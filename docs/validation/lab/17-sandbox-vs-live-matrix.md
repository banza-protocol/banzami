# 17 — Sandbox vs Live capability matrix

Version: 1.0
Rule: **a Sandbox PASS never implies Live readiness.**

---

## 1. Live truth, preserved exactly

```
LIVE FOUNDATION                 DISPOSABLE-PROVEN
REAL LIVE INFRASTRUCTURE        NOT PROVISIONED
REAL LIVE DATABASE              NOT PROVISIONED
REAL LIVE FINANCIAL RUNTIME     NOT PROVISIONED
REAL LIVE PRODUCT               NOT DEPLOYED / NOT TESTED
REAL LIVE COLLECTIONS           NOT DEPLOYED / NOT TESTED
FINANCIAL LIVE                  NOT_READY / FAIL-CLOSED
```

The Validation Lab validates **Sandbox only**. Any future Live validation is a
separate, explicitly authorized milestone with its own design.

## 2. Matrix

`Sandbox`: implemented · external-dependency · not-implemented · out-of-scope.
`Live`: not-provisioned for everything — the column records *what would still be
missing* if it were.

| Capability area | Sandbox | Live | Live gap beyond provisioning |
|---|---|---|---|
| Ledger / double entry | implemented | not provisioned | — |
| Wallets / balances | implemented | not provisioned | — |
| Consumer P2P | implemented | not provisioned | KYC tiers enforced |
| QR payments | implemented | not provisioned | — |
| Payment links | implemented | not provisioned | — |
| Payment sessions | implemented | not provisioned | — |
| Business Receive Point | implemented | not provisioned | — |
| Collections | implemented | **not deployed** | BANZA ADR-016 Live ratification |
| Refunds | implemented | not provisioned | — |
| Application settlements | implemented | not provisioned | — |
| Payouts (operator side) | implemented | not provisioned | **bank rail** |
| **Cash-Out (rail)** | external-dependency | not provisioned | **bank/EMIS contract** |
| **Cash-In** | not-implemented | not provisioned | **rail + product surface** |
| Acquiring (hosted) | simulated | not provisioned | **EMIS/Multicaixa** |
| Webhooks | implemented | not provisioned | — |
| Receipts / verifier | implemented | not provisioned | — |
| Developer Platform | implemented | not provisioned | Live key issuance policy |
| Consumer KYC | out-of-scope (no KYC in Sandbox) | not provisioned | **full KYC programme** |
| Business KYB | implemented | not provisioned | real document review + BNA |
| Compliance / AML | partial | not provisioned | **regulatory reporting** |
| Risk / freeze | implemented | not provisioned | real risk models |
| Reconciliation / boundary | implemented | not provisioned | real rail statements |
| Pricing / fees | implemented | not provisioned | commercial pricing sign-off |
| Disputes | implemented | not provisioned | dispute policy + SLAs |
| BANZADMIN | implemented | not provisioned | operator segregation of duties |
| App Banzami (web) | implemented | not provisioned | — |
| App Banzami (iOS/Android) | build-gated | not released | store review |
| SDKs | TS + Dart published | keys refused in Live | Live key support |
| DOA integration | implemented | not applicable | DOA has no Live rail |

## 3. Capabilities whose Sandbox PASS is least transferable

Flagged because a reader is most likely to over-read them:

1. **Payouts.** The operator lifecycle and the 0.75 % fee are real and proven.
   No money has ever left the system. A Sandbox payout `CONFIRM` is an operator
   state transition, not a bank credit.
2. **Acquiring.** Hosted payment confirmation in Sandbox is
   `POST /public/pay/{slug}/test-confirm`. There is no card, no Multicaixa, no
   Express.
3. **Consumer KYC.** Sandbox performs none, deliberately. A green Consumer suite
   says nothing about identity verification.
4. **Compliance / AML.** Pilot limits and the KYC-tier model exist in code; no
   regulatory reporting path exists.
5. **Any balance.** Every Kwanza in the Sandbox is synthetic value issued from a
   transit account.

## 4. Enforcement

Every Run Manifest asserts:

```
REAL_LIVE_TESTS_EXECUTED            = 0
REAL_LIVE_FINANCIAL_MUTATIONS       = 0
REAL_LIVE_INFRASTRUCTURE_MUTATIONS  = 0
```

And `S00-ENV-007` proves it positively rather than by convention: the runner's
resolved host set contains no Live host, and `make check-live-fail-closed`
passes. The Sandbox itself refuses `bz_live_…` keys.

## 5. Reporting

Every capability result carries both columns. A report that prints only the
Sandbox column is malformed, because the whole risk this matrix addresses is
someone reading a Sandbox PASS as permission to launch.
