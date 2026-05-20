# Banzami — developer convenience targets
# All commands assume the repo root as working directory.
#
# Prerequisites:
#   docker        https://docs.docker.com/get-docker/
#   sqlx-cli      cargo install sqlx-cli --no-default-features --features postgres
#   Go 1.22+      https://go.dev/dl/
#   Rust stable   https://rustup.rs/
#   tmux          brew install tmux  |  sudo apt install tmux
#
# Quick start — full stack in one command (requires tmux):
#   cp .env.example .env    # fill in JWT_SECRET, ADMIN_API_KEY, account IDs
#   ./dev.sh                # launches infra + all services + all apps in tmux
#   ./dev.sh stop           # kills everything
#
# Manual (individual terminals, no tmux):
#   make dev-up             # start PostgreSQL + Redis
#   make db-migrate         # apply all migrations
#   make core-run           # Rust core-api (:8081)
#   make gateway-run        # Go api-gateway (:8080)
#   make admin-api-run      # Go admin-api (:8082)
#   make public-api-run     # Go public-api (:8083)
#
# Full containerised stack:
#   make sqlx-prepare       # generate .sqlx/ cache (once, then commit)
#   make stack-build        # build all Docker images
#   make stack-up           # start everything in containers

ifneq (,$(wildcard .env))
  include .env
  export
endif

COMPOSE_INFRA  = docker compose -f infra/docker/docker-compose.yml
COMPOSE_FULL   = docker compose -f infra/docker/docker-compose.full.yml
DB_MIG         = db/migrations
CORE_DIR       = core
GATEWAY_DIR    = services/api-gateway
ADMIN_DIR      = services/admin-api
PUBLIC_API_DIR = services/public-api

.DEFAULT_GOAL := help

# ─── Help ─────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@printf "\nBanzami — local development\n\n"
	@printf "  \033[1mFull stack (tmux required)\033[0m\n"
	@printf "    ./dev.sh             Launch everything in a tmux session\n"
	@printf "    ./dev.sh stop        Kill all services and the tmux session\n"
	@printf "    tmux attach -t banzami  Re-attach to a running session\n"
	@printf "\n  \033[1mInfrastructure (DB + Redis only)\033[0m\n"
	@printf "    make dev-up          Start PostgreSQL and Redis (detached)\n"
	@printf "    make dev-down        Stop infrastructure\n"
	@printf "    make dev-reset       Destroy volumes and restart (fresh state)\n"
	@printf "    make dev-logs        Tail infrastructure logs\n"
	@printf "    make dev-status      Show container health\n"
	@printf "\n  \033[1mDatabase\033[0m\n"
	@printf "    make db-migrate      Apply all pending migrations\n"
	@printf "    make db-reset        Drop, recreate, and re-migrate dev database\n"
	@printf "    make db-status       Show applied and pending migrations\n"
	@printf "    make db-psql         Open a psql shell on the dev database\n"
	@printf "\n  \033[1mRust core-api (:8081)\033[0m\n"
	@printf "    make core-run        Run core-api (requires dev-up + db-migrate)\n"
	@printf "    make core-check      cargo check --workspace\n"
	@printf "    make core-test       cargo test  --workspace\n"
	@printf "    make core-build      cargo build --release\n"
	@printf "    make sqlx-prepare    Generate .sqlx/ offline cache for Docker builds\n"
	@printf "\n  \033[1mGo api-gateway (:8080)\033[0m\n"
	@printf "    make gateway-run     Run api-gateway (requires core-run)\n"
	@printf "    make gateway-build   go build ./...\n"
	@printf "    make gateway-check   go vet ./...\n"
	@printf "    make gateway-test    go test ./...\n"
	@printf "\n  \033[1mGo admin-api (:8082)\033[0m\n"
	@printf "    make admin-api-run   Run admin-api (requires core-run)\n"
	@printf "    make admin-api-build go build ./...\n"
	@printf "    make admin-api-check go vet ./...\n"
	@printf "    make admin-api-test  go test ./...\n"
	@printf "\n  \033[1mGo public-api (:8083)\033[0m\n"
	@printf "    make public-api-run  Run public-api (requires core-run)\n"
	@printf "    make public-api-build go build ./...\n"
	@printf "    make public-api-check go vet ./...\n"
	@printf "    make public-api-test go test ./...\n"
	@printf "\n  \033[1mFull containerised stack\033[0m\n"
	@printf "    make stack-build     Build all Docker images\n"
	@printf "    make stack-up        Start full stack in containers (runs migrations)\n"
	@printf "    make stack-down      Stop and remove containers\n"
	@printf "    make stack-logs      Tail all service logs\n"
	@printf "\n  \033[1mLocal tools\033[0m\n"
	@printf "    make studio          Validation Studio — local editor (:3099)\n"
	@printf "\n  \033[1mQuality\033[0m\n"
	@printf "    make check-all       Run all linters, type-checkers, and layout check\n"
	@printf "    make check-repo-layout  Repository layout compliance check (CLAUDE.md §20)\n"
	@printf "    make test-all        Run all test suites\n"
	@printf "\n"

