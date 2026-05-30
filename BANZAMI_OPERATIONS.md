# Banzami — Operational Guide

> This document describes: **Banzami** — the reference operator implementation.
> For other layers: [BANZA](../banza/BANZA_REFERENCE.md) · [BanzAI](../banzai/BANZAI_REFERENCE.md)

**Version:** 1.0  
**Date:** 2026-05-30  
**Status:** Official  
**Authority:** ADR-025

---

## Services

The Banzami reference operator runs the following services in production:

| Service | Language | Port | Purpose |
|---------|----------|------|---------|
| `core-api` | Rust/Axum | 8081 | Financial kernel — ledger, wallets, transactions, QR, settlement |
| `api-gateway` | Go | 8080 | Merchant-facing public API |
| `public-api` | Go | 8083 | Consumer-facing API (mobile) |
| `admin-api` | Go | 8082 | Internal operator API (internal network only) |
| `dashboard-frontend` | Next.js | 3000 | Merchant dashboard |
| `admin-frontend` | Next.js | 3001 | Operator admin portal |
| `pay-frontend` | Next.js | 3003 | Consumer pay page |
| `checkout-frontend` | Next.js | 3004 | Hosted checkout page |
| `docs-frontend` | Next.js | 3005 | Public documentation site (banzami.org) |
| `banzai-api` | Node.js | 4200 | BanzAI Protocol OS API |

---

## Health Checks

Every service exposes a health endpoint:

```bash
GET /health       → 200 OK   (all services)
GET /metrics      → Prometheus metrics (all services)
```

For the Rust core-api:

```bash
curl http://localhost:8081/health
# → { "status": "ok", "version": "x.y.z" }
```

---

## Observability Stack

| Tool | Purpose |
|------|---------|
| **OpenTelemetry** | Distributed tracing — all services emit OTLP traces |
| **Prometheus** | Metrics collection — request counts, durations, error rates |
| **Grafana** | Dashboards — payment lifecycle, service health, latency |

Grafana dashboards are defined in `infra/monitoring/`.

### Key Metrics to Monitor

| Metric | Alert threshold |
|--------|----------------|
| Authorization latency | p99 > 2s |
| Transfer latency | p99 > 5s |
| QR payment end-to-end latency | p99 > 5s |
| Webhook dispatch latency | p99 > 10s |
| DB transaction duration | p99 > 1s |
| Error rate (5xx) | > 0.1% of requests |

### Trace Attributes

All Banzami traces include:
- `deployment.environment` — `sandbox` or `production`
- `trace_id` — propagated through all service calls in a payment chain
- `causation_id` — links derived events to their trigger

---

## Database

PostgreSQL is the single source of financial truth. No financial data lives in Redis, logs, or application memory.

### Connection

All services connect via `DATABASE_URL` environment variable. Never hardcode credentials.

### Migrations

Database migrations live in `db/migrations/`. All migrations are sequential and numbered. Run migrations before deploying application code:

```bash
cd db && sqlx migrate run
```

Migrations must be reversible where possible. Document irreversible migrations explicitly.

### Backup

Production database is backed up daily. Backups are verified monthly by restoring to a test environment.

---

## Redis

Redis is used for:
- Rate limiting (per API key, per IP)
- Idempotency key storage (24-hour TTL)
- Distributed locking (payment processing)
- Session management

Redis is **not** the source of truth for any financial data. Loss of Redis state is recoverable — the financial state lives in PostgreSQL.

---

## Background Workers

Two background workers run inside `core-api`:

| Worker | Interval | What it does |
|--------|----------|-------------|
| QR expiry | 60s | Marks dynamic QR codes as EXPIRED after `expires_at` |
| Payment link expiry | 60s | Marks payment links as EXPIRED after `expires_at` |

Both use `tokio::time::interval` with `MissedTickBehavior::Skip`.

---

## Environments

### Sandbox

- Completely isolated from production
- Separate database, separate API keys (`bz_test_…`)
- No real EMIS rails, no real money movement
- Available at `https://sandbox-api.banzami.org`

### Production (Live)

- Real Angolan Kwanza
- Real EMIS integration
- API keys prefixed `bz_live_…`
- Available at `https://api.banzami.org`

**The sandbox and live environments share no data, no credentials, and no infrastructure.**

---

## Incident Response

### Financial Invariant Violations

If a financial invariant violation is detected in production:

1. Page the on-call engineer immediately
2. Do NOT attempt to fix the ledger manually
3. Put the affected payment flows into maintenance mode
4. Capture the full trace context (`trace_id`, `causation_id`, ledger entries)
5. Investigate root cause in the Rust kernel
6. Apply fix via a proper database migration after root cause is confirmed
7. Re-certify if the invariant violation affects a certified capability (see [BANZA_CERTIFICATION.md](../banza/BANZA_CERTIFICATION.md))

Financial invariant violations are Critical severity — they require immediate response.

### Service Degradation

For non-financial service degradation (dashboard slow, webhooks delayed):

1. Check Grafana dashboards for the degraded service
2. Check service logs (`docker logs <service-name>`)
3. Restart the service if safe to do so: `./deploy.sh <service>`
4. Escalate if the degradation persists or affects payment flows

---

## Runbooks

Detailed operational runbooks are in `docs/runbooks/`:

| Runbook | Scenario |
|---------|---------|
| `runbooks/payment-flow-debug.md` | Debugging a stuck or failed payment |
| `runbooks/webhook-retry.md` | Manually retrying failed webhook deliveries |
| `runbooks/settlement-reconciliation.md` | Running a manual reconciliation job |
| `runbooks/sandbox-reset.md` | Resetting the sandbox environment |

---

## Log Levels

| Level | Use |
|-------|-----|
| `ERROR` | Service error requiring investigation |
| `WARN` | Recoverable issue (retry succeeded, rate limit hit) |
| `INFO` | Normal operation events (payment completed, webhook dispatched) |
| `DEBUG` | Internal state — disable in production |

All logs are structured JSON. Never log secrets, API keys, PIN codes, or full card data.

---

**Referências:**

- [BANZAMI_ARCHITECTURE.md](BANZAMI_ARCHITECTURE.md) — Service topology and component diagram
- [BANZAMI_DEPLOYMENT.md](BANZAMI_DEPLOYMENT.md) — How to deploy services
- `infra/monitoring/` — Grafana and Prometheus configuration
- `docs/runbooks/` — Operational runbooks
