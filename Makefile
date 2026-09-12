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
	@printf "    make website         Official Banzami website — local dev (:3005)\n"
	@printf "\n  \033[1mQuality\033[0m\n"
	@printf "    make check-all       Run all linters, type-checkers, layout + security checks\n"
	@printf "    make security-check  Security regressions, secret scan, dependency audit\n"
	@printf "    make check-repo-layout  Repository layout compliance check (CLAUDE.md §20)\n"
	@printf "    make check-harness-hygiene  E2E harnesses can give back what they mint\n"
	@printf "    make check-remote-contract  remote proofs report their real exit status\n"
	@printf "    make check-host-attestation the Sandbox host matches ops/sandbox-host-manifest.tsv\n"
	@printf "    make check-sdk-payment-boundary  SDK is the single source of payment flows\n"
	@printf "    make banza-conformance-l0  Run BANZA L0 conformance against the sandbox (evidence)\n"
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
.PHONY: db-migrate db-reset db-status db-psql db-drift-check db-verify

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

# Report schema-parity drift between two databases (live vs sandbox). Set
# REFERENCE_DATABASE_URL (e.g. sandbox) and DATABASE_URL (e.g. live). Allow-list
# documented divergences with PARITY_IGNORE. See tools/check-migration-drift.sh.
db-drift-check:
	bash tools/check-migration-drift.sh

# Verify the active migration source against DATABASE_URL: tracked, no pending, and
# frozen Phase-2 migrations kept out of the active source. Same gate as CI.
db-verify: _require-database-url _require-sqlx
	@sqlx migrate info --source $(DB_MIG) | grep -qi pending \
	  && { printf "  ✗ pending migrations — run 'make db-migrate'\n"; exit 1; } \
	  || printf "  ✓ no pending migrations\n"
	@ls $(DB_MIG)/0064_* $(DB_MIG)/0065_* $(DB_MIG)/0066_* >/dev/null 2>&1 \
	  && { printf "  ✗ a frozen Phase-2 migration is in the active source\n"; exit 1; } \
	  || printf "  ✓ frozen Phase-2 migrations are out of the active source\n"

db-psql:
	$(COMPOSE_INFRA) exec postgres psql -U banzami -d banzami_dev

# ─── Rust core-api ────────────────────────────────────────────────────────────
.PHONY: core-run core-check core-test core-build sqlx-prepare

core-run: _require-database-url
	cd $(CORE_DIR) && cargo run --bin core-api

# SQLX_OFFLINE for the same reason core-test uses it (see the note below): a
# plain `cargo check` resolves sqlx::query! against DATABASE_URL, so `make
# check-all` failed with 54 "connection refused" errors on any machine without
# a local dev database — a green-or-red signal that measured the developer's
# postgres rather than the code.
core-check:
	SQLX_OFFLINE=true cargo check --workspace --manifest-path $(CORE_DIR)/Cargo.toml

# SQLX_OFFLINE=true forces the compile-time sqlx::query! checks to use the
# committed .sqlx/ cache instead of connecting to DATABASE_URL. Without it, a plain
# `cargo test` silently connects to the dev DB (.env) and fails to compile when that
# DB lags the migrations (e.g. a missing `disputes` table) — see audit Part 16.
core-test:
	SQLX_OFFLINE=true cargo test --workspace --manifest-path $(CORE_DIR)/Cargo.toml

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
check-component-coverage:
	@node tools/check-component-coverage.mjs

.PHONY: check-component-coverage check-all test-all check-repo-layout check-pricing-consumers check-economic-authority check-released-operations check-harness-hygiene check-remote-contract check-host-attestation check-sdk-payment-boundary banza-conformance-l0 check-assurance check-assurance-release check-assurance-reference

check-repo-layout:
	node tools/check-repository-layout.mjs

# Where this operator is allowed to charge money. Static, so it runs in CI: a
# new crate depending on banzami-pricing is a new economic entrypoint, and it
# must be reviewed rather than merged as a dependency line.
check-pricing-consumers:
	node tools/check-pricing-consumers.mjs

# CLIENT-CONTROLLED ECONOMIC-POLICY AUTHORITY — a caller influencing what it is
# charged without ever sending an amount. Three separate fixes each looked
# complete and each left another door open, so the class gets a named gate and a
# self-test that reintroduces every instance.
check-economic-authority:
	node tools/check-economic-authority.mjs
	node tools/check-economic-authority.selftest.mjs