# ─── Prereq guards ────────────────────────────────────────────────────────────
.PHONY: _require-database-url _require-sqlx _require-tmux

_require-tmux:
	@command -v tmux > /dev/null 2>&1 \
	  || (printf "\n  tmux not found. Install:\n\n    macOS:  brew install tmux\n    Debian: sudo apt install tmux\n\n"; exit 1)

_require-database-url:
	@test -n "$(DATABASE_URL)" \
	  || (printf "\n  DATABASE_URL is not set.\n  Copy .env.example to .env and re-run.\n\n"; exit 1)

_require-sqlx:
	@command -v sqlx > /dev/null 2>&1 \
	  || (printf "\n  sqlx-cli not found. Install:\n\n    cargo install sqlx-cli --no-default-features --features postgres\n\n"; exit 1)

# ─── Infrastructure ───────────────────────────────────────────────────────────
.PHONY: dev-up dev-down dev-reset dev-logs dev-status

dev-up:
	$(COMPOSE_INFRA) up -d
	@printf "Waiting for PostgreSQL..."
	@for i in $$(seq 1 30); do \
	  $(COMPOSE_INFRA) exec -T postgres pg_isready -U banzami -d banzami_dev -q 2>/dev/null && break; \
	  [ $$i -eq 30 ] && printf "\n  Timed out waiting for PostgreSQL. Run 'make dev-logs'.\n" && exit 1; \
	  printf "."; sleep 1; \
	done
	@printf " ready\n"
	@printf "  PostgreSQL  → localhost:5433\n"
	@printf "  Redis       → localhost:6379\n"

dev-down:
	$(COMPOSE_INFRA) down

dev-reset:
	$(COMPOSE_INFRA) down -v
	$(COMPOSE_INFRA) up -d

dev-logs:
	$(COMPOSE_INFRA) logs -f

dev-status:
	$(COMPOSE_INFRA) ps

# ─── Database ─────────────────────────────────────────────────────────────────
.PHONY: db-migrate db-reset db-status db-psql

db-migrate: _require-database-url _require-sqlx
	@printf "Applying migrations → $(DATABASE_URL)\n"
	sqlx migrate run --source $(DB_MIG)

db-reset: _require-database-url _require-sqlx
	@printf "Resetting database → $(DATABASE_URL)\n"
	sqlx database drop -y
	sqlx database create
	sqlx migrate run --source $(DB_MIG)

db-status: _require-database-url _require-sqlx
	sqlx migrate info --source $(DB_MIG)

db-psql:
	$(COMPOSE_INFRA) exec postgres psql -U banzami -d banzami_dev

# ─── Rust core-api ────────────────────────────────────────────────────────────
.PHONY: core-run core-check core-test core-build sqlx-prepare

core-run: _require-database-url
	cd $(CORE_DIR) && cargo run --bin core-api

core-check:
	cargo check --workspace --manifest-path $(CORE_DIR)/Cargo.toml

core-test:
	cargo test --workspace --manifest-path $(CORE_DIR)/Cargo.toml

core-build:
	cargo build --release --manifest-path $(CORE_DIR)/Cargo.toml

