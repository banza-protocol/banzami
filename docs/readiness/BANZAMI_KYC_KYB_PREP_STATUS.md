# Banzami — KYC/KYB Vendor-Agnostic Prep Status

**Version:** 1.0
**Date:** 2026-06-19
**Related:** [VENDOR_RFP_SCORECARD](BANZAMI_KYC_KYB_VENDOR_RFP_SCORECARD.md) · [VENDOR_BOUNDARY](BANZAMI_KYC_KYB_VENDOR_BOUNDARY.md) · [WAVE1_OUTREACH_EMAILS](BANZAMI_WAVE1_OUTREACH_EMAILS.md) · [OUTREACH_TRACKER](BANZAMI_PARTNER_OUTREACH_TRACKER.md) · [TRUST_COMPLIANCE audit context](2026-06-19-global-readiness-audit.md)

> **Prepared, not production-ready.** Two vendor-agnostic preparation batches are
> complete. **No KYC/KYB vendor is selected or integrated.** The simulated provider
> is development-only. **Collection and internal tracking are not verification.**
> KYC-001 / KYC-002 / KYB-001 are unchanged and still externally blocked.

---

## 1. Executive Summary

Banzami has strengthened its internal KYC/KYB preparation across two batches
(audit completeness, document type, contract tests, and a vendor-agnostic data
model), reducing future integration friction. **Production validation still
depends on selecting and integrating a real external identity vendor**, plus
regulatory clearance. None of this prep changes launch readiness or any item
status — it shapes the data and contracts a real adapter will later satisfy.

## 2. What Is Now Prepared Internally

- **Provider seam** — `KycProvider` trait (`verify_customer` / `verify_merchant`)
  with `KycProviderKind` selection via `KYC_PROVIDER`.
- **Simulated provider** — deterministic, **development-only** default.
- **External provider stub** — wired (`KYC_PROVIDER=EXTERNAL`) but returns
  `NOT_CONFIGURED` until a vendor adapter exists (never a silent approval).
- **Progressive KYC levels** — `KycLevel` 0–3 with single/daily limits.
- **Operation gating** — `OperationType` minimum-level rules enforced on payments.
- **Audit logs** — KYC/KYB decisions (merchant approve/reject/suspend/AML, consumer
  KYC) write to the immutable audit log; tested.
- **Carta de Condução** document type — accepted as an internal type (vendor
  support unverified).
- **`merchant_kyb_profile`** — persists business KYB facts (legal name, NIF,
  registration, activity, sole-trader flag, representative link). Collection only.
- **`kyc_verifications`** — provider-agnostic verification tracking record
  (subject, provider, provider_ref, status, level), idempotent on
  `(provider, provider_ref)`.
- **Status transition rules** — `VerificationRecordStatus` enforces the legal
  lifecycle (PENDING → APPROVED/REJECTED/MANUAL_REVIEW; MANUAL_REVIEW →
  APPROVED/REJECTED; APPROVED → EXPIRED; REJECTED/EXPIRED terminal).
- **Tests** — contract tests, audit DB-backed tests, profile/verification DB-backed
  tests, transition unit tests — all passing.

## 3. What Remains Vendor-Specific (deferred until a vendor is selected)

- Real **API adapter** (`ExternalKycProvider` HTTP implementation).
- **OCR / liveness** capture and mapping.
- **Document-authenticity scoring**.
- **Angola document support confirmation** (which documents the vendor verifies).
- **Webhook signatures / callback payloads**.
- **Provider error codes** → our error model.
- **NIF / registry verification** (real check, not collection).
- **Beneficial-owner verification**.
- **Production / sandbox integration tests** against the live vendor.
- **BNA / regulatory evidence**.

## 4. What Is Intentionally Deferred (Batch 2B and beyond)

- **`beneficial_owners` table** — not created.
- **Beneficial-owner identity PII** — date of birth, nationality, document type,
  document number — not stored.
- **Merchant-level settlement / bank details** — not added (per-payout bank exists;
  overlaps Money Out, separately blocked).
- **Real NIF / registry verification** — not wired.
- **Consumer manual-review UI** — not built (depends on the vendor's review model).
- **Vendor-specific adapter** — not implemented.

## 5. Governance Impact

- **KYC-001** remains **IN_PROGRESS**.
- **KYC-002** remains **IN_PROGRESS**.
- **KYB-001** remains **IMPLEMENTED**.
- **Trust & Compliance** remains **6/9 launch-ready**.
- **Launch-ready** remains **56/66**; code-complete 58/66.
- **No external blocker removed.**
- **Simulated provider remains development-only.**
- **Collection is not verification** — none of this prep is production KYC/KYB, and
  no item is closer to VALIDATED. It becomes §16 evidence **only after** a real
  vendor is live and the data is actually verified.

## 6. Next Critical Path — Vendor Selection

The next real step is **selecting an Angolan KYC/KYB vendor**, using:

- [BANZAMI_KYC_KYB_VENDOR_RFP_SCORECARD.md](BANZAMI_KYC_KYB_VENDOR_RFP_SCORECARD.md) — requirements, weighted scoring, go/hold/reject gate.
- [BANZAMI_WAVE1_OUTREACH_EMAILS.md](BANZAMI_WAVE1_OUTREACH_EMAILS.md) — tailored outreach to the shortlist.
- [BANZAMI_PARTNER_OUTREACH_TRACKER.md](BANZAMI_PARTNER_OUTREACH_TRACKER.md) — live tracking of verification and decisions.

This is a commercial/regulatory step, not an engineering one.

## 7. Validation Path After Vendor Selection

Once a vendor is selected (and only then), in order:

1. **Implement the `ExternalKycProvider` adapter** against the vendor API.
2. **Wire `provider_ref` / status** into `kyc_verifications` from real outcomes.
3. **Implement callbacks / webhooks** (signature scheme + payload mapping).
4. **Run sandbox tests** (approve/reject/pending, signed callbacks, idempotency).
5. **Run production smoke tests** with `KYC_PROVIDER=EXTERNAL`.
6. **Verify gating end-to-end** (payments/settlement blocked until the right level).
7. **Collect audit logs + regulatory evidence**.
8. **Then validate KYC-001 → KYC-002 → KYB-001 under §16** (all ACs PASS, evidence,
   tests, confidence ≥ 80, vendor live) — each with its own approval.

---

## Statement

KYC/KYB is **prepared but not production-ready**. The internal seam, data model,
audit trail, document types, and verification lifecycle are in place; the
real-vendor adapter, identity verification, and regulatory evidence are not. No
matrix, status, or readiness change accompanies this preparation.
