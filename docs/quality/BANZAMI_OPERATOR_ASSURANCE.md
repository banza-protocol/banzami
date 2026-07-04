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
| in-audit | 10 |
| verified | 6 |
| **total** | **21** |

## Capabilities

| ID | Name | Owner | Surface | Disposition | Sandbox | Live | Gate | Status |
|---|---|---|---|---|---|---|---|---|
| CAP-LEDGER-001 | Double-entry ledger (append-only postings) | core-ledger | internal | **released** | ✅ | 🔒 no | integration-required | verified |
| CAP-WALLET-001 | Wallet accounts and balances | core-wallets | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-PAY-001 | Payment sessions | operator-payments | public | **pending-e2e** | ✅ | 🔒 no | sandbox-e2e-required | in-audit |
| CAP-PAY-002 | Payment links | operator-payments | public | **pending-e2e** | ✅ | 🔒 no | sandbox-e2e-required | in-audit |
| CAP-PAY-003 | QR payment flows (Banzami QR) | operator-payments | public | **pending-e2e** | ✅ | 🔒 no | sandbox-e2e-required | in-audit |
| CAP-REFUND-001 | Typed-source refunds (refund_source) | core-refunds | public | **pending-e2e** | ✅ | 🔒 no | sandbox-e2e-required | in-audit |
| CAP-PAYOUT-001 | Wallet withdrawal / payouts (0.75% fee, paired postings) | core-payouts | public | **pending-e2e** | ✅ | 🔒 no | sandbox-e2e-required | in-audit |
| CAP-COLLECT-001 | Collections (split charge, merchant-only) | operator-payments | none | **quarantined** | ✅ | 🔒 no | sandbox-e2e-required | blocked |
| CAP-WEBHOOK-001 | Signed webhooks (banza-signature) | operator-events | public | **pending-e2e** | ✅ | 🔒 no | sandbox-e2e-required | in-audit |
| CAP-PROOF-001 | Receipts, proofs and verification pages (/r/{ref}) | operator-proofs | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-DEV-001 | Developer Console (login, OTP, workspaces, projects) | developer-platform | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-DEV-002 | API key lifecycle (sandbox keys, one-time secret reveal) | developer-platform | public | **released** | ✅ | 🔒 no | sandbox-e2e-required | verified |
| CAP-DOCS-001 | Developer documentation site | developer-platform | public | **released** | ✅ | 🔒 no | static-only | verified |
| CAP-SDK-001 | TypeScript SDK (@banzami/sdk) | developer-platform | public | **blocked-external** | ✅ | 🔒 no | sandbox-e2e-required | in-audit |
| CAP-SDK-002 | Flutter SDK (banzami_flutter) | developer-platform | public | **pending-e2e** | ✅ | 🔒 no | sandbox-e2e-required | in-audit |
| CAP-APP-001 | Consumer mobile app (Flutter, com.banzami.consumer) | mobile | none | **quarantined** | ✅ | 🔒 no | sandbox-e2e-required | blocked |
| CAP-APP-005 | Merchant mobile app (Flutter, com.banzami.merchant) | mobile | none | **quarantined** | ✅ | 🔒 no | sandbox-e2e-required | blocked |
| CAP-APP-002 | Merchant dashboard (Banzami Business) | web | none | **quarantined** | — | 🔒 no | sandbox-e2e-required | blocked |
| CAP-APP-003 | Admin portal (BANZADMIN) | web | internal | **internal_only** | ✅ | ⚠️ yes | sandbox-e2e-required | in-audit |
| CAP-APP-004 | Pay page + checkout | web | public | **pending-e2e** | ✅ | 🔒 no | sandbox-e2e-required | in-audit |
| CAP-LIVE-001 | Live payments / EMIS / Multicaixa rails | operator-payments | none | **quarantined** | — | 🔒 no | sandbox-e2e-required | blocked |

## External-Sandbox disposition summary

| Disposition | Count |
|---|---|
| blocked-external | 1 |
| internal_only | 1 |
| pending-e2e | 8 |
| quarantined | 5 |
| released | 6 |

Public surfaces released: **5/14**. Full external launch requires 14/14.

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
- **API/UI surface:** /v1/transfers, /v1/wallets
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [core/transfers TransferEngine integration tests] · e2e_sandbox [tools/e2e/transfer-sandbox-e2e.mjs] · negative/security [transfer-sandbox-e2e negatives (unauthorized→401, cross-tenant/invalid recipient→404, insufficient→422)]
- **Evidence:** evidence/assurance/transfer-sandbox-e2e-20260704.json
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **released** · reference-path
- **Launch scope:** sandbox
- **Status:** **verified**

### CAP-PAY-001 — Payment sessions

