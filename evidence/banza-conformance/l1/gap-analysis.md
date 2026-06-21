# BANZA L1 Gap Analysis — Banzami

**Version:** 1.0
**Date:** 2026-06-21
**Status:** Analysis / planning — **not** a conformance report, **not** certification.

---

## 1. Scope

This is a **gap analysis** for BANZA **L1 (Core Payment Capability)** readiness of the
Banzami operator. It compares the BANZA L1 conformance contract (as implemented by the
official runner `banza-conformance==0.1.0`) against what Banzami **actually** exposes
today.

- This is **not** a conformance report. No L1 report has been generated.
- This is **not** certification, and confers no level.
- **Banzami remains not certified.** No production BANZA certificate exists; no
  production federation is live; M2/M3 are not complete.
- No L1 item is marked `VALIDATED` as a result of this analysis.

L1 is **sandbox/simulated core payments**. Unlike launch readiness, L1 conformance does
**not** depend on external providers (KYC/KYB vendor, money-in/out rails, BNA). It is an
internal engineering effort — see §7 and §8.

---

## 2. Current Verified Baseline

- BANZA **L0** dry-run evidence exists and passed **5/5** (Health + Operator manifest).
- Cross-validated on two channels: PyPI `banza-conformance==0.1.0` and GHCR
  `ghcr.io/banza-protocol/banza-conformance:v0.1.0`.
- Evidence: [`evidence/banza-conformance/l0/banzami-sandbox-l0-report.json`](../l0/banzami-sandbox-l0-report.json).
- The sandbox operator declares `certification_level=0`, `simulated=true`,
  `production_allowed=false`, and capabilities `supports_wallets=false`,
  `supports_qr=false`, `supports_settlement=false`
  (`services/sandbox-operator/cmd/sandbox-operator/main.go`).
- The production certificate endpoint `/.well-known/banza/certificate.json` is **absent
  (404)** — correct, because no certificate has been issued.

---

## 3. The L1 conformance contract (what the runner expects)

`banza-conformance --level 1` runs, cumulatively: `health`, `manifest` (L0) **plus**
`wallets`, `transfers`, `traces` (L1). It calls the operator base URL directly, with **no
auth**, expecting root-level paths and these shapes:

| Case | Request | Expectation |
|------|---------|-------------|
| WLT-001/002 | `POST /wallets` `{label, currency}` | `201` + `id, label, currency, balance_minor` |
| WLT-004 | `GET /wallets/:id` | `200` + `id, balance_minor` |
| WLT-005 | `GET /wallets/<unknown>` | `404` |
| (seed) | `POST /wallets/:id/seed` `{amount_minor, currency}` | funds a sandbox wallet |
| TRF-001 | `POST /transfers` `{from_wallet_id, to_wallet_id, amount_minor, currency, idempotency_key}` | `201` + `id` (prefix `txfr-`), `trace_id` |
| TRF-002 | same `idempotency_key` again | `200/201` + **same** `id` |
| TRF-003 | transfer exceeding balance | `422` |
| TRF-008 | `GET /transfers/:id` | `200` + `trace_id` (prefix `tr-`) |
| TRF-009 | `GET /traces/:id` | `200` + `trace_id`, `timeline` (≥1 entry) |
| EVT-004 | `GET /events` | events include `trace_id`, `correlation_id` |

L1 is awarded only if `health + manifest + wallets + transfers + traces` all pass.

---

## 4. L1 Requirement Matrix

Status labels: `IMPLEMENTED` · `PARTIAL` · `MISSING` · `BLOCKED_EXTERNAL` · `NEEDS_EVIDENCE` · `NOT_APPLICABLE`.