# A new fee-bearing operation is a new place this operator charges money. The
# enum, the database constraint and the completeness gate must agree, so adding
# a variant alone fails here rather than at runtime on a real withdrawal.
check-released-operations:
	node tools/check-released-operations.mjs

# Static half of the E2E fixture-hygiene gate. The dynamic half needs the
# deployed Sandbox: tests/phase0/fixture-hygiene-suite.sh, run by the operator.
check-harness-hygiene:
	node tools/check-harness-hygiene.mjs
	node tools/check-harness-hygiene.selftest.mjs
	node tools/check-harness-hygiene.console.selftest.mjs

# Remote proofs must report what happened on the far side. Needs the Sandbox
# host, so it is not a CI job — CI has no credentials for it, deliberately.
check-remote-contract:
	node tools/check-remote-wrappers.mjs
	node tools/check-remote-wrappers.selftest.mjs
	node tools/check-deploy-status-capture.mjs
	node tools/check-deploy-status-capture.selftest.mjs
	bash tools/ops/lib/remote.selftest.sh

# What is actually running on the Sandbox host, against ops/sandbox-host-manifest.tsv.
# Needs the host, so it is not a CI job: CI holds no credentials for it.
check-host-attestation:
	bash tests/phase0/sandbox-host-attestation.sh

# ─── Security gate ────────────────────────────────────────────────────────────
# Aggregates the repository-owned security checks: the regression suites that
# encode every remediated finding (SEC-001…SEC-008), a secret scan over tracked
# files, and dependency vulnerability scans. Optional scanners that are not
# installed are reported as SKIPPED rather than failing, so the result is
# reproducible on any developer machine; everything it can observe is enforced.
# See docs/security/BANZAMI_SECURITY_AUDIT.md.
.PHONY: security-check
security-check:
	tools/security-check.sh

# Canonical assurance manifest gate (quality/operator-assurance-manifest.yaml).
# Structural mode runs in check-all. Two launch gates:
#   check-assurance-reference — reference financial path readiness (can pass now)
#   check-assurance-release   — FULL external Sandbox launch (HOLD until every
#                               public surface is deployed-E2E released)
check-assurance:
	node tools/check-assurance-manifest.mjs

check-assurance-reference:
	node tools/check-assurance-manifest.mjs --reference

check-assurance-release:
	node tools/check-assurance-manifest.mjs --sandbox-launch

# Enforce that the Flutter SDK is the single source of truth for payment flows
# (docs/adr/SDK_PAYMENT_SOURCE_OF_TRUTH.md).
.PHONY: check-openapi-drift
check-openapi-drift:
	node tools/check-openapi-route-drift.mjs

.PHONY: check-deploy-parity
check-deploy-parity:
	node tools/check-deploy-parity.mjs

.PHONY: check-retired-surfaces
check-retired-surfaces:
	node tools/check-retired-surfaces.mjs

.PHONY: check-docs-drift
check-docs-drift:
	node tools/check-docs-drift.mjs

# Reads the live Sandbox; not part of check-all, which must run without a host.
.PHONY: check-canonical-resources
check-canonical-resources:
	node tools/check-canonical-resources.mjs

check-sdk-payment-boundary:
	node tools/check-sdk-payment-boundary.mjs

# Run the official BANZA conformance suite (Level 0) against the Banzami sandbox
# as an operator candidate. Produces evidence (not a certificate) under
# evidence/banza-conformance/l0/. See that directory's README.
banza-conformance-l0:
	tools/banza-conformance-l0.sh

check-all: core-check gateway-check admin-api-check public-api-check check-repo-layout check-sdk-payment-boundary check-assurance check-component-coverage security-check check-openapi-drift check-retired-surfaces check-docs-drift
	@printf "\nAll checks passed.\n"

# ─── Assurance command bundles (docs/quality/E2E_METHODOLOGY.md) ──────────────
.PHONY: assure-fast assure-full assure-sandbox assure-reference assure-sandbox-launch assure-release assure-inventory assure-sandbox-runtime

