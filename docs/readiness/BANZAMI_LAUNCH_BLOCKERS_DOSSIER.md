# Banzami — Launch Blockers Dossier

**Version:** 1.0
**Date:** 2026-06-19
**Source:** `docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json` (structurally clean — 0 governance errors)
**Audience:** Founders, operations, compliance, and partnerships.

> This dossier states exactly what blocks Banzami's launch. It is honest and
> conservative: it does not claim production-readiness, and it treats simulated
> providers as development-only. Banzami is built on the open **BANZA** protocol;
> Banzami is the operator. Launch decisions here are operator/commercial choices,
> not protocol changes.

---

## 1. Executive Summary

**Banzami cannot launch yet — and the reason is external, not engineering.**

- The operator software is **internally code-complete for everything buildable
  without an external partner.** Money movement, the ledger, wallets, merchant
  flows, the developer platform, refunds, disputes, and webhook lifecycle are
  validated and in production.
- Launch is blocked by **external provider and regulatory dependencies**: an
  Angolan identity (KYC/KYB) partner, at least one real funding provider, at
  least one real withdrawal provider, a settlement/reconciliation rail, and
  regulatory clearance where the chosen rail requires it.
- **There is no code shortcut to launch.** The critical path is commercial and
  regulatory: choose providers, integrate at least one real path per capability,
  and obtain clearance.

## 2. Current Readiness

| Lens | Value | Meaning |
|------|-------|---------|
| **Launch-ready** (VALIDATED) | **56/66** | production-proven |
| **Code-complete** (VALIDATED + IMPLEMENTED) | **58/66** | internal engineering done |
| **Externally blocked** | **10** | awaiting vendor / bank / regulator |
| **Internal engineering blockers** | **0** | nothing waits on our code |
| **Launch-critical** (critical VALIDATED) | **19/24** | strict launch bar |
| **Implemented critical** (critical V+I) | **21/24** | code-complete critical (helper) |

The 2-item gap between launch-ready (56) and code-complete (58) is **WAL-004**
(funding engine) and **KYB-001** (KYB flow): both implemented and tested, both
awaiting an external provider — so neither is launch-ready.

## 3. External Blockers (10 items)

| Item | Title | Status | Blocker |
|------|-------|--------|---------|
| WAL-004 | Wallet funding (deposit) | IMPLEMENTED | `FUNDING_PROVIDER_REQUIRED` |
| KYC-001 | Consumer KYC | IN_PROGRESS | KYC vendor pending |
| KYC-002 | Merchant representative KYC | IN_PROGRESS | KYC vendor pending |
| KYB-001 | Merchant KYB | IMPLEMENTED | `KYB_IDENTITY_VENDOR_REQUIRED` (sole traders / beneficial owners) |
| PAY-001 | Withdrawals to bank/rail | IN_PROGRESS | `WITHDRAWAL_PROVIDER_REQUIRED` |
| PAY-002 | Withdrawal tracking + reconciliation | BLOCKED | `SETTLEMENT_RAIL_REQUIRED` + `RECONCILIATION_REQUIRED` |
| EMS-001 | EMIS / Multicaixa (one rail) | BLOCKED | EMIS + BNA certification |
| EMS-002 | EMIS settlement (one rail) | BLOCKED | blocked by EMS-001 |
| BANK-001 | Partner bank — funding/settlement | BLOCKED | no partner bank integrated |
| BANK-002 | Partner bank — payout/withdrawal | BLOCKED | no partner bank integrated |

All 10 carry an **external** blocker. None is blocked on internal engineering.

## 4. Dependency Grouping (by decision area)

**A. Identity provider (KYC/KYB)** — KYC-001, KYC-002, KYB-001
One Angolan identity-verification partner unlocks all three (consumer identity,
merchant representative identity, and the sole-trader / beneficial-owner portion
of KYB). Business KYB (NIF / registry) is implemented; individual identity needs
the vendor.

**B. Money In provider (funding)** — WAL-004, EMS-001, BANK-001
The funding engine (WAL-004) is implemented and tested on a simulated provider.
It needs **one** real funding rail — EMIS (EMS-001) **or** a partner bank
(BANK-001) **or** another licensed provider.

**C. Money Out provider (withdrawal)** — PAY-001, EMS-002, BANK-002
The payout engine exists. It needs **one** real withdrawal rail — partner bank
(BANK-002), EMIS settlement (EMS-002), or another licensed provider.

**D. Settlement & reconciliation** — PAY-002, EMS-002, BANK-001/002 (per chosen rail)
Reconciliation against whichever external rail is used; provider-agnostic.

**E. Regulatory / BNA** — EMIS and regulated rails where applicable; provider
approval / payment-operator certification as required by the chosen path.

## 5. Provider-Agnostic Strategy (BANZA ADR-009 / ADR-017)

- **Banzami does not depend exclusively on EMIS.** EMIS is **one possible rail**.
- **Partner banks are possible rails.** Other licensed providers may also satisfy
  Money In / Money Out / settlement.
- **Launch requires at least one approved provider path per capability — not all
  of them.** One funding provider + one withdrawal provider + one settlement
  process is sufficient to launch; the others remain optional alternatives.
- The code already reflects this: funding/acquiring runs on an `AcquirerProvider`
  abstraction, refunds are source-aware (ADR-030), and Money In/Out blockers are
  capability-level (`*_PROVIDER_REQUIRED`), not EMIS-specific.

## 6. Recommended Strategic Paths

### Path A — EMIS-first
- **Unlocks:** EMS-001 (funding), EMS-002 (settlement) → WAL-004, PAY-001, PAY-002.
- **Remaining:** KYC/KYB vendor (Group A) still required independently.
- **Complexity:** HIGH — EMIS technical integration + **BNA payment-operator
  certification**.