- **Owner:** operator-payments
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA ADR-043
- **Threat category:** financial-money-movement
- **Implementation:** services/api-gateway, core/transactions
- **API/UI surface:** /v1/business/payment-sessions (merchant-JWT today; dev-key path pending ADR-047)
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** docs/quality/PAYMENTS_CONTRACT_AUDIT.md, docs/adr/ADR-047-project-merchant-binding-for-developer-payment-capabilities.md
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **pending-e2e**
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-PAY-002 — Payment links

- **Owner:** operator-payments
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA payment link contract
- **Threat category:** financial-money-movement
- **Implementation:** services/api-gateway
- **API/UI surface:** /v1/payment-links + public /public/pay/{slug} (merchant-JWT today; dev-key path pending ADR-047)
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security [RT03 §4: public payer view redacts internal UUIDs (deployed)]
- **Evidence:** docs/quality/PAYMENTS_CONTRACT_AUDIT.md, docs/adr/ADR-047-project-merchant-binding-for-developer-payment-capabilities.md
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **pending-e2e**
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-PAY-003 — QR payment flows (Banzami QR)

- **Owner:** operator-payments
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** operator-extension — Banzami QR engine spec (project_qr_engine)
- **Threat category:** financial-money-movement
- **Implementation:** services/api-gateway, apps/mobile
- **API/UI surface:** /v1/qr
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **pending-e2e**
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-REFUND-001 — Typed-source refunds (refund_source)

- **Owner:** core-refunds
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA refund/restitution rules
- **Threat category:** financial-money-movement
- **Implementation:** core/transactions, services/api-gateway
- **API/UI surface:** /v1/refunds
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **pending-e2e**
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-PAYOUT-001 — Wallet withdrawal / payouts (0.75% fee, paired postings)

- **Owner:** core-payouts
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** operator-extension — Banzami ADR-031 pricing dimension
- **Threat category:** financial-money-movement
- **Implementation:** core/payouts
- **API/UI surface:** /v1/payouts
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **pending-e2e**
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-COLLECT-001 — Collections (split charge, merchant-only)

- **Owner:** operator-payments
- **Public status:** preview-disabled · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA ADR-036 (pending ratification)
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
- **API/UI surface:** webhook delivery + banza-signature header
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **pending-e2e**
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-PROOF-001 — Receipts, proofs and verification pages (/r/{ref})

- **Owner:** operator-proofs
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA ADR-033, ADR-044
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
- **Tests:** unit [services/developer-api/internal/accountidentity (flow, crypto, email)] · integration [services/developer-api workspace/project authz tests] · e2e_sandbox [tools/e2e/dev-console/developer-foundation-e2e.mjs (DEV-001.*)] · negative/security [unauth redirect, OTP single-use/invalid, CSRF-block, cross-tenant 403, logout-invalidates, no-secret-in-storage]
- **Evidence:** evidence/assurance/dev-foundation/e2e-1783197561.json
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
- **Tests:** unit [sdk/typescript env-resolution + webhook-signature tests] · integration [] · e2e_sandbox [SDK clean tarball-install E2E → BanzamiClient.me() against deployed Gateway with a fresh Console key (evidence artifact)] · negative/security [bz_live_+sandbox rejected (BanzamiConfigError); ./sandbox exposes no unreleased-capability methods; tools/check-sdk-contract.mjs]
- **Evidence:** tools/check-sdk-contract.mjs, evidence/assurance/dev-foundation/sdk-clean-install-1783203531.json, docs/operations/SDK_REGISTRY_OWNERSHIP_AND_RELEASE.md, .github/workflows/sdk-publish.yml, tools/sdk-release.mjs
- **Cleanup disposition:** active-needs-remediation
- **External surface:** public · **Disposition:** **blocked-external**
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-SDK-002 — Flutter SDK (banzami_flutter)

- **Owner:** developer-platform
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — SDK-first policy (CLAUDE.md §13)
- **Threat category:** identity-auth
- **Implementation:** sdk/flutter
- **API/UI surface:** pub banzami_flutter
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **External surface:** public · **Disposition:** **pending-e2e**
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-APP-001 — Consumer mobile app (Flutter, com.banzami.consumer)

- **Owner:** mobile
- **Public status:** preview-disabled · **Sandbox:** true · **Live:** false
- **Authority:** internal — operator product
- **Threat category:** tenant-data
- **Implementation:** apps/mobile (main_consumer.dart)
- **API/UI surface:** consumer mobile UI (deep-link inbound payments; no camera QR scan)
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
- **Implementation:** apps/pay, apps/checkout
- **API/UI surface:** pay/checkout UI + /public/pay/{slug}
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security [RT03 §4: public payer view redacts internal UUIDs (deployed); strict CSP; no client secrets]
- **Evidence:** docs/quality/PAYMENTS_CONTRACT_AUDIT.md
- **Cleanup disposition:** active-needs-remediation
- **External surface:** public · **Disposition:** **pending-e2e**
- **Launch scope:** sandbox
- **Status:** **in-audit**

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
