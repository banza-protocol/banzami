# MONEY-MODEL-001 — conformance record

Version: 1.0

Decision: [ADR-063](../adr/ADR-063-customer-liabilities-backing-assets-and-reconciliation.md) ·
Architecture: [MONEY_MODEL.md](../architecture/MONEY_MODEL.md) · Date: 2026-09-14/15

Financial Live: **NOT READY / FAIL-CLOSED.** Everything below is the Public Sandbox,
with fictitious value and synthetic backing.

## What the audit found, and what changed

| # | Finding | Resolution | Commit |
|---|---|---|---|
| 1 | System accounts known only by name; no economic classification | `ledger_accounts.system_role` + `synthetic`, `ledger_account_economic_classes` (0147); roles registered at Core boot | d60b5f0a |
| 2 | A payout moved the backing asset at PROCESSING | net reserved in `WITHDRAWALS_IN_FLIGHT`; backing credited only at CONFIRMED | d60b5f0a |
| 3 | A SENT payout could be failed/returned without the rail's word | `EXTERNAL_EVIDENCE_REQUIRED`; `payouts.failure_evidence_ref`; admin-api and BANZADMIN ask for it | d60b5f0a, 4e01998b |
| 4 | An acquirer's settlement fee stayed in transit | recognised as `EXTERNAL_COSTS` | d60b5f0a |
| 5 | Reconciliation settlement-only, amount-matched, no report | boundary reconciliation by reference, 8 outcomes, idempotent runs (0148) | 86f5ee29 |
| 6 | Collections shares computed in `f64` | exact integer basis points | 86f5ee29 |
| 7 | Acquiring credit trusted its callers to pass a CONFIRMED payment | checked where the credit is made | 86f5ee29 |
| 8 | (cleanroom) A hosted payment stayed PENDING on a deleted Project's link and could later credit the retired Business | retirement fails pending cash-in; position reports any left; operator route for Businesses retired before the change (0149); 27 resolved | facb407f, 87078805 |

## Required counters

| Counter | Value | Evidence |
|---|---|---|
| MONEY_MODEL | PASS | all rows below |
| INTERNAL_LIABILITY_CONSERVATION | PASS | journey test; deployed E2E B, C, D, G: obligations Δ 0 |
| INTERNAL_TRANSFER_CHANGES_NETWORK_VALUE | 0 | same |
| SANDBOX_BACKING_COVERAGE | PASS | deployed position: backing 4 404 183 ≥ obligations 4 404 000; difference = revenue 183 |
| NO_UNBACKED_SANDBOX_LIABILITY | PASS | `crediting_a_participant_without_backing_is_detected`; deployed findings `[]` |
| CUSTOMER_FUNDS_AND_BANZAMI_REVENUE_CONFLATED | 0 | `OPERATOR_REVENUE` its own class, excluded from obligations; E2E F/K |
| UNCONFIRMED_EXTERNAL_FUNDING_CREATES_SPENDABLE_LIVE_VALUE | 0 | `settle_confirmed_payment` status check; LIVE refusals; gate (mutations) |
| AMBIGUOUS_EXTERNAL_RESULT_DOUBLE_SPEND_PATHS | 0 | unit + DB tests; deployed E2E H (`EXTERNAL_EVIDENCE_REQUIRED`), I, J late confirmation once |
| RECONCILIATION_REWRITES_LEDGER_HISTORY | 0 | 0033 triggers; gate; E2E J ledger row counts unchanged |
| RECONCILIATION_IDEMPOTENT | PASS | DB test; deployed E2E J: same run id, `created=false`, one row |
| RECONCILIATION_DIRECT_LEDGER_WRITE | 0 | gate over `core/reconciliation`; mutation M11 |
| DUPLICATE_EXTERNAL_EVIDENCE_FINANCIAL_EFFECTS | 1 | duplicate funding key → one credit (A); duplicate evidence → `DUPLICATE_EXTERNAL`, one confirmation (J) |
| MANUAL_BALANCE_PATCH_PATHS | 0 | no balance column; gate |
| FINANCIAL_FLOAT_PATHS | 0 | gate over financial crates and Go services |
| UNCLASSIFIED_LEDGER_ACCOUNT_TYPES | 0 | deployed classes: 0 `UNCLASSIFIED`; 12 `UNOWNED_EMPTY` (no entries) |
| RETIRED_RESOURCE_HIDDEN_LIABILITY | 0 | deployed: `RETIRED_RESOURCE_HOLDS_VALUE` and `RETIRED_RESOURCE_PENDING_CASH_IN` absent |
| MONEY_MODEL_SANDBOX_E2E | PASS | `tests/phase0/money-model-e2e.sh` 114/114 (run 3 times) |
| MONEY_MODEL_EXTERNAL_FAILURE_E2E | PASS | E2E G; cleanroom steps 15–17 |
| RECONCILIATION_SCENARIOS | PASS | DB test; E2E J: MATCHED, DUPLICATE_EXTERNAL, MISSING_INTERNAL, MISSING_EXTERNAL, AMOUNT_MISMATCH, REQUIRES_REVIEW → converged |
| MONEY_MODEL_PUBLIC_CLEANROOM | PASS | public cleanroom 32/32 on the final tree, residue 0; post-cleanroom position findings `[]`, pending cash-in 0 |
| LIVE_REAL_MONEY_PATHS_ENABLED | 0 | wallet-native gate; Sandbox-only routes refuse LIVE |
| FINANCIAL_LIVE_STATUS | NOT_READY | — |
| FINANCIAL_LIVE_FAIL_CLOSED | PASS | acceptance `TEST_SCENARIO_LIVE_FAIL_CLOSED=PASS` |

