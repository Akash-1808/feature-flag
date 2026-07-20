# ⚡ FlagCraft — Enterprise Feature Flag Platform

[![CI Pipeline](https://github.com/Akash-1808/feature-flag/actions/workflows/ci.yml/badge.svg)](https://github.com/Akash-1808/feature-flag/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/Akash-1808/feature-flag)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Monorepo: Turborepo](https://img.shields.io/badge/monorepo-turborepo-red.svg)](https://turbo.build)

**FlagCraft** is a universal, ultra-fast, self-hostable feature flag evaluation platform engineered for high availability, zero-latency local evaluations, and automated circuit-breaking.

---

## 🏗️ Architecture & Core Differentiators

FlagCraft decouples control-plane management from data-plane evaluation using tiered caching and deterministic hash bucketing:

```mermaid
graph TD
    subgraph Control Plane
        Dashboard[Next.js Dashboard - Port 3000]
        API[Node.js / Express API - Port 3001]
        PG[(PostgreSQL - System of Record)]
    end

    subgraph Data Plane
        Redis[(Redis Tiered Cache & Pub/Sub)]
        SDK_Client[Client / Server SDKs]
    end

    subgraph Observability
        Prom[Prometheus Scraper - Port 9090]
        Graf[Grafana Live Dashboards - Port 3005]
        Watcher[Metrics Watcher / Auto-Rollback Engine]
    end

    Dashboard <--> API
    API <--> PG
    API <--> Redis
    SDK_Client -- "ETag Polling (304 Not Modified)" --> API
    SDK_Client -- "Batch Metrics Reports" --> API
    API --> Watcher
    Watcher -- "Circuit Breaker Tripped" --> PG & Redis
    Prom -- "Scrape /api/metrics" --> API
    Graf -- "Query Time-Series" --> Prom
```

### ✨ Key Capabilities
- **⚡ ETag Conditional Polling**: SDKs send `If-None-Match` headers. Over 95% of steady-state polls return `304 Not Modified` with near-zero bandwidth payload.
- **🎯 Deterministic MurmurHash3 Bucketing**: User cohorts remain consistent across servers without sticky sessions or reshuffling during rollout increments.
- **🛡️ Fail-Open Caching**: If the central API becomes unreachable, SDKs fall back to local disk/memory cache to ensure your application never breaks.
- **🤖 Auto-Rollback Circuit Breakers**: The built-in `MetricsWatcher` continuously evaluates flag error cohorts. If a flag spike crosses the 5% error threshold, the rollout is automatically disabled within seconds without human intervention.
- **📊 Real-time Observability**: Native Prometheus `prom-client` gauges and pre-packaged dark-mode Grafana dashboards.

---

## 🚀 1-Minute Quick Start (Self-Host via Docker Compose)

You can spin up the entire production stack locally or on your servers using Docker Compose:

```bash
# Clone the repository
git clone https://github.com/Akash-1808/feature-flag.git
cd feature-flag

# Start all services (API, Dashboard, Postgres, Redis, Prometheus, Grafana)
docker compose up -d
```

Once running, access the services:
- **🖥️ Dashboard UI**: [http://localhost:3000](http://localhost:3000)
- **⚙️ FlagCraft API**: [http://localhost:3001](http://localhost:3001)
- **📈 Grafana Observability**: [http://localhost:3005](http://localhost:3005) *(Dashboard auto-provisioned)*
- **📊 Prometheus Targets**: [http://localhost:9090/targets](http://localhost:9090/targets)

---

## 📦 Using the SDK (`flagcraft`)

### Installation
```bash
npm install flagcraft
```

### Server-Side / Client-Side Usage
```typescript
import { FlagCraft } from 'flagcraft';

// Initialize SDK with your environment API Key
const flagcraft = new FlagCraft({
  apiKey: 'server_abc123_your_secret_key',
  baseUrl: 'http://localhost:3001',
  refreshIntervalMs: 30000, // ETag conditional polling interval
});

await flagcraft.init();

// Evaluate a feature flag with user targeting attributes
const isEnabled = flagcraft.evaluate('new-checkout-flow', {
  userId: 'usr_998877',
  attributes: {
    country: 'US',
    plan: 'enterprise',
  },
});

if (isEnabled) {
  // Render new checkout experience
}
```

---

## 🧪 Performance & Load Testing (`k6`)

FlagCraft includes comprehensive k6 load tests verified under 100 concurrent virtual users:

```bash
# Run Flag Evaluation Latency Test (~300+ req/sec)
docker run --rm -i -v "${PWD}/k6:/scripts" -e BASE_URL="http://host.docker.internal:3001" -e API_KEY="your_api_key" grafana/k6 run /scripts/evaluation-latency.js

# Run ETag Polling Efficiency Test (>95% 304 ratio)
docker run --rm -i -v "${PWD}/k6:/scripts" -e BASE_URL="http://host.docker.internal:3001" -e API_KEY="your_api_key" grafana/k6 run /scripts/polling-efficiency.js
```

---

## 🛠️ Monorepo Structure

```
├── apps/
│   ├── api/          # Express/Node.js backend API + Auto-rollback engine
│   └── dashboard/    # Next.js 15 App Router Management Dashboard
├── packages/
│   └── sdk/          # Universal TypeScript SDK (flagcraft)
├── infra/
│   ├── prometheus/   # Prometheus scrape configs
│   └── grafana/      # Auto-provisioned dashboards & datasources
└── k6/               # High-concurrency performance benchmark scripts
```

---

## 📝 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.
