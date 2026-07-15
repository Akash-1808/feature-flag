# Feature Flag Platform — Project Guide

## 1. What This Project Is

An open-source, self-hostable feature flag platform comprising three main deliverables:

1. **API Server** — Node.js + Express/Fastify + TypeScript. Handles flag CRUD, issues API keys, serves conditional polling responses. User authentication and organization management are handled by **Better Auth** with the organization plugin.
2. **Dashboard** — Next.js + TypeScript. UI for creating/toggling flags, managing rollout rules, viewing audit logs.
3. **SDK** — Lightweight TypeScript package published to npm. Installed in client applications to evaluate flags locally, refreshing via efficient conditional polling.

Supporting infrastructure: **Postgres** (source of truth), **Redis** (hot-path evaluation cache), **Prometheus client** (metrics for auto-rollback), **Better Auth** (authentication, sessions, org/RBAC).

---

## 2. Architecture Principles

### Polling Over Push

Flags are evaluated on every request but changed rarely. The platform uses **conditional polling** (ETag-based, default 30s interval) instead of WebSocket push. Most polls return `304 Not Modified` — near-zero bandwidth. The bounded propagation delay (≤ poll interval) is acceptable because:

- The auto-rollback watcher (§9) handles the kill-switch case automatically.
- Polling keeps infrastructure stateless, horizontally scalable, and operationally simple.

### Fail-Open Resilience

The SDK **never blocks the host application**. If the API server is unreachable, the SDK continues serving its last successfully cached ruleset. Failures are logged locally but do not degrade the consuming app.

### Deterministic Rollout Bucketing

A user in a 20% rollout stays in that 20% on every evaluation. Bucketing hashes `flag_key + user_id` into a stable value in `[0, 100)` and compares it against `rollout_pct`. Increasing a rollout from 10% to 25% **only adds users, never removes or reshuffles** existing ones.

### Tiered Persistence

- **Postgres** — durable source of truth for flags, rules, audit log.
- **Redis** — hot-path cache for evaluation reads. Writes go to Postgres first, then update Redis.

### Dual Auth Paths (Better Auth + Custom API Keys)

Dashboard/human authentication uses **Better Auth** with the organization plugin — it handles user sign-up, login, sessions, org membership, and RBAC out of the box. SDK/machine authentication uses **custom API key middleware** — environment-scoped, typed (client read-only / server read-write) keys validated via SHA-256 hash lookup. These are two completely separate auth paths that never overlap.

---

## 3. Monorepo Structure

```
feature-flag/
├── apps/
│   ├── api/                  # API server (Node.js + Express/Fastify + TS)
│   │   ├── src/
│   │   │   ├── auth.ts       # Better Auth instance config (plugins, DB adapter)
│   │   │   ├── auth-client.ts # Better Auth client (for server-side session checks)
│   │   │   ├── routes/       # Route handlers grouped by domain
│   │   │   ├── middleware/   # API key auth, rate limiting, compression
│   │   │   ├── services/    # Business logic layer
│   │   │   ├── repositories/ # Data access (Postgres queries)
│   │   │   ├── cache/       # Redis cache layer
│   │   │   ├── jobs/        # Background jobs (stale flag detection, metrics watcher)
│   │   │   ├── utils/       # Shared utilities (hashing, bucketing)
│   │   │   └── index.ts     # Entry point
│   │   ├── tests/
│   │   └── package.json
│   └── dashboard/            # Next.js + TypeScript dashboard
│       ├── src/
│       │   ├── app/          # Next.js App Router pages
│       │   ├── components/   # React components
│       │   ├── hooks/        # Custom React hooks
│       │   ├── lib/          # API client, utilities
│       │   └── styles/       # Global styles
│       ├── tests/
│       └── package.json
├── packages/
│   └── sdk/                  # TypeScript SDK (published to npm)
│       ├── src/
│       │   ├── client.ts     # Main SDK client class
│       │   ├── poller.ts     # Conditional polling loop
│       │   ├── evaluator.ts  # Flag evaluation + bucketing logic
│       │   ├── cache.ts      # In-memory ruleset cache
│       │   └── index.ts      # Public API surface
│       ├── tests/
│       └── package.json
├── infra/
│   ├── docker-compose.yml    # Self-host: API + Postgres + Redis
│   ├── prometheus.yml        # Prometheus scrape config
│   └── grafana/              # Dashboard JSON exports
├── db/
│   ├── migrations/           # Numbered SQL migration files
│   └── feature_flag_schema.sql  # Full reference schema
├── k6/                       # Load test scripts
│   ├── evaluation-latency.js
│   └── polling-efficiency.js
├── .github/
│   └── workflows/
│       └── ci.yml            # GitHub Actions CI pipeline
├── package.json              # Root workspace config
├── tsconfig.base.json        # Shared TypeScript config
├── claude.md                 # This file
└── README.md
```