# Reference financial path gate — passes on the verified reference path alone.
assure-reference: check-assurance check-assurance-reference
	@printf "\nReference-path assurance passed.\n"

# FULL external Sandbox launch gate — HOLDs until every public surface is
# deployed-E2E released. This is the gate that authorises an external launch.
assure-sandbox-launch: check-assurance check-assurance-release check-repo-layout assure-inventory assure-sandbox-runtime check-live-fail-closed check-mobile-config check-docs-claims check-sdk-contract
	@printf "\nFULL external Sandbox launch gate passed.\n"

.PHONY: check-live-fail-closed
check-live-fail-closed:
	node tools/check-live-fail-closed.mjs

check-mobile-config:
	node tools/check-mobile-sandbox-config.mjs

.PHONY: check-docs-claims check-sdk-contract assure-developer-foundation
check-docs-claims:
	node tools/check-docs-claims.mjs

check-sdk-contract:
	node tools/check-sdk-contract.mjs

.PHONY: sdk-release-prepare
sdk-release-prepare:
	node tools/sdk-release.mjs

# Release Train 01 dedicated gate — HOLDs until Console, API-key lifecycle,
# Docs and TypeScript SDK are all released with deployed evidence.
assure-developer-foundation:
	node tools/check-developer-foundation.mjs

.PHONY: assure-payments-foundation
assure-payments-foundation:
	node tools/check-payments-foundation.mjs

# RT04C — controlled deployment + full deployed E2E gate for the ADR-047 payment
# binding. Enforces the build-level controls now and HOLDs until the deployed
# Sandbox E2E evidence is registered and the three capabilities are released.
.PHONY: assure-project-payment-binding
assure-project-payment-binding:
	node tools/check-project-payment-binding.mjs

# RT04E secure-rollout static hygiene — rejects migration/payee-credential leakage
# patterns across the whole chain + compose boundary
# (docs/operations/RT04E_SECURE_OPERATOR_ROLLOUT.md).
.PHONY: check-rollout-secret-hygiene
check-rollout-secret-hygiene:
	node tools/check-rollout-secret-hygiene.mjs

# RT04E rollout runner canary/lock/revision harness — runs the real runner against
# a fake sentinel + stubbed chain in an isolated temp dir (no real service/secret).
.PHONY: test-rollout-runner
test-rollout-runner:
	bash tools/test/rt04e-rollout-verify.sh

# ─── Mobile iOS Simulator E2E (docs/quality/MOBILE_E2E_REQUIREMENTS.md) ───────
# These run the deployed-Sandbox simulator matrices. They FAIL until the
# integration_test/ suites + registered evidence exist — that is the gate that
# keeps a mobile app out of `released-sandbox` until it is genuinely proven.
.PHONY: check-mobile-config assure-mobile-consumer-ios assure-mobile-merchant-ios assure-mobile-cross-app-ios assure-mobile-ios

assure-mobile-consumer-ios:
	@bash tools/mobile/run-ios-e2e.sh consumer

assure-mobile-merchant-ios:
	@bash tools/mobile/run-ios-e2e.sh merchant

assure-mobile-cross-app-ios:
	@bash tools/mobile/run-ios-e2e.sh cross-app

assure-mobile-ios: check-mobile-config assure-mobile-consumer-ios assure-mobile-merchant-ios assure-mobile-cross-app-ios
	@printf "\nMobile iOS Simulator assurance passed.\n"

# Fast local assurance — seconds; suitable for pre-commit.
assure-fast: check-repo-layout check-assurance check-sdk-payment-boundary
	@printf "\nFast assurance passed.\n"

# Full local assurance — everything that does not need the deployed sandbox.
assure-full: check-all test-all
	@printf "\nFull local assurance passed.\n"

# Deployed-sandbox E2E — real flows against sandbox-api.banzami.com.
# Guarded, opt-in, sandbox-only (tools/e2e/README.md).
assure-sandbox:
	BANZAMI_E2E=RUN node tools/e2e/transfer-sandbox-e2e.mjs

# Release-readiness gate — alias of the FULL external Sandbox launch gate.
assure-release: assure-sandbox-launch
	@printf "\nRelease-readiness gate passed.\n"

