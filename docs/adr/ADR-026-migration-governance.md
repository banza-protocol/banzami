# ADR-026 — Migration Governance: single source of truth, sqlx tracking, Phase-2 freeze

**Status:** Accepted · **Date:** 2026-06-30 · **Supersedes:** none

> Version: 1.0

## Context

The Technical Consistency Audit (Part 4) found that the LIVE (`banzami`), SANDBOX
(`banzami_staging`) and DEV (`banzami_dev`) databases had been provisioned by
hand-applying migration files per-file, **bypassing sqlx's `_sqlx_migrations`
tracking**. Consequences:

- No database had a tracking table, so "which migrations are applied?" was
  unanswerable and `sqlx migrate info` could not be trusted.
- Migrations were applied **non-sequentially / cherry-picked**: LIVE had the high
  migrations (0072–0078) but was missing low ones (0027 refunds, 0028 disputes,
  0030 payment_requests) — code that registered those routes would 500 in LIVE.
- `cargo test` (online `sqlx::query!`) connected to the dev DB and failed to compile
  whenever it lagged the migrations.
- The **Collections / Split Charges** prototype (0064 collections, 0065
  payment_intents, 0066 collection_shares) existed in SANDBOX but is gated by BANZA
  ADR-036 (not yet ratified) and must not ship to LIVE.

## Decision

1. **`sqlx migrate run` is the single official migration mechanism.** All three
   databases adopt the `_sqlx_migrations` tracking table; it is backfilled to match
   reality byte-for-byte (`tools/sqlx-backfill.sh`, verified identical to real sqlx
   output). After adoption, `sqlx migrate run` is a clean no-op and governs all
   future changes. No more manual per-file `psql`.

2. **Operator features are brought to LIVE parity now.** `refunds`, `disputes`,
   `payment_requests` (0027/0028/0030) are operator-infrastructure capabilities,
   independent of Split Charges, and were applied to LIVE (additive, pre-validated
   zero violations).

3. **Collections/Split-Charges migrations are frozen out of the active source.**
   0064/0065/0066 moved to `db/migrations.phase2/` (outside the sqlx source) so
   `sqlx migrate run` never creates them. They are reintroduced in Phase 2 with
   BANZA ADR-036, renumbered to the sequence tail, using `CREATE TABLE IF NOT
   EXISTS`. SANDBOX's existing prototype tables remain as untracked, harmless
   extras until then. This honours the protocol-first rule (Banzami ADR-019).

4. **Drift is enforced, not hoped for.**
   - CI job `migrations` fails on an invalid/out-of-order sequence, pending
     migrations after run, a frozen migration leaking into the active source, or a
     `sqlx-backfill` that drifts from real sqlx tracking.
   - `make db-verify` (local) mirrors the CI gate; `make db-drift-check`
     (`tools/check-migration-drift.sh`) reports live↔sandbox schema-parity drift.
   - The api-gateway validates required operator tables at **startup**
     (`validateGatewaySchema`): a LIVE stack missing one refuses to boot rather
     than 500-ing on first request.

## Rationale

sqlx's tracking is strictly sequential, which is exactly why the team bypassed it
and drift accumulated. Adopting it correctly (backfill to truth) restores a single
source of truth without re-running migrations on production. The freeze keeps the
unratified Collections contract from churning the schema, while parity for genuine
operator features removes the latent 500 risk.

## Alternatives considered

- **Mark collections as applied-but-absent on LIVE** (lie to sqlx so it skips them):
  rejected — dishonest tracking; the tables would never be created.
- **Apply all 6 migrations to LIVE for literal parity:** rejected — promotes a
  protocol-gated prototype to production ahead of ADR-036.
- **Keep the hand-applied model + a drift report only:** rejected — does not give a
  single source of truth or a deployment mechanism.

## Consequences

- `_sqlx_migrations` is authoritative on LIVE/SANDBOX/DEV; deploys run `sqlx migrate
  run`.
- DEV is recreated from the active source (it was inconsistent); its data is
  regenerable by design.
- One documented, tested rollback exists
  (`docs/runbooks/rollback-2026-06-30-migration-governance.sql`).
- Phase 2 must reintroduce the frozen migrations through the ADR-036 process before
  Collections/Split Charges ships.