---

## 4. Data Model

### Better Auth-Managed Tables

Better Auth owns and manages these tables via `npx @better-auth/cli migrate`:

| Table | Purpose |
|---|---|
| `user` | User accounts (email, name, image, etc.). Managed by Better Auth. |
| `session` | Active sessions. Managed by Better Auth. |
| `account` | OAuth/credential accounts linked to users. Managed by Better Auth. |
| `verification` | Email verification tokens. Managed by Better Auth. |
| `organization` | Tenant layer. Created via Better Auth org plugin. |
| `member` | Org membership + role (`owner`, `admin`, `member`). Managed by Better Auth org plugin. |
| `invitation` | Pending org invites. Managed by Better Auth org plugin. |

> **Do not manually modify Better Auth tables.** Use the Better Auth API and CLI for schema changes.

### Application-Owned Tables

These tables are managed by our own migrations in `db/migrations/`:

| Table | Purpose |
|---|---|
| `environments` | `dev` / `staging` / `prod` scoped to an org. Flags behave independently per environment. |
| `api_keys` | Scoped by environment and type. `client` = read-only (safe for browser/app). `server` = read-write (never leaves backend). |
| `flags` | Flag definition: `key`, `description`, `type`. Environment-independent. |
| `flag_states` | The actual `enabled` boolean + `rollout_pct` per environment for a flag. **This is the row the SDK reads.** |
| `targeting_rules` | JSONB-based conditions (e.g. `plan = enterprise`) attached to a `flag_state`, evaluated in priority order. |
| `audit_log` | Every write recorded with `actor`, `before`/`after` state, and `timestamp`. References `user.id` from Better Auth. |

### Hot-Path Query

Indexes are optimized for the SDK's primary query: **fetch all `flag_states` + `targeting_rules` for one `environment_id`**. This is the single most performance-critical database path.

### Schema Location

- Better Auth tables: managed by `npx @better-auth/cli migrate`. Config in `apps/api/src/auth.ts`.
- Application tables: `db/feature_flag_schema.sql` (reference), `db/migrations/` (versioned).

---

## 5. Data Flow

```
┌──────────┐   toggle    ┌───────────┐   write    ┌──────────┐
│Dashboard │ ──────────► │ API Server│ ─────────► │ Postgres │
└──────────┘             └─────┬─────┘            └──────────┘
                               │ update cache
                               ▼
                          ┌─────────┐
                          │  Redis  │
                          └────┬────┘
                               │ serve evaluation reads
                               ▼
┌──────────┐   poll       ┌───────────┐
│   SDK    │ ◄──────────  │ API Server│
│ (client  │  ETag-based  └───────────┘
│  app)    │  304 / 200
└──────────┘

┌────────────────┐  error spike detected  ┌──────────┐
│ Metrics Watcher│ ──────────────────────► │ Postgres │
│                │  auto-disable flag      │ (flag_   │
│                │  + audit_log entry      │  states) │
└────────────────┘                         └──────────┘
```

1. User toggles a flag in the Dashboard.
2. API server validates (auth + RBAC), writes to Postgres (`flag_states`, `audit_log`), updates Redis.
3. SDK polls API server on interval (default 30s), sending its last-known `ETag`.
   - No change → `304 Not Modified` (near-zero bandwidth).
   - Change detected → full updated ruleset + new `ETag`.
4. SDK replaces its in-memory cache. Next `flags.isEnabled('checkout-v2')` reflects the new value instantly (no network round-trip).
5. On boot, SDK does one REST fetch for the full ruleset, then starts the poll loop.
6. Metrics watcher can auto-disable a flag by writing directly to `flag_states`.

