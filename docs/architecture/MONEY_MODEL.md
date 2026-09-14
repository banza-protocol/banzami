# Money model — what a Banzami balance is, and what backs it

Version: 1.0

Milestone MONEY-MODEL-001 · Decision: [ADR-063](../adr/ADR-063-customer-liabilities-backing-assets-and-reconciliation.md)
· Related: [ADR-061](../adr/ADR-061-wallet-native-rail-decoupled-financial-network.md) (wallet-native),
[ADR-062](../adr/ADR-062-sandbox-resources-are-developer-disposable.md) (Sandbox deletion),
[future Financial Live operating model (internal)](../regulatory/FUTURE_FINANCIAL_LIVE_OPERATING_MODEL.md)

**Internal architecture. Financial Live is NOT READY / FAIL-CLOSED.** Everything
here runs in the Public Sandbox with fictitious value. Nothing here states a
regulatory status, a safeguarding arrangement or a banking relationship. The words
*liability* and *backing* are architectural concepts, not legal terms.

## 1. A balance is an obligation

A Banzami balance is not a number stored in PostgreSQL. There is no balance
column (ADR-061 §3). A participant's balance is the sum of immutable ledger
entries on a **LIABILITY** account: it is what Banzami owes that participant.

What Banzami owes is supported by positions **outside** the network — a bank or
custodian account, value an acquirer confirmed and has not yet settled. Those
are **ASSET** accounts. The double-entry identity ties them together at every
instant:

```
external backing + external transit + external costs
   = participant obligations + Business obligations + withdrawals in flight + operator revenue
```

So the operator question — *how much do we owe, and how much backs it?* — is a
query, not a reconciliation project:

```
                  BANZAMI NETWORK (the ledger)
     participants · Businesses · withdrawals in flight      ← obligations
                           │
═══════════════════════════╪═════════════════════ boundary (external rails)
                           │  reconciliation: operations ↔ external evidence
                           ▼
          external transit (acquirer) · external backing (bank/custodian)   ← assets
```

## 2. Every account has an economic class

| Class | Account type | What it is | Where it comes from |
|---|---|---|---|
| `PARTICIPANT_AVAILABLE` / `PARTICIPANT_RESERVED` | LIABILITY | What Banzami owes a consumer (spendable / reserved) | owner: `consumer_wallets` |
| `BUSINESS_AVAILABLE` / `BUSINESS_RESERVED` | LIABILITY | What Banzami owes a Business, including its wallet accounts | owner: `wallets`, `wallet_accounts` |
| `WITHDRAWALS_IN_FLIGHT` | LIABILITY | Obligations reserved for a withdrawal no rail has confirmed | system role (0147) |
| `EXTERNAL_TRANSIT` | ASSET | Value confirmed at an acquirer/provider, not yet settled to backing | system role (Core boot) |
| `EXTERNAL_BACKING` | ASSET | A bank or custodian position | system role (Core boot) |
| `OPERATOR_REVENUE` | REVENUE | Fees Banzami earned — Banzami's own, never a customer's | system role (Core boot) |
| `EXTERNAL_COSTS` | EXPENSE | What an acquirer kept when it settled | system role (0147) |
| `UNOWNED_EMPTY` | any | An account nothing owns and nothing ever posted to (an onboarding that stopped) | — holds nothing |
| `UNCLASSIFIED` | any | An account nothing owns **with entries** | — an integrity finding |

System roles live in `ledger_accounts.system_role`, constrained to the one
account type each role can have; `synthetic = true` marks positions no real bank
or provider stands behind (every Sandbox system account). Participant classes are
derived from ownership in the view `ledger_account_economic_classes`, so an
account created by any path is classified the moment its owner exists. A wallet
liability can never count as backing: backing is only an `EXTERNAL_*` ASSET.

## 3. What changes the network total, and what does not

