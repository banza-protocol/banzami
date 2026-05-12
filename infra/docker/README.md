# infra/docker

Docker Compose definitions for local development and staging.

## Local Development Quickstart

### Prerequisites

- [Docker Desktop](https://docs.docker.com/get-docker/) (or Docker Engine + Compose v2)
- `sqlx-cli` for running database migrations:

```bash
cargo install sqlx-cli --no-default-features --features postgres
```

### 1. Configure environment

```bash
cp .env.example .env
# .env is git-ignored — never commit it
```

### 2. Start services

```bash
make dev-up
```

This starts PostgreSQL 16 and Redis 7 in detached mode and waits for health checks to pass.

| Service    | Port | Credentials                                  |
| ---------- | ---- | -------------------------------------------- |
| PostgreSQL | 5433 | user: `banzami` / pass: `banzami_dev` / db: `banzami_dev` (host 5433 avoids clash with a local Postgres on 5432) |
| Redis      | 6379 | no auth in local dev                         |

### 3. Run database migrations

```bash
make db-migrate
```

Applies all pending migrations from `core/ledger/migrations/` against the `DATABASE_URL` in your `.env`.

### 4. Verify

```bash
make db-psql
# then inside psql:
\dt
# Should show: ledger_accounts, ledger_entries, ledger_postings
```

---

## Common Commands

| Command           | Effect                                           |
| ----------------- | ------------------------------------------------ |
| `make dev-up`     | Start services (detached)                        |
| `make dev-down`   | Stop services (data volumes preserved)           |
| `make dev-reset`  | Destroy volumes + restart (clean slate)          |
| `make dev-logs`   | Tail logs from all services                      |
| `make dev-status` | Show service health                              |
| `make db-migrate` | Apply pending migrations                         |
| `make db-reset`   | Drop + recreate + migrate (wipes all dev data)   |
| `make db-psql`    | Open psql shell on the dev database              |
| `make check`      | `cargo check --workspace` (core/)               |
| `make test`       | `cargo test  --workspace` (core/)               |

---

## Services

### PostgreSQL (`postgres:16-alpine`)

- Data is persisted in the `postgres_data` Docker volume across restarts.
- `make dev-reset` destroys the volume — use when you need a completely clean database.
- Credentials are intentionally weak and local-only. Production credentials live in the secret manager.

### Redis (`redis:7-alpine`)

- Configured with `--save 60 1` (persist to disk every 60 s if ≥1 key changed).
- Data lives in the `redis_data` Docker volume.
- No auth in local development. Production Redis requires `requirepass`.

---

## Adding Services

When adding a new service (e.g., an observability stack):

1. Add it to `docker-compose.yml` with a healthcheck.
2. Add a corresponding `make` target if it has an operational workflow.
3. Update this README.
4. If it changes the production topology, create an ADR under `docs/adr/`.
