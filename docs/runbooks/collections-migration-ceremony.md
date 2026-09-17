# Runbook — Collections migration ceremony (COLLECTIONS-PROTOCOL-AND-PRODUCT-001)

Enables the ratified **Collections / cobrança dividida** capability (BANZA ADR-016 +
ADR-015) by applying the folded tracked migrations `0156–0158` to a database. This
is the **owner-gated** step (ADR-BLUEPRINT-004): the code, protocol, schema, domain
logic and tests are all done and on `main`; only the DB apply + Core restart remain.

All other work for this milestone is complete and merged. Nothing here uses ad-hoc
SQL — application goes through the canonical migrator / autonomous controller.

## Bindings (verify before issuing the authorisation record)

- `source_revision` (git HEAD carrying `0156–0158`): **`cfa02e42e7c92f86470ab1d73ba165befe1bb5de`** (or later, if more has merged — recompute the digest then).
- `target`: `banzami_staging` (Sandbox).
- `migration_directory_digest` (controller `amc_migration_digest(db/migrations)`): **`978e07482a4c6015be7354c0f98dc913bf9ec6f90581be454702017679c11200`**
  - recompute with: `( cd db/migrations && ls -1 [0-9]*.sql | LC_ALL=C sort | while read f; do printf '%s\n' "$f"; shasum -a 256 "$f"; done ) | shasum -a 256 | cut -d' ' -f1`

## SANDBOX (autonomous controller — `sandbox-autonomous-migration-only`)

1. Ensure `/srv/banzami/src` on the Sandbox host is at `source_revision` above.
2. Issue the single-use authorisation record (root, root-protected path, non-symlink,
   single hard link, no credential content) with fields:
   ```
   state=issued
   source_revision=cfa02e42e7c92f86470ab1d73ba165befe1bb5de
   target=banzami_staging
   migration_directory_digest=978e07482a4c6015be7354c0f98dc913bf9ec6f90581be454702017679c11200
   issued_epoch=<now>
   expires_epoch=<now + short window>
   ```
3. Run the controller (`infra/blueprint/migration-controller/rt04e-autonomous-migration-controller.sh`, no argv) in the approved RT04E sandbox runtime. It validates the record → digest → provenance, applies `db/migrations` via the migrator (idempotent: `0156–0158` are `CREATE ... IF NOT EXISTS`), and consumes the record.
4. **Restart `core-api-staging`** — Core caches `collections_available()` in a
   `OnceCell`; without a restart it keeps returning 503 even after the tables exist.
   ```bash
   ssh root@217.160.9.248 "docker restart \$(docker ps --format '{{.Names}}' | grep -m1 core-api-staging)"
   ```
5. Verify: `POST /v1/collections` (merchant JWT) returns 201, not 503
   `COLLECTIONS_UNAVAILABLE`. The E2E in step "Post-ceremony" then runs green.

## LIVE (separate ceremony — dual-control, do NOT autorun)

Per ADR-BLUEPRINT-004, Live migration requires explicit approval, dual-control,
a maintenance window, verified backup/restore and immutable release attestation.
`0156–0158` are in the tracked chain, so the standard Live migration ceremony picks
them up. Enabling the Collections **capability** in Live does **not** make the
platform Financial Live ready — real-money movement stays governed by the
independent platform-wide Financial Live gate (fail-closed).

## Post-ceremony (Sandbox) — run to prove the lifecycle

- `make app-web-business` (Business Web regression).
- The 452→226+226 split lifecycle E2E (create → pay share A → PARTIAL → pay share B
  → COMPLETED → receipts → realtime → book balanced).
- Drop `PARITY_IGNORE=collections,collection_shares,payment_intents` from
  `tools/check-migration-drift.sh` invocations once both Sandbox and Live are past
  `0158`.