# Generate .sqlx/ query metadata for offline Docker builds.
# Run this once after any sqlx::query! change, then commit the .sqlx/ directory.
sqlx-prepare: _require-database-url _require-sqlx
	@printf "Generating sqlx offline cache (.sqlx/)...\n"
	cd $(CORE_DIR) && cargo sqlx prepare --workspace
	@printf "Done. Commit the .sqlx/ directory before building Docker images.\n"

# ─── Go api-gateway ───────────────────────────────────────────────────────────
.PHONY: gateway-run gateway-build gateway-check gateway-test

gateway-run: _require-database-url
	cd $(GATEWAY_DIR) && go run ./cmd/gateway

gateway-build:
	cd $(GATEWAY_DIR) && go build ./...

gateway-check:
	cd $(GATEWAY_DIR) && go vet ./...

gateway-test:
	cd $(GATEWAY_DIR) && go test ./...

# ─── Go admin-api ─────────────────────────────────────────────────────────────
.PHONY: admin-api-run admin-api-build admin-api-check admin-api-test

admin-api-run:
	cd $(ADMIN_DIR) && go run ./cmd/admin

admin-api-build:
	cd $(ADMIN_DIR) && go build ./...

admin-api-check:
	cd $(ADMIN_DIR) && go vet ./...

admin-api-test:
	cd $(ADMIN_DIR) && go test ./...

# ─── Go public-api ────────────────────────────────────────────────────────────
.PHONY: public-api-run public-api-build public-api-check public-api-test

public-api-run:
	cd $(PUBLIC_API_DIR) && go run ./cmd/public-api

public-api-build:
	cd $(PUBLIC_API_DIR) && go build ./...

public-api-check:
	cd $(PUBLIC_API_DIR) && go vet ./...

public-api-test:
	cd $(PUBLIC_API_DIR) && go test ./...

# ─── Full containerised stack ─────────────────────────────────────────────────
.PHONY: stack-build stack-up stack-down stack-logs

stack-build:
	$(COMPOSE_FULL) build

# Starts the full stack. Applies migrations before launching app containers.
# Requires: .env with JWT_SECRET, ADMIN_API_KEY, TRANSIT_ACCOUNT_ID, BANK_ACCOUNT_ID set.
# Requires: .sqlx/ committed (run `make sqlx-prepare` first).
stack-up: _require-database-url _require-sqlx
	$(COMPOSE_FULL) up -d postgres redis
	@printf "Waiting for PostgreSQL..."
	@for i in $$(seq 1 30); do \
	  $(COMPOSE_FULL) exec -T postgres pg_isready -U banzami -d banzami_dev -q 2>/dev/null && break; \
	  [ $$i -eq 30 ] && printf "\n  Timed out.\n" && exit 1; \
	  printf "."; sleep 1; \
	done
	@printf " ready\n"
	sqlx migrate run --source $(DB_MIG)
	$(COMPOSE_FULL) up -d core-api api-gateway admin-api public-api
	@printf "\n  Services starting...\n"
	@printf "  api-gateway  → http://localhost:8080\n"
	@printf "  admin-api    → http://localhost:8082\n"
	@printf "  public-api   → http://localhost:8083\n"
	@printf "  core-api     → http://localhost:8081  (internal)\n"
	@printf "  Prometheus   → http://localhost:9090\n"
	@printf "  Grafana      → http://localhost:3000\n"
	@printf "  PostgreSQL   → localhost:5433\n"
	@printf "  Redis        → localhost:6379\n\n"

stack-down:
	$(COMPOSE_FULL) down

stack-logs:
	$(COMPOSE_FULL) logs -f

# ─── Quality gates ────────────────────────────────────────────────────────────
.PHONY: check-all test-all check-repo-layout

check-repo-layout:
	node tools/check-repository-layout.mjs

check-all: core-check gateway-check admin-api-check public-api-check check-repo-layout
	@printf "\nAll checks passed.\n"

sdk-test:
	cd sdk/typescript && npm ci && npm test

test-all: core-test gateway-test admin-api-test public-api-test sdk-test
	@printf "\nAll test suites passed.\n"

# ─── Local tools ──────────────────────────────────────────────────────────────
.PHONY: studio studio-install

studio-install:
	cd apps/validation-studio && npm install

studio: studio-install
	cd apps/validation-studio && npm run dev
