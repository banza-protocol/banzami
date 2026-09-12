<!-- GENERATED FILE — DO NOT EDIT. -->
<!-- Source of truth: quality/operator-assurance-manifest.yaml · regenerate: node tools/generate-assurance-doc.mjs -->

# Banzami Operator Assurance

> **This document is generated.** The canonical, machine-readable source of
> truth is [`quality/operator-assurance-manifest.yaml`](../../quality/operator-assurance-manifest.yaml).
> Capability status must never be edited here or duplicated elsewhere.

Programme: **BANZAMI-SANDBOX-RELEASE-ASSURANCE-001** · manifest updated: 2026-07-04

## Status summary

| Status | Count |
|---|---|
| blocked | 5 |
| in-audit | 1 |
| verified | 18 |
| **total** | **24** |

## Capabilities

| ID | Name | Owner | Surface | Disposition | Sandbox | Live | Gate | Status |
|---|---|---|---|---|---|---|---|---|
| CAP-LEDGER-001 | Double-entry ledger (append-only postings) | core-ledger | internal | **released** | ✅ | 🔒 no | integration-required | verified |
| CAP-WALLET-001 | Wallet accounts and balances | core-wallets | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-TRANSFER-002 | Transferências between a project's own wallet accounts | operator-payments | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-PAY-001 | Payment sessions | operator-payments | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-PAY-002 | Payment links | operator-payments | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-PAY-003 | QR payment flows (Banzami QR) | operator-payments | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-REFUND-001 | Typed-source refunds (refund_source) | core-refunds | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-PAYOUT-001 | Wallet withdrawal / payouts (0.75% fee, paired postings) | core-payouts | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-COLLECT-001 | Collections (split charge, merchant-only) | operator-payments | none | **quarantined** | ✅ | 🔒 no | sandbox-e2e-required | blocked |
| CAP-WEBHOOK-001 | Signed webhooks (banza-signature) | operator-events | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-PROOF-001 | Receipts, proofs and verification pages (/r/{ref}) | operator-proofs | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-DEV-001 | Developer Console (login, OTP, workspaces, projects) | developer-platform | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-READINESS-001 | Project financial readiness (GET /v1/financial-setup) | developer-platform | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-DEV-002 | API key lifecycle (sandbox keys, one-time secret reveal) | developer-platform | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-DEV-003 | Console API request logs (project-scoped, request_id correlation) | developer-platform | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-DOCS-001 | Developer documentation site | developer-platform | public | **released** | ✅ | 🔒 no | static-only | verified |
| CAP-SDK-001 | TypeScript SDK (@banzami/sdk) | developer-platform | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-SDK-002 | Public Banzami client SDK (banzami_client, Dart/Flutter) | developer-platform | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-APP-001 | Consumer mobile app (Flutter, com.banzami.consumer) | mobile | none | **quarantined** | ✅ | 🔒 no | sandbox-e2e-required | blocked |
| CAP-APP-005 | Merchant mobile app (Flutter, com.banzami.merchant) | mobile | none | **quarantined** | ✅ | 🔒 no | sandbox-e2e-required | blocked |
| CAP-APP-002 | Merchant dashboard (Banzami Business) | web | none | **quarantined** | — | 🔒 no | sandbox-e2e-required | blocked |
| CAP-APP-003 | Admin portal (BANZADMIN) | web | internal | **internal_only** | ✅ | ⚠️ yes | sandbox-e2e-required | in-audit |
| CAP-APP-004 | Pay page + checkout | web | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-LIVE-001 | Live payments / EMIS / Multicaixa rails | operator-payments | none | **quarantined** | — | 🔒 no | sandbox-e2e-required | blocked |

## External-Sandbox disposition summary

| Disposition | Count |
|---|---|
| internal_only | 1 |
| quarantined | 5 |
| released | 18 |

Public surfaces released: **17/17**. Full external launch requires 17/17.

## Detail

