# Runbook — Collections migration ceremony (COLLECTIONS-PROTOCOL-AND-PRODUCT-001)

Enables the ratified **Collections / cobrança dividida** capability (BANZA ADR-016 +
ADR-015) by applying the folded tracked migrations `0156–0158`. This is the
**owner-gated** step. Code, protocol, schema, domain logic and tests are done and on
`main`; only the controlled DB apply + Core restart remain. **No ad-hoc SQL, no
operator-DB-URL bypass, no bypass of the authorisation-record control.**

## Canonical path (corrected)

The real controlled path is `infra/blueprint/sandbox-ops/scripts/sandbox-migration.sh`
(*"The ONLY controlled path that migrates banzami_staging"*), driven from a verified
release package. The `rt04e-autonomous-migration-controller.sh` is a **validation-layer
stub** (its `main()` dies "autonomous execution is not wired in this increment"), so it
is NOT used. An earlier draft of this runbook cited that stub and its digest — both are
superseded below.

## Verified bindings (recomputed from the current clean tree)

- `source_revision` = **current `git rev-parse HEAD`** of the clean checkout the release
  package is built from. `sandbox-release-package.sh build` sets
  `SOURCE_REVISION=$(git rev-parse HEAD)` after asserting `git status --porcelain` is
  empty; the manifest/authz/receipt all bind to it and require 40 hex.
  **It is NOT the migration-introducing commit** — it is whatever HEAD is built.
  Current HEAD: **`b98c09d1fa691fa5b0d1bdcf747ebbda6f785afb`** (local == origin, clean).
- `migration_directory_digest` (authz/executor algorithm =
  `cat $(ls db/migrations/*.sql | sort) | shasum -a 256`):
  **`ba3a90c50f8b43fee51761aa90c4d136cf7467ba826f65c885312e607e1f8a56`**
  (stable across `cfa02e42…HEAD` — `db/migrations` is byte-identical over that range).
- `target` = **`banzami_staging`** (`authz.sh AUTHZ_TARGET_FIXED`; the DB in
  `bzsandbox-*-postgres-1`).
- Sandbox pre-ceremony `_sqlx_migrations` head = **0155** (156/157/158 absent — verified read-only).

## Authorisation-record schema (issued BY the orchestrator, not hand-written)

`authz.sh authz_issue <dir> <rev> <parent> <exec> <mig> <service_set> <ttl>` writes
`authz.record` (perms `0600`, non-symlink, single hard link, current-run-only) with:
`target=banzami_staging`, `source_revision` (40 hex), `parent_digest`,
`executor_digest`, `migration_digest`, `id`, `issued_epoch`, `expires_epoch`,
`state=issued`. `sandbox-migration.sh apply` issues it (ttl 600s) from the release
manifest, then `authz_consume` flips `issued→consumed` atomically (single-use), alongside
a matching `migration.receipt`. **The owner does not author the record by hand and must
not** — issuing it outside this flow, or applying via the operator DB URL, is the
prohibited bypass (`COLLECTIONS_GOVERNANCE_BYPASS=0`).

## SANDBOX ceremony (owner-executed, operator context on the Sandbox host)

> Preconditions the owner confirms: the existing `bzsandbox` project's blueprint state
> files (`$TMPDIR/banzami-blueprint-sandbox/current.run`,
> `$TMPDIR/banzami-blueprint-release/current.run`) are present from the original
> bootstrap. **Do NOT run `sandbox-bootstrap.sh apply`** — it is create-only
> (`die "sandbox root pre-exists"`) and its teardown wipes the PG volume; the project
> already exists. If the release-state file is absent, only
> `sandbox-release-package.sh build` (below) is needed to (re)create it; the sandbox
> bootstrap state must be reused, never rebuilt. Realign the operator db_url after any
> role bootstrap (known gotcha).

