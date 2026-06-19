# Banzami — KYC/KYB Vendor RFP & Scoring Framework

**Version:** 1.0
**Date:** 2026-06-19
**Inputs:** [LAUNCH_BLOCKERS_DOSSIER](BANZAMI_LAUNCH_BLOCKERS_DOSSIER.md) · [PARTNER_INTEGRATION_PACK](BANZAMI_PARTNER_INTEGRATION_PACK.md) · [PARTNER_OUTREACH](BANZAMI_PARTNER_OUTREACH.md) · [TARGET_PARTNERS_RESEARCH](BANZAMI_TARGET_PARTNERS_RESEARCH.md) · [OUTREACH_VERIFICATION_WORKFLOW](BANZAMI_OUTREACH_VERIFICATION_WORKFLOW.md) · [OUTREACH_TRACKER](BANZAMI_PARTNER_OUTREACH_TRACKER.md)
**Purpose:** Objectively compare and select an Angolan KYC/KYB identity vendor.

> **No vendor is selected. No production KYC/KYB exists.** This RFP/scorecard is a
> selection framework. All capability cells start **Pending** and are gated on
> direct vendor verification. The simulated provider in our stack is
> **development-only** and is never treated as production. KYC-001 / KYC-002 /
> KYB-001 cannot be marked VALIDATED until a real vendor is integrated and tested.

---

## 1. Executive Summary

Banzami's **Trust & Compliance** pillar is **6/9 launch-ready, 7/9 code-complete**.
The 6 security/risk items are validated. The 3 remaining — **KYC-001 (consumer
KYC), KYC-002 (merchant representative KYC), KYB-001 (merchant KYB)** — are blocked
by **external identity verification, not by core engineering.**

Internally, the compliance architecture is built and tested: a provider interface
(`KycProvider` with `verify_customer` / `verify_merchant`), progressive KYC levels
with transaction gating, mobile KYC/KYB screens, and an admin compliance review
flow. The **external provider is a configured stub** awaiting a real vendor.

Selecting the right vendor is the **critical path** to closing the pillar. This
document defines the requirements, scoring model, questionnaire, and decision gate
to choose objectively before building any vendor-specific adapter.

## 2. Vendor Shortlist

> Angola coverage and all capabilities are **unverified** until confirmed by the vendor.

| Vendor | Profile | Initial priority | Angola coverage |
|--------|---------|------------------|-----------------|
| **Smile ID** | Africa-native identity (docs + faces) | HIGH | **verify** |
| **Youverify** | Pan-African KYC/KYB + registry | HIGH | **verify** |
| **Sumsub** | Global tiered KYC/KYB/AML | MEDIUM-HIGH | **verify** |
| **Prembly / Dojah** | Africa developer-first identity infra | MEDIUM | **verify** |
| **Trulioo** | Global KYB / business verification | LOW-MEDIUM | **verify** |
| **Veriff / Onfido** | Global document/biometric | MEDIUM (only if Angola plausible) | **verify** |

## 3. Required Capabilities (minimum)

**Identity & documents**
- Angola coverage · Bilhete de Identidade (B.I.) · Passport · Carta de Condução (if applicable)
- OCR · selfie / liveness · **manual-review fallback**

**Scope**
- Consumer KYC · Merchant representative KYC · KYB (business) · sole-trader identity
- **Beneficial-owner** verification · **NIF / business-registry** verification or integration path

**Risk & screening**
- AML · sanctions · PEP screening

**Integration & operations**
- REST API · sandbox · **signed webhooks/callbacks** · idempotency
- audit logs · data retention / privacy policy · production SLA

A vendor missing any **must-have** (Angola coverage, API/sandbox, production
identity verification, KYB/beneficial-owner if required) is a **REJECT** (Section 5).

## 4. Scoring Model (weighted)

Score each criterion **0–5** (0 = absent, 3 = adequate, 5 = excellent). Weighted
total = Σ(score/5 × weight). Maximum = 100.

| # | Criterion | Weight | Score (0–5) | Weighted |
|---|-----------|--------|-------------|----------|
| 1 | **Angola document coverage** (B.I./Passport/Carta, authenticity) | **20%** | `[ ]` | `[ ]` |
| 2 | **API / sandbox / webhook maturity** (idempotency, signing, docs) | **15%** | `[ ]` | `[ ]` |
| 3 | **KYB + beneficial-owner support** (NIF/registry, UBO) | **15%** | `[ ]` | `[ ]` |
| 4 | **AML / sanctions / PEP** screening | **10%** | `[ ]` | `[ ]` |
| 5 | **Regulatory / compliance fit** (BNA alignment, evidence) | **15%** | `[ ]` | `[ ]` |
| 6 | **Integration effort** (adapter fit, time-to-sandbox) | **10%** | `[ ]` | `[ ]` |
| 7 | **Pricing / commercial fit** | **10%** | `[ ]` | `[ ]` |
| 8 | **Support / SLA** | **5%** | `[ ]` | `[ ]` |
| | **TOTAL** | **100%** | | **`[ ]` / 100** |

