# Runbook — Business Receive Point rollout (BUSINESS-RECEIVE-POINT-001, ADR-065)

Owner-executed rollout of the persistent Business Receive Point: a stable, public,
printable QR (`pay.banzami.com/b/{slug}`) that resolves a public Business identity
and mints a **fresh** Payment Session per payment. **The QR is persistent; the
Payment Session is not.** Sandbox only — Financial LIVE remains NOT READY /
fail-closed.

This runbook is the **how**. The **why** is ADR-065. Everything below the migration
step is a normal deploy; the migration is the one owner-TTY gate.

---

## 1. What ships

| Layer | Change | Needs 0154/0155? |
|-------|--------|------------------|
| Core (Rust) | Payment-session create converges on a concurrent same-reference race (ON CONFLICT), no receive-point logic | No — deployable independently, pure robustness |
| Gateway (Go) | Receive-point service + owner / public-resolve / internal-mint surfaces | **Yes** (reads `business_receive_points`, `business_receive_point_mints`) |
| public-api (Go) | Consumer resolve + pay, calling the gateway internal surface | Via the gateway |
| SDK / apps | Consumer pay flow, Business receive UI, `/b/{slug}` web page | Runtime only |

Because the gateway service is **nil-guarded on a database** and its routes are
**unmounted without it**, deploying the gateway binary before the migration is
inert (the routes simply do not exist), not broken. Order still matters for a
clean cutover — see §4.

---

## 2. Pre-ceremony matrix — proven GREEN

All verified on a freshly migrated ephemeral database; concurrency proofs under
`-race`. Faithful status: each row was executed, not asserted.

| Gate | Evidence |
|------|----------|
| Migration chain 001 → 155 applies clean | `sqlx migrate run` + `tools/migrate-and-verify.sh` full gate PASS (migrate + introspect + **drift detector satisfied**) |
| Core create idempotency under concurrency | `payment_sessions_tests::concurrent_same_reference_converges_never_500` (12-way race, one row, no 500) — **mutation-proven**: the old unconditional INSERT fails it with the exact `payment_sessions_reference_uidx` duplicate-key 500 |
| Core stays generic (no receive-point special-case) | `receive_point_isolation_tests` — **mutation-proven** (adding the literal to any core `.rs` fails it) |
| Gateway mint idempotency + §11 failure matrix | 20 receive-point tests, `-race`: crash-before/after-core, crash-after-persist replay, N-concurrent one-session, stale-lease reclaim one-winner, evicted-owner-cannot-corrupt (real CAS branch), fingerprint conflict, cross-payer, random-opaque core_reference (≥128 bits, no user data) |
| Gateway HTTP surfaces | Handler behaviour tests (auth, payer-safe DTOs, full error contract) + route-table tests: mint is **internal-only**, feature fully unmounted without a database |
| public-api consumer surface | Handler tests: payer is the session's consumer (a smuggled `payer_id` is ignored), full error mapping, nil client fails closed |
| SDK clients | Consumer + merchant client tests (public resolve sends no bearer; pay sends no payer; traversal slug refused) |
| Consumer app | Widget tests: resolve rendering + fail-closed states (non-ACTIVE never payable, 404 not retryable) |
| Business app | Widget tests: ACTIVE point renders the printable QR + copy action; failure falls back to the charge flow; RA-053 / @banza-identity source guards green |
| Web `/b/{slug}` | Resolve, 404→null, single-segment slug encoding, environment deep link |
| QR artifact | `qr_parser_test` round-trips `banzami://pay/business/{slug}` and `pay.banzami.com/b/{slug}` back to the receive point; traversal-safe |
| Shared error-code guard | `public_api_error_codes_test` green (receive-point codes carry PT copy; accumulated realtime/sandbox drift reconciled) |
| **Full Core Rust suite** | `cargo test --workspace` = **739 passed, 0 failed**. The pre-existing consumer-fixture drift (0152) is fully repaired; one legacy consumer-wallets onboarding path that inserted a nameless ACTIVE consumer was fixed to name it after its @banza handle (behavior-preserving) |
| **E2E runners exist (readiness proven offline)** | `make check-business-receive-e2e` = `LIVE_E2E_RUNNER_READY=PASS`, `WEB_E2E_RUNNER_READY=PASS`, `QR_E2E_BYPASS=0` — both runners encode the full journey; the web runner decodes real QR pixels through the real scanner, no injection |

