# Domain: Ledger

**Crate:** `banzami-ledger`  
**Module:** `core/ledger/`

---

## Business Purpose

The ledger is the single financial truth of the platform. Every Kz that enters, moves through, or exits Banzami is permanently recorded here. It is the foundation that makes reconciliation, auditing, and dispute resolution possible.

No other domain writes to the ledger directly. Every domain that moves money (wallets, transactions, settlement, payouts) does so by requesting a posting from the ledger engine.

---

## Architecture

```
                    ┌──────────────────────┐
  Other domains ──► │   LedgerEngine       │
                    │                      │
                    │  post(PostingBuilder)│
                    │  get_posting(id)     │
                    │  get_entries(acct_id)│
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  PostgreSQL          │
                    │                      │
                    │  accounts            │
                    │  ledger_postings     │
                    │  ledger_entries      │
                    └──────────────────────┘
```

### Data model

**`accounts`** — represents a financial account (asset, liability, equity, revenue, expense). Accounts are created once and never deleted.

**`ledger_postings`** — a journal entry: a balanced group of debits and credits. Immutable once written. Contains an idempotency key to prevent duplicate entries.

**`ledger_entries`** — individual debit or credit lines. Each entry belongs to exactly one posting. Never updated or deleted.

---

## Core Invariants

1. **Every posting is balanced.** `sum(DEBIT entries) == sum(CREDIT entries)` for every `LedgerPosting`. Enforced before any SQL is executed.
2. **Entries are immutable.** No UPDATE or DELETE is ever executed on `ledger_entries` or `ledger_postings`.
3. **Idempotency.** `ledger_postings.idempotency_key` has a UNIQUE constraint. Posting the same operation twice returns the existing posting without creating a duplicate.
4. **Currency consistency.** All entries in a posting must use the same currency. An account has a declared currency; posting to it in a different currency is a compile-time-detectable error.

---

## Account Structure

Banzami maintains a small set of system-level accounts:

| Account             | Type      | Role                                             |
|---------------------|-----------|--------------------------------------------------|
| `bank_account`      | ASSET     | Funds held at the acquiring bank                 |
| `transit_account`   | LIABILITY | Funds in-flight during payment or settlement     |
| `merchant_wallet_*` | LIABILITY | One per merchant wallet — funds owed to merchant |

Merchant wallet accounts are created lazily when a wallet is provisioned.

---

## Flows

### Payment capture

```
DR  transit_account   (LIABILITY decreases — in-flight cleared)
CR  merchant_wallet   (LIABILITY increases — merchant is now owed)
```

### Settlement confirmation

```
DR  bank_account      (ASSET increases — acquirer sent funds)
CR  transit_account   (LIABILITY decreases — in-flight cleared)
```

### Payout processing

```
DR  merchant_wallet   (LIABILITY decreases — merchant's balance consumed)
CR  bank_account      (ASSET decreases — funds leave Banzami)
```

### Payout reversal (failed or returned)

```
DR  bank_account      (ASSET increases — funds returned)
CR  merchant_wallet   (LIABILITY increases — merchant's balance restored)
```

---

## Failure Scenarios

| Scenario | Behaviour |
|----------|-----------|
| Unbalanced posting attempted | `LedgerError::UnbalancedPosting` before any DB write |
| Duplicate idempotency key | Returns existing posting — no error, no duplicate |
| Account not found | `LedgerError::AccountNotFound` |
| Currency mismatch | `LedgerError::AccountCurrencyMismatch` |
| DB failure mid-write | PostgreSQL transaction rollback — partial postings impossible |

---

## Security Assumptions

- Only the Rust core-api process has write access to ledger tables. Go services never touch these tables.
- All writes happen inside a PostgreSQL transaction. A crash between entries leaves no partial posting.
- The idempotency key constraint is the last line of defence against double-posting if the application-layer check is bypassed.
