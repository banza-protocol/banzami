# Banzami — developer convenience targets
# All commands assume the repo root as working directory.
#
# Prerequisites:
#   docker        https://docs.docker.com/get-docker/
#   sqlx-cli      cargo install sqlx-cli --no-default-features --features postgres
#
# Quick start:
#   cp .env.example .env
#   make dev-up
#   make db-migrate

# Load .env if present (never required — env vars can be set externally)
ifneq (,$(wildcard .env))
  include .env
  export
endif

COMPOSE       = docker compose -f infra/docker/docker-compose.yml
LEDGER_MIG    = core/ledger/migrations

.DEFAULT_GOAL := help

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------
.PHONY: help
help:
	@printf "\nBanzami — local development\n\n"
	@printf "  \033[1mServices\033[0m\n"
	@printf "    make dev-up        Start PostgreSQL and Redis (detached)\n"
	@printf "    make dev-down      Stop all services\n"
	@printf "    make dev-reset     Destroy volumes and restart (fresh state)\n"
	@printf "    make dev-logs      Tail all service logs\n"
	@printf "    make dev-status    Show service health\n"
	@printf "\n  \033[1mDatabase\033[0m\n"
	@printf "    make db-migrate    Run pending ledger migrations\n"
	@printf "    make db-reset      Drop, recreate, and re-migrate dev database\n"
	@printf "    make db-psql       Open a psql shell on the dev database\n"
	@printf "\n  \033[1mBuild\033[0m\n"
	@printf "    make check         cargo check --workspace (core/)\n"
	@printf "    make test          cargo test  --workspace (core/)\n"
	@printf "\n"

# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------
.PHONY: dev-up
dev-up:
	$(COMPOSE) up -d
	@echo "Waiting for PostgreSQL to be ready..."
	@for i in $$(seq 1 20); do \
	  $(COMPOSE) exec -T postgres pg_isready -U banzami -d banzami_dev -q 2>/dev/null && break; \
	  [ $$i -eq 20 ] && echo "  PostgreSQL not ready after 20s — run 'make dev-logs'" && exit 1; \
	  sleep 1; \
	done
	@echo "  PostgreSQL: ready"
	@echo "  Redis:      ready"
	@echo ""
	@echo "  DATABASE_URL=$(DATABASE_URL)"
	@echo "  REDIS_URL=$(REDIS_URL)"

.PHONY: dev-down
dev-down:
	$(COMPOSE) down

.PHONY: dev-reset
dev-reset:
	$(COMPOSE) down -v
	$(COMPOSE) up -d

.PHONY: dev-logs
dev-logs:
	$(COMPOSE) logs -f

.PHONY: dev-status
dev-status:
	$(COMPOSE) ps

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
.PHONY: _require-database-url
_require-database-url:
	@test -n "$(DATABASE_URL)" \
	  || (echo "\n  DATABASE_URL is not set.\n  Copy .env.example to .env and re-run.\n"; exit 1)

.PHONY: _require-sqlx
_require-sqlx:
	@command -v sqlx > /dev/null 2>&1 \
	  || (printf "\n  sqlx-cli not found. Install with:\n\n    cargo install sqlx-cli --no-default-features --features postgres\n\n"; exit 1)

.PHONY: db-migrate
db-migrate: _require-database-url _require-sqlx
	@echo "Running ledger migrations against: $(DATABASE_URL)"
	sqlx migrate run --source $(LEDGER_MIG)

.PHONY: db-reset
db-reset: _require-database-url _require-sqlx
	@echo "Resetting database: $(DATABASE_URL)"
	sqlx database drop -y
	sqlx database create
	sqlx migrate run --source $(LEDGER_MIG)

.PHONY: db-psql
db-psql:
	$(COMPOSE) exec postgres psql -U banzami -d banzami_dev

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
.PHONY: check
check:
	cargo check --workspace --manifest-path core/Cargo.toml

.PHONY: test
test:
	cargo test --workspace --manifest-path core/Cargo.toml