# Cleanup / inventory assurance — asset inventory + disposition sanity.
#
# DELIBERATELY STATIC. This validates INTENDED state (lifecycle values, secret
# hygiene, dispositions) and is offline and deterministic. It must never grow a
# network probe: a static registry that sometimes fails because a host is slow
# is worse than one that is honest about what it covers.
assure-inventory:
	node tools/check-asset-inventory.mjs

# Sandbox RUNTIME assurance — the separate layer that proves OPERATIONAL state.
#
# assure-inventory says what should be running; this says what IS running. The
# two are kept apart on purpose: the inventory gate passed for weeks while the
# Sandbox public surfaces answered 503, because a static registry cannot observe
# reality. Network-dependent by design — that is the point of it.
#
# Runtime healthy != capability released. This gate proves only that the
# environment CAN be tested; capability release still requires the e2e_sandbox
# test IDs and evidence artifacts the assurance manifest demands.
#
# Probe the origin directly (before public routing is live) with:
#   BANZAMI_SANDBOX_API_BASE=https://sandbox-api.banzami.com:2053 \
#   BANZAMI_SANDBOX_DEVAPI_BASE=https://developer-api.banzami.com:2053 \
#   BANZAMI_SANDBOX_INSECURE_TLS=1 make assure-sandbox-runtime
assure-sandbox-runtime:
	node tools/check-sandbox-runtime.mjs

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

.PHONY: website website-install

website-install:
	cd apps/website && npm install

website: website-install
	cd apps/website && npm run dev

.PHONY: website-docker-build website-docker-run

website-docker-build:
	docker build -t banzami/website-frontend:latest apps/website

website-docker-run: website-docker-build
	docker run --rm -p 3000:3000 banzami/website-frontend:latest

# GitHub App canonical source-access plan — static gate
# (docs/operations/GITHUB_APP_CANONICAL_SOURCE_ACCESS.md).
.PHONY: check-github-app-source-access
check-github-app-source-access:
	node tools/check-github-app-source-access.mjs

# RT04E Sandbox rollout safety gate — 16 static checks + behavioural/continuity
# checks 17-92 over the RT04E deployment definitions (immutable tags, isolation,
# prune-proof rollback, --no-env-resolution confidentiality, base-only vs full
# attestation projections, full-SHA identity, hermetic Compose wrapper + inherited
# COMPOSE_* rejection, target-scoped prohibited-service handling, the two-mode
# execution boundary + migration-receipt writer/validator + 30-min freshness &
# single-use consume-on-use lifecycle, constrained-parser fixtures). Docker/DB/secret-free.
# See docs/operations/RT04E_SANDBOX_ROLLOUT.md.
.PHONY: check-rt04e-rollout-safety
check-rt04e-rollout-safety:
	node tools/check-rt04e-rollout-safety.mjs

# Banzami Environment Blueprint static validators (checks 1-13): shared-blueprint
# derivation, Live structural-validity-but-unprovisioned, Sandbox/Live isolation,
# no host-published Postgres port, no secret literals, read-only file secret
# interface, immutable migration-runner contract, autonomous migration-controller
# precondition contract. Docker/DB/network/secret-free.
# See infra/blueprint/docs/.
.PHONY: check-blueprint
check-blueprint:
	node infra/blueprint/validators/check-blueprint.mjs

# Reproducible, no-global-install Dockerfile lint for the migration-runner (offline;
# no Docker/hadolint/secret/VM). A pinned hadolint container may also be run where
# Docker is available; this repo-contained linter is the gate of record.
.PHONY: check-dockerfile-lint
check-dockerfile-lint:
	node infra/blueprint/validators/check-dockerfile.mjs

# ── Blueprint Increment 2A — disposable local PostgreSQL runtime lab ──────────
# LOCAL · DISPOSABLE · SYNTHETIC · non-Sandbox · non-LIVE · non-production.
# Never contacts the VM. All resources are per-run, labelled, and torn down.
# check-blueprint-lab is a static (no-Docker) gate; the blueprint-lab-* targets
# require a local Docker Engine + Compose v2.
.PHONY: check-blueprint-lab blueprint-lab-up blueprint-lab-verify blueprint-lab-down blueprint-lab-verify-clean blueprint-lab-full
check-blueprint-lab:
	node infra/blueprint/validators/check-blueprint-lab.mjs

blueprint-lab-up:
	bash infra/blueprint/lab/scripts/lab.sh up

