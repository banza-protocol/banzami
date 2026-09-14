# ADR-063 — Customer liabilities, backing assets and reconciliation

Version: 1.0
Status: Accepted
Date: 2026-09-14
Relates to: ADR-021 (operator fees), ADR-029 (application settlement), ADR-031 (withdrawal pricing), ADR-061 (wallet-native, rail-decoupled), ADR-062 (Sandbox deletion)
Milestone: MONEY-MODEL-001
Architecture: [docs/architecture/MONEY_MODEL.md](../architecture/MONEY_MODEL.md)

## Context

ADR-061 established that value moves inside Banzami through Core and the ledger,
and that external rails are boundaries. That settles *how* value moves. It does
not say *what a balance represents*, nor how Banzami would know that what it owes
is supported by what it holds outside the network — the question that must be
answered before Financial Live is seriously considered.

The audit (MONEY-MODEL-001) found the ledger already liability-based — every
participant and Business balance is a LIABILITY account derived from immutable
entries, cash-in credits only on confirmation, acquirer settlement moves value from
transit to a bank account — but with the model implicit and five concrete gaps:

1. **No economic classification.** System accounts were known only by their display
   names; nothing distinguished a backing position from transit, revenue from an
   obligation, or an orphan account from a participant's. Twelve owner-less, empty
   accounts existed in the Sandbox with no stated meaning.
2. **A withdrawal moved backing before the rail executed it.** Payout processing
   credited the bank ASSET immediately, so the backing shrank for a withdrawal no
   rail had executed.
3. **An ambiguous outcome could pay twice.** A SENT payout could be failed — and the
   participant restored — on an operator's word, including after a provider timeout
   in which the bank may have executed it.
4. **An acquirer's fee disappeared into transit.** Settlement confirmation moved only
   the net from transit to bank and recognised the fee nowhere.
5. **Reconciliation was settlement-only and matched by amount.** It had no notion of
   duplicates, pending or review outcomes, cash-in or cash-out, and no idempotent,
   inspectable report; the network had no position report at all.

A sixth, smaller finding: Collections percentage shares were computed in `f64`.

## Decision

### 1. A balance is an obligation; backing is an external asset

A participant or Business balance is an obligation of Banzami to its owner:
LIABILITY entries, never a stored number. What supports it is represented only by
ASSET accounts standing for positions outside the network. A liability can never
count as backing. The double-entry identity

```
backing + transit + external costs = obligations + withdrawals in flight + operator revenue
```

holds at every instant, and the coverage invariant is **backing + transit ≥
covered obligations** (participants, Businesses, withdrawals in flight).

### 2. Every account has an economic class (migration 0147)

`ledger_accounts.system_role` ∈ {`EXTERNAL_BACKING` (ASSET), `EXTERNAL_TRANSIT`
(ASSET), `WITHDRAWALS_IN_FLIGHT` (LIABILITY), `OPERATOR_REVENUE` (REVENUE),
`EXTERNAL_COSTS` (EXPENSE)}, each constrained to its account type, plus
`synthetic` for positions no real institution stands behind. Core registers the
roles of its configured accounts at boot and refuses to start if an id already
carries another role. The in-flight and acquirer-fee accounts are created by the
migration with fixed ids. Participant accounts are classified by ownership in the
view `ledger_account_economic_classes`; an owner-less account with entries is
`UNCLASSIFIED` and a finding; one with none is `UNOWNED_EMPTY`.

No duplicate accounting universe is created: the chart stays one ledger, and
existing accounts keep their ids, types and history.

### 3. Cash-out reserves, then extinguishes, on the rail's word

- PROCESSING: DR participant / CR withdrawals in flight (net), fee to operator
  revenue as before (ADR-031). No backing moves.
- CONFIRMED: DR withdrawals in flight / CR backing (net). Claimed before posting, so
  a racing failure cannot pay out a restored obligation.
- FAILED from SENT, and RETURNED: only with the provider's evidence reference,
  recorded on the payout (`payouts.failure_evidence_ref`); otherwise
  `EXTERNAL_EVIDENCE_REQUIRED` and the payout stays SENT. No job fails a payout.
- A payout processed before this decision (bank credited at processing) confirms
  with no further posting; none exists in the Sandbox.

### 4. Cash-in credits only confirmed value

`settle_confirmed_payment` refuses any acquiring payment that is not CONFIRMED,
where the credit is made, rather than trusting its callers. Sandbox funding routes
refuse LIVE. Provider callbacks remain evidence: signature-validated, idempotent,
amount- and currency-checked. Provisional credit before confirmation would be a
separately modelled risk product and does not exist.

