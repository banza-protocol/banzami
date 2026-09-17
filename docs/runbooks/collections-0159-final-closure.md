# Collections 0159 — final pre-owner closure (COLLECTIONS-PROTOCOL-AND-PRODUCT-001)

All autonomous work is complete and green. This is the single consolidated handoff
for the remaining owner/device ceremonies. It supersedes the interim §"Migration
0159" notes in [collections-migration-ceremony.md](collections-migration-ceremony.md)
for the *bindings* (recomputed at final HEAD below); the sanctioned execution path
is unchanged.

## Final bindings (recomputed at final HEAD)

- `source_revision` (final HEAD, clean, local == origin): **`bdfa13ea425923209a90dd430a498ddc042b79aa`**
  — the release package recomputes this at build time from the clean checkout.
- `migration_directory_digest` (`cat $(ls db/migrations/*.sql | sort) | shasum -a 256`):
  **`27f291977680a256ab320b20cb6fb572492e83815252447c0929a52c267dba8d`**
- `0159` file digest: **`0e7cf447a18b1e8a71f0056016489e7ea527f839f908778d06c7904f0646bf64`**
- `target` = **`banzami_staging`** (Sandbox) / **`banzami`** (Live).
- Sandbox pre-ceremony `_sqlx_migrations` head = **0158**; ceremony advances **158 → 159**.
- `parent_digest` / `executor_digest` / service set: emitted by `sandbox-release-package.sh build`
  from the manifest at build time — do NOT hand-paste; the plan gate verifies them.

## Autonomous gates — GREEN (proven this pass)

| Gate | Result |
|---|---|
| Core idempotency (engine + real-Postgres, 8-way concurrency, cross-business) | PASS |
| clippy `-D warnings` (collections + core-api) | PASS |
| Fresh chain 0001→0159 (head 159, index+column present, old global unique gone) | PASS |
| Incremental 0158→0159 with pre-existing data (2 collections + 1 PAID share preserved) | PASS |
| Historical NULL idempotency keys preserved (not fabricated) | PASS |
| 0159 runtime-authority diff | NONE (0 grants) |
| Split goldens (initial / 452·2 → 226+226 / 453·2 / error / partial / completed) | PASS |
| Surface contract regression (surface_ref = link id; slug via GET; no id/slug confusion) | PASS |
| `flutter analyze` (no Collections errors/warnings) · `flutter test` | PASS · 301/301 |
| Business Web split parity (built bundle contains Dividida/FIXED_AMOUNTS/Pessoa/v1-collections; splitChargeEnabled=true) | PASS |
| iOS device build · Android build (merchant flavor) | PASS · PASS |

Note (host, not Collections): the default JDK on this host is 25.0.2 and the project's
Gradle wrapper is 8.14, which cannot parse Java 25 (`IllegalArgumentException: 25.0.2`) —
build Android with JDK 17 (`JAVA_HOME=$(/usr/libexec/java_home -v 17)`). iOS builds for
device; the iOS *simulator* runtime remains blocked by GoogleMLKit/mobile_scanner lacking
an arm64 simulator slice for Apple-Silicon iOS 26+ sims (`BUSINESS_IOS_SIMULATOR_RUNTIME=BLOCKED_BY_TOOLCHAIN`).

---

## HUMAN ACTION #1 — Sandbox 0159 + receipt (one ceremony)

The sanctioned `sandbox-migration.sh apply` performs migration AND writes the
single-use authz + `migration.receipt` in one flow (§22 satisfied by the one path).
Run on the Sandbox host, operator TTY (no ad-hoc SQL, no operator-DB-URL bypass):

