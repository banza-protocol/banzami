# Domain: Consumer Wallets

## Business Purpose

Consumer wallets hold the monetary balances of end-users. They are the financial container for P2P transfer funds, QR payment receipts, and future features like top-ups and withdrawals.

Every consumer wallet is **backed by two LIABILITY ledger accounts** and follows the same double-entry accounting discipline as merchant wallets.

---

## Architecture

```
                ┌───────────────────────────┐
                │   ConsumerWalletEngine    │  (trait)
                │                           │
                │  create()                 │
                │  get_or_create()          │
                │  get()                    │
                │  get_for_consumer()       │
                │  balance()                │
                └────────────┬──────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
 ┌────────────▼──────────┐  ┌──────────────▼──────────┐
 │ ConsumerWalletRepo    │  │ LedgerEngine             │
 │  (consumer_wallets)   │  │  (ledger_accounts,       │
 └───────────────────────┘  │   ledger_entries)        │
                            └──────────────────────────┘
```

### Two-account model

| Account      | Type      | Purpose                                |
|--------------|-----------|----------------------------------------|
| `available`  | LIABILITY | Spendable funds                        |
| `reserved`   | LIABILITY | Funds held for pending outbound ops    |

Banza holds consumer funds as **liabilities** — we owe these amounts to the consumer.

- **Credit** to a LIABILITY account → we owe more (consumer received funds)
- **Debit** from a LIABILITY account → we owe less (consumer spent funds)

---

## Balance Derivation

Balances are **never stored** in the `consumer_wallets` table. They are always derived by querying `ledger_entries`:

```sql
-- Available balance (negated because LIABILITY credit balance = positive for consumer)
SELECT -SUM(
    CASE entry_type
        WHEN 'DEBIT'  THEN  amount_minor
        WHEN 'CREDIT' THEN -amount_minor
    END)
FROM ledger_entries
WHERE account_id = $1  -- available_account_id
```

This is the fundamental CLAUDE.md §2.1 invariant: **never mutate balances directly**.

---

## Invariants

1. **Balance is derived, never stored** — the `consumer_wallets` table has no balance column.
2. **One active wallet per consumer per currency** — enforced by a partial UNIQUE index.
3. **get_or_create is idempotent** — calling it twice produces one wallet, not two.
4. **Zero-balance wallets are valid** — a newly created wallet has an empty ledger; `balance()` returns zero.

---

## Failure Scenarios

| Error | Cause |
|-------|-------|
| `NotFound` | Wallet UUID doesn't exist |
| `NoWalletForConsumer` | No active wallet for (consumer, currency) pair |
| `NotActive` | Operation attempted on suspended/closed wallet |
| `InsufficientFunds` | Debit exceeds available balance (raised by transfer engine) |
| `CurrencyMismatch` | Operation amount currency ≠ wallet currency |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/internal/v1/consumer-wallets` | Create or return existing wallet |
| `GET`  | `/internal/v1/consumer-wallets` | Get wallet for consumer+currency |
| `GET`  | `/internal/v1/consumer-wallets/:id` | Get by wallet UUID |
| `GET`  | `/internal/v1/consumer-wallets/:id/balance` | Derive current balance |
