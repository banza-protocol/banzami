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
| blocked | 2 |
| in-audit | 18 |
| **total** | **20** |

## Capabilities

| ID | Name | Owner | Public status | Sandbox | Live | Authority | Gate | Disposition | Status |
|---|---|---|---|---|---|---|---|---|---|
| CAP-LEDGER-001 | Double-entry ledger (append-only postings) | core-ledger | internal | ✅ | 🔒 no | protocol (BANZA_REFERENCE ledger invariants) | integration-required | active-required | **in-audit** |
| CAP-WALLET-001 | Wallet accounts and balances | core-wallets | public-sandbox | ✅ | 🔒 no | protocol (BANZA_REFERENCE wallet model) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-PAY-001 | Payment sessions | operator-payments | public-sandbox | ✅ | 🔒 no | protocol (BANZA ADR-043) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-PAY-002 | Payment links | operator-payments | public-sandbox | ✅ | 🔒 no | protocol (BANZA payment link contract) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-PAY-003 | QR payment flows (Banzami QR) | operator-payments | public-sandbox | ✅ | 🔒 no | operator-extension (Banzami QR engine spec (project_qr_engine)) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-REFUND-001 | Typed-source refunds (refund_source) | core-refunds | public-sandbox | ✅ | 🔒 no | protocol (BANZA refund/restitution rules) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-PAYOUT-001 | Wallet withdrawal / payouts (0.75% fee, paired postings) | core-payouts | public-sandbox | ✅ | 🔒 no | operator-extension (Banzami ADR-031 pricing dimension) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-COLLECT-001 | Collections (split charge, merchant-only) | operator-payments | preview-disabled | ✅ | 🔒 no | protocol (BANZA ADR-036 (pending ratification)) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-WEBHOOK-001 | Signed webhooks (banza-signature) | operator-events | public-sandbox | ✅ | 🔒 no | protocol (BANZA webhook signing contract) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-PROOF-001 | Receipts, proofs and verification pages (/r/{ref}) | operator-proofs | public-sandbox | ✅ | 🔒 no | protocol (BANZA ADR-033, ADR-044) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-DEV-001 | Developer Console (login, OTP, workspaces, projects) | developer-platform | public-sandbox | ✅ | 🔒 no | internal (operator policy) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-DEV-002 | API key lifecycle (sandbox keys, one-time secret reveal) | developer-platform | public-sandbox | ✅ | 🔒 no | internal (operator policy) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-DOCS-001 | Developer documentation site | developer-platform | public-sandbox | ✅ | 🔒 no | internal (operator policy) | static-only | active-required | **in-audit** |
| CAP-SDK-001 | TypeScript SDK (@banzami/sdk) | developer-platform | public-sandbox | ✅ | 🔒 no | internal (SDK-first policy (CLAUDE.md §13)) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-SDK-002 | Flutter SDK (banzami_flutter) | developer-platform | public-sandbox | ✅ | 🔒 no | internal (SDK-first policy (CLAUDE.md §13)) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-APP-001 | Mobile apps (consumer + merchant flavors) | mobile | preview-disabled | ✅ | 🔒 no | internal (operator product) | integration-required | active-required | **in-audit** |
| CAP-APP-002 | Merchant dashboard (Banzami Business) | web | preview-disabled | — | 🔒 no | internal (operator product) | sandbox-e2e-required | active-needs-remediation | **blocked** |
| CAP-APP-003 | Admin portal (BANZADMIN) | web | internal | ✅ | ⚠️ yes | internal (operator product) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-APP-004 | Pay page + checkout | web | public-sandbox | ✅ | 🔒 no | internal (operator product) | sandbox-e2e-required | active-required | **in-audit** |
| CAP-LIVE-001 | Live payments / EMIS / Multicaixa rails | operator-payments | not-exposed | — | 🔒 no | protocol (pending regulatory authorization — MUST fail closed) | sandbox-e2e-required | active-required | **blocked** |

## Detail

### CAP-LEDGER-001 — Double-entry ledger (append-only postings)