### CAP-LEDGER-001 — Double-entry ledger (append-only postings)

- **Owner:** core-ledger
- **Public status:** internal · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA_REFERENCE ledger invariants
- **Threat category:** financial-money-movement
- **Implementation:** core/ledger, db/migrations/0033_ledger_immutability.sql, db/migrations/0099_audit_log_immutability.sql
- **API/UI surface:** none
- **Deployment gate:** integration-required
- **Tests:** unit [] · integration [core/ledger/tests/integration.rs (balanced posting, idempotent replay, immutability), 0099 audit-immutability verified (UPDATE/DELETE raise on deployed banzami_staging)] · e2e_sandbox [] · negative/security [ledger + audit_log DB triggers reject UPDATE/DELETE (fail-closed)]
- **Evidence:** docs/quality/REPAIR_LOG.md#RA-019, evidence/assurance/transfer-sandbox-e2e-20260704.json
- **Cleanup disposition:** active-required
- **External surface:** internal · **Disposition:** **released** · reference-path
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-WALLET-001 — Wallet accounts and balances

- **Owner:** core-wallets
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA_REFERENCE wallet model
- **Threat category:** financial-money-movement
- **Implementation:** core/wallets, core/transfers
- **API/UI surface:** /v1/transfers — public-api Consumer surface only (consumer token; sender derived from the token). Not mounted on the developer gateway (SEC-015), /v1/wallets
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [core/transfers TransferEngine integration tests] · e2e_sandbox [tools/e2e/transfer-sandbox-e2e.mjs] · negative/security [transfer-sandbox-e2e negatives (unauthorized→401, cross-tenant/invalid recipient→404, insufficient→422)]
- **Evidence:** evidence/assurance/transfer-sandbox-e2e-20260704.json
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released** · reference-path
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-TRANSFER-002 — Transferências between a project's own wallet accounts

