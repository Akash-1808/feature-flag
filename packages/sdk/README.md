# 📦 FlagCraft SDK (`flagcraft`)

[![npm version](https://img.shields.io/npm/v/flagcraft.svg?color=blue)](https://www.npmjs.com/package/flagcraft)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/flagcraft.svg?color=green)](https://bundlephobia.com/package/flagcraft)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

The official, ultra-fast, universal **TypeScript / JavaScript SDK** for [FlagCraft](https://github.com/Akash-1808/feature-flag), engineered for high-concurrency environments, zero-latency local evaluations, conditional ETag polling, and fail-open resilience.

---

## ✨ Why FlagCraft SDK?

Standard feature flag SDKs make blocking HTTP requests on every evaluation or download massive JSON payloads repeatedly. **`flagcraft`** is built differently:

- **⚡ Zero-Latency Local Evaluations (`0ms`)**: Rulesets are stored in an ultra-fast in-memory cache (`InMemoryCache`). Calling `flagcraft.evaluate()` executes entirely in local CPU memory without blocking network calls or disk I/O.
- **📉 ETag Conditional Polling (`>95% Bandwidth Saved`)**: When background polling checks for updates, the SDK sends an `If-None-Match: W/"hash"` header. If no flag rules changed in the management dashboard, the FlagCraft server returns a zero-byte **`HTTP 304 Not Modified`** response instantly.
- **🎯 Deterministic MurmurHash3 Bucketing**: When rolling out a feature to `30%` of users (`rollout_percentage = 30`), `flagcraft` calculates `MurmurHash3(flagKey + userId) % 100`. This guarantees the exact same user gets the identical experience across all distributed servers with **zero UI flickering**.
- **🛡️ Fail-Open & Tiered Fallback Cache**: If your central FlagCraft API or database goes offline during a major cloud outage, the SDK falls back to cached local rules or your safe code defaults (`isEnabled = false`). Your application **never crashes** due to flag evaluation failures.
- **📊 Auto-Rollback Telemetry**: Automatically batches and reports evaluation metrics and error cohorts back to FlagCraft (`MetricsWatcher`), allowing automated circuit breakers to trip within seconds if an anomaly occurs.

---

## 📦 Installation

Install `flagcraft` via your preferred package manager:

```bash
npm install flagcraft
```
```bash
yarn add flagcraft
```
```bash
pnpm add flagcraft
```

---

## 🚀 Quickstart Guide

### 1. Initialize the SDK
Create a single instance of `FlagCraft` during your server or application startup:

```typescript
import { FlagCraft } from 'flagcraft';

// Initialize with your Environment API Key from FlagCraft Dashboard
const flagcraft = new FlagCraft({
  apiKey: 'server_abc123_your_secret_key', // Or client_... for frontend apps
  baseUrl: 'http://localhost:3001',        // Your running FlagCraft API server
  pollingInterval: 30000,                  // Check for rule changes every 30 seconds
  fallbackFlags: {
    'new-ai-search': false,                // Safe defaults if API is unreachable on initial boot
  },
});

// Start the background ETag polling engine
await flagcraft.init();
```

---

### 2. Evaluate Feature Flags Instantly (`0ms` Latency)

Pass the flag key and targeting context (`userId`, `attributes`):

```typescript
// Example: Inside an Express, Next.js, or Fastify route controller
app.get('/search', async (req, res) => {
  const userId = req.headers['x-user-id'] || 'guest_user';

  // Instant local memory check (Zero network latency!)
  const useAiSearch = flagcraft.evaluate('new-ai-search', {
    userId: userId,
    attributes: {
      country: 'US',
      plan: 'pro',
      appVersion: '2.4.0',
    },
  });

  if (useAiSearch) {
    return res.json({ status: 'success', engine: 'AI Search Engine v2 ✨' });
  } else {
    return res.json({ status: 'success', engine: 'Standard SQL Search Engine' });
  }
});
```

---

### 3. Evaluate All Flags for a User (e.g., Initializing Frontend State)

If you need to return all flag states for a specific user in a single request:

```typescript
app.get('/api/user/flags', (req, res) => {
  const allFlags = flagcraft.evaluateFlags({
    userId: req.query.userId as string,
    attributes: { country: 'UK' },
  });

  // Returns: { 'new-ai-search': true, 'dark-mode-v2': false, ... }
  res.json(allFlags);
});
```

---

## ⚙️ Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`apiKey`** *(required)* | `string` | — | Your FlagCraft environment API key (`server_...` or `client_...`). |
| **`baseUrl`** | `string` | `'http://localhost:3001'` | The HTTP URL where your FlagCraft control-plane API is deployed. |
| **`pollingInterval`** | `number` | `30000` | Frequency in milliseconds for ETag background polling (`min: 1000ms`). |
| **`fallbackFlags`** | `Record<string, boolean>` | `{}` | Static fallbacks used before initial fetch or during network outages. |
| **`onError`** | `(err: Error) => void` | `console.error` | Custom error callback for background polling failures or network timeouts. |

---

## 📚 API Reference

### `flagcraft.init(): Promise<void>`
Boots the background `Poller` and performs the initial ruleset fetch. Resolves immediately when the initial ruleset is loaded into the `InMemoryCache` or gracefully falls back to `fallbackFlags`.

### `flagcraft.evaluate(flagKey: string, context?: EvaluationContext): boolean`
Evaluates a single feature flag synchronously using the cached ruleset.
- **`flagKey`**: The unique identifier of the flag (e.g., `'new-checkout'`).
- **`context.userId`**: Required for percentage-based rollouts to ensure deterministic hashing.
- **`context.attributes`**: Key-value pairs (`{ country: 'US', tier: 'gold' }`) evaluated against custom targeting rules (`CONTAINS`, `EQUALS`, `IN`, `GREATER_THAN`).

### `flagcraft.evaluateFlags(context?: EvaluationContext): Record<string, boolean>`
Evaluates every active feature flag in the environment for the provided context and returns a dictionary mapping flag keys to boolean outcomes.

### `flagcraft.close(): void`
Stops background polling intervals and clears the memory cache. Call this during graceful server shutdown (`SIGTERM` / `SIGINT`).

---

## 🧪 Advanced: ETag Polling Under the Hood

When `flagcraft` polls your FlagCraft server (`GET /sdk/flags`), it passes the MD5 hash of the active ruleset inside the `If-None-Match` HTTP header:

```http
GET /sdk/flags HTTP/1.1
Host: localhost:3001
x-api-key: server_e24dfb98_secret
If-None-Match: W/"a9f8c7e6b5d4c3b2a1"
```

If the ruleset hasn't changed since the last fetch, the server replies with:
```http
HTTP/1.1 304 Not Modified
```
This design allows thousands of distributed servers or serverless containers to poll frequently (`e.g., every 5-10s`) with **near-zero CPU and network overhead**.

---

## 📝 License

Distributed under the MIT License. Built with ❤️ for enterprise reliability and speed.
