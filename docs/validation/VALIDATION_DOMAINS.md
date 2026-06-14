# Banzami Validation Domains

Official domain taxonomy for all validation items. Each item in
`BANZAMI_IMPLEMENTATION_MATRIX.json` must belong to exactly one primary
validation domain.

**Version:** 1.0  
**Status:** Active

---

## Purpose

Validation domains group items by the *engineering concern* they address,
independent of product category. A QR payment item might live in the
`Consumer Experience` product category but belong to the `Financial Integrity`
domain if its primary concern is ledger correctness.

Domains are used for:
- domain-level health dashboards,
- filtering by engineering discipline,
- assigning cross-domain ownership,
- confidence scoring thresholds (some domains have higher standards),
- freeze impact analysis (changes in one domain propagate to dependents).

---

## Domain Definitions

### DOM-FIN — Financial Integrity

**Scope:** Ledger engine, wallet engine, settlement, P2P transfers, payouts, refunds, reconciliation.

**Concern:** Any item whose correctness is measured in terms of money: double-entry accuracy, balance consistency, atomic posting, idempotency of financial operations, ledger immutability.

**Standard:** Highest. All invariants must be PASS. Confidence must be ≥ 80 for VALIDATED.

**Owner area:** Core / Financeiro

**Category IDs:** `cat-ledger`, `cat-wallet`, `cat-p2p`, `cat-payouts`, `cat-refunds`

---

### DOM-IDENTITY — Wallet & Identity

**Scope:** Consumer identity, handle registry, consumer wallet lifecycle, consumer authentication.

**Concern:** Wallet provisioning, handle uniqueness, consumer registration, PIN management, balance isolation between consumers.

**Standard:** High. Security invariants mandatory for VALIDATED.

**Owner area:** Core / Identidade

**Category IDs:** `cat-identity`, `cat-handle`

---

### DOM-CONSUMER — Consumer Experience

**Scope:** QR payments, payment links, payment requests, consumer-facing UX flows.

**Concern:** End-to-end consumer payment experience: scan-confirm-paid latency, QR resolution accuracy, payment link reliability, UX correctness.

**Standard:** High. QR invariants mandatory. E2E/manual UX validation recommended.

**Owner area:** Produto / Consumer

**Category IDs:** `cat-qr`, `cat-paylinks`, `cat-payrequests`

---

### DOM-MERCHANT — Merchant Experience

**Scope:** Merchant mobile app (Banza Business), merchant web dashboard.

**Concern:** Merchant-facing UX: payment reception, balance visibility, transaction history, payout flows, QR generation, settlement reports.

**Standard:** Medium-High. Manual UX validation and sandbox testing recommended.

**Owner area:** Produto / Merchant

**Category IDs:** `cat-biz-mobile`, `cat-biz-web`

---

### DOM-DEV — Developer Platform

**Scope:** SDKs, REST API, webhooks, sandbox environment.

**Concern:** Developer experience: API contract stability, SDK correctness, webhook reliability, sandbox fidelity, documentation accuracy.

**Standard:** High. Webhook invariants mandatory. Integration tests required for VALIDATED.

**Owner area:** Plataforma / Developer

**Category IDs:** `cat-sdk`, `cat-api`, `cat-webhooks`, `cat-sandbox`

---

### DOM-SEC — Security

**Scope:** Authentication, authorization, key management, secret storage, network isolation, Go/Rust boundary.

**Concern:** Security properties: key hashing, PIN security, environment isolation, admin route protection, financial write boundary.

**Standard:** Highest. All security invariants must be PASS. No VALIDATED without security review.

**Owner area:** Segurança / Infra

**Category IDs:** `cat-security`, `cat-risk`

---

### DOM-COMPLIANCE — Compliance

**Scope:** KYB/KYC, AML, regulatory compliance enforcement.

**Concern:** Legal and regulatory requirements: merchant KYB gates, KYC transaction limits, AML flagging, compliance state machine correctness.

**Standard:** High. KYC invariants mandatory for VALIDATED.

**Owner area:** Compliance / Legal

**Category IDs:** `cat-kyc`

---

### DOM-OPS — Operations

**Scope:** Background workers, scheduled jobs, settlement scheduler, QR expiry worker, balance checker.

**Concern:** Operational reliability: worker health, scheduler correctness, failure handling, safe degradation.

**Standard:** Medium-High. Integration tests required.

**Owner area:** Plataforma / Operations

**Category IDs:** (items tagged with technicalArea containing "worker", "scheduler", "job")

---

### DOM-OBS — Observability

**Scope:** Metrics, tracing, structured logging, health endpoints, Grafana dashboards.

**Concern:** System visibility: all services expose required signals, latency tracking, payment lifecycle tracing, alert correctness.

**Standard:** Medium. Integration and configuration review required.

**Owner area:** Plataforma / SRE

**Category IDs:** `cat-observability`

---

## Category → Domain Mapping

| Category ID | Category Name | Primary Domain |
|-------------|---------------|----------------|
| `cat-ledger` | Ledger | DOM-FIN |
| `cat-wallet` | Wallets | DOM-FIN |
| `cat-p2p` | P2P Transfers | DOM-FIN |
| `cat-payouts` | Payouts | DOM-FIN |
| `cat-refunds` | Refunds | DOM-FIN |
| `cat-identity` | Identidade do consumidor | DOM-IDENTITY |
| `cat-handle` | Handles | DOM-IDENTITY |
| `cat-qr` | QR Payments | DOM-CONSUMER |
| `cat-paylinks` | Payment Links | DOM-CONSUMER |
| `cat-payrequests` | Payment Requests | DOM-CONSUMER |
| `cat-biz-mobile` | Banza Business Mobile | DOM-MERCHANT |
| `cat-biz-web` | Banza Business Web | DOM-MERCHANT |
| `cat-sdk` | SDKs | DOM-DEV |
| `cat-api` | API | DOM-DEV |
| `cat-webhooks` | Webhooks | DOM-DEV |
| `cat-sandbox` | Sandbox | DOM-DEV |
| `cat-security` | Segurança | DOM-SEC |
| `cat-risk` | Risco | DOM-SEC |
| `cat-kyc` | KYC/KYB | DOM-COMPLIANCE |
| `cat-observability` | Observabilidade | DOM-OBS |
| `cat-emis` | EMIS / Multicaixa | DOM-FIN |

---

## Domain in the Matrix

Every item in `BANZAMI_IMPLEMENTATION_MATRIX.json` must have a `validationDomain` field
matching a `DOM-*` identifier from this document.

```json
{
  "id": "LED-001",
  "validationDomain": "DOM-FIN",
  ...
}
```

Domain is used as a filter dimension in both the Validation Studio and the public
`/validacao` page.

---

## Governance Notes

- Domain assignments are stable but not immutable: a reclassification requires updating
  the item in the matrix and a note in the item's `history[]`.
- Domain is informational for most items; it is enforcement-relevant only for security
  (`DOM-SEC`) and financial integrity (`DOM-FIN`) items where it gates which invariants
  are required.
- Cross-domain items exist (e.g. QR payments touch both `DOM-CONSUMER` and `DOM-FIN`);
  the primary domain is the one governing the item's validation standard.
