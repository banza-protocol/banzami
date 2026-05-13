# Domain: Transactions

**Crate:** `banzami-transactions`  
**Module:** `core/transactions/`

---

## Business Purpose

A transaction represents a single payment event between a customer and a merchant. It is the primary revenue-generating entity on the platform. The transaction domain orchestrates the wallet reservations and ledger postings that make a payment happen safely and atomically.

---

## Architecture

```
  TransactionEngine
    │
    ├── create(request)          — create in PENDING state
    ├── authorize(id, request)   — reserve funds, move to AUTHORIZED
    ├── capture(id, request)     — settle funds, move to CAPTURED
    ├── reverse(id, request)     — release hold, move to REVERSED
    └── fail(id, request)        — mark as failed (from PENDING only)
```

The engine depends on `WalletEngine` for balance operations and inherits its dependency on `LedgerEngine`.

---

## State Machine

```
                 authorize
  PENDING ─────────────────► AUTHORIZED ──────────────► CAPTURED ✓
     │                            │         capture
     │                            │
     │                            └──────────────────► REVERSED ✓
     │                                       reverse
     │
     └────────────────────────────────────────────────► FAILED  ✓
                       fail
```

All terminal states (CAPTURED, REVERSED, FAILED) are immutable. No transitions out of them are permitted.

---

## Transaction Types

| Type       | Description                              |
|------------|------------------------------------------|
| `Payment`  | Customer pays merchant                   |
| `Refund`   | Merchant returns funds to customer       |
| `Transfer` | Wallet-to-wallet movement (same platform)|

---

## Lifecycle and Ledger

### PENDING → AUTHORIZED

Validates: compliance approval, risk score, sufficient wallet balance.

```
Wallet: available -= amount; reserved += amount
Ledger:
  DR  customer_wallet / source_wallet   (LIABILITY ↓)
  CR  transit_account                   (LIABILITY ↑)
```

### AUTHORIZED → CAPTURED

```
Wallet: reserved -= amount
Ledger:
  DR  transit_account    (LIABILITY ↓)
  CR  merchant_wallet    (LIABILITY ↑)
```

### AUTHORIZED → REVERSED

```
Wallet: available += amount; reserved -= amount
Ledger:
  DR  transit_account    (LIABILITY ↓)
  CR  source_wallet      (LIABILITY ↑)
```

### PENDING → FAILED

No ledger entry. No wallet change. The transaction simply did not happen.

---

## Invariants

1. State transitions are enforced by `TransactionStatus::can_transition_to()`. An illegal transition returns `TransactionError::InvalidStatusTransition`.
2. A PENDING transaction cannot be captured directly — it must be authorized first. This two-step model separates the fund check (authorize) from the commitment (capture).
3. Idempotency: `transactions.idempotency_key` is UNIQUE. Creating a transaction with a duplicate key returns the existing transaction.
4. The amount cannot change between creation and capture. Partial captures are not supported in the current implementation.

---

## Pre-Authorize Checks

Before writing any ledger entry, the authorization step validates:

1. **Compliance:** `merchant.can_process_transactions()` — KYB must be Approved and AML status must not be flagged.
2. **Risk:** transaction risk score must be below the configured threshold.
3. **Balance:** `wallet.available_balance >= amount`.

All three checks are evaluated in the Rust core before any wallet or ledger mutation. A check failure returns an error; no state is changed.

---

## Failure Scenarios

| Scenario | State | Behaviour |
|----------|-------|-----------|
| Insufficient balance | PENDING | `WalletError::InsufficientFunds` — stays PENDING |
| Compliance not approved | PENDING | `ComplianceError` — stays PENDING |
| Risk threshold exceeded | PENDING | `RiskError` — stays PENDING |
| Network failure after wallet debit | AUTHORIZED | Ledger and wallet are consistent — idempotency key allows safe retry |
| Duplicate request | Any | Returns existing transaction — no duplicate |
| Capture on CAPTURED transaction | CAPTURED | `InvalidStatusTransition` error |

---

## Security Assumptions

- The compliance and risk checks are performed inside the Rust core, after authentication in the Go gateway. A Go gateway bypass would still be blocked by these checks.
- Idempotency keys are scoped per merchant (`UNIQUE(merchant_id, idempotency_key)` at the DB level). A merchant cannot replay another merchant's transaction.
