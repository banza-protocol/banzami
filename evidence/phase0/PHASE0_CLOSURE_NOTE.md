# Banzami — Phase 0 Functional Sandbox Closure Note

Version: 1.0

**Status: Phase 0 functional Sandbox evidence completed with limited simulations.**

Canonical evidence revision (main): `2eff5e0ec91ec2816baa0d838d08ead1afdaec78`

Internal technical Sandbox only. Synthetic participants and synthetic balances only.
No real money, customers, external providers, public access, LIVE or Production.

---

## 1. Phase 0 objective

Prove, in an internal technical Sandbox, that the Banzami operator's core payment
functions behave correctly and safely under a stricter V1.0 pilot-limit overlay —
before any consideration of real funds. Phase 0 validates functional correctness,
financial-invariant safety (no balance/ledger mutation on rejection) and the pilot
guardrails, using synthetic data end-to-end.

## 2. Test scope

The Phase 0 functional plan (Plano de Teste Detalhado Banzami V1.0), items
F0-001..F0-024, exercised against a pilot-enabled internal Sandbox:

- Onboarding, wallet creation, synthetic funding.
- QR payment success, ledger double-entry, idempotency, insufficient-balance and
  invalid-request rejection.
- V1.0 pilot-limit rejections (per-payment, consumer daily, consumer max balance,
  merchant daily receiving, aggregate funds) with no-mutation proof.
- Payment intents, reconciliation and complaint/refund functional flows.
- Payment links (create + provider-simulated confirmation).
- Tabletop operational simulations (service restart, incident classification).

All amounts are synthetic minor units; all participants are synthetic.

## 3. Final result

**PASS 20 · FAIL 0 · SIMULATED 4 · DEFERRED 0** (total 24).

## 4. What was proven live (Sandbox, synthetic)

Exercised through the internal Sandbox APIs against the deployed pilot-enabled
build, with genuine (non-fabricated) outcomes:

- Pilot-enabled redeploy of the four approved services (healthy, non-root, no host
  ports; internal networks only).
- Onboarding → routable `@banza` handle → KYC BASIC → wallet creation.
- Synthetic funding; QR payment success; ledger double-entry (paired debit/credit);
  idempotent retry (no double charge); insufficient-balance and invalid-QR rejection.
- Five pilot-limit rejections — per-payment, consumer daily, consumer max balance,
  merchant daily receiving, aggregate funds — each returning a deterministic
  `PILOT_LIMIT_*` code with consumer balance, merchant balance and the ledger
  unchanged (no partial posting).
- Payment intents (payment-requests create → pay/settle → decline) with wallet-native
  balance movement.
- Complaint/refund (QR payment → `WALLET_PAYMENT` refund reversal) with balance
  correction, ledger reversal and an over-refund guard (`REFUND_EXCEEDS_CAPTURED`).
- Reconciliation computed from actual test outputs (expected vs ledger-derived
  balances) with zero discrepancy across all synthetic participants.

## 5. What remains simulated and why (4 SIMULATED)

- **F0-007 payment links — settlement SIMULATED.** Link creation and
  provider-simulated confirmation are proven live, but the full acquiring settlement
  (merchant wallet credit + ledger double-entry) depends on the external EMIS/HMAC
  callback rail, which is intentionally excluded from Phase 0. No live test failed.
- **F0-011 duplicate prevention — SIMULATED.** Covered by the F0-010 idempotency path
  proven live; not separately driven.
- **F0-019 service restart recovery — SIMULATED (tabletop/deploy-level).** A live
  restart drill was not executed.
- **F0-022 incident material classification — SIMULATED (tabletop).**

Additionally, three pilot caps (merchant per-received, merchant max balance,
aggregate volume) are simulated at the live-API level because they are structurally
shadowed by an equal/lower cap at the API layer, or impractical to drive at API
volume; they are covered by the merged real-database integration tests.

## 6. Confirmation of non-usage

Phase 0 used **no** LIVE environment, **no** Production, **no** real money, **no**
external payment provider, **no** customer data and **no** public access. No
infrastructure was reset; no migrations were run (read-only verification only); no
DNS, certificate or SMTP change was made. Synthetic service credentials were held in
volatile memory or delivered file-only and never exposed in logs, evidence or
reports.

## 7. Readiness for the next regulatory-preparation step

This closure provides an internal, synthetic functional-evidence baseline that
demonstrates:

- correct wallet-native payment behaviour and double-entry ledger integrity;
- deterministic, safe enforcement of the V1.0 pilot limits with no balance or ledger
  mutation on rejection;
- functional refund/reversal and reconciliation with zero discrepancy;
- reproducible evidence captured under version control on `main`.

This baseline supports the preparation of the next regulatory-engagement step by
giving reviewers a sanitised, synthetic demonstration of functional correctness and
guardrail behaviour. It is preparatory internal evidence only.

## 8. Limitations before any Fase 1 with funds reais

Before any Fase 1 involving real funds, the following remain out of Phase 0 scope and
must be addressed under the appropriate approvals and safeguarding structure:

- Real settlement rails and the external acquiring/EMIS callback path (the F0-007
  settlement rail excluded here).
- Live restart/recovery and incident-classification drills executed operationally
  (currently tabletop).
- Independent aggregate-volume and merchant-cap exercising at scale.
- Production observability, real reconciliation against external statements, and
  operational runbooks validated live.
- The regulatory approvals, admission and safeguarding arrangements required for any
  handling of real customer funds — none of which is claimed or implied by this
  Phase 0 evidence.

This document is not a claim of BNA approval, BNA Regulatory Sandbox admission,
production readiness, LIVE deployment, public availability, real payments, customer
data usage, or external-provider activation.