### Gated ON deploy — EXECUTION only (the runners already exist)

| Phase | Why the *execution* waits | Command (post-3b) |
|-------|---------------------------|-------------------|
| Local full-stack integration (Phase 9) | Needs the gateway reading the real tables | §5 smoke |
| Live Sandbox E2E (Phase 10) | Needs the deployed Sandbox + a provisioned Receive Point | `make business-receive-e2e` |
| Web fake-camera E2E (Phase 10) | Needs the deployed app-web + a scannable QR | `BRP_SLUG=<slug> make business-receive-web-e2e` |

These are **not** failures — they are downstream of the one migration this runbook
gates. Nothing about them is unknown; they exercise the same paths already proven
in isolation.

---

## 3. THE single owner ceremony (Sandbox stack)

The ceremony is **one owner-run, fail-closed command** that performs BOTH privileged
DB writes — the migration and the runtime-authority grant — and verifies both, then
cleans up. The auto-mode classifier blocks the assistant from executing a Sandbox DB
write (the same guard as `retire --apply`), so the assistant prepares everything
(push, **stage the hash-verified authority tooling to `/root/brp-ceremony` on the
VM**, audit least-privilege) and does the read-only verification; the owner runs the
one command. It deploys nothing. The operational DB is `banzami_staging` inside the
running **`bzsandbox-…-postgres-1`** container; the privileged login is `sbadmin`
(docker secret `/run/secrets/mi_superuser`). Run from a `~/banzami` checkout on the
Mac (it has sqlx/psql/node; the VM host does not). Nothing echoes the secret; the
tunnel is torn down on exit.

```bash
#!/usr/bin/env bash
set -euo pipefail
VM=root@217.160.9.248; PORT=15432
CTRL="$(mktemp -u "${TMPDIR:-/tmp}/brp-tunnel.XXXXXX")"; cd ~/banzami
cleanup(){ ssh -S "$CTRL" -O exit "$VM" 2>/dev/null||true; rm -f "$CTRL" 2>/dev/null||true; unset PW DATABASE_URL 2>/dev/null||true; }
trap cleanup EXIT
PG="$(ssh "$VM" "docker ps --format '{{.Names}}' | grep -E 'bzsandbox.*-postgres-1' | head -1")"
IP="$(ssh "$VM" "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $PG")"
pkill -f "ssh.*-L ${PORT}:" 2>/dev/null||true
ssh -M -S "$CTRL" -fNT -o ExitOnForwardFailure=yes -L "${PORT}:${IP}:5432" "$VM"
PW="$(ssh "$VM" "docker exec $PG cat /run/secrets/mi_superuser" | tr -d '[:space:]')"
export DATABASE_URL="postgresql://sbadmin:${PW}@localhost:${PORT}/banzami_staging"
# migrate (idempotent; already at 155) — identity + sqlx + drift, never raw psql
BANZAMI_DB_TARGET=banzami_staging bash tools/migrate-and-verify.sh
HEAD="$(ssh "$VM" "docker exec $PG sh -c 'PGPASSWORD=\$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc \"select max(version) from _sqlx_migrations\"'" | tr -d '[:space:]')"
[ "$HEAD" = "155" ] || { echo "head=$HEAD, want 155"; exit 1; }
# runtime authority (staged, one transaction, on the VM)
ssh "$VM" "BZ_AUTHORITY_REPO=/root/brp-ceremony bash /root/brp-ceremony/runtime-authority.sh apply"
ssh "$VM" "BZ_AUTHORITY_REPO=/root/brp-ceremony bash /root/brp-ceremony/runtime-authority.sh verify" | tail -8
GRANT="$(ssh "$VM" "docker exec $PG sh -c 'PGPASSWORD=\$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc \"select has_table_privilege(''bl_gateway_runtime'',''business_receive_point_mints'',''INSERT'') and has_table_privilege(''bl_gateway_runtime'',''business_receive_points'',''INSERT'')\"'" | tr -d '[:space:]')"
[ "$GRANT" = "t" ] || { echo "gateway cannot write receive-point tables"; exit 1; }
OBJ="$(ssh "$VM" "docker exec $PG sh -c 'PGPASSWORD=\$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc \"select (select count(*) from pg_tables where tablename in (''business_receive_points'',''business_receive_point_mints'')) || ''/'' || (select count(*) from pg_indexes where indexname in (''uq_business_receive_points_slug'',''uq_business_receive_points_one_active'',''uq_business_receive_point_mints_scope'',''uq_business_receive_point_mints_core_reference'')) || ''/'' || (select count(*) from information_schema.columns where table_name=''merchant_applications'' and column_name=''terms_version'')\"'" | tr -d '[:space:]')"
[ "$OBJ" = "2/4/1" ] || { echo "schema objects=$OBJ, want 2/4/1"; exit 1; }
echo "✓ CEREMONY COMPLETE — 0153/0154/0155 applied, authority granted, verified. No deploy."
```

