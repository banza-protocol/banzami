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

## 3. THE migration command (owner TTY, Sandbox stack)

Migrations are applied ONLY through the sanctioned gate (`tools/migrate-and-verify.sh`),
never `psql` (the `psql` path caused the 0090–0095 drift — see
`docs/quality/REPAIR_LOG.md`). Run it on an operator TTY with the **Sandbox stack**
database URL sourced from the stack secret (never typed, never logged). This applies
**0153 → 0154 → 0155** in order and refuses to proceed on any schema drift.

```bash
# On the Sandbox host, from the deployed source bundle (or the executor image —
# see docs and the sandbox-migration-execution runbook). DATABASE_URL is sourced
# from the stack secret; it is never echoed.
DATABASE_URL="$(cat /run/secrets/sandbox_db_url)" \
BANZAMI_DB_TARGET="banzami_sandbox" \
  bash tools/migrate-and-verify.sh
```

Expected tail:

```
Applied 153/... Applied 154/business receive point ... Applied 155/receive point mint idempotency
── [4/4] schema-manifest drift detector ──
✓ schema manifest satisfied — no drift.
✓ ROLLOUT GATE PASSED
```

A non-zero exit is a **HARD STOP** — do not deploy the application. Drift is closed
by a forward-only repair migration, never by backfilling history.

---

## 4. Deploy order

1. **Migrate** — §3. Gate must exit 0.
2. **core-api** — `./deploy.sh core-api`. Safe to deploy before or after the
   migration (no schema dependency); ship it so the concurrent-create fix is live.
3. **api-gateway** — `./deploy.sh api-gateway`. Its receive-point routes mount only
   now that the tables exist.
4. **public-api** — `./deploy.sh public-api`. Consumer resolve/pay via the gateway
   internal surface.
5. **pay-frontend** — `./deploy.sh pay-frontend` (the `/b/{slug}` page). See the
   [website/pay deploy note](../../CLAUDE.md) — `pay-frontend`, not `--all`.
6. **Apps** — the mobile/web app builds ship on their own cadence; the SDK client
   and screens are already merged.

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
