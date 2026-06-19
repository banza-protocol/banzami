# Banzami — Partner Integration Pack

**Version:** 1.0
**Date:** 2026-06-19
**Audience:** KYC/KYB vendors · partner banks · funding/withdrawal providers · settlement/reconciliation providers
**Source of truth:** [BANZAMI_LAUNCH_BLOCKERS_DOSSIER.md](BANZAMI_LAUNCH_BLOCKERS_DOSSIER.md)

> **Honest status.** Banzami's operator software is internally code-complete for
> everything buildable without an external partner, but it is **not yet in
> production** for real-money or identity flows. No KYC/KYB vendor, bank, EMIS, or
> payment provider is integrated today. This pack describes what we have built,
> what we need from a partner, and exactly how we would integrate and validate a
> partnership. Simulated providers in our sandbox are development-only and are
> never treated as production.

---

## 1. Banzami Positioning

Banzami is the **reference operator** of the open **BANZA** payment protocol,
focused first on **Angola**. It is a **wallet-native, QR-native instant payment
network** in Kwanza (AOA):

- consumers pay by scanning a QR or sending to a `@handle`;
- merchants accept instant wallet payments with no terminal hardware;
- applications integrate payments natively through official SDKs.

BANZA is the protocol (rules, ledger invariants, contracts). **Banzami is the
operator** (UX, wallets, QR, merchant tooling). Choosing rails and identity
providers is an **operator/commercial decision** — this is where a partner fits.

## 2. Current Technical Readiness

| Lens | Value | Meaning |
|------|-------|---------|
| Launch-ready (validated) | 56/66 | production-proven internally |
| Code-complete | 58/66 | internal engineering done |
| Externally blocked | 10 | **awaiting a partner like you** |
| Internal engineering blockers | 0 | nothing waits on our code |

The platform is built on a modular core (Rust financial engine, Go API gateway,
Next.js apps, Flutter SDK, PostgreSQL, Redis), with double-entry ledger
invariants enforced and tested against a real database.

## 3. What Is Already Implemented (no partner required)

- **Double-entry ledger & reconciliation engine** — immutable, balanced postings.
- **Consumer & merchant wallets** — balances, reservations, transfers.
- **Instant money movement** — QR scan-to-pay, P2P transfers, split payments.
- **Merchant suite** — onboarding, public storefront/QR, team & permissions, dashboard.
- **Developer platform** — REST API, SDKs, sandbox environment, webhooks.
- **Refunds** — source-aware (acquiring → transit; wallet-native → payer wallet),
  with over-refund ceilings and idempotency.
- **Disputes** — full lifecycle (open → review → resolve) with audit trail.
- **Webhook delivery** — signed (HMAC) events with retry, via a transactional outbox.
- **Provider abstraction** — funding/acquiring runs on an `AcquirerProvider`
  interface; a simulated provider exists for development. **A real provider plugs
  in here.**

## 4. External Capability Required (what we need from a partner)

Depending on partner type, we need **one** of each capability (not all):

| Capability | What we need | Matrix items it unblocks |
|------------|--------------|--------------------------|
| **Identity (KYC/KYB)** | document verification, NIF / company registry checks, individual & beneficial-owner identity, BNA-aligned process | KYC-001, KYC-002, KYB-001 |
| **Money In (funding)** | move real AOA into a wallet; initiation + asynchronous confirmation callback | WAL-004, plus one rail (EMS-001 or BANK-001) |
| **Money Out (withdrawal)** | disburse from a wallet to a bank account / external rail; initiation + status | PAY-001, plus one rail (EMS-002 or BANK-002) |
| **Settlement & reconciliation** | a statement/feed to reconcile our ledger against the rail | PAY-002 |

## 5. Provider-Agnostic Architecture

- **Banzami does not depend on any single provider.** EMIS, partner banks, and
  other licensed providers are all candidate rails.
- **One approved path per capability is enough to launch** — additional providers
  are optional alternatives, added later without rework.
- Internally, each capability sits behind an abstraction (e.g.
  `AcquirerProvider` for funding/acquiring; a payout interface for withdrawals;
  source-aware refunds). A new provider is an **adapter**, not a rebuild.
- Money In / Money Out readiness is expressed as capability-level requirements
  (`FUNDING_PROVIDER_REQUIRED`, `WITHDRAWAL_PROVIDER_REQUIRED`,
  `SETTLEMENT_RAIL_REQUIRED`), never as a hard dependency on one vendor.

## 6. API Requirements (what a provider adapter needs)

### Identity (KYC/KYB) provider
- **Submit verification:** create a verification for a person/business (documents,
  NIF, selfie/liveness as applicable) → returns a verification id.
- **Status / result:** poll or webhook with `APPROVED | REJECTED | PENDING` + reason.
- **Levels:** support tiered verification (progressive KYC by transaction volume).
- **Webhooks:** signed status callbacks preferred; idempotent.

