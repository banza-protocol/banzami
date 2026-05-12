# infra

Infrastructure-as-code, container definitions, monitoring, and deployment automation.

## Contents

- `docker/` — Dockerfiles and Compose definitions for local development and staging.
- `terraform/` — Cloud infrastructure provisioning (Hetzner, OVH, Cloudflare).
- `monitoring/` — OpenTelemetry collector configurations, Prometheus rules, Grafana dashboards.
- `deployment/` — Deployment scripts, environment manifests, release automation.

## Conventions

- **Kubernetes is intentionally deferred** (CLAUDE.md §3.8). Do not introduce it without an ADR establishing operational necessity.
- **Secrets never live in this directory.** Use the configured secret manager and reference values by ID.
- Every service must ship with a corresponding Dockerfile, a Prometheus scrape config, and a Grafana dashboard.
- Infrastructure changes that alter the production topology, security posture, or data residency require an ADR under [`docs/adr/`](../docs/adr/).
- Terraform state is remote, encrypted, and never committed. Local plan files (`*.tfplan`) are git-ignored.
