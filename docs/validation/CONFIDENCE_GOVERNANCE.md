# Confidence Governance — Source of Truth

**Version:** 1.0

## Rule

Two confidence values exist for a validation item. They are not interchangeable:

| Value | What it is | Authority |
|-------|------------|-----------|
| `confidence.score` (stored) | The **formal §16 confidence**, approved during the validation process and persisted in the matrix. | **Source of truth.** §16 gates VALIDATED on `confidence.score >= 80` (CLAUDE.md §16.9). |
| `computeConfidence(item)` (derived) | An **advisory estimate** computed live from `validationMethods`, `evidence`, and `invariants`. | Diagnostic / drift detection only. Never a §16 gate. |

The stored `confidence.score` is what a human approved through the governed
validation flow. The derived `computeConfidence` is a heuristic over the item's
recorded metadata, and its scoring vocabulary is intentionally narrow — so a
fully-validated item with sparse `validationMethods` can score lower than its
approved confidence without being any less valid.

## How `checkMatrix` applies this

For a `VALIDATED` item:

- `confidence.score < 80` → **ERROR** `VALIDATED_LOW_CONFIDENCE` — a real §16
  violation (a VALIDATED item must have stored confidence ≥ 80).
- `confidence.score ≥ 80` **but** `computeConfidence(item) < 80` → **WARNING**
  `CONFIDENCE_DRIFT` — advisory only. The item keeps its VALIDATED status; the
  warning signals that the recorded `validationMethods` / `evidence` metadata may
  be incomplete relative to the approved confidence.
- both ≥ 80 → no confidence issue.

## Consequences

- **Divergence between stored and derived confidence produces a warning, not an
  invalidation.** A §16-approved status is never downgraded automatically.
- **Large drift should prompt a review of evidence/validationMethods metadata**
  (e.g. tagging the methods actually used), not a status change.
- The derived estimate may legitimately understate confidence because
  `computeConfidence` does not score every method tag the matrix uses (e.g.
  `security_audit`, `financial_invariant`, `reconciliation`). Closing that gap is
  an optional refinement to the estimator — it does not affect §16 authority.

## Out of scope

This note does not change the §16 rule, any item status, any stored
`confidence.score`, or the readiness model. It documents which value governs.
