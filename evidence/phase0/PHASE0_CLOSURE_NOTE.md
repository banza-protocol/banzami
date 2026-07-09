# Banzami — Phase 0 Functional Sandbox Closure Note

Version: 1.0

**Status: Phase 0 functional Sandbox evidence completed with limited simulations.**

Canonical evidence revision (main): `6e094476ea1e4fd575cf7971cdae9f6d8d35b108`

Internal technical Sandbox only. Synthetic participants, synthetic merchants,
synthetic platforms and synthetic balances only. No real money, customers, external
providers, public access, LIVE or Production.

---

## 1. Phase 0 objective

Prove, in an internal technical Sandbox, that the Banzami operator's core payment
functions and its online/API/SDK platform-integration surface behave correctly and
safely under a stricter V1.0 pilot-limit overlay — before any consideration of real
funds. Phase 0 validates functional correctness, financial-invariant safety (no
balance/ledger mutation on rejection), the pilot guardrails, and the platform
API-key model, using synthetic data end-to-end.

## 2. Test scope

The updated Phase 0 functional plan (Plano de Teste Detalhado Banzami V1.0),
items F0-001..F0-035, exercised against a pilot-enabled internal Sandbox. Coverage
now spans:

- **QR payments** — scan → confirm → settle, wallet-native double-entry.
- **Payment links** — create, cancel/expiry.
- **Payment intents** — create → pay/settle → decline, idempotency.
- **Online checkout** — consumer pays online via QR with balance movement.
- **API/SDK-style platform integration** — SDK-shape payment-request creation.
- **Platform API key authentication** — synthetic platform + dev-key auth.
- **Receipt verification** — reference queryable, state-match, non-fabricable, privacy.
- **Platform reconciliation** — created vs settled vs ledger-derived balance.
- **Pilot limits** — the V1.0 caps with no balance/ledger mutation on rejection.
- **Ledger/balance integrity** — double-entry; balances derived from the ledger.
- **Idempotency** — retried payments/intents debited exactly once.
- **Synthetic refund/reversal** — refund with balance correction + over-refund guard.

All amounts are synthetic minor units; all participants, merchants and platforms
are synthetic.

## 3. Final result

**PASS 29 · FAIL 0 · SIMULATED 6 · DEFERRED 0 · BLOCKED 0** (total 35).

> **Complementary evidence (Developer Platform E2E).** A dedicated developer/platform
> lifecycle E2E was added under `evidence/developer-platform/` (F0-DP-001..016 +
> UI): PASS 15 · SIMULATED 1 (webhook outbound) · BLOCKED 1 (no Developer Console
> frontend). It additionally proves a **genuine synthetic API-key revocation** (revoke
> → rejected) and the workspace/project/audit-trail lifecycle. This complements — and
> does not change — the Phase 0 counts above.

## 4. What was proven live (Sandbox, synthetic)

Exercised through the internal Sandbox APIs against the deployed pilot-enabled
build, with genuine (non-fabricated) outcomes:

- Pilot-enabled redeploy of the four approved services (healthy, non-root, no host
  ports; internal networks only).
- Onboarding → routable `@banza` handle → KYC BASIC → wallet creation.
- Synthetic funding; QR payment success; ledger double-entry (paired debit/credit);
  idempotent retry (no double charge); insufficient-balance and invalid-request
  rejection.
- Five pilot-limit rejections (per-payment, consumer daily, consumer max balance,
  merchant daily receiving, aggregate funds) — each with a deterministic
  `PILOT_LIMIT_*` code and consumer balance, merchant balance and ledger unchanged
  (no partial posting).
- Payment intents (create → pay/settle → decline) with balance movement.
- Complaint/refund (QR payment → `WALLET_PAYMENT` refund reversal) with balance
  correction, ledger reversal and an over-refund guard.
- Reconciliation (both a consumer/merchant pass and a platform pass) computed from
  actual outputs — zero discrepancy.
- Online checkout (consumer pays online via QR) with balance movement.
- Platform API-key layer: a synthetic platform provisioned via the Sandbox-only
  fixture endpoint; active synthetic key authenticates; revoked/invalid keys and
  unauthorised (including wrong-scope) attempts rejected — no balance/ledger
  mutation on any rejection.
- Receipt verification at the authenticated-receipt level: reference queryable,
  state matches the settled payment, receipt is non-fabricable (a forged reference
  does not resolve), and no unnecessary personal data is exposed (payer shown
  handle-only).

The developer/platform data model was provisioned by applying the canonical
developer migrations to the Sandbox database **only through the existing gated
migration adapter** (least-privilege runtime grants, no ad-hoc SQL); no
infrastructure was reset.

## 5. What remains simulated (6 SIMULATED)

Listed honestly — none is claimed as an operational live PASS:

- **Webhook outbound delivery/retry requiring a public HTTPS sink** (F0-028/F0-029):
  event emission, `Banza-Signature` HMAC signing and the retry/backoff + idempotency
  contract are verified, but a live 2xx outbound delivery needs a public https sink
  (SSRF-enforced), excluded by the no-external / no-public constraint.
- **External EMIS/HMAC settlement rail** (F0-007 payment-link acquiring settlement):
  intentionally not driven; the acquiring settlement is the external-provider rail.
- **Service restart drill** (F0-019): tabletop/deploy-level; a live restart drill
  was not executed.
- **Incident classification tabletop** (F0-022): tabletop simulation.

Additionally, three pilot caps (merchant per-received, merchant max balance,
aggregate volume) are engine-verified by the merged real-database integration tests
rather than independently driven at the live-API level (structurally shadowed by an
equal/lower cap, or impractical at API throughput), and F0-011 duplicate prevention
is covered by the F0-010 idempotency path.

## 6. Confirmation of non-usage

Phase 0 used **no** LIVE environment, **no** Production, **no** real money, **no**
external payment provider, **no** real customer data and **no** public access. No
infrastructure was reset; no ad-hoc SQL was used to mutate state (the developer
schema was applied via the gated migration adapter using canonical, version-tracked
migrations); no DNS, certificate or SMTP change was made. Synthetic service
credentials were held in volatile memory or delivered file-only and never exposed in
logs, evidence or reports.

## 7. Readiness for the next regulatory-preparation step

This closure provides an internal, synthetic functional-evidence baseline that
demonstrates:

- correct wallet-native payment behaviour and double-entry ledger integrity;
- deterministic, safe enforcement of the V1.0 pilot limits with no balance or ledger
  mutation on rejection;
- functional refund/reversal and reconciliation with zero discrepancy;
- an online/API/SDK platform-integration surface with authenticated platform keys,
  scoped rejection, and verifiable receipts;
- reproducible evidence captured under version control on `main`.

This baseline supports the preparation of the next regulatory-engagement step by
giving reviewers a sanitised, synthetic demonstration of functional correctness and
guardrail behaviour. It is preparatory internal evidence only.

## 8. Limitations before any Fase 1 with funds reais

Before any Fase 1 involving real funds, the following remain out of Phase 0 scope and
must be addressed under the appropriate approvals and safeguarding structure:

- Real settlement rails and the external acquiring/EMIS callback path (the F0-007
  settlement rail excluded here).
- Live webhook outbound delivery/retry against real receiver endpoints.
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
