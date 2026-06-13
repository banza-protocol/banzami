# Banzami — Deployment Guide

> This document describes: **Banzami** — the reference operator implementation.
> For other layers: [BANZA](../banza/BANZA_REFERENCE.md)

**Version:** 1.0  
**Date:** 2026-05-30  
**Status:** Official  
**Authority:** ADR-025

---

## Deployment Script

All deployments go through `./deploy.sh` at the repository root.

```bash
./deploy.sh <service>         # deploy one service
./deploy.sh                   # deploy all services
./deploy.sh --no-cache <svc>  # force full rebuild (clears Docker layer cache)
```

**Changes are not done until pushed to `origin/main` AND deployed via `./deploy.sh`.**

---

## Services

| Service name | What it deploys |
|-------------|----------------|
| `core-api` | Rust financial kernel |
| `api-gateway` | Go merchant-facing API |
| `public-api` | Go consumer-facing API |
| `admin-api` | Go internal operator API |
| `dashboard-frontend` | Next.js merchant dashboard |
| `admin-frontend` | Next.js admin portal |
| `pay-frontend` | Next.js consumer pay page |
| `checkout-frontend` | Next.js hosted checkout |
| `docs-frontend` | Next.js public docs site (banzami.com) |
| `staging` | Full staging environment |

---

## Deployment Flow

```
1. Code changes committed and pushed to origin/main
        ↓
2. ./deploy.sh <service> runs on local machine
        ↓
3. Docker image built from Dockerfile in service directory
        ↓
4. Image pushed to production server via rsync + Docker
        ↓
5. Container restarted on production server
        ↓
6. Health check verified: GET /health → 200 OK
        ↓
7. Deployment complete
```

### Staging First

For infrastructure changes, deploy to `staging` before production:

```bash
./deploy.sh staging           # deploy full staging environment first
# verify staging is healthy
./deploy.sh                   # deploy all production services
```

For routine application deployments (bug fixes, feature additions), staging is recommended but not required if the change is low-risk.

---

## Dockerfile Locations

| Service | Dockerfile |
|---------|-----------|
| `core-api` | `core/Dockerfile` |
| `api-gateway` | `services/api-gateway/Dockerfile` |
| `public-api` | `services/public-api/Dockerfile` |
| `admin-api` | `services/admin-api/Dockerfile` |
| `dashboard-frontend` | `apps/dashboard/Dockerfile` |
| `admin-frontend` | `apps/admin/Dockerfile` |
| `pay-frontend` | `apps/pay/Dockerfile` |
| `checkout-frontend` | `apps/checkout/Dockerfile` |
| `docs-frontend` | `apps/docs/Dockerfile` |

---

## docs-frontend Deployment

The `docs-frontend` service has a special deployment requirement: files from `docs/` that are read at build time must be synced to the server.

The `deploy.sh` rsync section handles this. If you add a new file under `docs/` that is read at build time, you MUST add it to:
1. `deploy.sh` — rsync section for docs-frontend
2. `apps/docs/Dockerfile` — COPY instruction

**Canonical example:**

```dockerfile
# apps/docs/Dockerfile
COPY docs/BANZA_REFERENCE.md ./docs/BANZA_REFERENCE.md
COPY docs/BANZAMI_REFERENCE.md ./docs/BANZAMI_REFERENCE.md
```

---

## Local Development

For local development, use Docker Compose:

```bash
./dev.sh          # start all services locally
make dev          # equivalent via Makefile
```

Local service URLs:
- `http://localhost:8081` — core-api (Rust)
- `http://localhost:8080` — api-gateway (Go)
- `http://localhost:8083` — public-api (Go)
- `http://localhost:3000` — dashboard-frontend (Next.js)
- `http://localhost:3003` — pay-frontend (Next.js)

Docker Compose configuration: `infra/docker/docker-compose.yml`

---

## Environment Variables

All configuration is via environment variables. Never hardcode credentials in application code.

### Required for all services

```
DATABASE_URL        PostgreSQL connection string
REDIS_URL           Redis connection string
```

### Service-specific variables

| Variable | Service | Description |
|----------|---------|-------------|
| `BANZA_API_KEY_SECRET` | core-api | HMAC key for API key verification |
| `BANZA_WEBHOOK_SECRET` | api-gateway | HMAC key for webhook signature |
| `OTLP_ENDPOINT` | all | OpenTelemetry collector endpoint |

Environment variables are defined in `.env` (local, gitignored) and set on the production server via the deployment configuration. Never commit `.env` files.

---

## Infrastructure

### Production

- **Hosting:** Hetzner/OVH
- **CDN/DNS:** Cloudflare
- **Container:** Docker (no Kubernetes — intentionally deferred until operational maturity requires it)
- **Database:** PostgreSQL (managed)
- **Cache:** Redis (managed)

### Scaling

The current architecture is a **modular monolith** deployed as coordinated Docker containers on a single server. Service extraction into separate servers happens only when:
- Operational necessity exists
- Scaling boundaries are proven
- Domain ownership becomes complex

See ADR-005 for the modular monolith decision.

---

## Database Migrations

Database migrations must run before deploying new application code.

```bash
# Run from db/ directory
cd db && sqlx migrate run

# Or via Makefile
make migrate
```

All migrations are in `db/migrations/` — sequential, numbered, immutable once merged.

**Migration checklist before deploying:**
- [ ] Migration is reversible (or irreversibility is explicitly documented)
- [ ] Migration tested locally and on staging
- [ ] Migration does not lock tables for extended periods
- [ ] Application code is backwards-compatible with both old and new schema during rollout

---

## Rollback

For application rollbacks, redeploy the previous version:

```bash
./deploy.sh <service>    # redeploy from the previous tagged image
```

For database rollbacks, apply the down migration:

```bash
cd db && sqlx migrate revert
```

Database rollbacks must be coordinated with application rollbacks. Financial data is never deleted — only migrations that add or transform data without deleting it are considered safe to rollback.

---

## Deployment Checklist

Before deploying to production:

- [ ] Changes are committed and pushed to `origin/main`
- [ ] Tests pass locally (`make test` or `cargo test && go test ./...`)
- [ ] Database migrations tested on staging (if applicable)
- [ ] Financial invariants preserved (no changes to ledger arithmetic, balance calculation, or settlement logic without review)
- [ ] `./deploy.sh staging` run and verified healthy (for infrastructure changes)
- [ ] Health checks pass post-deployment: `GET /health → 200 OK` on all affected services

---

**Referências:**

- [BANZAMI_OPERATIONS.md](BANZAMI_OPERATIONS.md) — Service operations guide
- [BANZAMI_ARCHITECTURE.md](BANZAMI_ARCHITECTURE.md) — Technical architecture
- `deploy.sh` — Deployment script (authoritative)
- `infra/docker/` — Docker Compose configuration
- ADR-005 — Modular monolith decision