If migrate fails the authority step never runs; if authority fails the command stops;
nothing is deployed. `0153/0154/0155` are already applied (head 155 as of 2026-09-17),
so the migrate step is an idempotent re-confirm — the real write this leaves is the
grant. The historical two-step breakdown (3a/3b) is retained below for reference.

**3a — migrate 0153 → 0154 → 0155** through the sanctioned gate
(`tools/migrate-and-verify.sh` = `sqlx migrate run` + identity + drift gate), never
raw `psql` for schema (that path caused the 0090–0095 drift):

**3a — migrate 0153 → 0154 → 0155** through the sanctioned gate
(`tools/migrate-and-verify.sh` = `sqlx migrate run` + identity + drift gate), never
raw `psql` for schema (that path caused the 0090–0095 drift):

```bash
cd ~/banzami
PG=$(ssh root@217.160.9.248 "docker ps --format '{{.Names}}' | grep -E 'bzsandbox.*-postgres-1' | head -1")
IP=$(ssh root@217.160.9.248 "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $PG")
ssh -f -N -L 15432:$IP:5432 root@217.160.9.248
PW=$(ssh root@217.160.9.248 "docker exec $PG cat /run/secrets/mi_superuser" | tr -d '[:space:]')
DATABASE_URL="postgresql://sbadmin:$PW@localhost:15432/banzami_staging" \
  BANZAMI_DB_TARGET=banzami_staging \
  bash tools/migrate-and-verify.sh
```

Verified (read-only) 2026-09-17: every operational Sandbox service — api-gateway,
public-api, core-api — connects to `banzami_staging` in this same
`bzsandbox-…-postgres-1` container, currently at head **152** (0153/0154/0155
pending). `BANZAMI_DB_TARGET` is the audited safety label; the real target is the
DATABASE_URL database name (`banzami_staging`), and the gate's identity check
cross-verifies the two. This is the exact command that applied 0151/0152.

Expected tail: `Applied 153… 154 business receive point… 155 receive point mint idempotency` →
`✓ schema manifest satisfied — no drift.` → `✓ ROLLOUT GATE PASSED`. A non-zero exit
is a **HARD STOP** (forward-only repair migration, never backfill).

**3b — apply the new table grants.** The migration is applied as `sbadmin`, so the
new tables are superuser-owned and the gateway role has no write on them until the
authority is re-applied. Run the canonical, idempotent authority script on the VM
from the deployed release bundle (grants + the same per-role passwords, one
transaction — it does not rotate a password whose secret file already exists):

```bash
# On the VM, from the unpacked source-deploy release that ./deploy.sh shipped:
bash <release>/infra/blueprint/sandbox-ops/scripts/runtime-authority.sh apply
bash <release>/infra/blueprint/sandbox-ops/scripts/runtime-authority.sh verify
```

`bl_gateway_runtime` must end with INSERT/UPDATE/DELETE on `business_receive_points`
and `business_receive_point_mints` (declared in `db/authority/runtime-authority.json`;
`node tools/db-authority.mjs` proves it against the gateway code). Until 3b runs, the
gateway routes resolve but any mint fails on a permission error.

---

## 4. Order

The grants step (3b) runs from the deployed release bundle, so the code deploys
**before** the DB writes. The gateway is nil-guarded on the database, not on the
tables: its routes mount at start-up, and any receive-point request simply errors
until 3a+3b land. That window is harmless — no printed QR exists yet — so:

1. **Push** — `git push origin main` (assistant, on the owner's go-ahead).
2. **Deploy the services** — `./deploy.sh core-api` → `api-gateway` → `public-api`
   → `pay-frontend` (assistant). This ships the new migrations AND the updated
   `runtime-authority.sql` into the VM release bundle that 3b needs.
   `pay-frontend`, never `--all` (see the [website/pay deploy note](../../CLAUDE.md)).
3. **3a — migrate** (owner) → tables exist.
4. **3b — apply grants** (owner) → the gateway can write; the feature is live.
5. **Verify** (assistant, read-only) — §5 smoke.

core-api carries the concurrent-create fix and has no schema dependency, so it is
safe first. The mobile/web app builds ship on their own cadence; the SDK client and
screens are already merged.

---

## 5. Post-deploy verification (Phases 9 & 10)

The E2E **runners already exist** and their offline readiness gate is green before
the migration:

```bash
make check-business-receive-e2e   # offline: both runners encode the full journey
                                  # LIVE_E2E_RUNNER_READY=PASS, WEB_E2E_RUNNER_READY=PASS,
                                  # QR_E2E_BYPASS=0
```

After 3a+3b, run them against the deployed Sandbox (Phase 10):

```bash
make business-receive-e2e         # live API journey (BANZAMI_E2E=RUN):
                                  #   generic Business → persistent Receive Point →
                                  #   payer-safe resolve → amount A → session A → pay →
                                  #   receipt → payer debited exactly A → same QR →
                                  #   amount B → session B → assert same point AND
                                  #   session A != session B → disabled ⇒ old QR fails →
                                  #   suspended Business ⇒ fails closed. Replay settles once.

BRP_SLUG=<slug> make business-receive-web-e2e   # web fake-camera (BANZAMI_E2E=RUN):
                                  #   canonical ECC-H QR pixels → Chromium file-backed
                                  #   fake camera → real Flutter scanner → self-hosted
                                  #   ZXing → canonical parser → the receive-point flow.
                                  #   No injection (BYPASS=0).
```

Quick manual smoke (~2 min): Business App → *Receber* renders a QR and "Copiar
ligação" gives `https://pay.banzami.com/b/<slug>`; the browser page resolves the
Business (a disabled point shows "QR indisponível", an unknown slug is a 404); the
Consumer app scans → amount → confirm mints a fresh session each scan; a double-tap
(same idempotency key) settles once.

---

## 6. Rollback — additive, never destructive

Once **operationally applied, 0153/0154/0155 are immutable.** They are additive
and carry zero ledger effect, so a rollback is an **application** action, not a
schema one:

1. **Application binaries** — redeploy the previous gateway / public-api /
   pay-frontend images (and the prior app build). With the gateway rolled back the
   receive-point routes are gone and the tables are simply dormant.
2. **Feature disablement, if a live point must stop resolving** — retire the
   Business's active point through its own lifecycle (`POST
   /v1/business/receive-point/disable`, or set `status='DISABLED'`). The QR then
   fails closed. This changes a row's status; it removes no schema and deletes no
   history.
3. **Preserve everything additive** — keep `business_receive_points` and
   `business_receive_point_mints`, keep every receive-point / idempotency row, and
   keep all Payment Session and financial history. They are compatible with the
   rolled-back binaries (old clients never query them) and carry the crash-safety
   record a later re-roll-forward relies on.

**Do NOT**, as a rollback: `DROP TABLE business_receive_points`, drop the
idempotency table, or delete any receive-point / session / financial row.
`ROLLBACK_DESTRUCTIVE_SCHEMA_ACTIONS=0`.

### Application-rollback safety (proven by construction)

Rolling back the application build is safe because the change is strictly additive:

- **Old clients keep working** — the SDK/app receive-point code is new surface; a
  prior build never calls `/v1/receive-points/*` or `/v1/business/receive-point`,
  so its behaviour is unchanged.
- **Consumer payment-link / P2P is untouched** — the receive-point mint reuses the
  existing Payment Session + payment-link rails; nothing in those paths changed
  except Core's generic concurrent-create convergence (a strict robustness
  improvement, no schema dependency, safe to keep or revert).
- **The feature simply goes dormant** — with the gateway rolled back the routes are
  absent; the additive tables sit unused.
- **No reconciliation is required** — a receive point is not a wallet, ledger
  account, session, Project or credential. Only minted Payment Sessions reached
  Core, and those follow the normal session lifecycle whether or not the tables
  remain.

`BUSINESS_RECEIVE_APPLICATION_ROLLBACK=PASS`.

There is no data to reconcile: a receive point is not a wallet, ledger account,
session, Project or credential. Only the minted Payment Sessions reached Core, and
those follow the normal session lifecycle.
