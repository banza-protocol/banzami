# BANZADMIN — Financial operations: Operator Fees & Application Settlements

**ADRs:** Banzami ADR-021 · BANZA ADR-039
**Version:** 1.0
**Scope:** Increment 5.6 — read/audit screens (core-api · admin-api · BANZADMIN).

The operator audit surface for the two financial primitives. Both live under
**BANZADMIN → Finanças** alongside Pricing Rules ([pricing.md](pricing.md)).

---

## Operator Fees (read-only)

**BANZADMIN → Finanças → Taxas do operador.** Every operator fee applied at a
payment capture is an **immutable, append-only** record. This surface is strictly
read-only — never edits, never deletes.

| Layer | Detail |
|-------|--------|
| core-api | `GET /internal/v1/operator-fees` (filters) · `GET /internal/v1/operator-fees/{id}`. Read repository (`PostgresOperatorFeeReadRepository`) joins `transactions` for the gross, so each row shows **gross / fee / net**. Never writes. |
| admin-api | `GET /admin/v1/finance/operator-fees[/{id}]` — `finance.view`; only whitelisted filters forwarded. |
| BANZADMIN | list + filters (currency, category, transaction, date range, environment), detail panel with the **immutable pricing snapshot** (collapsible), and CSV export. |

Filters: `environment`, `currency`, `business_category`, `pricing_profile`,
`pricing_rule_id`, `transaction_id`, `status`, `from`, `to`, `limit`.

The fee `rate_bps`/snapshot are shown here because it is an **admin-only** audit
surface and the values are already in the immutable snapshot — they never reach a
payer or any public API.

---

## Application Settlements (read + cancel/fail)

**BANZADMIN → Finanças → Liquidações de aplicações.** Deferred settlements of
accumulated net value to a beneficiary.

| Layer | Detail |
|-------|--------|
| core-api | `GET /internal/v1/application-settlements` (now filtered: `owner_ref`, `status`, `currency`, `business_category`, `pricing_profile`, `environment`, `from`, `to`) · `GET …/{id}` · `POST …/{id}/cancel` · `POST …/{id}/fail` (existing engine). |
| admin-api | `GET /admin/v1/finance/application-settlements[/{id}]` — `finance.view`; `POST …/{id}/cancel` and `…/{id}/fail` — `finance.manage`, **audited**. |
| BANZADMIN | list + filters, detail with source/beneficiary/app-fee accounts, gross/fee/net, postings, all timestamps, failure reason, snapshot; **cancel / fail actions shown only when the state permits**. |

### Lifecycle guard

`cancel` / `fail` are allowed **only** in a non-terminal state (`CREATED` /
`PENDING`); the engine rejects them otherwise (`INVALID_STATUS`). A `COMPLETED`
settlement is **immutable** — the UI hides the actions and shows a terminal
notice. `fail` requires a non-empty reason. **Reprocessing is not offered** in this
increment (no safe re-run path yet).

---

## RBAC

| Capability | Roles |
|---|---|
| `finance.view` | SUPER_ADMIN, OPERATIONS, COMPLIANCE, SUPPORT, READ_ONLY |
| `finance.manage` (cancel/fail) | **SUPER_ADMIN only** |

Reads are not audited (no mutation); `cancel`/`fail` write
`CANCEL_APPLICATION_SETTLEMENT` / `FAIL_APPLICATION_SETTLEMENT` audit rows
(who / when / IP / reason — no secrets).

---

## Security

- Read-only for operator fees; settlements mutate only via the engine's guarded
  lifecycle. The ledger, fee engine and settlement engine semantics are untouched.
- All filters are bound parameters (no SQL injection); admin-api forwards only
  whitelisted query keys.
- No secrets/PII: amounts, references and the (already-immutable) pricing snapshot
  only.

---

## Tests

- **core-api** (real-DB): operator-fees read lists/filters/get (gross/fee/net);
  application-settlement `list_filtered` by owner/status/currency.
- **admin-api** (Go): operator-fees list forwards only whitelisted filters;
  settlement cancel audits; fail requires a reason; RBAC (view broad / manage
  SUPER_ADMIN-only).
- **BANZADMIN**: `tsc` + `next build` green (no unit-test runner configured).

---

## Deferred

Settlement **reprocess**, Pricing **Profiles** / **Fee Policies** CRUD, and finance
**dashboards** remain for later parts. BANZADMIN still has no unit-test runner.