- **Launch impact:** national interbank reach (Multicaixa Express).
- **Regulatory risk:** HIGH (certification is the long pole).
- **Business dependency:** EMIS agreement + BNA.

### Path B — Partner-bank-first
- **Unlocks:** BANK-001 (funding/settlement), BANK-002 (payout) → WAL-004, PAY-001, PAY-002.
- **Remaining:** KYC/KYB vendor still required; EMIS optional/later.
- **Complexity:** MEDIUM — one bank integration; depends on the bank's API maturity.
- **Launch impact:** narrower rail than EMIS, but faster to a working path.
- **Regulatory risk:** MEDIUM (bank partnership + applicable clearance).
- **Business dependency:** a partner bank agreement.

### Path C — Hybrid (recommended)
- **Sequence:** KYC/KYB vendor **+** partner bank first → launch; add EMIS later.
- **Unlocks:** Group A + BANK-001 + BANK-002 → WAL-004, PAY-001, PAY-002, KYC-001/002, KYB-001.
- **Remaining:** EMIS (EMS-001/002) as a later, additive rail.
- **Complexity:** MEDIUM — two partner integrations (identity + bank) in parallel.
- **Launch impact:** earliest viable launch with a real, if narrower, rail.
- **Regulatory risk:** MEDIUM — defers BNA/EMIS certification out of the critical path.
- **Business dependency:** one identity vendor + one partner bank.

> **Recommendation: Path C (Hybrid).** It puts the *identity vendor* (which
> blocks 3 critical items and is needed under every path) and *one bank rail* on
> the critical path, defers the slowest dependency (EMIS/BNA), and reaches a real
> launchable path soonest. EMIS is added later as an additional rail.

## 7. Minimum Launch Package

The smallest external setup that makes launch possible:

1. **One production KYC/KYB provider** (Angolan identity verification) — unblocks
   consumer KYC, representative KYC, and sole-trader/beneficial-owner KYB.
2. **One funding provider** (Money In) — EMIS or partner bank or other licensed.
3. **One withdrawal provider** (Money Out) — partner bank or EMIS or other licensed.
4. **One settlement/reconciliation process** against the chosen rail.
5. **Legal / regulatory clearance** appropriate to the chosen rail (incl. BNA
   certification if EMIS).
6. **Operational runbook for provider failures** — funding/withdrawal outage,
   reconciliation mismatch, and identity-vendor downtime procedures.

## 8. Internal Readiness Statement (already built & validated)

- **Ledger & accounting** — double-entry, immutable, reconciliation engine.
- **Wallets** — consumer and merchant wallets, balances, reservations.
- **Money movement** — QR scan-to-pay, P2P transfers, splits (17/17 validated).
- **Merchant flows** — onboarding, profiles, QR, team management, dashboard (7/7).
- **Developer platform** — REST API, SDKs, sandbox, webhooks (12/12).
- **Refunds** — source-aware (acquiring → transit; wallet-native → consumer wallet),
  ceiling + idempotency (REF-001 validated).
- **Disputes** — full lifecycle, audit trail, balanced consumer-win posting (REF-002 validated).
- **Webhook lifecycle** — refund.completed, dispute.opened/resolved delivered via
  transactional outbox + signed delivery with retry.
- **Source-aware wallet-native payments** — `wallet_payments` object (BANZA ADR-017).
- **Validation Studio governance** — §16 gates, structurally clean matrix,
  3-lens readiness (launch-ready vs code-complete vs externally blocked).

## 9. What Must NOT Be Claimed Yet

- ❌ Do **not** claim Banzami is production-ready.
- ❌ Do **not** claim real AOA funding (Money In) works — no production provider.
- ❌ Do **not** claim real withdrawals (Money Out) work — no production provider.
- ❌ Do **not** claim KYC/KYB is production-ready — identity vendor pending.
- ❌ Do **not** claim EMIS is integrated — only if EMIS is selected **and** certified.
- ❌ Do **not** treat simulated providers (`ACQUIRING_PROVIDER` unset / `SIMULATED`,
  `KYC_PROVIDER=SIMULATED`) as production. They are development-only.

## 10. Action Plan

| # | Action | Owner | Output |
|---|--------|-------|--------|
| 1 | Shortlist Angolan **KYC/KYB vendors** (document verification, NIF, OCR, BNA-aligned) | Compliance | vendor shortlist + criteria |
| 2 | Shortlist **partner banks / payment providers** for funding + withdrawal | Partnerships | provider shortlist |
| 3 | Define **provider API requirements** (funding init + callback, withdrawal init + status, reconciliation feed) against the `AcquirerProvider` / payout abstractions | Engineering | integration spec |
| 4 | Define **compliance / BNA questions** (operator certification scope, per chosen rail) | Compliance | regulatory checklist |
| 5 | Prepare a **provider integration checklist** (sandbox keys, signing secrets, idempotency, reconciliation) | Engineering | checklist |
| 6 | Define **sandbox-to-production validation criteria** (real-money smoke tests, invariant tests against the live rail, runbook drills) | Engineering + Ops | go-live gate |

---

## Closing

Banzami's engineering is **done for what can be built internally** — 56/66
launch-ready, 58/66 code-complete, **0 items blocked on internal engineering**.
The path to launch is **commercial and regulatory**: pick an identity vendor and
at least one funding and one withdrawal rail (Path C recommended), satisfy the
minimum launch package, and validate each real provider against the existing
invariant tests before going live. EMIS is one option among several — not a
precondition.
