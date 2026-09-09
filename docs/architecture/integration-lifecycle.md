# Integration Lifecycle — from a new business to settlement

**Status:** Implemented · **Version:** 1.0 · **Part of:**
[application-integration-engine.md](application-integration-engine.md) ·
**Decision:** [ADR-032](../adr/ADR-032-application-integration.md)

![Integration lifecycle](../diagrams/banzami-integration-lifecycle-v1.svg)

```
Create Business → KYB → Wallet(+accounts) → Pricing → Application
      → Receber pagamento → Settlement → Beneficiário
```

Every stage is **gated by Business Resolution** (`GET /v1/integration`): the app
polls it and renders `blockers[]` until the business is ready. The app owns none
of these stages' money logic — it triggers them via the SDK and reflects state.

## Stages

1. **Create Business** — an application acts through a real Business account
   ([ADR-028](../adr/ADR-028-application-business-account-requirement.md)).
   Blocker until active: `BUSINESS_NOT_ACTIVE`.
2. **KYB** — the operator verifies the business
   ([kyb-merchant-verification.md](kyb-merchant-verification.md)). Blocker:
   `KYB_NOT_APPROVED`. (Sandbox auto-approves.)
3. **Wallet (+ sub-accounts)** — the operator provisions a wallet; the app
   creates purpose sub-accounts as needed (e.g. one `CAMPAIGN` account per
   campaign, [ADR-027](../adr/ADR-027-wallet-accounts-operator-implementation.md)).
   Blockers: `WALLET_MISSING`, `WALLET_ACCOUNT_MISSING`.
4. **Pricing** — the operator assigns the category's pricing rule
   ([pricing-resolution-engine.md](pricing-resolution-engine.md)). Blocker:
   `PRICING_MISSING`.
5. **Application** — with `blockers[]` empty, the app can operate: create payment
   sessions ([ADR-030](../adr/ADR-030-payment-sessions.md)), collections, split
   bills, QR ([qr-engine.md](qr-engine.md)).
6. **Receber pagamento** — the payer pays through any provisioned interface
   (link / QR / deep link); the operator credits the destination sub-account and
   emits `payment_session.paid`.
7. **Settlement** — the app requests close + supplies its application fee; the
   operator computes fees, posts the ledger and pays the beneficiary
   ([settlement-resolution-engine.md](settlement-resolution-engine.md),
   [ADR-029](../adr/ADR-029-application-defined-settlement-fees.md)).

## Readiness contract

`settlement_ready == true` **and** `blockers == []` ⇒ the business can receive
payments and settle. Anything else ⇒ the app shows the blocker and waits; it does
not attempt to work around the operator.
