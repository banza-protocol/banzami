# Domain: Reconciliation

**Crate:** `banzami-reconciliation`  
**Module:** `core/reconciliation/`

---

## Business Purpose

Reconciliation is the process of comparing Banza's internal settlement records against the bank's external statement to verify that every Kz is accounted for. It detects discrepancies before they become financial losses or disputes.

Reconciliation is not optional infrastructure. It is the mechanism that proves the platform is financially correct.

---

## Architecture

```
  ReconciliationEngine
    │
    └── reconcile(
          run_id,
          settlements: Vec<SettlementView>,  ← caller provides these
          external_lines: Vec<ExternalStatementLine>
        ) → ReconciliationReport
```

### Design decision: decoupled from the settlement crate

The reconciliation engine does not query settlements directly. The caller (the `reconciliation` route handler) fetches the relevant settlements and converts them to `SettlementView` slices before passing them to the engine.

This keeps `banzami-reconciliation` independent of `banzami-settlement` — the engine can be tested in isolation without a database, and can be reused for any matching problem where the same logic applies.

---

## Input Types

**`SettlementView`** — an internal settlement as seen by the reconciliation engine:
```
settlement_id    — the Banzami-internal ID
net_amount_minor — the amount expected to appear on the bank statement
currency         — the currency
```

**`ExternalStatementLine`** — a line from the bank's statement:
```
reference        — bank's reference (e.g., acquirer batch ID)
amount_minor     — amount as reported by the bank
currency         — the currency
posted_at        — when the bank posted it
```

---

## Matching Algorithm

The engine uses a greedy first-match approach, matching by `(amount_minor, currency)`:

```
for each internal settlement:
  find the first unconsumed external line where:
    external.amount_minor == settlement.net_amount_minor
    external.currency     == settlement.currency

  mark external line as consumed
  → MATCHED

  if no match found:
  → MISSING_EXTERNAL

for each remaining unconsumed external line:
  → MISSING_INTERNAL
```

Amount mismatch (same reference, different amount) is tracked as:
```
  → AMOUNT_MISMATCH (discrepancy_minor = external - internal)
```

---

## Output: ReconciliationReport

```
run_id                   — unique identifier for this run
total_checked            — number of internal settlements examined
matched                  — count of perfect matches
missing_external         — internal settlements with no bank counterpart
missing_internal         — bank lines with no internal settlement
amount_mismatches        — lines where amounts disagree
total_discrepancy_minor  — net discrepancy in minor units
records                  — full detail for every line checked
generated_at             — timestamp of the run
```

---

## ReconciliationStatus Values

| Status             | Meaning                                              |
|--------------------|------------------------------------------------------|
| `MATCHED`          | Internal and external agree exactly                  |
| `MISSING_EXTERNAL` | Internal settlement has no bank counterpart          |
| `MISSING_INTERNAL` | Bank line has no internal settlement                 |
| `AMOUNT_MISMATCH`  | Both sides exist but amounts differ                  |

---

## Invariants

1. The sum of `matched + missing_external + missing_internal + amount_mismatches` equals `total_checked + (unmatched external lines count)`.
2. `total_discrepancy_minor` is the sum of `discrepancy_minor` across all `AMOUNT_MISMATCH` records. A perfect reconciliation has `total_discrepancy_minor == 0`.
3. A reconciliation run is immutable once saved. Re-running for the same period creates a new `ReconciliationRunId`.

---

## Failure Scenarios

| Scenario | Behaviour |
|----------|-----------|
| No settlements found for period | Empty report — `total_checked = 0` |
| All settlements missing from bank | All records `MISSING_EXTERNAL` — flag for investigation |
| Bank has extra lines | Recorded as `MISSING_INTERNAL` — possible duplicate transfer |
| DB failure during save | Report not persisted — caller receives error, can retry |

---

## Operational Workflow

```
1. Receive bank statement for period (CSV / MT940 / API export)
2. Parse into ExternalStatementLine records
3. POST /admin/v1/reconciliation/run with merchant_id, period, and lines
4. Review ReconciliationReport:
   - MATCHED records require no action
   - MISSING_EXTERNAL: investigate why bank did not send the batch
   - MISSING_INTERNAL: bank sent money we have no record of — possible ghost transfer
   - AMOUNT_MISMATCH: raise dispute with acquirer for the discrepancy amount
```

---

## Security Assumptions

- Reconciliation is an admin-only operation. Merchants cannot trigger or view reconciliation runs.
- External statement data is provided by the caller — it is not fetched by the platform directly. This keeps the reconciliation engine dependency-free and lets the caller apply any pre-processing or normalisation needed for a specific bank format.
