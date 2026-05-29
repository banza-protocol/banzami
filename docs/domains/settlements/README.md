# Domain: Settlements

**Crate:** `banzami-settlement`  
**Module:** `core/settlement/`

---

## Business Purpose

Settlement is the process by which Banza collects the net proceeds of a merchant's transactions from the acquiring bank and credits them to the merchant's wallet.

Transactions generate revenue for the merchant, but the actual funds move from the acquirer to Banza in batches — not transaction by transaction. A settlement batch represents one such collection: a merchant's gross transaction volume for a period, minus Banza's fees, equals the net amount transferred.

---

## Architecture

```
  SettlementEngine
    │
    ├── create_batch(request)         — create settlement covering a period
    ├── get(settlement_id)            — retrieve settlement details
    ├── list_for_merchant(merchant_id)— list all settlements
    ├── submit(settlement_id)         — send batch to acquirer
    ├── confirm(settlement_id)        — record receipt, post ledger entry
    └── fail(settlement_id, reason)   — mark as failed
```

The engine depends on `LedgerEngine` to post the net receipt at confirmation.

---

## State Machine

```
               submit               confirm
  PENDING ─────────────► SUBMITTED ──────────► SETTLED ✓
     │                       │
     └───────────────────────┴──────────────► FAILED  ✓
                       fail
```

A settlement can be failed from either `PENDING` or `SUBMITTED`. Failing from `PENDING` means the batch was never sent. Failing from `SUBMITTED` means the acquirer rejected it.

---

## Batch Model

A settlement batch covers one merchant's wallet for a defined time period:

```
gross_amount   — total transaction volume collected
fee_amount     — Banzami's processing fees
net_amount     — gross_amount - fee_amount (what the merchant receives)
period_start   — start of the covered period
period_end     — end of the covered period
transaction_count — number of transactions in the batch
```

The invariant `fee_amount <= gross_amount` is enforced at creation. A fee that exceeds the gross amount is a data error.

---

## Ledger Posting at Confirmation

When the acquirer confirms that funds have been transferred:

```
DR  bank_account      +net_amount  (ASSET ↑ — funds received from acquirer)
CR  transit_account   +net_amount  (LIABILITY ↓ — in-flight balance cleared)
```

The transit account represents the accumulated merchant entitlements that have been earned (through transaction captures) but not yet physically received from the acquirer. Settlement confirmation clears this balance as the actual bank transfer arrives.

---

## Invariants

1. `fee_amount <= gross_amount`. Creating a batch where fees exceed gross is rejected with `SettlementError::FeeExceedsGross`.
2. A settlement cannot be confirmed without being submitted first.
3. A SETTLED settlement cannot transition to any other state.
4. The ledger posting at confirmation is idempotent — the settlement ID is used as the posting's idempotency key. Confirming twice returns the existing posting.
5. `net_amount = gross_amount - fee_amount` is calculated at creation and stored. It cannot change.

---

## Failure Scenarios

| Scenario | Behaviour |
|----------|-----------|
| Fee > gross amount | `SettlementError::FeeExceedsGross` at creation |
| Confirming an already settled batch | `InvalidStatusTransition` error |
| Ledger post fails at confirmation | PostgreSQL rollback — settlement stays SUBMITTED, can be retried |
| Acquirer rejects batch | Admin calls `fail` endpoint — no ledger entry, status → FAILED |

---

## Reconciliation

Settled batches are the input to the reconciliation process. The reconciliation engine compares:
- Internal: `net_amount` from `settlements` where `status = 'SETTLED'`
- External: lines from the acquirer's bank statement

Any mismatch generates a `MISSING_EXTERNAL`, `MISSING_INTERNAL`, or `AMOUNT_MISMATCH` record in the reconciliation report.

---

## Operational Notes

- Settlement batches are created and managed exclusively through the admin-api. Merchants have read-only visibility into their settlement history.
- A merchant may have multiple PENDING settlements simultaneously (e.g., one per currency).
- The period covered by a batch is for reporting purposes only. It does not need to exactly match the transaction timestamps — it is an administrative window.
