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
| **DOM-CONFORMANCE** | Can Banzami prove BANZA L0 sandbox conformance with official protocol tooling? | Operator-side BANZA conformance **evidence** (L0 sandbox suite, health/manifest, reproducible runner) **plus the L1→L4 roadmap** tracked as `FUTURE`/`PLANNED`. L0 is validated evidence; L1–L4 are roadmap, not claims. Evidence, **not** certification — BANZA owns certification. |

---

## Status → readiness

An item is **launch-ready** when `VALIDATED` and **code-complete** when `VALIDATED`
or `IMPLEMENTED`. A pillar is:

- **ready** — every launch-surface item launch-ready, no critical gap;
- **partial** — some ready, no critical gap;
- **blocked** — has a `CRITICAL` item not yet ready, or a `BLOCKED` item.

**Can Banzami launch?** = no `CRITICAL` item is unready or blocked. The dashboard
lists every launch blocker by ID.

### Roadmap items (`FUTURE` / `PLANNED`)

Items with status `FUTURE` or `PLANNED` are **tracked future scope**, not part of
the current launch surface. They are **excluded** from the launch-ready /
code-complete denominators (`launchScope = total − roadmap`) and are **never**
counted as an internal or external blocker — tracking a roadmap must never make
launch look worse. They surface as a separate "Roadmap" count.

This is how the **BANZA L1→L4 progression** is tracked: L0 evidence is `VALIDATED`,
while L1/L2/L3/L4 are `PLANNED`/`FUTURE` roadmap items — visible and honest, but
not a launch claim and not a certification claim (BANZA owns certification).

---

## Governance notes

- Pillars are operator-only. No protocol-ownership, federation, governance, or
  documentation domains exist — those belong to the BANZA protocol, not the
  operator. `DOM-CONFORMANCE` is **not** an exception: it tracks the operator's
  own **evidence** of passing the BANZA conformance suite at L0 (a dry run against
  the Banzami sandbox), never protocol authority or a certification claim. BANZA
  owns the certification framework; passing the suite is evidence, not a
  certificate, and Banzami is not a certified operator.
- `FINANCIAL_CRITICAL_CATEGORIES` (ledger, wallet, P2P, QR, payouts, refunds) is
  keyed by `categoryId`, independent of the pillar model.
