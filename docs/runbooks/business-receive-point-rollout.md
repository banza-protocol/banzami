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

### Gated ON deploy (cannot be green before the migration)

| Phase | Why gated | Runs after §4 |
|-------|-----------|---------------|
| Local full-stack integration (Phase 9) | Needs the gateway reading the real tables | §5 smoke test |
| E2E runners — native + web camera (Phase 10) | Needs the deployed Sandbox stack + a real scanned QR | §5, then the E2E harness |

These are **not** failures — they are downstream of the one migration this runbook
gates. Nothing about them is unknown; they exercise the same paths already proven
in isolation.

---

## 3. THE two owner DB writes (Sandbox stack)

Both DB writes below are **owner-run**: the auto-mode classifier blocks the
assistant from executing a Sandbox DB write (the same guard as `retire --apply`),
so the assistant prepares everything, pushes, deploys the services and does the
read-only verification — the owner runs these two. The operational DB is
`banzami_staging` inside the running **`bzsandbox-…-postgres-1`** container
(internal-only on the docker bridge); the privileged login is the superuser
`sbadmin`, whose password is the docker secret `/run/secrets/mi_superuser` inside
that container. Run from a `~/banzami` checkout on the Mac (it has sqlx/psql/node;
the VM host does not) over an SSH tunnel. Nothing echoes the secret.

**3a — migrate 0153 → 0154 → 0155** through the sanctioned gate
(`tools/migrate-and-verify.sh` = `sqlx migrate run` + identity + drift gate), never
raw `psql` for schema (that path caused the 0090–0095 drift):

```bash
cd ~/banzami
PG=bzsandbox-20260708184104-1708617-23807-postgres-1
IP=$(ssh root@217.160.9.248 "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $PG")
ssh -f -N -L 15432:$IP:5432 root@217.160.9.248
PW=$(ssh root@217.160.9.248 "docker exec $PG cat /run/secrets/mi_superuser" | tr -d '[:space:]')
DATABASE_URL="postgresql://sbadmin:$PW@localhost:15432/banzami_staging" \
  BANZAMI_DB_TARGET=banzami_staging \
  bash tools/migrate-and-verify.sh
```

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

## 5. Post-deploy smoke (Phase 9, ~2 min)

Against the Sandbox stack, as the operator:

1. **Owner provisions + reads** — Business App → *Receber*: a QR renders, "Copiar
   ligação" gives `https://pay.banzami.com/b/<slug>`. (Or `GET /v1/business/receive-point`
   with a merchant JWT.)
2. **Public resolve** — open `pay.banzami.com/b/<slug>` in a browser: the Business
   name + @banza render; a disabled point shows "QR indisponível"; an unknown slug
   is a 404.
3. **Consumer mint + pay** — Consumer app → scan the QR → enter an amount → confirm.
   A fresh Payment Session is minted and settled through the payment-link path; the
   Business sees the payment. Repeat the scan → a **new** session each time.
4. **Idempotency** — a double-tap on confirm (same idempotency key) settles **once**.

Then hand off to the E2E harness (Phase 10) for native + web-camera runs.

---

## 6. Rollback

Additive and reversible. In reverse dependency order:

1. **Application** — redeploy the previous gateway / public-api / pay-frontend
   images. With the gateway rolled back, the routes are gone and the tables are
   inert regardless of whether they still exist.
2. **Schema (only if required)** — forward-only, on the sanctioned gate:
   `DROP TABLE business_receive_point_mints;` then
   `DROP TABLE business_receive_points;` (0155 then 0154). Both are pure additive
   objects with **zero ledger effect** — no financial state is touched. Remove the
   Business Receive Point feature from `tools/schema-manifest.json` in the same
   change so the drift detector stays satisfied.
3. **Core** — the concurrent-create fix is a strict robustness improvement with no
   schema dependency; it does not need reverting and should not be.

There is no data to reconcile: a receive point is not a wallet, ledger account,
session, Project or credential. Only the minted Payment Sessions reached Core, and
those follow the normal session lifecycle.