- **Owner:** core-ledger
- **Public status:** internal · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA_REFERENCE ledger invariants
- **Threat category:** financial-money-movement
- **Implementation:** core/ledger
- **API/UI surface:** none
- **Deployment gate:** integration-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-WALLET-001 — Wallet accounts and balances

- **Owner:** core-wallets
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA_REFERENCE wallet model
- **Threat category:** financial-money-movement
- **Implementation:** core/wallets
- **API/UI surface:** /v1/wallets
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-PAY-001 — Payment sessions

- **Owner:** operator-payments
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA ADR-043
- **Threat category:** financial-money-movement
- **Implementation:** services/api-gateway, core/transactions
- **API/UI surface:** /v1/payment_sessions
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-PAY-002 — Payment links

- **Owner:** operator-payments
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA payment link contract
- **Threat category:** financial-money-movement
- **Implementation:** services/api-gateway
- **API/UI surface:** /v1/payment_links
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
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
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-COLLECT-001 — Collections (split charge, merchant-only)

- **Owner:** operator-payments
- **Public status:** preview-disabled · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA ADR-036 (pending ratification)
- **Threat category:** financial-money-movement
- **Implementation:** services/api-gateway
- **API/UI surface:** /v1/collections
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **Launch scope:** sandbox
- **Status:** **in-audit**

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
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-PROOF-001 — Receipts, proofs and verification pages (/r/{ref})

- **Owner:** operator-proofs
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** protocol — BANZA ADR-033, ADR-044
- **Threat category:** financial-read
- **Implementation:** services/api-gateway, apps/website
- **API/UI surface:** /r/{ref}
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-DEV-001 — Developer Console (login, OTP, workspaces, projects)

- **Owner:** developer-platform
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — operator policy
- **Threat category:** identity-auth
- **Implementation:** services/developer-api
- **API/UI surface:** developer console UI + /developer API
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-DEV-002 — API key lifecycle (sandbox keys, one-time secret reveal)

- **Owner:** developer-platform
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — operator policy
- **Threat category:** identity-auth
- **Implementation:** services/developer-api, services/api-gateway
- **API/UI surface:** developer console key management
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-DOCS-001 — Developer documentation site

- **Owner:** developer-platform
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — operator policy
- **Threat category:** content
- **Implementation:** apps/website
- **API/UI surface:** docs site
- **Deployment gate:** static-only
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-SDK-001 — TypeScript SDK (@banzami/sdk)

- **Owner:** developer-platform
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — SDK-first policy (CLAUDE.md §13)
- **Threat category:** identity-auth
- **Implementation:** sdk/typescript
- **API/UI surface:** npm @banzami/sdk
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
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
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-APP-001 — Mobile apps (consumer + merchant flavors)

- **Owner:** mobile
- **Public status:** preview-disabled · **Sandbox:** true · **Live:** false
- **Authority:** internal — operator product
- **Threat category:** tenant-data
- **Implementation:** apps/mobile
- **API/UI surface:** mobile UI
- **Deployment gate:** integration-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
- **Launch scope:** sandbox
- **Status:** **in-audit**

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
- **Launch scope:** sandbox
- **Status:** **in-audit**

### CAP-APP-004 — Pay page + checkout

- **Owner:** web
- **Public status:** public-sandbox · **Sandbox:** true · **Live:** false
- **Authority:** internal — operator product
- **Threat category:** financial-money-movement
- **Implementation:** apps/pay, apps/checkout
- **API/UI surface:** pay/checkout UI
- **Deployment gate:** sandbox-e2e-required
- **Tests:** unit [] · integration [] · e2e_sandbox [] · negative/security []
- **Evidence:** —
- **Cleanup disposition:** active-required
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
- **Launch scope:** excluded
- **Status:** **blocked**

---

Registration rule: every new material capability MUST be added to the
manifest with tests, gate and evidence before release.
Enforced by `tools/check-assurance-manifest.mjs` (`make check-assurance`).