| Area | BANZA L1 expectation | Banzami current state | Status | Evidence | Gap / next action |
|------|----------------------|-----------------------|--------|----------|-------------------|
| **Wallets** | `POST /wallets {label,currency}` → 201 `{id,…}`; `GET /wallets/:id`; unknown → 404 | Core implements `POST /internal/v1/wallets {merchant_id,currency}` → 201 and `GET /internal/v1/wallets/:id`; unknown → 404 | `PARTIAL` | `core/api/src/routes/wallets.rs:17-70` | Path prefix `/internal/v1/`; request field `merchant_id` ≠ `label`; sandbox operator exposes no wallet route |
| **Balances** | `balance_minor` in `GET /wallets/:id` | Balance **derived** from ledger (never stored), but returned via separate `GET /internal/v1/wallets/:id/balance` (`available/reserved/total`); no `balance_minor` on the wallet object | `PARTIAL` | `core/api/src/routes/wallets.rs:72-86`; `core/transfers/src/engine.rs:151-164` | Expose `balance_minor` inline on the conformance-shaped wallet response |
| **Internal transfers** | `POST /transfers {from_wallet_id,to_wallet_id,…}` → 201 `{id (txfr-),trace_id}` | `POST /internal/v1/transfers {sender_id,recipient_id,amount_minor,currency,idempotency_key}` → 201; atomic; UUID id (no `txfr-`); **no `trace_id`** | `PARTIAL` | `core/api/src/routes/transfers.rs:22-111`; `core/transfers/src/transfer.rs:64-81` | Field names `sender_id/recipient_id` ≠ `from/to_wallet_id`; add `txfr-` id + `trace_id` on response |
| **Idempotency** | body `idempotency_key`; same key → same record | Body `idempotency_key`, DB UNIQUE constraint, engine returns existing record | `IMPLEMENTED` | `db/migrations/0012_transfers_schema.sql:20`; `core/transfers/src/engine.rs:66-73` | Matches (minor: always 201 on retry; runner accepts 200/201) |
| **Ledger posting** | balanced double-entry, atomic | `PostingBuilder.assert_balanced()`; all writes in one DB transaction | `IMPLEMENTED` | `core/ledger/src/posting.rs:33-130`; `core/transfers/src/engine.rs:81-241` | — |
| **Ledger immutability** | append-only entries, audit trail | `INSERT`-only ledger entries; no UPDATE/DELETE | `IMPLEMENTED` | `db/migrations/0001_ledger_schema.sql` | — |
| **Static QR / payment address** | stable payment identifier | Static QR `POST /internal/v1/qr/static` + `@banza` handle resolution | `IMPLEMENTED` | `core/api/src/main.rs` (qr/static, identity/resolve) | Capability exists; L1 suites don't test QR (that's L2) — `NOT_APPLICABLE` to the L1 cases |
| **API endpoints** (conformance-shaped) | root `/wallets`, `/transfers`, `/traces/:id`, `/events`, no auth | Functionality lives under `/internal/v1/` behind the gateway; the public sandbox exposes only `/health` + manifest | `MISSING` | `services/sandbox-operator/.../main.go`; `core/api/src/main.rs` | Need a conformance-shaped sandbox surface at root paths |
| **Traces / auditability** | `trace_id` on responses; `GET /traces/:id` timeline; `GET /events` with `correlation_id` | Internal `X-Request-ID` middleware + `ledger_posting_id`; **no** `trace_id` field on transfer; **no** `/traces/:id`; **no** `/events` | `PARTIAL` | `core/api/src/middleware.rs:4-28`; `core/transfers/src/transfer.rs:64-81` | Surface `trace_id` (`tr-`), add a trace timeline endpoint and an events feed with `correlation_id` |
| **Error handling** | 422 insufficient funds, 404 unknown | `INSUFFICIENT_FUNDS` → 422; `NOT_FOUND` → 404; structured error envelope | `IMPLEMENTED` | `core/api/src/routes/transfers.rs:75-81`; `core/api/src/error.rs:42-48` | Matches |
| **Sandbox safety** | `simulated=true`, `production_allowed=false` | Manifest + `/health` declare both; `sandbox-credit` disabled when `environment.is_live()` | `IMPLEMENTED` | `services/sandbox-operator/.../main.go`; `core/api/src/routes/wallets.rs:106-211` | — |
| **Security boundaries** | sandbox vs production separation | Environment isolation (LIVE/SANDBOX); core `/internal/v1` is loopback behind the api-gateway (auth at the edge) | `IMPLEMENTED` | `docs/reference-operator.md:85-105` | A conformance-facing sandbox surface must stay sandbox-only and simulated |
| **External dependencies** | (none for L1) | KYC/KYB vendor, money-in/out rails, BNA gate **launch** and L2-operational, **not** L1 sandbox conformance | `NOT_APPLICABLE` | matrix external blockers (WAL-004, KYC-*, PAY-001) | L1 is achievable in sandbox without external providers |

---

## 5. Expected L1 Conformance Failures Today

If `banza-conformance --url https://sandbox.banzami.org --level 1` were run **today**:

- `health` (HEALTH-001/002) → **PASS** (unchanged from L0).
- `manifest` (MAN-001/002/003) → **PASS** (unchanged from L0).
- `wallets` (WLT-001/002/004/005) → **FAIL** — the public sandbox operator has no
  `/wallets` route, so `POST /wallets` does not return `201`. (Even pointed at the core
  API, the path is `/internal/v1/wallets`, the request field is `merchant_id` not
  `label`, and the response has no `balance_minor`.)
- `transfers` (TRF-001/002/003/008) → **FAIL / SKIP** — no `/transfers` on the sandbox;
  against the core API the response lacks a `txfr-` id and a `trace_id`, and the request
  shape differs. (`TRF-003` insufficient-funds → 422 would pass once reachable.)
- `traces` (TRF-009, EVT-004) → **SKIP / FAIL** — no `trace_id` is produced upstream, and
  there are no `GET /traces/:id` or `GET /events` endpoints.

**Net result today: L1 is NOT awarded — only L0.** Running `--level 1` against the public
sandbox now would only re-confirm the known L0-only state; it should be run locally
against a conformance-shaped sandbox surface during development (see §8).

---

## 6. Implementation Work Required

**Must-have for L1 evidence (internal engineering):**

1. A **conformance-shaped sandbox surface** exposing root paths with the exact contract:
   `POST/GET /wallets` (`label`, `balance_minor` inline), `POST /wallets/:id/seed`,
   `POST/GET /transfers` (`from_wallet_id`/`to_wallet_id`, `txfr-` id), insufficient → 422.
2. **Surface `trace_id`** (prefix `tr-`) on transfer create/get responses.
3. A **trace timeline** endpoint `GET /traces/:id` (`trace_id` + `timeline[]`).
4. An **events feed** `GET /events` where each event carries `trace_id` + `correlation_id`.

**Should-have before validation:**

- Conformance-shaped integration tests (the strong ledger invariants already exist:
  `core/ledger/src/posting.rs`, `core/transfers/src/engine.rs`).
- Decide whether to add the surface to `services/sandbox-operator` (Go) or as a thin
  sandbox adapter in front of the Rust core — without weakening the production
  `/internal/v1` boundary.

**External / blocking dependencies:** **none** for L1 (sandbox/simulated).

**Documentation / evidence:** generate and archive an L1 report only after the suites pass
locally.

---

## 7. Evidence Required Before L1 Validation

Expected later under `evidence/banza-conformance/l1/`:

- `banzami-sandbox-l1-report.json` — official runner, `wallets + transfers + traces` all pass.
- API endpoint proof — the conformance-shaped routes exist and respond as specified.
- Ledger invariant tests — already strong; cite as supporting evidence.
- Wallet + transfer integration tests against the sandbox surface.
- Trace/audit evidence — `GET /traces/:id` timeline and `GET /events` with `correlation_id`.
- (Optional, L2) static-QR / payment-address evidence.

---

## 8. Guardrails

- **L1 is not validated.** This document is analysis only.
- **Banzami is not certified.** No certified-operator status is claimed.
- **No production BANZA certificate exists** (`/.well-known/banza/certificate.json` is absent).
- **No production federation is live.** M2/M3 are not complete.
- **PASS remains conformance evidence, not certification.** BANZA owns the certification framework.
- L2/L3/L4 remain `FUTURE` roadmap; nothing here advances them.

---

## 9. Recommendation

1. **Implement the missing L1 endpoints next, as a sandbox surface** — do **not** mutate the
   production `/internal/v1` API to chase the contract. Add a conformance-shaped,
   simulated sandbox surface (extend `services/sandbox-operator` or a sandbox adapter)
   so the production boundary and field names stay intact.
2. **Add test fixtures first.** Stand the runner up against a local sandbox surface and
   iterate; the runner ships a fixture server, so L1 can be developed test-first.
3. **Add granular matrix items for L1 gaps** (wallet shape, transfer `trace_id`, `/traces`,
   `/events`) **when implementation starts** — as roadmap/`PLANNED`, never `VALIDATED`
   until a real L1 report exists. Keep them off the launch-critical path (L1 is not
   required for the Angola launch, which is external-blocked).
4. **Do not run `--level 1` against the public sandbox now.** Run it locally during
   development; archive an L1 report only once `wallets + transfers + traces` pass.

**Strategic note:** L1 is **internally achievable** — it needs no external provider — so it
is a prioritisation choice, not a blocker. It should not change the launch answer
(`NOT YET`), which remains gated on external dependencies, not on BANZA level progression.