---

## 6. Security Model

### Authentication: Better Auth

Dashboard authentication (sign-up, login, sessions, password reset) is handled entirely by Better Auth. The API server mounts Better Auth's handler at `/api/auth/*` and uses `auth.api.getSession()` with `fromNodeHeaders()` to validate sessions in Express route handlers.

```typescript
// Server-side session check in Express routes
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";

const session = await auth.api.getSession({
  headers: fromNodeHeaders(req.headers),
});
```

### API Key Scoping (SDK Auth)

- **Client keys** — read-only, scoped to a single `environment_id`. Safe to ship to browsers/apps.
- **Server keys** — read-write, scoped to a single `environment_id`. Never leave the backend.
- A dev key **cannot** access prod rows. Scoping is enforced at the database query level.

### RBAC Roles (Better Auth Organization Plugin)

Roles are managed by Better Auth's organization plugin. Default roles:

| Role | Permissions |
|---|---|
| `owner` | Full access, manage org settings, delete org, manage members |
| `admin` | Manage flags, environments, API keys, invite/remove members |
| `member` | Create/edit flags, cannot manage members or org settings |

A custom `viewer` role can be added via Better Auth's `roles` configuration if needed. Role checks in route handlers use the session's active organization membership.

### Threat Mitigations

| Threat | Mitigation |
|---|---|
| Client tampers with flag value in browser | Not preventable client-side. **Never gate security-sensitive logic on a client-side flag check.** Re-verify server-side with a server API key. |
| Leaked API key used to write flags | Client keys are read-only by type. Server keys never leave backend. |
| Dev key used against prod | Keys are scoped to a single `environment_id`. |
| Malicious/accidental change by legitimate user | RBAC via Better Auth org plugin + full audit log (before/after, actor, timestamp). |
| Brute force / API abuse | Rate limiting keyed by API key and IP. |
| Flag server unreachable | SDK fails open — serves last cached ruleset. Logged locally. |

---

## 7. SDK Design

### Public API Surface

```typescript
import { FeatureFlagClient } from '@feature-flag/sdk';

const client = new FeatureFlagClient({
  apiKey: 'client_key_xxx',       // Client API key (read-only)
  baseUrl: 'https://flags.example.com',
  pollingInterval: 30_000,        // ms, default 30s
  defaultValues: {                // Fallbacks if flag not found
    'checkout-v2': false,
  },
});

await client.initialize();       // Boot fetch — pulls full ruleset

// Evaluate flag (local, no network call)
const enabled = client.isEnabled('checkout-v2', {
  userId: 'user_abc',            // Required for rollout bucketing
  attributes: { plan: 'enterprise' },  // For targeting rules
});

client.destroy();                // Stop polling, clean up
```

### SDK Lifecycle

1. **Boot** — single REST `GET` to pull the full ruleset for the environment.
2. **Poll loop** — `GET` with `If-None-Match: <etag>` header every `pollingInterval` ms.
3. **Evaluation** — purely local: check `flag_states.enabled`, evaluate `targeting_rules` in priority order, apply deterministic bucketing.
4. **Fail-open** — on network error, log and continue serving cached ruleset. Never throw or block the host app.

### Bucketing Algorithm

```
bucket = hash(flag_key + user_id) % 100   // Stable value in [0, 100)
enabled = bucket < rollout_pct
```

- Hash function: use a fast, well-distributed hash (e.g. MurmurHash3 or FNV-1a).
- **Critical invariant**: increasing `rollout_pct` from N to M (where M > N) must only **add** users, never remove existing ones. This is guaranteed by the stable hash approach.

---

## 8. Payload Strategy

| Scenario | Strategy | Expected Behavior |
|---|---|---|
| SDK boot / ruleset changed | `gzip` compression (middleware or Nginx-level) | ~70-80% size reduction |
| Poll with no change | `304 Not Modified` | Zero payload. This is the common case. |

The `304` path matters more than compression — most polls should cost almost nothing.

### ETag Implementation

