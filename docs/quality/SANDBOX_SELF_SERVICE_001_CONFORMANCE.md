# SANDBOX-SELF-SERVICE-001 — conformance and gap ledger

Version: 1.0

The before-state is [SANDBOX_SELF_SERVICE_001_BASELINE.md](SANDBOX_SELF_SERVICE_001_BASELINE.md)
(2026-09-13). This is the after-state on 2026-09-14, read from the deployed Public
Sandbox. Every PASS names the harness or gate that produced it; every harness signs
in through the product, uses no internal route or database write, prints no secret,
retires what it created and measures residue.

Design: [ADR-060](../adr/ADR-060-self-service-public-sandbox.md). Security:
[SANDBOX_SELF_SERVICE_SECURITY_REVIEW.md](../security/SANDBOX_SELF_SERVICE_SECURITY_REVIEW.md),
[REALTIME_STATUS_THREAT_MODEL.md](../security/REALTIME_STATUS_THREAT_MODEL.md).
Competitive evidence (internal): [DEVELOPER_PLATFORM_COMPETITIVE_MATRIX.md](DEVELOPER_PLATFORM_COMPETITIVE_MATRIX.md).

## Harnesses (deployed Sandbox, through Cloudflare and nginx)

| Harness | Result |
|---|---|
| `tools/e2e/sandbox/self-service-e2e.mjs all` | fresh developer 24/24, application 18/18, residue 0 |
| `tools/e2e/sandbox/realtime-isolation-e2e.mjs all` / `expiry` | realtime 17/17, isolation 16/16, token expiry 2/2, residue 0 |
| `tools/e2e/sandbox/acceptance-suites.mjs scenarios` | 28/28 catalogue scenarios, all 18 §51 counters PASS, residue 0; predicates mutation-proven (`selftest`) |
| `tools/e2e/sandbox/acceptance-suites.mjs workbench` | webhook workbench 10/10 |
| `tools/e2e/sandbox/acceptance-suites.mjs refunds` | refund acceptance 8/8 |
| `tools/e2e/console/explorer-browser-acceptance.mjs` | API Explorer in a browser 10/10, `API_EXPLORER_SECRET_LEAKS=0` |
| `tools/e2e/docs/quickstart-e2e.mjs run` | 12/12, `DOC_QUICKSTART_OPERATOR_ACTIONS=0`, residue 0 |
| `tools/e2e/docs/doa-tutorial-e2e.mjs run` | 13/13, `DOA_DOC_SPECIAL_CASES=0`, residue 0 |
| `tools/e2e/cleanroom/public-sandbox-cleanroom.mjs` | 26/26 with the SDK from registry.npmjs.org, `PUBLIC_SANDBOX_OPERATOR_INTERVENTIONS=0`, residue 0 |
| Console sweeps on a populated project | accessibility 41/41, responsive 52/52, route suite 18/18 |
| `tools/e2e/docs/sweep.mjs` | 600/0 — `DOCS_ACCESSIBILITY=PASS`, `DOCS_RESPONSIVE=PASS` |
| Hosted pay page, cross-device (browser) | page turned "Pagamento confirmado" 827 ms after another device paid; stream opened with no query string |
| Ledger invariants (read-only SQL, deployed) | unbalanced postings 0, global debit−credit 0, non-positive entries 0, negative balances 0, retired payers with balance 0, refunds above source 0, paid sessions with a live interface 0 |

Measured: first SDK call 6.1 s and first completed payment 7.1 s after sign-in in
the automated cleanroom (including `npm install`); human time was not measured.
Realtime PAID p50 900 ms, max 1 000 ms.

## Gap ledger

Every gap found during the milestone, and how it closed. `MANDATORY_GAPS=0`.

