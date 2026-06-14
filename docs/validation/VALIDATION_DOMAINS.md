# Banzami Validation Domains — Operator Readiness Pillars

Official domain taxonomy for the Validation Studio. Every validation item in
`BANZAMI_IMPLEMENTATION_MATRIX.json` carries exactly one **readiness pillar** as
its `validationDomain`.

## Purpose

The Validation Studio is an **Operator Readiness Center**. It answers one
question: *Can Banzami safely operate real-world payments today?* The domains are
the **readiness pillars** that answer it — each maps to one question on the
Operator Readiness Dashboard. (Feature areas live in `categoryId`; pillars are the
higher-level launch lens.)

---

## Pillars

| Pillar | Question | Covers |
|--------|----------|--------|
| **DOM-IDENTITY** | Can consumers use wallets & @handles? | Identity, positioning, `@banza` handle registration & resolution |
| **DOM-MONEY-MOVE** | Can money move between wallets? | Consumer wallet, P2P, QR payments, pay links, payment requests |
| **DOM-MONEY-IN** | Can real Kwanza enter the system? | Wallet funding, EMIS acquiring |
| **DOM-MONEY-OUT** | Can money leave to a bank account? | Withdrawals, settlement, refunds & disputes |
| **DOM-MERCHANT** | Can merchants accept & manage payments? | Merchant app, Business Dashboard |
| **DOM-DEVELOPER** | Can developers integrate safely? | SDKs, REST API, webhooks, sandbox |
| **DOM-LEDGER** | Is the money provably correct? | Double-entry ledger, immutability, atomicity, reconciliation |
| **DOM-TRUST** | Is it safe & auditable for regulators? | KYC/KYB, risk engine, security, audit trails |
| **DOM-OPERATIONS** | Can incidents be detected & handled? Can it scale? | Observability, operations, incident response |

---

## Status → readiness

An item is **ready** when its status is `VALIDATED` or `IMPLEMENTED`. A pillar is:

- **ready** — every item ready, no critical gap;
- **partial** — some ready, no critical gap;
- **blocked** — has a `CRITICAL` item not yet ready, or a `BLOCKED` item.

**Can Banzami launch?** = no `CRITICAL` item is unready or blocked. The dashboard
lists every launch blocker by ID.

---

## Governance notes

- Pillars are operator-only. No protocol, federation, governance, or documentation
  domains exist — those belong to the BANZA protocol, not the operator.
- `FINANCIAL_CRITICAL_CATEGORIES` (ledger, wallet, P2P, QR, payouts, refunds) is
  keyed by `categoryId`, independent of the pillar model.