blueprint-lab-verify:
	bash infra/blueprint/lab/scripts/lab.sh verify

blueprint-lab-down:
	bash infra/blueprint/lab/scripts/lab.sh down

blueprint-lab-verify-clean:
	bash infra/blueprint/lab/scripts/lab.sh verify-clean

blueprint-lab-full:
	bash infra/blueprint/lab/scripts/lab.sh full

# ── Blueprint Increment 2B — migration-runner build/attestation/inspection lab ──
# LOCAL · DISPOSABLE · non-deploying · non-migrating. Builds the runner image from
# canonical source, generates real SBOM + provenance, inspects the image with the
# network disabled, and tears everything down. check-blueprint-runner-build is a
# static (no-Docker) gate; blueprint-runner-* require Docker Engine + Buildx.
.PHONY: check-blueprint-runner-build blueprint-runner-build blueprint-runner-verify blueprint-runner-clean blueprint-runner-full
check-blueprint-runner-build:
	node infra/blueprint/validators/check-blueprint-runner-build.mjs

blueprint-runner-build:
	bash infra/blueprint/build-lab/scripts/runner-build-lab.sh build

blueprint-runner-verify:
	bash infra/blueprint/build-lab/scripts/runner-build-lab.sh verify

blueprint-runner-clean:
	bash infra/blueprint/build-lab/scripts/runner-build-lab.sh clean

blueprint-runner-full:
	bash infra/blueprint/build-lab/scripts/runner-build-lab.sh full

# ── Blueprint Increment 2C — disposable canonical migration database lab ───────
# LOCAL · SYNTHETIC · DISPOSABLE · non-deploying. Applies the canonical migration
# set to a throwaway pg16, proves integrity/drift/ownership, and tears down.
# check-blueprint-migration-lab is a static (no-Docker) gate; blueprint-migration-lab-*
# require Docker Engine + Buildx.
.PHONY: check-blueprint-migration-lab blueprint-migration-lab-run blueprint-migration-lab-verify blueprint-migration-lab-clean blueprint-migration-lab-full
check-blueprint-migration-lab:
	node infra/blueprint/validators/check-blueprint-migration-lab.mjs

blueprint-migration-lab-run:
	bash infra/blueprint/migration-lab/scripts/migration-lab.sh run

blueprint-migration-lab-verify:
	bash infra/blueprint/migration-lab/scripts/migration-lab.sh verify

blueprint-migration-lab-clean:
	bash infra/blueprint/migration-lab/scripts/migration-lab.sh clean

blueprint-migration-lab-full:
	bash infra/blueprint/migration-lab/scripts/migration-lab.sh full

# ── Blueprint Increment 2D — final migration identity + derived executor attestation ──
# LOCAL · SYNTHETIC · DISPOSABLE · non-deploying. Attested derived executor + short-lived
# least-privilege migration login. check-* is a static (no-Docker) gate; the lab targets
# require Docker Engine + Buildx.
.PHONY: check-blueprint-migration-identity blueprint-migration-identity-lab-run blueprint-migration-identity-lab-verify blueprint-migration-identity-lab-clean blueprint-migration-identity-lab-full
check-blueprint-migration-identity:
	node infra/blueprint/validators/check-blueprint-migration-identity.mjs

blueprint-migration-identity-lab-run:
	bash infra/blueprint/migration-identity/scripts/migration-identity.sh run

blueprint-migration-identity-lab-verify:
	bash infra/blueprint/migration-identity/scripts/migration-identity.sh verify

blueprint-migration-identity-lab-clean:
	bash infra/blueprint/migration-identity/scripts/migration-identity.sh clean

blueprint-migration-identity-lab-full:
	bash infra/blueprint/migration-identity/scripts/migration-identity.sh full

# ── Blueprint Increment 2E — controlled migration authorisation/receipt/lock/file-only ──
# LOCAL · SYNTHETIC · DISPOSABLE · non-deploying. Single-use authorisation record + receipt
# lifecycle + REAL advisory-lock concurrency + file-only execution via the short-lived login.
.PHONY: check-blueprint-migration-control blueprint-migration-control-lab-run blueprint-migration-control-lab-verify blueprint-migration-control-lab-clean blueprint-migration-control-lab-full
check-blueprint-migration-control:
	node infra/blueprint/validators/check-blueprint-migration-control.mjs