| # | Gap | State | Closed by |
|---|---|---|---|
| G1 | Financial Setup needed BANZADMIN approval, classification and pricing | PASS | ADR-060 synthetic Business by use case; fresh 24/24, application 18/18 |
| G2 | A payer needed support | PASS | Project-owned test payers; cleanroom steps 8–13 |
| G3 | Sandbox-wide funds cap shared by every developer | PASS | Per-Project quotas + value perimeter (SSR-1) |
| G4 | No API Explorer, realtime, test event, scenarios or reset | PASS | ADR-060 §5–§10; suites above |
| G5 | A session paid by QR stayed ACTIVE; QR paid into the wrong account id | PASS | `20bf2577`, `c31dc004` |
| G6 | Test payers could sign in and move test value to any tenant | PASS | `847bf530` (SSR-1) |
| G7 | Unbounded workspace/project creation | PASS | `e3a82499` (SSR-2) |
| G8 | Test webhook deliveries as an amplifier | PASS | `1ff83ca3` (SSR-3) |
| G9 | Explorer path dot-segments and followed redirects | PASS | `a2bc64f9` (SSR-4) |
| G10 | Abandoned realtime streams held places for 15 s behind Cloudflare | PASS | `c6118fec` (SSR-5) |
| G11 | Cloudflare replaced 502/504 bodies: `SANDBOX_SIMULATED_TIMEOUT`, `UPSTREAM_ERROR`, `RETIREMENT_FAILED`, `PAYMENT_NOT_CONFIRMED` unreadable | PASS | `services/common/edgestatus`, timeout answers 503; catalogue gate refuses a documented 502/504 |
| G12 | API Reference had no path into the Explorer; sign-in lost the page | PASS | Try in Sandbox, `?op=`, safe return path; browser acceptance 10/10 |
| G13 | Console tables widened the page on tablet/phone; a 13 px control | PASS | sr-only labels pinned; responsive 52/52 |
| G14 | DOCS-PROD-001 §6/§16 described the pre-milestone Sandbox | PASS | Rows re-audited; `DOCS_PROD_001_PASS=82` |
| G15 | Documentation promised a test payer PIN for a page that has no sign-in | PASS | Removed from OpenAPI, SDK types, Console, guides (`847bf530`) |
| E1 | `@banzami/sdk` 0.14.0 on npm | EXTERNAL_HUMAN_BLOCKER | Prepared and verified (`node tools/sdk-release.mjs` PASS); publishing needs the owner's npm browser authentication. Until then the guides show HTTP/Console for test payers, webhook test events and realtime, and the cleanroom proves the published 0.13.0. |
| N1 | BitPay Angola developer portal unreadable (HTTP 522, no archive) | EVIDENCE LIMITATION | Recorded in the competitive matrix; comparison made against the readable Angolan reference and the brief's named capabilities; re-run when reachable |

## Product acceptance matrix (§79)

| Counter | Value | Evidence |
|---|---|---|
| SANDBOX_ZERO_HUMAN_OPERATOR_APPROVAL | PASS | fresh, application, cleanroom |
| PUBLIC_SANDBOX_OPERATOR_APPROVAL_REQUIRED | 0 | cleanroom `OPERATOR_INTERVENTIONS=0` |
| SANDBOX_FINANCIAL_SETUP_SELF_SERVICE | PASS | fresh 5, cleanroom 4 |
| SANDBOX_BUSINESS_SELF_SERVICE | PASS | fresh 6 (SANDBOX_SYNTHETIC, unverified), reset 24 |
| SANDBOX_BUSINESS_CONNECTION_SELF_SERVICE | PASS | application 14–15 (share code) |
| SANDBOX_APPLICATION_CLASSIFICATION_AUTOMATIC | PASS | application 4 |
| SANDBOX_PRICING_AUTOMATIC / DEVELOPER_SELECTS_PRICING_RATE | PASS / 0 | fresh 6, application 4; no rate field in any request |
| SANDBOX_TEST_PAYER_SELF_SERVICE / SANDBOX_TEST_FUNDING_SELF_SERVICE | PASS / PASS | cleanroom 8–9 |
| SANDBOX_DIRECT_BALANCE_EDITS | 0 | funding and reset by balanced postings; ledger invariants |
| SANDBOX_DETERMINISTIC_SCENARIOS / SANDBOX_HIDDEN_TEST_MAGIC | PASS / 0 | scenarios 28/28; `SANDBOX_UNDOCUMENTED_TEST_MAGIC=0` |
| PAYMENT_LINKS_SANDBOX_COMPLETE / QR_SANDBOX_E2E | PASS / PASS | cleanroom 12–13, pay page cross-device |
| SANDBOX_REFUND_FULL_E2E / PARTIAL / IDEMPOTENCY | PASS | refunds 8/8, scenarios REFUND_* |
| SANDBOX_APPLICATION_SETTLEMENT_SELF_SERVICE | PASS | application 11–12, cleanroom 21 |
| SANDBOX_RECEIPT_PROOF_E2E | PASS | fresh 20, refunds (REVERSED) |
| API_EXPLORER_E2E | PASS | browser acceptance 10/10 |
| API_EXPLORER_SECRET_IN_BROWSER / SECRET_LEAKS / LIVE_CAPABILITY / CROSS_TENANT | 0 / 0 / 0 / 0 | browser acceptance; isolation 10 |
| API_EXPLORER_IDEMPOTENCY_SAFE / REQUESTS_AUDITABLE | PASS / PASS | Explorer tests; logs `API_EXPLORER` |
| WEBHOOK_SYNTHETIC_TEST_EVENT / DELIVERY_REPLAY / DELIVERY_LOGS / WORKBENCH_E2E | PASS | workbench 10/10 |
| WEBHOOK_REPLAY_FINANCIAL_SIDE_EFFECTS | 0 | scenario WEBHOOK_REPLAY `financialChange=false` |
| REALTIME_PAYMENT_STATUS_E2E / RECONNECT / AUTHORIZATION | PASS | realtime 17/17, expiry 2/2 |
| REALTIME_PROJECT_SECRET_IN_BROWSER / MUTATION_CAPABILITY / CROSS_RESOURCE_ACCESS / SECRET_LEAKS | 0 | realtime 3–5, 8, 17; isolation 8 |
| DEVELOPER_API_LOGS / WORKSPACE_ACTIVITY_API_LOGS_DISTINCT | PASS | cleanroom 22–23 |
| SANDBOX_RESET_SELF_SERVICE / LEDGER_HISTORY_PRESERVED | PASS | fresh 24, cleanroom 25 |
| FRESH_DEVELOPER_SANDBOX_E2E / OPERATOR_ACTIONS | PASS / 0 | fresh 24/24 |
| APPLICATION_SANDBOX_E2E / OPERATOR_ACTIONS | PASS / 0 | application 18/18 |
| REFUND_PUBLIC_SANDBOX_E2E | PASS | refunds 8/8 |
| SANDBOX_CROSS_TENANT_TESTS | PASS | isolation 16/16 |
| SANDBOX_LEDGER_IMBALANCE / DUPLICATE_FINANCIAL_EFFECTS | 0 / 0 | ledger invariants; idempotency scenarios |
| BITPAY_APPLICABLE_DX_GAPS | 0 | competitive matrix (evidence limitation N1) |
| SANDBOX_MISLABELLED_LIVE / ENVIRONMENT_FAIL_OPEN_PATHS / LIVE_FINANCIAL_EXECUTION_AVAILABLE | 0 / 0 / 0 | scenario LIVE_FAIL_CLOSED (Live host 503), isolation 12–13, `check-live-fail-closed` |

