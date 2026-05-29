# BanzAI — Trace Explainer

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Active

---

## Overview

The Trace Explainer reconstructs the complete causal event timeline for any Banza payment flow and verifies that all financial invariants hold.

Every payment in Banza produces a `trace_id`. Given that ID, the Trace Explainer retrieves every event in causal order, displays the ledger entries, and reports invariant status for the complete flow.

---

## What is a Trace?

A trace is the complete, causally-ordered record of every event that occurred during a payment flow.

### Canonical QR payment trace

```
qr.created          → QR code generated (amount, currency, expiry)
transfer.initiated  → Payment triggered (gross/net/fee decomposition)
ledger.debit        → Consumer wallet debited (gross amount)
ledger.credit       → Merchant wallet credited (net amount)
ledger.credit       → Fee wallet credited (fee amount)
transfer.completed  → Payment confirmed
qr.paid             → QR marked as consumed
settlement.assigned → Settlement record created
```

Each event records:
- Event type
- Entity ID (QR ID, transfer ID, ledger entry ID, settlement ID)
- Timestamp (UTC, millisecond precision)
- Amount and currency (where applicable)
- Wallet IDs (for ledger events)

---

## Invariant Verification

The Trace Explainer verifies the following invariants against the actual event data:

| Invariant | What it checks |
|-----------|---------------|
| `INV-TRACE-001` | Every payment event carries the same `trace_id` |
| `INV-LEDGER-001` | Sum of all debit entries equals sum of all credit entries |
| `INV-LEDGER-002` | No ledger entry was modified after creation |
| `INV-STL-001` | `gross_minor = net_minor + fee_minor` |
| `INV-STL-002` | No wallet balance went negative at any point |

A trace that passes all invariants is marked `PASS`. A single failing invariant marks the entire trace as requiring investigation.

---

## Reading the Timeline

### Event markers

| Marker colour | Meaning |
|--------------|---------|
| Green dot | Positive event (completed, paid, credit) |
| Red dot | Debit event |
| Gold dot | Neutral / state transition event |

### Amount display

For `transfer.initiated`, the gross/net/fee decomposition is displayed:
```
gross 5000 = net 4850 + fee 150
```

For ledger events, the currency and formatted amount are shown:
```
XOF 50.00
```

### Timestamps

All timestamps are displayed in UTC time (HH:MM:SS). Full ISO 8601 timestamps are available in the raw data.

---

## Using the Trace Explainer

### Via BanzAI UI

Navigate to **BanzAI → Trace Explainer**. Enter a `trace_id` (format: `tr_<slug>`). Click Load.

Leave the field empty and click **Demo** to load a sample trace.

### Via BanzAI Chat

```
> Explica o trace tr_abc123xyz
```

BanzAI will retrieve the trace, display the timeline in prose, and report invariant status.

### Via API (planned)

```http
GET /traces/{trace_id}
Authorization: Bearer <token>
```

---

## Demo Trace

The Trace Explainer module ships with a demo trace (`tr_demo_abc123`) that demonstrates a complete QR payment flow:

- Consumer pays 50.00 XOF
- Net: 48.50 XOF to merchant, Fee: 1.50 XOF
- All 5 invariants PASS

This trace is always available regardless of live/demo mode.

---

## Investigating Invariant Failures

### INV-LEDGER-001 failure (debit ≠ credit)

This indicates a broken ledger posting. The sum of all debit entries does not equal the sum of all credit entries for this trace. This is a critical financial data integrity issue.

**Investigation steps:**
1. Identify which posting is unbalanced
2. Check for partial rollbacks (INV-LEDGER-004)
3. Verify no direct database mutations occurred

### INV-STL-001 failure (gross ≠ net + fee)

Money was created or destroyed during settlement. This is a critical financial invariant violation.

**Investigation steps:**
1. Check the `transfer.initiated` event for the declared gross/net/fee values
2. Verify the fee calculation engine output
3. Check for rounding errors (should never occur with i64 minor units)

### INV-TRACE-001 failure (missing trace_id)

An event in the flow is missing its `trace_id` propagation. This indicates a traceability gap.

**Investigation steps:**
1. Identify which event is missing the trace_id
2. Check the service that emitted that event type
3. Verify trace context propagation in OpenTelemetry spans

---

## References

- `docs/validation/INVARIANT_TAXONOMY.md` — full invariant definitions
- `apps/docs/components/banzamia/modules/TraceModule.tsx` — UI implementation
- ADR-001 — service architecture (trace propagation boundaries)