- **Owner:** operator-payments
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA ADR-052 internal wallet-account transfers
- **Threat category:** financial-money-movement
- **Implementation:** core/api/src/routes/wallet_account_transfers.rs, services/api-gateway/internal/handler/wallet_account_transfers.go, db/migrations/0102_wallet_account_transfers.sql
- **API/UI surface:** /v1/wallet-account-transfers
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [balanced double-entry posting per transfer (source DEBIT / destination CREDIT)] · e2e_sandbox [tests/phase0/transfer-devkey-e2e.sh (20/20 on deployed sandbox, post-reset)] · negative/security [a foreign project cannot name another owner's account as source (404, not 403), a foreign project cannot name another owner's account as destination (404), the victim's two balances are unchanged after both refused attempts, insufficient funds, negative amount and self-transfer are all rejected and move nothing, the same idempotency key with a changed payload is a 409 conflict, not a silent replay]
- **Evidence:** evidence/assurance/transfers/cap-transfer-002-devkey-sandbox-e2e.json
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-PAY-001 — Payment sessions

- **Owner:** operator-payments
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA ADR-015
- **Threat category:** financial-money-movement
- **Implementation:** services/api-gateway, core/transactions
- **API/UI surface:** /v1/payment-sessions
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox ['PAY001.create · amount-exact · currency-preserved · identifier-present · interfaces-issued (deployed sandbox)', 'PAY001.read-own · no-ledger-movement (session is an intent, not a settlement)', 'PAY001.idempotent-replay · idempotency-actor-scoped · idempotency-concurrent-single-resource', 'PAY001.purpose-omitted-defaults · purpose-explicit-generic (RA-045)'] · negative/security ['PAY001.neg.unauthenticated · neg.bogus-credential (401)', 'PAY001.neg.cross-merchant-create (403) · neg.cross-merchant-read (404) — two independently provisioned merchants', 'PAY001.neg.zero-amount · neg.negative-amount · neg.unsupported-currency · neg.unknown-purpose (400)', 'PAY001.neg.unknown-session · neg.malformed-id (404) · neg.no-internal-leak', 'PAY001.idempotency-conflict-rejected (409) — reused key, different payload (RA-044)']
- **Evidence:** evidence/assurance/payments/cap-pay-001-db30ba00.json, evidence/assurance/golden/developer-golden-journey.json, tools/e2e/golden/developer-golden-journey-e2e.mjs, tools/e2e/payments/cap-pay-001-sandbox-e2e.mjs, docs/quality/PAYMENTS_CONTRACT_AUDIT.md, docs/adr/ADR-047-project-merchant-binding-for-developer-payment-capabilities.md
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-PAY-002 — Payment links

- **Owner:** operator-payments
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA payment link contract
- **Threat category:** financial-money-movement
- **Implementation:** services/api-gateway
- **API/UI surface:** /v1/payment-links + public /public/pay/{slug} (merchant login token or a bound developer key, ADR-047)
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox ['PAY002.create · owner-is-caller · amount-exact · currency-preserved · slug-issued · initial-state-active', 'PAY002.read-own · list-own (owner-scoped)', 'PAY002.public-resolves · public-amount-matches · public-status (unauthenticated payer surface)', 'PAY002.idempotent-replay · idempotency-structural-canonical · idempotency-actor-scoped · concurrent-single-resource', 'PAY002.owner-cancel · public-reflects-cancellation (lifecycle)', 'PAY002.no-ledger-movement (link creation and resolution are non-financial)'] · negative/security [RT03 §4: public payer view redacts internal UUIDs (deployed), 'PAY002.neg.cross-merchant-create (403) · cross-merchant-list (403) — payee bound to the principal (RA-047)', 'PAY002.neg.cross-merchant-read · cross-merchant-cancel · cross-merchant-mark-used (404, non-enumerable)', 'PAY002.neg.victim-link-unchanged — the target link is untouched after every cross-tenant attempt', 'PAY002.neg.unauthenticated · neg.bogus-credential (401)', 'PAY002.neg.zero-amount · negative-amount · missing-wallet · missing-currency · past-expiry (400)', 'PAY002.neg.public-unknown-slug · public-malformed-slug (404) · public-no-internal-fields · public-no-internal-ids', 'PAY002.idempotency-conflict-rejected (409, ADR-022) · neg.cancel-twice (422)']
- **Evidence:** evidence/assurance/payments/cap-pay-002-8647b001.json, tools/e2e/payments/cap-pay-002-sandbox-e2e.mjs, docs/quality/PAYMENTS_CONTRACT_AUDIT.md, docs/adr/ADR-047-project-merchant-binding-for-developer-payment-capabilities.md
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-PAY-003 — QR payment flows (Banzami QR)

- **Owner:** operator-payments
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** operator-extension — Banzami QR engine spec (project_qr_engine)
- **Threat category:** financial-money-movement
- **Implementation:** core/api/src/routes/qr_pay.rs, core/qr, services/public-api, services/api-gateway, sdk/flutter
- **API/UI surface:** POST /v1/qr/static (QR issuance only), POST /v1/qr/dynamic (QR issuance only), POST /v1/qr/pay — public-api Consumer surface
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [core/qr engine tests (HMAC sign/verify, resolve_for_payment, claim/release)] · integration [core/api/src/routes/qr_pay_tests.rs (16, real database), services/api-gateway receipt_semantics_test.go (a QR payment's receipt says QR)] · e2e_sandbox [tests/phase0/qr-payment-e2e.sh (28/28 on the deployed sandbox)] · negative/security [a payer-supplied amount does not override a fixed-amount code, a second payment of a single-use code moves nothing, a forged signature is refused and does not burn the code, a refused payment rolls the single-use claim back, an expiry edited in the database stops the code verifying, an unauthenticated caller pays nothing (401), a merchant credential naming a payer moves no money]
- **Evidence:** evidence/assurance/payments/cap-pay-003-a4d8c5a8.json
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-REFUND-001 — Typed-source refunds (refund_source)

- **Owner:** core-refunds
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA refund/restitution rules
- **Threat category:** financial-money-movement
- **Implementation:** core/transactions, services/api-gateway
- **API/UI surface:** /v1/refunds
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [core/api restitution: refund debits the account that was credited (RA-061)] · e2e_sandbox [tests/phase0/refund-devkey-e2e.sh (15/15 on deployed sandbox, post-reset), tests/phase0/refund-published-sdk-e2e.sh (25/25 through the PUBLISHED @banzami/sdk@latest, installed from npm)] · negative/security [a read-only key cannot refund (refunds:read → 403 on write), a second project holding a valid key cannot refund another project's payment (404, not 403), the victim's balance is unchanged after the refused attempt, the foreign project cannot read the resulting refund (404), an idempotent replay returns the same refund and moves no money]
- **Evidence:** evidence/assurance/refunds/cap-refund-001-devkey-sandbox-e2e.json, evidence/assurance/refunds/ra-065-published-sdk-refunds.json, docs/quality/REPAIR_LOG.md#RA-061
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-PAYOUT-001 — Wallet withdrawal / payouts (0.75% fee, paired postings)

- **Owner:** core-payouts
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** operator-extension — Banzami ADR-031 pricing dimension
- **Threat category:** financial-money-movement
- **Implementation:** core/payouts
- **API/UI surface:** /v1/payouts
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [core/payouts engine tests (fee resolution bounds, reversal derives the fee from what was posted)] · e2e_sandbox [tests/phase0/payout-sandbox-e2e.sh (28/28 on deployed sandbox, post-reset)] · negative/security [an unapproved merchant cannot withdraw at all (KYB gate, fail-closed 403), a wallet the caller does not own is refused, and the balance is untouched (RA-056), negative amount, missing bank destination and insufficient funds are all refused and move nothing, a replay returns the SAME payout rather than queueing a second withdrawal, processing an already-processed payout posts nothing further]
- **Evidence:** evidence/assurance/payouts/cap-payout-001-sandbox-e2e.json, docs/quality/REPAIR_LOG.md#RA-063
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-COLLECT-001 — Collections (split charge, merchant-only)

- **Owner:** operator-payments
- **Public status:** preview-disabled · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA ADR-016 (Payment Collections)
- **Threat category:** financial-money-movement
- **Implementation:** services/api-gateway, db/migrations.phase2 (frozen)
- **API/UI surface:** none (frozen; legacy /v1/splits returns 410 at edge)
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** docs/architecture/protocol-integration.md
- **Cleanup disposition:** legacy-compat-justified
- **External surface:** none · **Disposition:** **quarantined**
- **Launch scope:** excluded
- **Status:** **blocked**

### CAP-WEBHOOK-001 — Signed webhooks (banza-signature)

- **Owner:** operator-events
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA webhook signing contract
- **Threat category:** identity-auth
- **Implementation:** services/api-gateway
- **API/UI surface:** /v1/webhooks/endpoints, webhook delivery + banza-signature header
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [guarded egress destination validation (ADR-049)] · e2e_sandbox [tests/phase0/webhook-lifecycle-e2e.sh (18/18 on deployed sandbox, post-reset), tests/phase0/webhook-delivery-to-doa.sh (signed delivery accepted by production DOA), tests/phase0/developer-platform-e2e.sh F0-DP-011 (24/24, simulated=0) — real outbound delivery from the deployed runtime to a public HTTPS sink it does not control, verified by an implementation that imports nothing from the signer; previously SIMULATED for want of such a sink] · negative/security [the endpoint secret is returned once and never re-exposed on read, a read-only key can list but cannot register or rotate (403), another project cannot read, rotate or even see the endpoint (404, and a clean list), an unbound project has no webhook surface at all (403), rotation issues a genuinely different secret, signature is over the raw bytes: body, digest and timestamp tampering all fail, the same delivery rejected under a wrong secret, asserted in the E2E itself — a verifier that accepts everything would report a green delivery for a platform that signed nothing, a refused delivery is retried on the published backoff (observed +0s, +65s, +5m6s) carrying the SAME event id, each attempt re-signed with a fresh timestamp so a long backoff never expires mid-retry, destination guard rejects http, loopback, RFC1918 and link-local metadata targets]
- **Evidence:** evidence/assurance/webhooks/cap-webhook-001-sandbox-e2e.json, evidence/assurance/webhooks/cap-webhook-001-devkey-lifecycle-sandbox-e2e.json
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-PROOF-001 — Receipts, proofs and verification pages (/r/{ref})

- **Owner:** operator-proofs
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA ADR-024, ADR-025
- **Threat category:** financial-read
- **Implementation:** services/api-gateway, services/common/documents, apps/website
- **API/UI surface:** /r/{ref}, /v1/public/proofs/{ref}, receipt.pdf
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [transfer-sandbox-e2e receipt.pdf render (deployed, non-root Chromium)] · negative/security [non-existent proof ref → clean 404 (no 500/leak) on deployed sandbox]
- **Evidence:** evidence/assurance/transfer-sandbox-e2e-20260704.json
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released** · reference-path
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-DEV-001 — Developer Console (login, OTP, workspaces, projects)

- **Owner:** developer-platform
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — operator policy
- **Threat category:** identity-auth
- **Implementation:** services/developer-api, apps/website/app/developers
- **API/UI surface:** developer console UI (developers.banzami.com) + developer-api auth/workspace/project
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [services/developer-api/internal/accountidentity (flow, crypto, email)] · integration [services/developer-api workspace/project authz tests] · e2e_sandbox [tools/e2e/dev-console/developer-foundation-e2e.mjs (DEV-001.*), tools/e2e/dev-console/api-logs-correlation-e2e.mjs (LOG.overview-* — the Overview moves with real traffic and renders none of the old constants)] · negative/security [unauth redirect, OTP single-use/invalid, CSRF-block, cross-tenant 403, logout-invalidates, no-secret-in-storage, zero-mock: no Console page renders illustrative data (apps/website/app/developers/illustrative-data.test.ts, ILLUSTRATIVE list empty)]
- **Evidence:** evidence/assurance/dev-foundation/e2e-1783197561.json, evidence/assurance/dev-foundation/api-logs-correlation-1788633497.json
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-READINESS-001 — Project financial readiness (GET /v1/financial-setup)

- **Owner:** developer-platform
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — operator policy (ADR-057; ADR-028 fee-destination rule)
- **Threat category:** identity-auth
- **Implementation:** core/api (POST /internal/v1/settlement-readiness — same pricing resolver and ADR-028 evaluation settlement uses), services/api-gateway (GET /v1/financial-setup, Project key only; /v1/me project {id,name,ref}), services/developer-api (Console financial setup carries the same readiness), sdk/typescript (getFinancialSetup, 0.12.0)
- **API/UI surface:** GET /v1/financial-setup (scope identity:read, Project key is the only authority), GET /v1/me (project {id, name, ref})
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [core/api/src/routes/settlement_readiness_tests.rs (readiness and settlement create agree on every case), services/api-gateway/internal/handler/financial_setup_test.go, services/developer-api/internal/developer/financial_setup_settlement_readiness_test.go, tests/ops/project-readiness-contract-guard.test.mjs (legacy routes, caller pricing fields, SDK profile readers, application special cases = 0)] · integration [] · e2e_sandbox [tests/phase0/project-readiness-e2e.sh (CASE A sandbox-default, CASE B sandbox-reference; 49/49 deployed), tests/phase0/project-readiness-probe.sh (an existing Project, identity:read key)] · negative/security [invalid key 401, missing scope 403, Project key refused on /v1/integration, request cannot name another owner, caller pricing field 400, a stranger's fee-destination state not reported, no internal identifiers in any response]
- **Evidence:** evidence/assurance/developer-platform/project-readiness-2026-09-10.json, docs/adr/ADR-057-project-financial-readiness.md
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-DEV-002 — API key lifecycle (sandbox keys, one-time secret reveal)

- **Owner:** developer-platform
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — operator policy
- **Threat category:** identity-auth
- **Implementation:** services/developer-api (developer.dev_api_keys — single key authority), services/api-gateway (DeveloperKeyAuth + GET /v1/me, ADR-046)
- **API/UI surface:** developer console key management (create/reveal-once/list/rotate/revoke), GET /v1/me (deployed Gateway consumption surface, scope identity:read)
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [services/developer-api key crypto + authz tests, services/api-gateway DeveloperKeyAuth fail-closed test] · integration [] · e2e_sandbox [tools/e2e/dev-console/developer-foundation-e2e.mjs (DEV-002.* management lifecycle), tools/e2e/dev-console/dev-key-gateway-e2e.mjs (RT02.* gateway consumption, 20/20 hardened)] · negative/security [reveal-once, list-no-raw-secret, revoke/rotate rejected-by-Gateway, cross-tenant 403, scope-deny, bz_live/malformed/unknown fail-closed, no-mutation-on-denied, /v1/me no-internal-ids-leak, audit-no-raw-secret]
- **Evidence:** evidence/assurance/dev-foundation/e2e-1783197561.json, evidence/assurance/dev-foundation/dev-key-gateway-1783205605.json, docs/adr/ADR-046-unified-developer-sandbox-api-key-authority.md
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-DEV-003 — Console API request logs (project-scoped, request_id correlation)

- **Owner:** developer-platform
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — Banzami ADR-054
- **Threat category:** identity-auth
- **Implementation:** services/api-gateway (APIRequestLog middleware + PostgresRequestLogRecorder), services/developer-api (ProjectAPIRequestLogs, GET /projects/{id}/logs), apps/website/components/developers/portal/RequestLog.tsx, db/migrations/0104_dev_api_request_logs.sql
- **API/UI surface:** developer console → Registos → Pedidos à API, GET /projects/{projectID}/logs (session-authenticated, project-scoped)
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [services/api-gateway/internal/middleware/apilog_test.go (attribution, failures, redaction, non-vacuity), services/developer-api/internal/developer/request_logs_test.go (authority, filters, no-oracle), apps/website/app/developers/request-id-shape.test.ts (docs vs generator)] · integration [services/api-gateway/internal/service/request_log_retention_test.go (real-DB prune)] · e2e_sandbox [tools/e2e/dev-console/api-logs-correlation-e2e.mjs (LOG.* 18/18, incl. Overview real-data assertions)] · negative/security [cross-project 403 both directions, foreign request_id is not an oracle, unauthenticated 401, no credential field in schema or response, credential-shaped path segment redacted, unauthenticated request writes no row]
- **Evidence:** evidence/assurance/dev-foundation/api-logs-correlation-1788633497.json, docs/adr/ADR-054-developer-api-request-logs.md
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-DOCS-001 — Developer documentation site

- **Owner:** developer-platform
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — operator policy
- **Threat category:** content
- **Implementation:** apps/website/app/developers/docs
- **API/UI surface:** developers.banzami.com/docs (static, public)
- **Deployment gate:** static-only
- **Tests:** unit [apps/website/app/developers/docs/page.test.tsx, apps/website/lib/console-routing.test.ts] · integration [] · e2e_sandbox [tools/e2e/dev-console/developer-foundation-e2e.mjs (DOCS-001.*)] · negative/security [no-auth, no-management-api-fetch, no-internal-host-leak, legacy-route-safe]
- **Evidence:** evidence/assurance/dev-foundation/e2e-1783197561.json, tools/check-docs-claims.mjs (docs↔manifest badge consistency)
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-SDK-001 — TypeScript SDK (@banzami/sdk)

- **Owner:** developer-platform
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — SDK-first policy (CLAUDE.md §13)
- **Threat category:** identity-auth
- **Implementation:** sdk/typescript
- **API/UI surface:** "@banzami/sdk/sandbox (curated external Sandbox entry): BanzamiClient.me() + config/errors/env helpers"
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [sdk/typescript env-resolution + webhook-signature tests] · integration [] · e2e_sandbox [SDK clean tarball-install E2E → BanzamiClient.me() against deployed Gateway with a fresh Console key (evidence artifact), tests/phase0/refund-published-sdk-e2e.sh (25/25 through @banzami/sdk@latest installed from npm), tests/phase0/sdk-types-cleanroom.sh (4/4 — fresh consumer, strict, skipLibCheck:false, no @types/node)] · negative/security [bz_live_+sandbox rejected (BanzamiConfigError); ./sandbox exposes no unreleased-capability methods; tools/check-sdk-contract.mjs, public .d.ts declares no undeclared Node global; documented ./webhooks subpath resolves under NodeNext]
- **Evidence:** tools/check-sdk-contract.mjs, evidence/assurance/dev-foundation/sdk-clean-install-1783203531.json, docs/operations/SDK_REGISTRY_OWNERSHIP_AND_RELEASE.md, .github/workflows/sdk-publish.yml, tools/sdk-release.mjs, evidence/assurance/sdk/cap-sdk-001-public-install.json, evidence/assurance/sdk/cap-sdk-001-types-cleanroom-1788629468.json
- **Cleanup disposition:** active-needs-remediation
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-SDK-002 — Public Banzami client SDK (banzami_client, Dart/Flutter)

- **Owner:** developer-platform
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — SDK-first policy (CLAUDE.md §13) · Banzami ADR-053
- **Threat category:** identity-auth
- **Implementation:** sdk/dart-client
- **API/UI surface:** pub.dev banzami_client (dart pub add banzami_client)
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [sdk/dart-client/test/client_test.dart (construction refusals, typed errors, polling), sdk/dart-client/test/links_test.dart (link and QR parsing)] · integration [] · e2e_sandbox [sdk/dart-client/test/sandbox_e2e_test.dart (10/10 with a real publishable key against the deployed Sandbox), clean-room install from pub.dev outside every Banzami repository (16/16)] · negative/security [the constructor refuses a SECRET key before any request, with the reason, a key from the wrong environment, and a LIVE client while LIVE is unreleased, are both refused, the operator refuses a publishable key on every route that moves money — create, transfer, refund, open account, manage webhooks, list the owner's accounts (403, measured), parseSlug refuses look-alike hosts, http, wrong paths and malformed slugs; checkoutUrl throws rather than build a URL that would send a payer elsewhere, no credential is printed or interpolated into an error, guarded by a source test, the first-party framework carries publish_to: none, so it cannot be published by accident]
- **Evidence:** evidence/assurance/sdk/cap-sdk-002-public-install.json, docs/adr/ADR-053-flutter-package-boundary.md
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-APP-001 — Consumer mobile app (Flutter, com.banzami.consumer)

- **Owner:** mobile
- **Public status:** preview-disabled · **Sandbox:** true · **Live:** false
- **Authority:** internal — operator product
- **Threat category:** tenant-data
- **Implementation:** apps/mobile (main_consumer.dart)
- **API/UI surface:** consumer mobile UI (deep-link inbound payments; camera QR scan of @banza and payment-link QRs — a structured Banzami QR is refused, no consumer QR-pay route exists)
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [apps/mobile/test (env_config, session, widget)] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** docs/quality/MOBILE_E2E_REQUIREMENTS.md
- **Cleanup disposition:** active-needs-remediation
- **External surface:** none · **Disposition:** **quarantined**
- **Launch scope:** excluded
- **Status:** **blocked**

### CAP-APP-005 — Merchant mobile app (Flutter, com.banzami.merchant)

- **Owner:** mobile
- **Public status:** preview-disabled · **Sandbox:** true · **Live:** false
- **Authority:** internal — operator product
- **Threat category:** tenant-data
- **Implementation:** apps/mobile (main_merchant.dart)
- **API/UI surface:** merchant mobile UI (QR render, payment links, payout, refunds if exposed)
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [apps/mobile/test/merchant (session, handle-login, dashboard, KYB)] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** docs/quality/MOBILE_E2E_REQUIREMENTS.md
- **Cleanup disposition:** active-needs-remediation
- **External surface:** none · **Disposition:** **quarantined**
- **Launch scope:** excluded
- **Status:** **blocked**

### CAP-APP-002 — Merchant dashboard (Banzami Business)

- **Owner:** web
- **Public status:** preview-disabled · **Sandbox:** false · **Live:** false
- **Authority:** internal — operator product
- **Threat category:** tenant-data
- **Implementation:** apps/dashboard
- **API/UI surface:** none (not routed; dashboard.banzami.com is NXDOMAIN)
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** docs/quality/REPAIR_LOG.md#RA-003
- **Cleanup disposition:** active-needs-remediation
- **External surface:** none · **Disposition:** **quarantined**
- **Launch scope:** excluded
- **Status:** **blocked**

### CAP-APP-003 — Admin portal (BANZADMIN)

- **Owner:** web
- **Public status:** internal · **Sandbox:** true · **Live:** true
- **Authority:** internal — operator product
- **Threat category:** identity-auth
- **Implementation:** apps/admin, services/admin-api
- **API/UI surface:** admin UI (internal operators only)
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **External surface:** internal · **Disposition:** **internal_only**
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-APP-004 — Pay page + checkout

- **Owner:** web
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — operator product
- **Threat category:** financial-money-movement
- **Implementation:** apps/pay, infra/nginx/sandbox-edge.conf.template
- **API/UI surface:** https://pay.banzami.com (canonical) + https://checkout.banzami.com (308 alias), /public/pay/{slug}
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [tests/phase0/hosted-checkout-e2e.sh (24/24 against the PUBLIC deployment), tests/phase0/hosted-checkout-payment-e2e.sh (11/11, payer-authorised payment through the public page)] · negative/security [the page carries no internal identifier — no merchant, wallet, account or consumer id, unknown and empty slugs are 404; a traversal attempt is refused and returns no file, no writable server-authoritative field — the page sends no amount, recipient or currency anywhere, the unapproved external acquiring rail is absent in SANDBOX, resolved server-side rather than hidden, the SANDBOX disclosure is server-rendered, so it survives JavaScript or the platform-mode fetch being blocked, strict CSP, frame-ancestors none, connect-src scoped to the gateway origin, a paid link offers no payment control, and a second settlement attempt is refused and moves nothing]
- **Evidence:** evidence/assurance/checkout/cap-app-004-public-hosted-checkout.json, docs/quality/PAYMENTS_CONTRACT_AUDIT.md
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released**
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-LIVE-001 — Live payments / EMIS / Multicaixa rails

- **Owner:** operator-payments
- **Public status:** not-exposed · **Sandbox:** false · **Live:** false
- **Authority:** protocol — pending regulatory authorization — MUST fail closed
- **Threat category:** financial-money-movement
- **Implementation:** services/api-gateway
- **API/UI surface:** none
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** docs/quality/ENVIRONMENT_MATRIX.md
- **Cleanup disposition:** active-required
- **External surface:** none · **Disposition:** **quarantined**
- **Launch scope:** excluded
- **Status:** **blocked**

---

Registration rule: every new material capability MUST be added to the
manifest with tests, gate and evidence before release.
Enforced by `tools/check-assurance-manifest.mjs` (`make check-assurance`).