*(Copy this table per vendor. Criteria 1 and 5 are decisive — a 0 on Angola
coverage forces a REJECT regardless of total.)*

## 5. Go / Hold / Reject Criteria

- **GO** — total ≥ **70/100**, **and** Angola coverage verified, **and** no must-have at 0.
- **HOLD** — total **50–69**, or a promising vendor with one or more capabilities
  still "verify pending" (park until confirmed).
- **REJECT** — any of:
  - **no Angola coverage**,
  - **no API / sandbox**,
  - **no production identity verification** (demo/manual-only with no real capability),
  - **no usable compliance evidence** / regulatory fit,
  - **no path for KYB / beneficial-owner** where required.

## 6. Provider Questionnaire (send to vendors)

**A. Angola coverage & documents**
1. Do you verify Angolan **Bilhete de Identidade**, **Passport**, and **Carta de Condução**? Which exactly?
2. Document **authenticity** checks (tamper/forgery detection)? Data sources?

**B. Verification methods**
3. **OCR** extraction? **Selfie / liveness**? Liveness method (active/passive)?
4. **Manual-review** fallback — process, turnaround, escalation?

**C. Scope**
5. **Consumer KYC** + **merchant representative KYC** + **sole-trader** identity?
6. **KYB** (business) — **NIF / company-registry** verification or integration path?
7. **Beneficial-owner (UBO)** identification?
8. Tiered / **progressive** verification levels?

**D. Risk screening**
9. **AML**, **sanctions**, **PEP** screening — sources and refresh cadence?

**E. Integration**
10. **REST API** docs? Auth model? **Sandbox** + production isolation?
11. **Webhooks/callbacks** — signed (HMAC)? **Idempotency** support? Error taxonomy?
12. Result model: statuses (`APPROVED/REJECTED/PENDING`) + reasons?

**F. Operations & compliance**
13. **Audit logs** and exportable evidence?
14. **Data retention / privacy** policy; **data residency** (where is data stored)?
15. **Production SLA**, uptime, support hours?
16. **Pricing** model (per-check / tiered / minimums)?
17. Your **regulatory standing** and any expectations re: **BNA**?

## 7. Integration Decision Matrix (fill during evaluation)

> All cells **Pending** until verified. `Y` / `N` / `Pending`. Score from Section 4.

| Vendor | Angola coverage | Consumer KYC | Rep KYC | KYB | Beneficial owner | API | Sandbox | Webhooks | AML/PEP | Score /100 | Decision | Notes |
|--------|-----------------|--------------|---------|-----|------------------|-----|---------|----------|---------|------------|----------|-------|
| Smile ID | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | `[ ]` | Pending | — |
| Youverify | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | `[ ]` | Pending | — |
| Sumsub | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | `[ ]` | Pending | — |
| Prembly / Dojah | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | `[ ]` | Pending | — |
| Trulioo | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | `[ ]` | Pending | — |
| Veriff / Onfido | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | `[ ]` | Pending | — |

## 8. Impact on Banzami Readiness

A selected, integrated, and tested vendor unlocks the path for **all three** items
(each still requires its own §16 validation with production evidence):

| Item | What the vendor enables |
|------|--------------------------|
| **KYC-001** Consumer KYC | production consumer identity verification (B.I./Passport, OCR/liveness, manual review) → real KYC gating |
| **KYC-002** Merchant representative KYC | representative completes Consumer KYC via the same vendor; linked to the merchant |
| **KYB-001** Merchant KYB | sole-trader / beneficial-owner identity + NIF/registry verification, on top of the implemented business workflow + settlement gate |

A vendor unlocks the **path**, not the status: each item still needs the adapter
implemented, integration + production tests, gating verified end-to-end, audit
logs, and regulatory evidence before §16 VALIDATED.

## 9. What Must NOT Be Claimed

- ❌ **No vendor is selected.** This is a selection framework.
- ❌ **No production KYC/KYB exists.** The platform is internally code-complete for
  non-provider capabilities only.
- ❌ The **simulated provider is development-only** — never present it as production.
- ❌ **KYC-001 / KYC-002 / KYB-001 cannot be marked VALIDATED** until a real provider
  is integrated **and** validated against sandbox + production with passing tests,
  verified gating, audit logs, and regulatory evidence.
- ❌ Do **not** claim Angola coverage for any vendor until they confirm it in writing.

---

## Next Steps

1. Send the **questionnaire (Section 6)** to the Wave 1 shortlist (Smile ID,
   Youverify, Sumsub) via the [outreach emails](BANZAMI_WAVE1_OUTREACH_EMAILS.md).
2. Score responses with **Section 4**; record in the **Section 7 matrix**.
3. Apply the **Go/Hold/Reject gate (Section 5)**; shortlist GO vendors for a demo.
4. Select; then implement the vendor-specific `ExternalKycProvider` adapter and run
   the validation path (per the Trust & Compliance audit) — **only after selection.**

This document changes no code, no matrix, no statuses, and no readiness.