| Operation | Obligations | Backing | Rail | Entries |
|---|---|---|---|---|
| **Cash-in** (hosted payment, deposit) | ↑ | transit ↑ | yes — credited only once CONFIRMED | DR transit / CR participant or Business |
| **P2P**, **wallet payment**, **wallet account transfer** | = (who is owed changes) | = | no | DR payer / CR payee |
| **Refund of a wallet payment** | = | = | no | reverse of the payment |
| **Application settlement** | = (the application fee is credited to the application's own account — still an obligation) | = | no | DR source / CR beneficiary; DR source / CR application fee account |
| **Acquirer settlement** (transit → backing) | = | transit ↓ gross, backing ↑ net, costs ↑ fee | yes | DR backing / CR transit; DR costs / CR transit |
| **Withdrawal requested** (payout PROCESSING) | participant ↓ gross, in flight ↑ net, revenue ↑ fee | = | not yet | DR participant / CR in flight; DR participant / CR revenue |
| **Withdrawal executed** (payout CONFIRMED) | in flight ↓ | backing ↓ net | yes — only on the rail's confirmation | DR in flight / CR backing |
| **Withdrawal rejected or returned** (on evidence) | restored exactly | = | evidence required from SENT | reversals of what processing posted |
| **Restitution of an acquired payment** | ↓ | transit ↓ | yes | DR Business / CR transit |
| **Sandbox test funding** | ↑ | synthetic transit ↑ | simulated; refused in LIVE | DR transit / CR participant |
| **Sandbox retirement** | ↓ | synthetic transit ↓ | — | CR transit / DR participant |

`INTERNAL_TRANSFER_CHANGES_NETWORK_VALUE = 0` is proved at every step of
`fund_move_settle_withdraw_keeps_every_obligation_backed`
(`core/api/src/routes/money_model_tests.rs`).

## 4. The boundary waits for the rail

- **No credit before authority.** A hosted payment is credited only in
  `settle_confirmed_payment`, which refuses anything not CONFIRMED; a deposit only
  after its callback. Sandbox funding routes refuse LIVE.
- **A withdrawal reserves, then extinguishes.** Processing moves the net obligation
  to withdrawals in flight; the backing asset decreases only when the rail confirms.
- **A timeout is not a failure.** A SENT payout is failed or returned only with the
  provider's evidence reference (`EXTERNAL_EVIDENCE_REQUIRED`), recorded on the
  payout. Until then it stays SENT; a late confirmation resolves it exactly once.
- **Provider callbacks are evidence.** They are signature-validated, idempotent by
  their own key, amount- and currency-checked before anything is confirmed.
- **Rail down:** internal movements complete; cash-in and cash-out do not confirm
  and nothing is credited or paid out (ADR-061 §4).

## 5. Reconciliation is first-class and edits nothing

`core/reconciliation/src/boundary.rs` compares the boundary operations of a period
— cash-in (by the provider's reference), cash-out and acquirer settlement (by
their Banzami id, the reference they are submitted under) — with external evidence:

| Outcome | Banzami | Evidence |
|---|---|---|
| `MATCHED` | confirmed | executed, same amount and currency |
| `AMOUNT_MISMATCH` / `CURRENCY_MISMATCH` | confirmed | executed, different |
| `MISSING_EXTERNAL` | confirmed | nothing |
| `MISSING_INTERNAL` | nothing | executed |
| `DUPLICATE_EXTERNAL` | — | the same reference again |
| `PENDING` | waiting for the rail | nothing yet |
| `REQUIRES_REVIEW` | pending or failed | executed |

A run is recorded in `boundary_reconciliation_runs/items` (0148), identified by its
period and the digest of its evidence **and** operation states: the same inputs are
one run; a late confirmation is a new run. It writes only its report. Every
statement it runs against financial state is a SELECT; `tools/check-money-model.mjs`
fails the build if the crate writes financial state or posts. A difference is
resolved through the operation's own lifecycle (confirm, fail on evidence), or by
an explicit balanced correction through Core — never by editing history
(ledger entries and postings are immutable, 0033).

Operator route: `POST /internal/v1/admin/boundary-reconciliation`.

## 6. The financial position

`GET /internal/v1/admin/financial-position` (Core, internal, read-only, aggregates
only — no participant is named) returns per currency: participant, Business and
in-flight obligations; external backing and transit; operator revenue and external
costs; the coverage difference (backing − obligations); pending funding and
withdrawals; the latest reconciliation; and every **finding**:

| Finding | Meaning |
|---|---|
| `BOOK_UNBALANCED` | a posting's debits ≠ credits |
| `BACKING_BELOW_OBLIGATIONS` | backing + transit < obligations |
| `NEGATIVE_OBLIGATION` | a participant/Business account below zero |
| `NEGATIVE_BACKING_POSITION` | a backing or transit account paid out value it never received |
| `NEGATIVE_OPERATOR_REVENUE` / `NEGATIVE_EXTERNAL_COSTS` / `NEGATIVE_WITHDRAWALS_IN_FLIGHT` | a system position went the wrong way |
| `WITHDRAWALS_IN_FLIGHT_UNEXPLAINED` | in flight ≠ what unresolved payouts reserved |
| `UNCLASSIFIED_ACCOUNT_WITH_ENTRIES` | value on an account nothing owns |
| `RETIRED_RESOURCE_HOLDS_VALUE` | a retired test payer, retired Project Business or closed wallet account still holds value |
| `RETIRED_RESOURCE_PENDING_CASH_IN` | a hosted payment still pending on a retired Business's cancelled link — a later confirmation would credit it (retirement fails these) |
| `ENTRY_CURRENCY_MISMATCH` | an entry in a currency other than its account's |
| `BOUNDARY_*` | a severe outcome in the latest reconciliation run |

The balance checker logs each finding hourly as `LEDGER INVARIANT VIOLATION:
economic integrity` with its stable `code` — the signal alerting matches on. There
is no production alerting infrastructure for Financial Live yet; none is simulated.

## 7. Fees and costs are never customer funds

Operator revenue is its own class and is never counted as an obligation; the
coverage surplus in a healthy book is exactly Banzami's revenue net of costs. An
acquirer's fee is recognised as an external cost when the acquirer settles; before
MONEY-MODEL-001 it stayed in transit as value no provider held.

## 8. Currency and precision

Only AOA has system accounts; a withdrawal or acquirer settlement in another
currency is refused (`CURRENCY_NOT_SUPPORTED`) rather than covered by AOA backing.
Money is integer minor units end to end; the one float the published contract
carries (a Collections share percent) becomes exact basis points before any
arithmetic, or is refused.

## 9. The Sandbox

Every system account is `synthetic`. Test funding is a cash-in against synthetic
transit; retirement (SANDBOX-DELETE-001) returns value to it through balanced
postings and fails any hosted payment still waiting on the links it cancels, so
no later confirmation can credit a retired Business. `RETIRED_RESOURCE_HOLDS_VALUE`
and `RETIRED_RESOURCE_PENDING_CASH_IN` prove nothing is hidden on retired resources. There is no public withdrawal product in the Sandbox: withdrawals are
exercised at the Core level and through the operator routes.

## 10. Architectural invariant ≠ legal requirement

Backing ≥ obligations, no credit before confirmation, evidence before restoring a
submitted withdrawal, reconciliation without edits — these are **architectural
safety invariants** Banzami holds regardless of regulation. Whether funds must be
segregated, at which institutions, at what coverage ratio and reconciliation
frequency, with what capital buffer, are **legal requirements** that are
unanswered — see the operating model's safeguarding questions. The architecture is
built so that the stricter answer can be enforced without redesign; it does not
assume any answer.

## Evidence

- `core/api/src/routes/money_model_tests.rs` — the journey; rail down; ambiguous
  outcome and late confirmation; failure on evidence; acquirer fee; every finding
  (unbacked credit, one-legged credit, circular backing, unowned value, retired
  value, unexplained in flight, backing overdrawn); reconciliation outcomes,
  idempotency and zero ledger writes. 11 code mutations proven (7 on the
  lifecycle and position, 4 on reconciliation).
- `core/payouts` unit and integration tests; `core/settlement` tests;
  `core/reconciliation` unit tests (outcomes, digest, kind scoping).
- `tools/check-money-model.mjs` (+ selftest, 14 mutations), in CI — including
  public copy that would call a balance a deposit or electronic money.