blueprint-migration-control-lab-run:
	bash infra/blueprint/migration-control/scripts/migration-control.sh run

blueprint-migration-control-lab-verify:
	bash infra/blueprint/migration-control/scripts/migration-control.sh verify

blueprint-migration-control-lab-clean:
	bash infra/blueprint/migration-control/scripts/migration-control.sh clean

blueprint-migration-control-lab-full:
	bash infra/blueprint/migration-control/scripts/migration-control.sh full

# ── Blueprint Increment 2F — unified local completion lab ──────────────────────
# LOCAL · SYNTHETIC · DISPOSABLE · non-deploying. Runs every validated local Blueprint
# phase (2A→2E) from clean state and proves host-wide zero residue across all categories.
.PHONY: check-blueprint-complete blueprint-complete-lab
check-blueprint-complete:
	node infra/blueprint/validators/check-blueprint-complete.mjs

blueprint-complete-lab:
	bash infra/blueprint/complete-lab/complete-lab.sh full

# ── Blueprint — attested Sandbox service-image lab ─────────────────────────────
# LOCAL · DISPOSABLE · non-deploying. Builds attested immutable images for the four
# approved Sandbox services, validates SBOM/provenance/inspection/secret-boundary, and
# tears down. check-* is a static (no-Docker) gate; the lab targets require Docker + Buildx.
.PHONY: check-blueprint-service-images blueprint-service-images-lab-run blueprint-service-images-lab-verify blueprint-service-images-lab-clean blueprint-service-images-lab-full
check-blueprint-service-images:
	node infra/blueprint/validators/check-blueprint-service-images.mjs

blueprint-service-images-lab-run:
	bash infra/blueprint/service-lab/scripts/service-image-lab.sh run

blueprint-service-images-lab-verify:
	bash infra/blueprint/service-lab/scripts/service-image-lab.sh verify

blueprint-service-images-lab-clean:
	bash infra/blueprint/service-lab/scripts/service-image-lab.sh clean

blueprint-service-images-lab-full:
	bash infra/blueprint/service-lab/scripts/service-image-lab.sh full

# ── Blueprint — Sandbox operational adapters (same-VM controlled rebuild tooling) ──
# LOCAL rehearsal only in this repo; the VM apply is a later authorised operational step.
# check-* are static (no-Docker) gates. Bootstrap adapter (Section A) is present; the
# release-package / migration / deployment adapters land as subsequent focused increments.
.PHONY: check-sandbox-operational check-sandbox-bootstrap sandbox-bootstrap-plan sandbox-bootstrap-apply sandbox-bootstrap-verify sandbox-bootstrap-clean sandbox-bootstrap-full
check-sandbox-operational:
	node infra/blueprint/validators/check-sandbox-operational.mjs

check-sandbox-bootstrap:
	node infra/blueprint/validators/check-sandbox-bootstrap.mjs

sandbox-bootstrap-plan:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-bootstrap.sh plan

sandbox-bootstrap-apply:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-bootstrap.sh apply

sandbox-bootstrap-verify:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-bootstrap.sh verify

sandbox-bootstrap-clean:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-bootstrap.sh clean

sandbox-bootstrap-full:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-bootstrap.sh full

# ── Sandbox operational adapter B — verified release package ───────────────────
.PHONY: check-sandbox-release-package sandbox-release-package sandbox-release-package-verify sandbox-release-package-clean sandbox-release-package-full
check-sandbox-release-package:
	node infra/blueprint/validators/check-sandbox-release-package.mjs

# Capacity is a gate, not an afterthought. Disk exhaustion killed a Rust
# attestation build mid-compile twice, and ENOSPC surfaces as a compiler error
# or a hung daemon rather than as "no disk" — an hour after the decision.
.PHONY: release-preflight
release-preflight:
	node tools/release/preflight.mjs

# The build runs under continuous disk observation: peak is what decides whether
# a build survives, and it is only visible while the build is running. Crossing
# the hard floor mid-build aborts the child rather than exhausting the host.
sandbox-release-package: release-preflight
	node tools/release/build-with-sampling.mjs -- bash infra/blueprint/sandbox-ops/scripts/sandbox-release-package.sh build