## Documentation acceptance matrix (§80)

| Counter | Value | Gate |
|---|---|---|
| DOCS_PROD_001_SECTIONS_TOTAL / GAPS | 82 / 0 | `check-docs-prod-001-matrix` (82 PASS) |
| PUBLIC_DOC_STALE_CLAIMS / LEGACY_CONTRACTS / UNSUPPORTED_CLAIMS | 0 / 0 / 0 | `check-docs-drift`, `check-docs-claims` |
| DOCS_CURRENT_API_VERSION / DOCS_V2_REFERENCES | v1 / 0 | deployed docs audit `tools/e2e/docs/audit.mjs` 85/0 (46 pages) |
| DOC_QUICKSTART_OPERATOR_ACTIONS / DOC_QUICKSTART_E2E | 0 / PASS | quickstart run 12/12 |
| DOA_DOC_TUTORIAL_E2E / DOA_DOC_SPECIAL_CASES | PASS / 0 | DOA run 13/13 |
| ROUTE_OPENAPI_DOC_DRIFT / DOC_ENDPOINTS_NOT_IN_OPENAPI / OPENAPI_ENDPOINTS_UNDOCUMENTED | 0 / 0 / 0 | `check-openapi-route-drift`, `check-docs-api-reference` |
| DOC_EVENTS_MISSING / NOT_EMITTED | 0 / 0 | `check-webhook-event-catalogue` |
| DOC_ERRORS_MISSING / NOT_PUBLIC / PT_EN_DRIFT | 0 / 0 / 0 | `check-docs-error-catalogue` (+ edge statuses) |
| DOCS_PT_EN_PAGE_PARITY / CONTRACT_PARITY / DIAGRAM_PT_EN_PARITY | PASS | `check-docs-pt-en-structure`, `check-docs-illustrations` |
| DOCS_SEARCH_TASK_SUCCESS / DOC_CODE_EXAMPLES_TESTED | PASS / PASS | `check-docs-search`, `check-docs-code-examples` (36 TS examples against npm 0.13.0) |
| PUBLIC_SDK_INSTALL_FROM_REGISTRY | PASS | `tools/sdk-public-install-proof.mjs` 25/25 |
| DOCS_EDITORIAL_LINT / UNPROFESSIONAL_COPY_HITS / AWKWARD_TRANSLATION_HITS | PASS / 0 / 0 | `check-docs-editorial` (all 22 PT/EN pages) |
| DOCS_ACCESSIBILITY / DOCS_RESPONSIVE | PASS / PASS | docs sweep 600/0 |
| PUBLIC_DOC_REAL_SECRETS / PRIVATE_IDENTIFIERS | 0 / 0 | deployed docs audit; `make security-check` (gitleaks) |
| BROKEN_INTERNAL_DOC_LINKS / BROKEN_DOC_ANCHORS | 0 / 0 | deployed docs audit (1 458 links checked) |
| BITPAY_APPLICABLE_DOC_DX_GAPS | 0 | competitive matrix (evidence limitation N1) |

## Final regression (§82), after the last product change

Rust fmt, clippy `-D warnings`, 686 tests (real database) — pass. Go gateway,
public-api, developer-api, common/edgestatus tests (real database) — pass. SDK 115
tests, release prepare — pass. Website typecheck, 1 106 tests — pass. `make
check-docs-prod` — pass. `make security-check` (gitleaks, dependency audit) — pass,
with standard-library advisories noted for the next Go builder bump. `make
check-deploy-parity` — every deployed component runs this tree. CI green on main.
