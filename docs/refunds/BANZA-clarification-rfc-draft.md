# DRAFT — BANZA clarification request (refund/dispute restitution)

> **STATUS: DRAFT — PREPARED, NOT SUBMITTED.** Do not open externally against
> `github.com/banza-protocol` until Banzami product review approves submission.
> Authored by Banzami (reference operator) for the BANZA protocol ADR/RFC process.

## Context

Banzami is implementing the operator surface for refunds on top of BANZA
ADR-030 (typed refund source), `docs/core/disputes.md`, ADR-002/020
(double-entry), and ADR-040 (transaction proof). Three points in the protocol are
currently ambiguous or under-specified and block a safe, interoperable operator
implementation. Each asks the protocol to rule; Banzami will not choose silently.

## Question 1 — partial-reversal proof semantics

`ADR-040` + `contracts/proofs/transaction-proof.schema.json` define proof states
`PENDING | CONFIRMED | FAILED | REVERSED | CANCELLED | EXPIRED`, with `REVERSED`
described as a (full) reversal. The protocol does **not** define the proof state
of a **partially** refunded/restituted captured payment.

- **Proposed default (operator):** the proof stays `CONFIRMED` until cumulative
  restitution equals the captured amount, then becomes `REVERSED`. No partial
  state is invented.
- **Protocol decision requested:** confirm the above rule, **or** define a
  protocol representation for partial reversal (e.g., a `reversed_amount` field or
  a new state) — a `contracts/proofs/` change, hence an ADR.

## Question 2 — canonical persisted token for the acquiring source type

ADR-030 §2 names the source type `ACQUIRING_PAYMENT` "a.k.a. `TRANSACTION`."
Operators need one **canonical value to persist** in authoritative records and
expose in operator-readable state, so an acquiring payment source does not
disappear into an ambiguous generic "transaction" model.

- **Requested ruling:** confirm `ACQUIRING_PAYMENT` as the canonical persisted
  token (with `TRANSACTION` retained only as a bounded input/historical alias).
  Banzami will not run a `TRANSACTION → ACQUIRING_PAYMENT` data migration until
  this is confirmed.

## Question 3 — source-typed disputes + combined restitution ceiling conformance

`disputes.md:41-43` requires a dispute to reference a typed source, and `:52`
mandates that **combined** refund + dispute restitution against one source never
exceed the captured amount. However, the protocol provides **no dispute wire/state
contract and no conformance vector** for either rule.

- **Requested ruling:** (a) confirm the dispute↔typed-source binding as a protocol
  invariant; (b) confirm that the combined ceiling is satisfied by a shared
  source-scoped restitution aggregate whose internal shape is operator-defined;
  (c) advise whether a **conformance vector** should be added so every operator
  enforces the combined ceiling identically (interoperability).

## Non-goals

This request does **not** propose a protocol refund API shape or a protocol
refund/`refund.completed` event — those remain operator-local unless a separate
ADR adopts them. It seeks only the three clarifications above.