## Mutation proofs

- Core (real DB): 14 — payout credits backing at processing; SENT failed without
  evidence; acquirer fee left in transit; coverage check removed; retired value
  unchecked; in-flight unexplained unchecked; confirmation extinguishes nothing;
  duplicates unreported; re-run creates a new run; late evidence accepted as
  matched; reconciliation writes the ledger; retirement leaves pending cash-in;
  retired pending cash-in unreported; operator route acts on a Business in use.
- `tools/check-money-model.selftest.mjs`: 14 mutations.

## Deployment

Migrations 0147, 0148, 0149 applied through the executor from the source-deploy
release with the migrations verified by digest; database authority re-applied and
verified (`DB_AUTHORITY_VERIFY=PASS`). Deployed: core-api-staging `87078805`,
admin-api and admin-frontend `a34e0680`.

## Cleanup

27 hosted payments left PENDING on 17 retired synthetic/cleanroom Businesses
(cancelled links, suspended merchants, no active Project binding) failed through
`POST /internal/v1/sandbox/businesses/:merchant_id/fail-pending-cash-in` — 17
candidates, 17 eligible, 0 skipped, no value moved. Every E2E and cleanroom
fixture retired through Core. Operator revenue 183 remains: the withdrawal fees
the three E2E runs paid, in synthetic transit.

## Regression

core-api 276/276, payouts, settlement, reconciliation, collections, ledger
(including the 0144 guard) · clippy · admin-api handler tests · BANZADMIN 121 ·
money-model gate + selftest · db-authority · wallet-native gate · payout Sandbox
E2E 29/29 · economic model smoke 54/54 · SANDBOX-DELETE project 17/17, workspace
10/10, lifecycle 10/10 · acceptance: scenarios, webhook workbench 10/10, refunds
8/8, wallet-native 16/16.

All suites above re-run on the final tree after the closure changes below.
`RAIL_ISOLATION=7/7` (`SANDBOX_RAIL_SIMULATOR_CROSS_TENANT_EFFECT=0`,
`SANDBOX_RAIL_SWITCH_CAN_AFFECT_LIVE=0`) — now on fixture sessions, no email.

## Closure — developer authentication cannot lock developers out

The public Console's email provider reached its **daily sending quota** after a
heavy day of assurance runs (200 fixture sign-in codes on 2026-09-14), and real
developers then could not receive sign-in codes. Hardened operationally:

- **Fixture sessions** (`POST /internal/v1/fixture-sessions`, developer-api):
  general regression suites (rail isolation, api-logs, dev-key-gateway, rbac,
  cross-project, deletion, realtime, acceptance scenarios/workbench/refunds) now
  open a session for a fixture identity with **no email** — Sandbox only,
  `@banzami-e2e.test` only, behind the internal key, refused by the public edge
  (`/internal/` → 404), audited (`session.fixture_minted`), through the same
  store calls a verified sign-in uses. No OTP is created, read or bypassed.
  Proven live: edge 404; internal + fixture-domain 200; internal + real address 404.
- **Fixture email daily budget** (`FIXTURE_EMAIL_DAILY_BUDGET`, default 40):
  sign-in codes to the fixture domain are capped per UTC day; real addresses are
  never counted, so fixture traffic can no longer consume the quota real
  developers need.
- **Truthful failure**: a send the provider refused is no longer announced as
  sent. `request-otp` answers a uniform `503 CODE_NOT_SENT` that names no
  provider; the operator sees the reason (`provider_quota_exhausted` /
  `provider_rate_limited` / `provider_rejected`) in a log and audit line. Proven
  live: with the quota spent, `request-otp` returned 503 and the log carried
  `reason":"provider_quota_exhausted"`.
- **Real-email authentication stays real**: `tools/e2e/console/auth-email-e2e.mjs`
  and the public cleanroom sign in through actual delivery (request → provider
  accepted → OTP received → consumed → session).

Counters:

| Counter | Value | Evidence |
|---|---|---|
| RAIL_ISOLATION | 7/7 | acceptance `rail-isolation` on the final tree |
| SANDBOX_RAIL_SIMULATOR_CROSS_TENANT_EFFECT | 0 | same |
| SANDBOX_RAIL_SWITCH_CAN_AFFECT_LIVE | 0 | same |
| PUBLIC_OTP_BYPASS_CAPABILITIES | 0 | no public route discloses an OTP or looks like a peek (`TestNoPublicOTPDisclosure`); fixture-session route internal + fixture-only |
| INTERNAL_TESTS_CAN_EXHAUST_PUBLIC_EMAIL_QUOTA | 0 | fixture email capped at 40/day; general suites send no email |
| EMAIL_PROVIDER_QUOTA_FAILURE_OBSERVABLE | PASS | `reason` on the failure log + `otp.delivery_failed` audit; typed `ProviderError`/`DeliveryReason` (`delivery_error_test.go`) |
| EMAIL_DELIVERY_FAILURE_FAILS_TRUTHFULLY | PASS | `CODE_NOT_SENT` 503, uniform, no provider/numbers (`TestRequestOTP_DeliveryFailureIsNotAnnouncedAsSent`) |
| PUBLIC_DEVELOPER_EMAIL_AUTH_E2E | PASS | `auth-email-e2e.mjs` 6/6 on the final tree after the quota reset: request → provider accepted → OTP delivered → consumed → session → single-use → authenticates |
| BL_APP_RUNTIME_CAN_REOPEN_RETIRED_PROJECT | 0 | live probe: DELETE/UPDATE `sandbox_retired_projects` and `sandbox_test_payers` → permission denied; SELECT and other writes intact; Core still retires (SANDBOX-DELETE 37/37) |

Go mutation proofs (5): any address getting a fixture session; fixture sessions
in Live; a failed send announced as sent; the fixture budget removed; the
fixture route outside the internal guard. Plus the DB-authority manifest→SQL
drift check ties the `except_tables` exclusion to the generated grants.

**Final money-model SHA:** `037d353c` (money model core `87078805`, auth/email
hardening `d2098e7b`, retirement-marker authority `037d353c`) — CI green (run
34908180980). The two real-email suites re-ran and passed on this tree once the
provider daily quota reset at 00:00 UTC on 2026-09-15.

## Not in this milestone

- A BANZADMIN screen for the position: aggregates are available to operators
  through Core's internal route; no participant data is exposed.
- Production alerting: findings are logged with stable codes; no alert
  infrastructure exists for Financial Live.
- (done) `bl_app_runtime`'s write privilege on the retirement/lifecycle-truth
  tables is removed; see the closure counters.
