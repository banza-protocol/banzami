# infra

Infrastructure-as-code, container definitions, monitoring, and deployment automation.

## Production Environment

**Server:** IONOS VPS — `217.160.9.248` — Ubuntu 24.04 LTS — 4 vCores / 4 GB RAM / 120 GB NVMe
**CDN / Proxy:** Cloudflare (proxied, Full strict SSL)
**Compose file:** `/srv/banzami/docker-compose.yml` on the server
**Source:** `/srv/banzami/src/` — built locally per service with `docker build`

## Contents

- `docker/` — Dockerfiles and Compose definitions for local development and staging.
- `terraform/` — Cloud infrastructure provisioning (IONOS, Cloudflare DNS).
- `monitoring/` — OpenTelemetry collector configurations, Prometheus rules, Grafana dashboards.
- `deployment/` — Deployment scripts, environment manifests, release automation.

## Conventions

- **Kubernetes is intentionally deferred** (CLAUDE.md §3.8). Do not introduce it without an ADR establishing operational necessity.
- **Secrets never live in this directory.** Production secrets live in `/srv/banzami/.env` on the server (chmod 600, not committed).
- Every service must ship with a corresponding Dockerfile, a Prometheus scrape config, and a Grafana dashboard.
- Infrastructure changes that alter the production topology, security posture, or data residency require an ADR under [`docs/adr/`](../docs/adr/).
- Terraform state is remote, encrypted, and never committed. Local plan files (`*.tfplan`) are git-ignored.