### Funding (Money In) provider
- **Initiate funding:** start a credit of real AOA toward a wallet for an amount +
  reference → returns a provider transaction id.
- **Confirmation callback:** signed, idempotent webhook confirming settlement
  (`provider_event_id` must be unique so we can dedupe).
- **Currency & amount:** AOA, integer minor units, preserved end-to-end.

### Withdrawal (Money Out) provider
- **Initiate payout:** disburse to a registered bank account / rail for an amount +
  reference → returns a payout id.
- **Status:** `PENDING → PROCESSING → COMPLETED | FAILED` with reason; signed
  callbacks preferred.

### Settlement / reconciliation provider
- **Statement feed:** periodic settled-transactions file/API we can reconcile
  against ledger postings (amounts, references, timestamps, currency).

**Cross-cutting requirements:** TLS everywhere; HMAC-signed callbacks;
idempotency keys honored; sandbox + production environments isolated with separate
credentials; stable error taxonomy.

## 7. Compliance Requirements

- **Regulatory alignment:** processes must align with **BNA** (Banco Nacional de
  Angola) requirements for the relevant activity; payment-operator certification
  scope to be confirmed per rail.
- **Identity:** acceptable Angolan documents (B.I., Passport, Carta), OCR + manual
  review where needed, beneficial-owner identification for businesses.
- **Data protection:** secrets never shared in logs/screenshots; encryption at
  rest and in transit; least-privilege credentials.
- **Auditability:** every money movement and identity decision must be traceable
  and reconcilable on both sides.

## 8. Sandbox Requirements

- A **partner sandbox** with test credentials, isolated from production.
- Deterministic test outcomes (approve/reject/fail) for identity and payments.
- Signed-callback testing (we verify signatures) and idempotency replay testing.
- Documented sandbox→production promotion path (key rotation, environment flags).
- Banzami runs its own simulated provider today; we will integrate against your
  sandbox as the first step, **not** production.

## 9. Production Validation Criteria (our go-live gate)

Before any real-money or live-identity launch, we require:

1. **Real-money smoke tests** on the live rail (small funding + withdrawal),
   end-to-end.
2. **Invariant tests against the live provider** — no money creation (debits =
   credits), amount/currency preserved, idempotent replays produce no duplicate
   settlement, failed operations create no completed postings.
3. **Reconciliation match** — provider statement reconciles to our ledger with zero
   unexplained discrepancy.
4. **Identity production check** — `KYC_PROVIDER=EXTERNAL` validated against the
   real vendor; simulated provider disabled.
5. **Failure runbook drills** — provider outage, callback loss/retry, reconciliation
   mismatch, identity-vendor downtime.
6. **Regulatory clearance** appropriate to the chosen rail in place.

## 10. Questions for the Partner

**All partners**
- Sandbox + production environments with isolated credentials? Onboarding lead time?
- Signed (HMAC) webhooks? Idempotency support? Error taxonomy?
- SLA, uptime, and support model? Settlement/reconciliation feed format & cadence?
- Regulatory standing with BNA for the relevant activity?

**Identity (KYC/KYB)**
- Supported Angolan documents and verification methods (OCR, liveness, NIF/registry)?
- Beneficial-owner / sole-trader identity coverage? Tiered/progressive levels?
- Turnaround time and manual-review fallback?

**Funding / Withdrawal**
- Real AOA in/out: initiation + confirmation model, timing, limits, fees?
- Bank-account validation for payouts? Failure/return handling?
- Currency handling (AOA minor units) and rounding policy?

**Settlement / reconciliation**
- Statement format, frequency, and fields? Dispute/adjustment handling?

## 11. Next-Step Checklist

| # | Step | Owner |
|---|------|-------|
| 1 | NDA + partnership scoping call | Partnerships |
| 2 | Share provider API docs + sandbox credentials | Partner |
| 3 | Map provider API to Banzami's capability adapter (funding / payout / identity / settlement) | Banzami Eng |
| 4 | Build and test the adapter against the partner **sandbox** | Banzami Eng |
| 5 | Run invariant + reconciliation tests in sandbox | Banzami Eng |
| 6 | Confirm compliance / BNA scope for the chosen rail | Both, Compliance |
| 7 | Production credentials + go-live gate (Section 9) | Both |
| 8 | Real-money smoke test + runbook drill → launch decision | Both |

---

## Honesty Statement

This pack does **not** claim Banzami is production-ready, that real AOA funding or
withdrawals work today, that KYC/KYB is production-ready, or that EMIS / any bank /
any provider is integrated. Those become true **only** after a partner is
selected, integrated against sandbox, validated against the production go-live
gate (Section 9), and cleared by the relevant regulator. Simulated providers are
development-only.