```bash
set -euo pipefail
cd <repo-on-sandbox-host>
git fetch origin && git checkout b98c09d1fa691fa5b0d1bdcf747ebbda6f785afb
test -z "$(git status --porcelain)"   # clean worktree (build requires it)
S=infra/blueprint/sandbox-ops/scripts

# 1. Verified, secret-free release package from HEAD (embeds source_revision + migration
#    digest ba3a90c5… + attested operational executor for the 4 approved services).
bash $S/sandbox-release-package.sh build
bash $S/sandbox-release-package.sh verify

# 2. Controlled migration. plan is a dry, fail-closed gate (revision/parent/executor/
#    migration-digest/service-set must all match) — inspect it before apply.
bash $S/sandbox-migration.sh plan
bash $S/sandbox-migration.sh apply     # issues+consumes single-use authz+receipt, advisory
                                       # lock, file-only short-lived bl_migration login,
                                       # runs the attested executor: sqlx migrate 0156→0158
bash $S/sandbox-migration.sh verify

# 3. Restart Core to clear the collections_available() OnceCell (else it keeps 503-ing).
docker restart "$(docker ps --format '{{.Names}}' | grep -m1 core-api-staging)"

# 4. Read-only enablement checks (fail closed if any is wrong).
PG="$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-postgres-1')"
docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT max(version) FROM _sqlx_migrations"'   # expect 158
docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT to_regclass('\''public.collections'\''), to_regclass('\''public.payment_intents'\''), to_regclass('\''public.collection_shares'\'')"'

# 5. Single-use cleanup of ceremony state.
bash $S/sandbox-migration.sh clean
```

Fail-closed: every step aborts the ceremony (`set -euo pipefail`; `plan`/`apply` gates
`die`/`hold` on target/revision/digest/head/authz/executor/lock/schema failure). On any
partial failure, stop — do not continue, do not hand-apply.

Post-ceremony (autonomous, after the owner confirms head=158 + Core healthy): the
`POST /v1/collections` 503 is gone; run the full 452→226+226 lifecycle + acceptance
matrix. Drop `PARITY_IGNORE=collections,collection_shares,payment_intents` from the
drift check once Sandbox and Live are both past 0158.

---

# LIVE ceremony (prepared; dual-control — do NOT autorun)

Per ADR-BLUEPRINT-004, Live needs explicit approval, **dual-control**, a maintenance
window, verified backup/restore and immutable release attestation. `0156–0158` are in
the tracked chain, so the standard Live migration ceremony picks them up.

**Bindings:** same `db/migrations` content → same migration digest
`ba3a90c5…`; `source_revision` = the Live release-package HEAD (recompute at build
time; must be the same revision proven in Sandbox); `target` = the Live DB (`banzami`).

**Deploy plan:** build the Live release package from the Sandbox-proven revision →
Live migration ceremony (dual-control) applies `0156–0158` (additive, `IF NOT EXISTS`)
→ restart Live Core → deploy the 4 approved services already carrying the Collections
routes/domain. Collections routes/schema/config exist and are enabled in Live; **real
money stays fail-closed at the independent platform-wide Financial Live gate**, not
because Collections is absent/disabled (`COLLECTIONS_LIVE_CAPABILITY=IMPLEMENTED_AND_ENABLED`,
`COLLECTIONS_LIVE_GLOBAL_FINANCIAL_GATE=PASS`).

**Rollback plan:** `0156–0158` are purely additive (three new tables, no ALTER/'
backfill of existing objects, zero ledger effect per ADR-016). Rollback = leave the
tables in place (inert — no code writes to them unless Collections is used) or, if a
clean reversal is required in the window, drop the three tables in reverse dependency
order (`collection_shares` → `payment_intents` → `collections`) via the controlled
executor, never ad-hoc SQL. No financial history is touched (Collections hold no money).
The Financial Live gate remaining NOT_READY is itself the hard safety floor: no real
value can move regardless of the tables' presence.

## Drift detector fixed + Sandbox receipt reconciliation (COLLECTIONS-PROTOCOL-AND-PRODUCT-001 §1–6)

The RT04E drift false-negative is fixed at the root: `tools/introspect-schema.sql` now
reads authoritative `pg_catalog` (world-readable, ownership-agnostic) instead of
privilege-filtered `information_schema` — so tables owned by another role
(`business_receive_points`/`_mints` are owned by `sbadmin`, while the migration login
runs as `bl_schema_owner`) are no longer reported as false "missing". `pg_catalog` still
fails closed on a genuinely-absent object. Mutation-proven on a disposable DB (drop a
manifest-listed table → FAIL; restore → PASS) and the collections tables were added to
`tools/schema-manifest.json` so they are drift-protected. The live Sandbox (head 158)
now verifies **drift = 0**.

**Surface_ref vs public slug (canonical contract):** `surface_share` binds
`surface_ref` = the payment-link **id** — the stable internal settlement linkage the
settlement hook resolves by (`/internal/v1/collections/settle-surface`). The payer-safe
public **slug** is obtained via `GET /v1/payment-links/{id}` (two-step lookup). This is
correct per ADR-015/016 — do NOT replace `surface_ref` with the slug; the internal
settlement identity and the public payer artifact are deliberately separate.