- Server computes ETag from a hash of the serialized ruleset for the requested environment.
- SDK sends `If-None-Match` header on every poll request.
- Server compares and returns `304` (no body) or `200` (full ruleset + new ETag).

---

## 9. Auto-Rollback on Error-Rate Spike

The metrics watcher closes the loop without human intervention:

1. Requests/errors are tagged with the flag state active during evaluation.
2. Watcher tracks error rate for the cohort exposed to a flag over a rolling window (e.g. last 5 minutes).
3. If error rate crosses a configured threshold → watcher sets `flag_states.enabled = false` and writes an `audit_log` entry noting automatic rollback.
4. Next poll response reflects the disabled flag (bounded by poll interval).

**This is the answer to "how do you make rollouts safe without instant push"** — the system watches itself instead of relying on propagation speed.

---

## 10. Stale Flag Detection

A background job identifies `flag_state` rows at 0% or 100% with no changes for 30+ days. These are surfaced in the dashboard as cleanup candidates. Stale flags accumulate as dead code and unnecessary evaluation overhead.

---

## 11. Coding Conventions

### General

- **Language**: TypeScript throughout (API, Dashboard, SDK).
- **Module system**: ESM (`import`/`export`). No CommonJS `require()`.
- **Strict mode**: `tsconfig.json` uses `"strict": true` everywhere.
- **Naming**: `camelCase` for variables/functions, `PascalCase` for types/classes/components, `SCREAMING_SNAKE_CASE` for constants, `snake_case` for database columns/tables.
- **Error handling**: Use typed error classes. Never swallow errors silently — always log with context.

### API Server

- **Route organization**: Group by domain (`/flags`, `/environments`, `/api-keys`, `/audit`). Better Auth routes are mounted at `/api/auth/*` via `toNodeHandler(auth)`.
- **Layered architecture**: `routes/` → `services/` → `repositories/`. Routes handle HTTP concerns only. Services contain business logic. Repositories handle data access.
- **Validation**: Validate all inputs at the route level before passing to services. Use a schema validation library (e.g. Zod).
- **Auth**: Two separate auth paths:
  - **Dashboard routes**: Use `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` from Better Auth. Session includes active org and role.
  - **SDK routes** (`/sdk/*`): Use custom `X-API-Key` header middleware. Validates by SHA-256 hash lookup.
- **Better Auth gotcha**: Do NOT use `express.json()` before the Better Auth handler mount. Mount it only for routes after the Better Auth catch-all.
- **Response format**: JSON. Consistent envelope: `{ data, error, meta }`.

### Dashboard

- **Next.js App Router** with server components where appropriate.
- **Component organization**: Small, focused components. Co-locate component-specific styles.
- **State management**: React hooks + context for client state. Server components + fetch for data.
- **API calls**: Centralized API client in `lib/` — never call `fetch` directly from components.

### SDK

- **Zero dependencies** if possible. Minimize bundle size — this ships in other people's apps.
- **No side effects on import**. The consumer explicitly calls `initialize()`.
- **Tree-shakeable** exports.
- **Defensive coding**: Every external input (API response, user-provided config) is validated. Malformed data must never crash the host app.

### Database

- **Migrations**: Numbered SQL files (`001_create_organizations.sql`, `002_create_users.sql`, etc.). Always include both `up` and `down` migration.
- **Queries**: Parameterized queries only. Never interpolate user input into SQL strings.
- **Indexes**: Every query used in the hot path must have a supporting index. Document the query each index supports.

### Testing

- **Unit tests**: Bucketing hash determinism, rule-matching logic, input validation. These are where subtle correctness bugs hide.
- **Integration tests**: API routes (flag CRUD, auth scoping, ETag/conditional-fetch behavior).
- **Test naming**: `describe('functionName')` → `it('should <expected behavior> when <condition>')`.
- **Test location**: Co-located `tests/` directory within each package/app.

---

## 12. Environment & Configuration

### Environment Variables