```bash
set -euo pipefail
cd <repo-on-sandbox-host>
git fetch origin && git checkout bdfa13ea425923209a90dd430a498ddc042b79aa
test -z "$(git status --porcelain)"                 # clean worktree (build requires it)
S=infra/blueprint/sandbox-ops/scripts

# Pre-ceremony read-only verify (§23): head=158, 0159 absent, target correct.
PG="$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-postgres-1')"
docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT max(version) FROM _sqlx_migrations"'   # expect 158

# 1. Verified secret-free release package from final HEAD (recomputes digests).
bash $S/sandbox-release-package.sh build
bash $S/sandbox-release-package.sh verify

# 2. Controlled migration 158 → 159 (issues+consumes single-use authz + receipt).
bash $S/sandbox-migration.sh plan       # dry, fail-closed gate — inspect it
bash $S/sandbox-migration.sh apply      # bl_migration file-only login; sqlx migrate 0159
bash $S/sandbox-migration.sh verify     # expect head 159, drift 0 (pg_catalog detector), receipt written

# 3. DEPLOY COUPLING — only AFTER 0159 is live, deploy the new Core, then restart clears
#    collections_available() OnceCell as part of the deploy.
#    (from the ops host):  ./deploy.sh core-api-staging
docker restart "$(docker ps --format '{{.Names}}' | grep -m1 core-api-staging)"

# 4. Read-only enablement checks.
docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT max(version) FROM _sqlx_migrations"'   # expect 159
docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT indexname FROM pg_indexes WHERE indexname='\''collections_idem_scope'\''"'

# 5. Single-use cleanup of ceremony state.
bash $S/sandbox-migration.sh clean
```

If `bl_migration` has expired (`VALID UNTIL` in the past), refresh it with the documented
targeted `ALTER ROLE bl_migration LOGIN PASSWORD <mi_migration> VALID UNTIL <future>`
(owns nothing, safe) before step 2.

**After this, autonomous runtime proof runs (§44):** same Business + same key + same
payload → same Collection id; same key + changed payload → `409 IDEMPOTENCY_CONFLICT`;
8 concurrent identical → one Collection; two Businesses + same key → independent — mirrors
`core/collections/tests/idempotency_db.rs`, now against the deployed Sandbox.

## HUMAN ACTION #2 — real-device native runtime (only if still needed)

The app builds for device (proven). If a physical-device visual is wanted:
App Banzami Business → Nova cobrança → Dividida → 452 Kz → 2 pessoas → Gerar cobrança
dividida → expect 226 + 226. The share-payment legs can then be automated from Consumer
Web against the created Collection.

---

## HUMAN ACTION #3 — Live dual-control ceremony (only after Sandbox 0159 runtime proof)

Per ADR-BLUEPRINT-004: explicit approval, **dual-control** (two approvers), a maintenance
window, verified backup/restore, immutable release attestation.

- **§28 inventory:** target = Live DB **`banzami`**; deploy services = the 4 approved
  Collections-carrying services (core-api, api-gateway, public-api + the merchant surface);
  runtime DB roles unchanged (0159 adds no grants — §34); the platform **Financial Live
  gate** is a separate, settlement-layer control (platform mode SANDBOX ⇒ Financial LIVE
  fail-closed) and is NOT affected by Collections.
- **§29 pre-head / §30 delta:** read the Live `_sqlx_migrations` head read-only and apply
  the ACTUAL missing tail (do not assume it is only 0156–0159 — use real history). All are
  additive, `IF NOT EXISTS`/`IF EXISTS`.
- **§31 release package:** built from the Sandbox-proven revision; same
  `migration_directory_digest` `27f29197…` for the current chain.
- **§32 drift tool:** the repaired `tools/introspect-schema.sql` (authoritative `pg_catalog`)
  is the one used for Live verification.
- **§33 preflight:** run every sanctioned read-only Live preflight (revision/parent/executor/
  digest/service-set/head gates) before any write.
- **§35 feature config:** Collections capability enabled in Live (schema + routes + config;
  `splitChargeEnabled` compile-time true, no build disables it; no Collections-Live TODO).
- **§36 real-money independence:** Collections available ≠ money moves — real-value movement
  stays governed by the platform Financial Live gate; Collections hold no money
  (INV-COLLECTION-001), so no value can move through them regardless.
- **§38 rollback:** application/config rollback first; the additive schema stays (inert) —
  or, in the window, drop `collections_idem_scope` + `request_fingerprint` and restore the
  prior unique via the controlled executor, in reverse dependency order; never ad-hoc SQL;
  no financial history is touched.

**Post-Live verify (autonomous, §51):** Live head advanced, collections/payment_intents/
collection_shares present, `collections_idem_scope` + `request_fingerprint` present,
drift = 0, receipt written, service health green, a Collections request never fails as
"unavailable" (schema/route/feature present), and any real-money attempt fails only at the
platform Financial Live gate.
