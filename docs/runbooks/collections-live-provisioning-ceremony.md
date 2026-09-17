# Collections LIVE Provisioning Ceremony (owner package)

**COLLECTIONS-PROTOCOL-AND-PRODUCT-001 Part B §27** — the single owner package to
provision the real LIVE substrate and deploy Collections under governance.
Provisioning the real LIVE datastore is an **owner/governance boundary** and is
**not** performed autonomously (§28). Everything independently testable has already
been built and proven on a disposable Live-shaped substrate (see
`infra/blueprint/live-ops/scripts/live-foundation-disposable-e2e.sh`,
`LIVE_FOUNDATION_DISPOSABLE_E2E=PASS`).

> Financial LIVE remains **NOT_READY / fail-closed** and is independent of Collections.
> Deploying the Collections schema/routes to LIVE does **not** open real-money movement.

Version: 1.0

---

## 0. Current truth (do not overstate)

| Token | Value |
|---|---|
| `COLLECTIONS_LIVE_PRODUCT_CODE` | IMPLEMENTED |
| `COLLECTIONS_LIVE_INFRASTRUCTURE` | NOT_PROVISIONED |
| `COLLECTIONS_LIVE_MIGRATION_TOOLING` | target-aware LIVE path implemented + disposable-proven |
| `financial_live_gate` | NOT_READY / fail-closed (independent of Collections) |

## 1. Target & identity (explicit — never inferred from a DB name)

- Environment: **LIVE** (`infra/blueprint/environments.json`)
- Database: **`banzami`** on a **dedicated LIVE Postgres cluster** in a separate
  infrastructure boundary (never shares host/volume/network/secret with Sandbox).
- Non-secret provisioning profile: `infra/blueprint/live-ops/live-provisioning-profile.json`.

## 2. Infrastructure changes (owner)

1. Provision the dedicated LIVE Postgres cluster (private network, no public ingress).
2. Create the LIVE secret store entries named in `live-provisioning-profile.json`
   `secret_refs` (superuser, schema_owner, migration_login, app_runtime,
   control_plane, core_runtime, approver_keyring). **No secret is in the repo.**
3. Populate the dual-control **approver keyring** with **≥ 2 distinct** approver keys.

## 3. Role bootstrap (least privilege — proven)

Establish the role model on `banzami` (mirrors the disposable proof):
`bl_schema_owner` (NOLOGIN, owns every object), `bl_migration` (short-lived LOGIN,
CONNECTION LIMIT, VALID UNTIL, sole owner member), `bl_core_runtime` (only money-writer),
`bl_app_runtime` / `bl_control_plane` (own nothing). Then apply per-service runtime
authority from `db/authority/runtime-authority.sql` (generated from the manifest).

## 4. Backup & maintenance window

- A **verified backup + restore drill** is required before apply; attest with
  `LIVE_BACKUP_VERIFIED=1` to the controller **only after** the real drill.
- Apply only inside a **sanctioned maintenance window** (`--window-open`).
- **Down migrations forbidden.** Rollback is application/config + additive-compatible
  schema; **never** DROP/DELETE of ledger/history.

## 5. Dual control (≥ 2 distinct approvals — enforced, mutation-proven)

Two distinct authorized approvers each sign the exact migration identity:

```bash
DC=infra/blueprint/live-ops/scripts/dual-control.sh
$DC approve <approvals_dir> <keyring> <approver_id> banzami LIVE <REV> <MIG> <EXE> "<SVC>" <ttl>
# repeat for a SECOND, distinct approver
$DC verify  <approvals_dir> <keyring> banzami LIVE <REV> <MIG> <EXE> "<SVC>" 2   # must print VALID_APPROVERS=2
```

Quorum fails closed for 0/1/duplicate/expired/forged/tampered/wrong-identity approvals
(`live-dual-control-proof.sh`, `LIVE_DUAL_CONTROL_MUTATION_PROOF=PASS`).

## 6. Release identity (recompute at ceremony time)