```
# API Server
DATABASE_URL=postgresql://user:pass@localhost:5432/feature_flags
REDIS_URL=redis://localhost:6379
PORT=3001
BETTER_AUTH_SECRET=<random-32-char-secret>     # Better Auth session signing
BETTER_AUTH_URL=http://localhost:3001           # Better Auth base URL
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=100

# Dashboard
NEXT_PUBLIC_API_URL=http://localhost:3001

# Metrics Watcher
ERROR_RATE_THRESHOLD=0.05         # 5% error rate triggers rollback
ERROR_RATE_WINDOW_SECONDS=300     # 5-minute rolling window
PROMETHEUS_PUSH_GATEWAY_URL=http://localhost:9091
```

### Docker Compose (Self-Host)

```yaml
services:
  api:
    build: ./apps/api
    ports: ["3001:3001"]
    depends_on: [postgres, redis]
  dashboard:
    build: ./apps/dashboard
    ports: ["3000:3000"]
    depends_on: [api]
  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
  prometheus:
    image: prom/prometheus
    volumes: [./infra/prometheus.yml:/etc/prometheus/prometheus.yml]
  grafana:
    image: grafana/grafana
    volumes: [./infra/grafana:/var/lib/grafana/dashboards]
```

---

## 13. Performance Targets

| Metric | Target |
|---|---|
| Flag evaluation latency (p95) | < 1ms (local, in-memory) |
| API response latency — 304 (p95) | < 10ms |
| API response latency — full ruleset (p95) | < 50ms |
| 304 response ratio (steady state) | > 95% of poll requests |
| SDK boot time | < 200ms (network-dependent) |

### Load Testing

- **k6 scripts** in `k6/` directory.
- `evaluation-latency.js` — concurrent SDK boot and poll requests, measure p95/p99.
- `polling-efficiency.js` — steady-state polling, verify 304 ratio.

---

## 14. CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`):

1. **Lint** — ESLint + Prettier check across all packages.
2. **Type check** — `tsc --noEmit` for each package.
3. **Unit tests** — Run all unit test suites.
4. **Integration tests** — Spin up Postgres + Redis via `services`, run API integration tests.
5. **Build** — Verify all packages build successfully.
6. **Status badge** in README — signals trustworthiness for outside contributors.

---

## 15. Build Roadmap

| Week | Focus | Deliverable |
|---|---|---|
| 1 | Foundations | Monorepo, Postgres schema, org/user auth |
| 2 | Core API | Flag CRUD, targeting rule endpoints, deterministic bucketing |
| 3 | SDK v1 | Boot fetch + local evaluation + conditional polling loop |
| 4 | Resilience | Fail-open caching, stale-flag detection job |
| 5 | Dashboard | Flag list, toggle UI, rollout slider, audit log view |
| 6 | Security hardening | Key scoping, RBAC, rate limiting |
| 7 | Auto-rollback + performance | Metrics watcher, k6 load tests, Grafana dashboards |
| 8 | Packaging | Docker Compose self-host, npm-published SDK, README, CI |

---

## 16. Key Design Decisions — Rationale Reference

| Decision | Why |
|---|---|
| Better Auth over custom JWT | Auth is not the core value — feature flags are. Better Auth provides org management, RBAC, sessions, and invite flows out of the box, freeing effort for the actual differentiators (bucketing, polling, auto-rollback). |
| Dual auth paths (Better Auth + API keys) | Dashboard users authenticate via Better Auth sessions. SDKs authenticate via environment-scoped API keys. These paths never overlap — clean separation of human vs. machine auth. |
| Polling over WebSocket | Flags change rarely; polling is stateless and horizontally scalable. Auto-rollback handles the kill-switch case. |
| Redis + Postgres tiered persistence | Proven pattern: Redis for speed, Postgres for durability and auditability. |
| Client vs. server API keys | Prevents client-side key leaks from enabling writes. Environment scoping prevents cross-env access. |
| Deterministic bucketing via hash | Prevents feature flickering. Monotonic rollout increases (never reshuffles users). |
| Fail-open SDK | Availability of the host app is more important than flag accuracy during outages. |
| ETag-based conditional polling | Most polls return 304 — near-zero bandwidth. More impactful than payload compression. |
| Auto-rollback watcher | Eliminates dependency on human reaction time for bad rollouts. Makes polling-based propagation safe. |
| Stale flag detection | Prevents dead-code accumulation. Flags are temporary by nature. |
| JSONB targeting rules | Flexible condition schema without requiring schema migrations for new attribute types. |
