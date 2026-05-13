# Domain: Payouts

**Crate:** `banzami-payouts`  
**Module:** `core/payouts/`

---

## Business Purpose

A payout is the disbursement of settled funds from a merchant's Banzami wallet to their external bank account. Where settlement moves money from the acquirer into Banzami, a payout moves money from Banzami out to the merchant.

Payouts are initiated by the merchant and managed through their lifecycle by admin operators.

---

## Architecture

```
  PayoutEngine
    │
    ├── initiate(request)             — create payout in PENDING state
    ├── get(payout_id)                — retrieve payout details
    ├── list_for_merchant(merchant_id)— list merchant payouts
    ├── process(payout_id)            — commit funds, post ledger entry
    ├── mark_sent(payout_id)          — record bank transfer dispatch
    ├── confirm(payout_id)            — record bank receipt confirmation
    ├── fail(payout_id, reason)       — mark failed, reverse ledger if posted
    └── mark_returned(payout_id)      — record bank return, reverse ledger
```

The engine depends on `WalletRepository` (to resolve the merchant's ledger account ID) and `LedgerEngine` (to post fund movements).

---

## State Machine

```
                process
  PENDING ─────────────► PROCESSING ──── mark_sent ────► SENT
     │                       │                             │
     │ fail                  │ fail                        ├── confirm ──► CONFIRMED ✓
     ▼                       ▼                             │
  FAILED ✓              FAILED ✓                          ├── fail ──────► FAILED   ✓
                         (reversal)                        │
                                                           └── returned ─► RETURNED ✓
                                                                            (reversal)
```

### Key distinction

A `fail` from `PENDING` writes no ledger entry — no money was ever committed. A `fail` from `PROCESSING` or `SENT` reverses the ledger entry that was posted at `process`.

---

## Ledger Entries

### At `process` (PENDING → PROCESSING)

Funds are committed for disbursement:

```
DR  merchant_wallet   (LIABILITY ↓) — merchant's balance is consumed
CR  bank_account      (ASSET ↓)     — funds leave Banzami's bank balance
```

The `LedgerPostingId` is stored on the payout record for use in reversals.

### At `fail` (if a posting exists) or `mark_returned`

Funds are returned to the merchant:

```
DR  bank_account      (ASSET ↑)     — funds returned to Banzami
CR  merchant_wallet   (LIABILITY ↑) — merchant's balance restored
```

### At `confirm`

No ledger entry. Confirmation is an acknowledgement that the bank has received the funds. The ledger was updated at `process`.

---

## Invariants

1. `process` requires the merchant's wallet to have sufficient `available_balance`. If not: `PayoutError::InsufficientBalance`.
2. The `idempotency_key` is UNIQUE per merchant. Creating two payouts with the same key returns the existing one.
3. A CONFIRMED payout is terminal. No further transitions are possible.
4. Reversal is only possible if `ledger_posting_id` is set (i.e., a posting was made at `process`). Failing a PENDING payout requires no reversal.
5. `failure_reason` is required when failing a payout. This is enforced at the API layer.

---

## Failure Scenarios

| Scenario | Behaviour |
|----------|-----------|
| Insufficient balance at process | `InsufficientBalance` — payout stays PENDING |
| Bank transfer rejected (fail from PROCESSING) | Ledger reversal posted — merchant balance restored |
| Bank returns funds (returned from SENT) | Ledger reversal posted — merchant balance restored |
| Duplicate idempotency key | Returns existing payout — no duplicate created |
| Ledger reversal fails | `LedgerError` returned — payout status not updated (operator must retry) |

---

## Two-Step Design

The separation between `initiate` (create) and `process` (commit) is intentional.

**`initiate`** allows the merchant to express intent without immediately committing funds. The payout sits in `PENDING` until an operator (or a future automated system) decides to process it. This gives room for:
- Fraud review before committing funds
- Batching multiple payouts for bank submission
- Manual approval workflows

**`process`** is the commitment step. Once processed, funds are debited from the merchant's wallet. All subsequent state changes either confirm the transfer or reverse this commitment.

---

## Operational Notes

- Payouts are created by merchants through the public API. All lifecycle transitions after `initiate` are performed by admin operators through the admin-api.
- A merchant may have multiple payouts in PENDING or PROCESSING simultaneously. The sum of all PENDING and PROCESSING payouts should not exceed `available_balance` — enforced at `process` time for each individual payout.
- Bank transfer references and destination account details are stored on the payout record for the bank's use and for reconciliation.