sandbox-release-package-verify:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-release-package.sh verify

sandbox-release-package-clean:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-release-package.sh clean

sandbox-release-package-full:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-release-package.sh full

# ── Sandbox operational adapter C — controlled banzami_staging migration ───────
# Schema REALITY — distinct from migration state. The ledger being current does
# not imply the application can use the schema: account_identity existed, was
# recorded applied, and was unusable for seven weeks because the runtime role had
# no USAGE on it. Needs a runtime-role DATABASE_URL (a superuser would pass while
# the application still could not connect).
.PHONY: check-schema-reality
check-schema-reality:
	node tools/check-schema-reality.mjs

.PHONY: check-sandbox-migration sandbox-migration-plan sandbox-migration-apply sandbox-migration-verify sandbox-migration-clean
check-sandbox-migration:
	node infra/blueprint/validators/check-sandbox-migration.mjs

sandbox-migration-plan:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-migration.sh plan

sandbox-migration-apply:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-migration.sh apply

sandbox-migration-verify:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-migration.sh verify

sandbox-migration-clean:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-migration.sh clean

# ── Sandbox operational adapter D — provenance-first deployment ────────────────
.PHONY: check-sandbox-deploy sandbox-deploy-plan sandbox-deploy-apply sandbox-deploy-verify sandbox-deploy-clean
check-sandbox-deploy:
	node infra/blueprint/validators/check-sandbox-deploy.mjs

sandbox-deploy-plan:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh plan

sandbox-deploy-apply:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh apply

sandbox-deploy-verify:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh verify

sandbox-deploy-clean:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh clean

# ── Sandbox operational adapter E — full local operational rehearsal ───────────
.PHONY: sandbox-operational-rehearsal
sandbox-operational-rehearsal:
	bash infra/blueprint/sandbox-ops/scripts/sandbox-operational-rehearsal.sh full

# ── Gated same-VM execution adapter ────────────────────────────────────────────
# Static gate + local synthetic validation (no VM). The vm-* apply targets contact
# the VM ONLY through the adapter and require BZVM_SSH_TARGET / BZVM_REMOTE_ROOT
# (runtime env, never committed) plus an explicit --apply and BZVM_AUTH_FILE.
.PHONY: check-vm-execution-adapter vm-execution-test \
	vm-execution-preflight vm-release-transfer-plan vm-release-transfer-apply vm-dry-run \
	vm-legacy-reset-plan vm-legacy-reset-apply vm-sandbox-bootstrap-apply \
	vm-sandbox-migration-apply vm-sandbox-deploy-apply vm-sandbox-deploy-clean vm-sandbox-final-verify
check-vm-execution-adapter:
	node infra/blueprint/validators/check-vm-execution-adapter.mjs

vm-execution-test:
	bash infra/blueprint/vm-execution/test/vm-adapter-test.sh

vm-execution-preflight:
	bash infra/blueprint/vm-execution/vm-execute.sh preflight

vm-release-transfer-plan:
	bash infra/blueprint/vm-execution/vm-execute.sh release-transfer-plan

vm-release-transfer-apply:
	bash infra/blueprint/vm-execution/vm-execute.sh release-transfer-apply --apply

vm-dry-run:
	bash infra/blueprint/vm-execution/vm-execute.sh dry-run --apply

vm-legacy-reset-plan:
	bash infra/blueprint/vm-execution/vm-execute.sh legacy-reset-plan

vm-legacy-reset-apply:
	bash infra/blueprint/vm-execution/vm-execute.sh legacy-reset-apply --apply

vm-sandbox-bootstrap-apply:
	bash infra/blueprint/vm-execution/vm-execute.sh sandbox-bootstrap-apply --apply

vm-sandbox-migration-apply:
	bash infra/blueprint/vm-execution/vm-execute.sh sandbox-migration-apply --apply

vm-sandbox-deploy-apply:
	bash infra/blueprint/vm-execution/vm-execute.sh sandbox-deploy-apply --apply

vm-sandbox-deploy-clean:
	bash infra/blueprint/vm-execution/vm-execute.sh sandbox-deploy-clean --apply

vm-sandbox-final-verify:
	bash infra/blueprint/vm-execution/vm-execute.sh final-verify
