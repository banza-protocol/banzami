# Domain: Wallets

**Crate:** `banzami-wallets`  
**Module:** `core/wallets/`

---

## Business Purpose

A wallet is the financial container for a merchant. Every merchant has at least one wallet per currency they operate in. The wallet tracks how much money Banzami owes the merchant at any given moment.

Wallet balances are maintained in two layers:
1. **Ledger entries** — the authoritative source of truth; all balance changes flow through immutable ledger postings.
2. **Balance query** — derived at read time by summing ledger entries for the wallet's accounts; no mutable balance column is stored separately.

---

## Architecture

```
  WalletEngine
    │
    ├── reserve(wallet_id, amount)    — hold funds for an authorised payment
    ├── release(wallet_id, amount)    — free a hold (reversal / expiry)
    ├── settle(wallet_id, amount)     — confirm a debit (capture)
    ├── credit(wallet_id, amount)     — add funds (settlement receipt)
    └── get_balance(wallet_id)        — read available + reserved + total
```

The engine depends on `LedgerEngine` to post every balance change as a double-entry journal entry.

---

## State Machine

```
             provision
  ─────────► Active ◄────────────
                │     unsuspend  │
            suspend              │
                │                │
                ▼                │
           Suspended ────────────┘
                │
              close (terminal — no path back)
                │
                ▼
             Closed
```

A `Closed` wallet cannot be reactivated. All funds must be paid out before closing.

---

## Balance Model

| Component   | Meaning                                          |
|-------------|--------------------------------------------------|
| `available` | Funds free to use or pay out                     |
| `reserved`  | Funds on hold for an authorised-but-not-captured transaction |
| `total`     | `available + reserved`                           |

Operations and their balance effects:

| Operation | Available | Reserved | Ledger Entry               |
|-----------|-----------|----------|----------------------------|
| `reserve` | ↓         | ↑        | DR merchant / CR transit   |
| `release` | ↑         | ↓        | DR transit / CR merchant   |
| `settle`  | —         | ↓        | (ledger already posted at reserve) |
| `credit`  | ↑         | —        | DR bank / CR merchant      |

---

## Invariants

1. `available_balance >= 0` at all times. An attempt to reserve more than the available balance returns `WalletError::InsufficientFunds`.
2. `reserved_balance >= 0`. A release for more than the reserved balance is rejected.
3. Balance columns are always consistent with the sum of ledger entries for the corresponding account. Any divergence indicates a bug.
4. A `Suspended` or `Closed` wallet rejects all operations.
5. Currency is fixed at wallet creation. All operations must match the wallet's currency.

---

## Failure Scenarios

| Scenario | Behaviour |
|----------|-----------|
| Insufficient available balance | `WalletError::InsufficientFunds` — no ledger entry written |
| Wallet not found | `WalletError::NotFound` |
| Wallet suspended or closed | `WalletError::NotActive` |
| Currency mismatch | `WalletError::CurrencyMismatch` |
| Ledger post fails | `WalletError::Ledger` — balance columns not updated (transaction rollback) |

---

## Reconciliation

The authoritative balance for any wallet can be reconstructed at any point in time by summing ledger entries for the wallet's account:

```sql
SELECT
  SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor ELSE 0 END) -
  SUM(CASE WHEN entry_type = 'DEBIT'  THEN amount_minor ELSE 0 END)
FROM ledger_entries
WHERE account_id = :wallet_account_id;
```

This value must always equal `available_balance + reserved_balance` on the `wallets` table.

---

## Security Assumptions

- Balance is always derived from ledger entries inside a single PostgreSQL transaction. There is no separate balance column that could diverge from the ledger.
- The `WalletEngine` is the only entry point for balance changes. Sandbox credits (test_credit / sandbox_credit endpoints) bypass the PostingBuilder double-entry enforcement to insert a single CREDIT entry directly, which is the accepted pattern for injecting virtual balance in isolated test environments.
- Every sandbox credit is tagged `environment = SANDBOX` at the database level. A `CHECK` constraint prevents sandbox entries from appearing in live balance queries.