```bash
REV=$(git rev-parse origin/main)                                   # clean tree; local == origin
MIG=$(cat $(ls db/migrations/*.sql | sort) | shasum -a256 | awk '{print $1}')
# current chain (0156–0159 in place): MIG = 27f291977680a256ab320b20cb6fb572492e83815252447c0929a52c267dba8d
# 0159 single-file digest         : 0e7cf447a18b1e8a71f0056016489e7ea527f839f908778d06c7904f0646bf64
```

- `service_set` = `core-api api-gateway public-api developer-api`
- `executor_digest` = the attested migration executor image digest built for LIVE.

## 7. Migration delta (read the REAL Live head — do not assume)

A freshly-provisioned `banzami` is empty → apply the **full tracked chain** 0001→0159.
If Live already carries earlier migrations, **read its real head** and apply only the
actual missing tail — never assume it is only 0156–0159:

```bash
psql "$LIVE_ADMIN_URL" -tAc "SELECT max(version) FROM _sqlx_migrations"   # actual pre-head
```

## 8. Apply → verify → receipt (controller)

```bash
infra/blueprint/live-ops/scripts/live-migration-control.sh apply \
  --env LIVE --admin-url "$LIVE_ADMIN_URL" \
  --window-open --approvals-dir <dir> --keyring <keyring> \
  --rev "$REV" --mig "$MIG" --exec "$EXE" --svc "core-api api-gateway public-api developer-api" \
  --receipt-dir <receipt_dir>
```

The controller fail-closes on: environment mismatch, unprovisioned target, closed
window, unverified backup, quorum-not-met. On success it bootstraps roles, migrates as
`bl_migration` (objects owned by `bl_schema_owner`), verifies ownership, writes a
**durable** receipt (`MIGRATION_RECEIPT_STATE=PRESENT_AND_VERIFIED`), and consumes the
single-use approvals (`AUTHORIZATION_RECORD_STATE=CONSUMED`).

## 9. Post-provisioning autonomous continuation (§29–31)

After the owner has provisioned + applied, the following run autonomously:

- read actual Live pre-head, apply the actual missing range → `COLLECTIONS_LIVE_SCHEMA_DEPLOYED=PASS`
- drift check (`tools/introspect-schema.sql` / rollout gate) → `COLLECTIONS_LIVE_DRIFT=0`
- receipt present + verified → `COLLECTIONS_LIVE_MIGRATION_RECEIPT=PASS`
- deploy the 4 approved services; health → `COLLECTIONS_LIVE_SERVICE_HEALTH=PASS`
- prove Collections schema/routes exist → `COLLECTIONS_LIVE_COLLECTIONS_UNAVAILABLE=0`
- real-money still blocked at the platform gate → `COLLECTIONS_LIVE_GLOBAL_FINANCIAL_GATE=PASS`

## 10. Rollback — application/config-first (the additive schema STAYS)

Canonical rollback of an applied migration is **application / configuration / service
rollback** — `LIVE_COLLECTIONS_ROLLBACK_MODE=APPLICATION_CONFIG_FIRST`. The additive
0159 schema (`collections_idem_scope`, `collections.request_fingerprint`) **remains
in place**; a destructive schema down-migration is **not** the normal rollback
(`LIVE_COLLECTIONS_SCHEMA_DOWN_MIGRATION_NORMAL_ROLLBACK=0`), and ledger / financial /
audit / migration history is **never** DROPped or DELETEd. This is safe because 0159 is
additive and the previously-deployed Core revision is forward-compatible with it
(`COLLECTIONS_0159_FORWARD_COMPATIBLE_ROLLBACK=PASS` — an old-shaped insert with a NULL
idempotency key and no request_fingerprint succeeds against head 159, disposable-proven).
A destructive schema removal is reserved for an exceptional, separately-authorized
decommission — never an ordinary rollback.

---

**Next legitimate human stop:** provisioning the real LIVE substrate (steps 1–3) and the
dual-control apply (steps 5–8). Everything else is built and disposable-proven.