### 5. Acquirer costs are recognised

An acquirer settlement confirmation moves the gross out of transit: the net to
backing, the fee to `EXTERNAL_COSTS`. A cost Banzami's revenue does not cover shows
as a coverage shortfall instead of value left in transit.

### 6. Reconciliation compares the boundary and edits nothing (migration 0148)

`core/reconciliation/src/boundary.rs` compares cash-in, cash-out and acquirer
settlement operations with external evidence by reference within kind, and records
MATCHED / AMOUNT_MISMATCH / CURRENCY_MISMATCH / MISSING_EXTERNAL / MISSING_INTERNAL
/ DUPLICATE_EXTERNAL / PENDING / REQUIRES_REVIEW. A run is unique by period and the
digest of its evidence and operation states. It writes only its report; it never
posts, confirms, fails or edits. Differences are resolved through the operation's
lifecycle or an explicit balanced correction through Core.

### 7. The position is a query

`financial_position` (read-only) returns obligations, backing, transit, revenue,
costs, the coverage difference, pending boundary operations, the latest
reconciliation and every integrity finding (unbalanced book, backing below
obligations, negative obligation or backing position, unexplained in-flight value,
value on unowned or retired resources, currency mismatch, severe reconciliation
outcomes). Exposed to operators at `GET /internal/v1/admin/financial-position`
(aggregates only) and logged hourly by the balance checker with stable codes.

### 8. Money is never floating point

Collections percentage shares resolve through exact integer basis points or are
refused. `tools/check-money-model.mjs` fails the build on float money in financial
crates or Go services.

## Sandbox behaviour

Every system account is synthetic; test funding is cash-in against synthetic
transit; SANDBOX-DELETE-001 retirement returns value to transit through balanced
postings, and the position proves no retired resource holds value. There is no
public withdrawal product; withdrawals are exercised through Core and operator
routes. The public API is unchanged: developers see payments, balances,
transactions, refunds and settlements, never backing accounts.

## Live boundary

This decision enables nothing in Financial Live: no real bank account, no real
money, no live keys, no Live balances. `FINANCIAL_LIVE = NOT READY / FAIL-CLOSED`.
When Live exists, its system accounts are registered with `synthetic = false` and
its external evidence comes from real adapters; the model does not change.

## Regulatory uncertainty

The coverage invariant, confirmation before credit, evidence before restoring a
submitted withdrawal and non-destructive reconciliation are **architectural safety
invariants**. The legal nature of a balance, segregation, eligible institutions,
coverage ratio, reconciliation frequency, capital, the treatment of pending
withdrawals and fees, and insolvency treatment are **legal requirements not yet
known** — recorded, unanswered, in the
[future Financial Live operating model](../regulatory/FUTURE_FINANCIAL_LIVE_OPERATING_MODEL.md).
None is encoded as law.

## Non-goals

A safeguarding arrangement, a banking partner, a legal classification of Banzami
value, provisional credit, a public withdrawal API, multi-currency FX, production
alerting infrastructure, or any change to the BANZA protocol.

## Alternatives considered

- **A balance column with periodic reconciliation.** Rejected: ADR-061 §3 — a stored
  balance can be set; a derived one cannot.
- **Classifying accounts by name.** Rejected: names are display text; roles are
  constrained data.
- **Crediting the bank at processing and reversing on failure** (the previous
  shape). Rejected: it moves backing before execution and made a blind failure a
  double payment.
- **Treating a timeout as a failure after N minutes.** Rejected: the rail may have
  executed; only its evidence or confirmation resolves the payout.
- **Reconciliation that auto-corrects.** Rejected: a correction is a financial
  decision and a balanced posting through Core, never a side effect of comparison.
- **A second accounting system for backing.** Rejected: one ledger, classified.

## Evidence

- `core/api/src/routes/money_model_tests.rs` (real database): the fund → P2P →
  payment → acquirer sweep → withdrawal journey with the rail down and back, the
  ambiguous outcome and late confirmation, failure on evidence, the acquirer fee,
  each integrity finding, and reconciliation outcomes, idempotency and zero ledger
  writes. Eleven code mutations proven.
- `core/payouts` (unit + integration), `core/settlement`, `core/reconciliation`,
  `core/collections` tests; admin-api handler tests; BANZADMIN payouts tests.
- `tools/check-money-model.mjs` + selftest (14 mutations), in CI.
- Deployed Sandbox evidence: [quality/MONEY_MODEL_001_CONFORMANCE.md](../quality/MONEY_MODEL_001_CONFORMANCE.md).
