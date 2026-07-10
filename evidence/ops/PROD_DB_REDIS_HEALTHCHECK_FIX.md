# Production Postgres/Redis Healthcheck Fix (repository-only)

Version: 1.0
Date: 2026-07-10
Source commit at execution: `af3fa5c759b59f90921a16d27e5b7f819b33d62c`

> **Scope note.** Sanitised: no IPs, hostnames, SSH users, server paths, secrets,
> tokens, DB URLs, raw logs or raw Docker output. Repository/config change only — no
> server interaction, no container restart, no Docker compose invocation.

## Prior issue (Stage A precheck · Stage C readiness D5/D6)

- **D5 — Postgres:** the production healthcheck probed a database name that does not
  exist in the cluster. `pg_isready` only checks that the server accepts connections,
  so health reported OK **for the wrong reason**, while the server logged a FATAL
  "database does not exist" on every probe (permanent log noise; the probe proved
  nothing about the real database).
- **D6 — Redis:** the production healthcheck ran an **unauthenticated** `redis-cli
  ping` against a password-protected Redis. `redis-cli` exits 0 even when the server
  replies NOAUTH, so the check would keep reporting healthy even if Redis were
  rejecting every real client (false positive; masks real outages from monitoring).

## Fix applied (versioned source of truth)

New `infra/docker/production-healthchecks.override.yml`:

- **Postgres** — probes the database that actually exists in the production cluster
  (the staging/sandbox database; the Stage A evidence records that no live-money
  database exists there) and additionally proves the database **opens** with a
  read-only `SELECT 1` over the container-local socket. No password used or exposed.
- **Redis** — authenticated `PING` reading the password from the container
  environment at probe time (`--no-auth-warning`; the value is never embedded in the
  config or printed by the check) and passing **only on a literal PONG** reply — any
  NOAUTH/auth failure now fails the check.

Hardened for parity (fail-closed even if auth is added later): the local compose
Redis healthchecks now also require a PONG reply instead of accepting any exit-0 ping.

**Applying the override to the server is a separate, explicitly approved operation**
(compose config update + container recreate for healthcheck definitions to take
effect). Nothing in the repository auto-applies it and no deploy path exists for it —
the deploy authority gate is unchanged.

## Files changed

- `infra/docker/production-healthchecks.override.yml` — new (versioned fix).
- `infra/docker/docker-compose.full.yml` — local Redis healthcheck requires PONG.
- `infra/docker/docker-compose.yml` — local Redis healthchecks (2) require PONG.
- `tests/ops/prod-healthchecks.test.sh` — new static validation.
- `evidence/ops/PROD_DB_REDIS_HEALTHCHECK_FIX.md` — this note.

## Validation performed (no Docker, no network, no DB)

- `tests/ops/prod-healthchecks.test.sh` — **7/7 pass**: postgres healthcheck targets
  the existing database and no longer references the nonexistent name; it verifies the
  database opens; redis healthcheck authenticates and cannot treat NOAUTH as healthy;
  local parity; no secret literal committed; the override touches only postgres/redis
  healthcheck+env (no build/image/ports/volumes — **no application service restore
  path opened**); deploy authority gate still blocks unsupported services.
- `tests/ops/deploy-authority-gate.test.sh` — **16/16 pass** (gate unchanged).
- `tests/ops/website-assurance-gate.test.sh` — **7/7 pass** (website guarantees unchanged).
- `bash -n` on deploy.sh and both test scripts — OK.
- Override parses as valid YAML with exactly the two intended services.
- Full assurance tool set (layout · manifest · inventory · live-fail-closed ·
  docs-claims · SDK-contract · website-preflight) — pass.
- Sanitiser/secret scan over changed files — clean.

## Services NOT touched

No server interaction of any kind: website app + website-edge, Stage B guard, rt04e
sandbox project, production Postgres/Redis containers (running unchanged with the old
healthchecks until the override is applied in a separately approved operation), DNS,
certificates, SMTP, external providers, and every payment/admin/gateway/API/pay/
checkout/developers/Developer Platform service. No deploy, restart, rebuild,
migration, database write or proxy routing change. Stage A evidence, Stage B guard,
Stage C NOT IMPLEMENTED / NOT APPROVED, deploy authority gate, single-source-of-truth
guard and the no-QEMU guarantee are all preserved.

## Remaining follow-ups

1. Apply the override server-side (compose config update + postgres/redis container
   recreate) in a separately approved operation, then verify probes and log silence.
2. `ops: host secret-hygiene cleanup` (D9) — unchanged.
3. Stage C implementation PRs — still gated on explicit Stage C execution approval.

## Final status

**PRODUCTION DB/REDIS HEALTHCHECKS FIXED IN REPO — NO SERVICES CHANGED.**