**Receipt reconciliation (§6, owner action):** the prior rollout applied the migration
correctly but skipped the receipt due to the (now-fixed) false drift. To write the
receipt cleanly WITHOUT fabricating anything, re-run the sanctioned rollout on a VM
checkout that includes the drift fix — `sqlx migrate run` is then a no-op (head already
158), the drift step now passes, and the rollout writes the receipt:
1. Update `/srv/banzami/src` to the drift-fix HEAD (git checkout the final revision;
   keep branch `main`, no remotes, clean).
2. Ensure `bl_migration` is valid (refresh via the documented targeted `ALTER ROLE` if
   its `VALID UNTIL` has passed).
3. Re-run the ceremony/rollout (interactive TTY + credential paste). Expect: migrate
   no-op, drift 0, receipt written.

---

## Migration 0159 — Collection create idempotency (COLLECTIONS-PROTOCOL-AND-PRODUCT-001 Phase 1)

`0159_collections_idempotency.sql` is a NEW additive migration that fixes
INV-COLLECTION-008 (idempotent Collection creation). It:

- drops the incorrect GLOBAL unique from 0156 (`collections_idempotency_key_key`);
- adds `request_fingerprint TEXT` (nullable);
- adds the correctly-scoped unique index `collections_idem_scope`
  `(merchant_id, environment, idempotency_key)` — the canonical
  (authenticated_caller, receiving_implementation, operation, key) tuple per BANZA
  `spec/idempotency.md` §2.

**Data-safe:** the key was never persisted before this fix (the INSERT dropped it),
so every existing row has `idempotency_key IS NULL` and neither change can conflict
with existing data. Written `IF EXISTS`/`IF NOT EXISTS` (idempotent, no-op on re-run).

**Verified bindings (recompute at ceremony build time — these are the current
values):**
- HEAD: **`013f3b7788d35df23683f6dcf7fe8675ae40bd1e`** (local == origin, clean).
- `migration_directory_digest` (`cat $(ls db/migrations/*.sql | sort) | shasum -a 256`):
  **`27f291977680a256ab320b20cb6fb572492e83815252447c0929a52c267dba8d`**
  (changed from the 0156–0158-era `ba3a90c5…` because `0159` was added).
- Sandbox pre-ceremony `_sqlx_migrations` head = **0158**; the ceremony advances **0158 → 0159**.
- target = **`banzami_staging`**.

### ⚠️ Deploy ordering is COUPLED (apply 0159 BEFORE deploying the new core-api)

The Phase-1 core-api code REQUIRES 0159's column + index: `insert_collection` /
`create_collection_idempotent` write `request_fingerprint` and use
`ON CONFLICT (merchant_id, environment, idempotency_key)`. Deploying that code
against a pre-0159 schema would 500 on every Collection create. Because 0159 is
additive and backward-compatible (the OLD deployed code simply ignores the new
column/index), the safe, no-downtime order is:

```
1. owner: apply 0159 in Sandbox via the SAME sanctioned ceremony as 0156–0158
   (infra/blueprint/sandbox-ops/scripts/sandbox-migration.sh, TTY + credential
   paste; the tracked chain now ends at 0159 so the controlled flow picks it up).
   Expect: head 158 → 159, drift 0, single-use authz + receipt written.
2. owner or operator: ./deploy.sh core-api-staging   (deploys the Phase-1 code)
3. restart is handled by the deploy; verify /healthz + the collections routes.
```

Never deploy the new core-api before step 1.

### Post-0159 Sandbox runtime proof (autonomous, after the owner applies 0159 + deploy)

Against the deployed Sandbox core-api (INV-COLLECTION-008, matches the local
real-DB tests in `core/collections/tests/idempotency_db.rs`):

- same Business + same key + same request → the SAME collection id (replay);
- same key + a changed request (e.g. different total) → `409 IDEMPOTENCY_CONFLICT`;
- 8 concurrent identical creates → exactly one collection row, all callers get the
  same id, zero exposed 500s;
- two different Businesses using the same key → two independent collections.

### Live

`0159` is in the tracked chain, so the standard Live ceremony picks it up alongside
`0156–0158` (same additive, `IF NOT EXISTS`/`IF EXISTS` discipline; same digest
`27f29197…` for the current chain). Rollback = leave the index/column in place
(inert) or, in a maintenance window, drop `collections_idem_scope` + the
`request_fingerprint` column and restore the prior global unique via the controlled
executor — never ad-hoc SQL. No financial history is touched (Collections hold no
money). The independent platform Financial Live gate remains the hard money floor.
