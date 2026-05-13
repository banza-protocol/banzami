# Domain: Transfers (Instant P2P)

## Business Purpose

Instant peer-to-peer wallet transfers are the core product primitive for the consumer network. A user scans a QR code or types a handle, confirms an amount, authenticates, and the money moves in real time.

The transfer domain enforces:

- **Atomicity**: the balance check, ledger posting, and transfer record are committed in a single PostgreSQL transaction — no partial state is ever persisted.
- **Idempotency**: re-submitting the same `idempotency_key` returns the original transfer unchanged.
- **Double-entry correctness**: every completed transfer corresponds to exactly one balanced `ledger_posting`.

---

## Transfer Flow

```
send(SendTransferRequest)
  │
  ├─ Idempotency check: existing transfer for this key? → return it
  │
  ├─ BEGIN TRANSACTION
  │
  ├─ SELECT ... FOR UPDATE  (sender's consumer_wallet row)
  │   └─ Serializes concurrent sends from the same wallet
  │
  ├─ Fetch recipient's available_account_id
  │
  ├─ Derive sender's available balance from ledger_entries
  │   └─ InsufficientFunds? → ROLLBACK
  │
  ├─ INSERT ledger_posting
  ├─ INSERT ledger_entry (DR sender:available)    ← we owe sender less
  ├─ INSERT ledger_entry (CR recipient:available) ← we owe recipient more
  ├─ INSERT transfers (status = COMPLETED)
  │
  └─ COMMIT
```

### Double-entry invariant

```
DR sender_consumer_wallet:available_account   (LIABILITY ↓)
CR recipient_consumer_wallet:available_account (LIABILITY ↑)
```

For every Kz that leaves the sender's balance, the exact same amount enters the recipient's balance. The ledger remains balanced.

---

## State Machine

```
┌─────────────────────────────────────────────────┐
│  Note: PENDING is internal only — the transfer   │
│  record is inserted as COMPLETED in the same     │
│  DB transaction as the ledger posting.           │
│  Callers always see COMPLETED or FAILED.         │
└─────────────────────────────────────────────────┘

  send() succeeds   ┌───────────┐
  ─────────────────►│ COMPLETED │
                    └───────────┘
  
  send() fails      ┌──────────┐
  (balance / wallet)│  FAILED  │
  ─────────────────►│          │
                    └──────────┘
```

---

## Invariants

1. **Atomicity**: balance check + ledger post + transfer record in one PG transaction.
2. **No self-transfers**: `sender_id ≠ recipient_id` enforced at both application and DB layer.
3. **Positive amounts only**: `amount_minor > 0` enforced at both layers.
4. **Idempotency**: same `idempotency_key` → same transfer (checked before any DB writes).
5. **SELECT FOR UPDATE**: prevents concurrent overdraft from the same wallet.
6. **Ledger reference**: every COMPLETED transfer references its `ledger_posting_id`.

---

## Failure Scenarios

| Error | Cause | HTTP |
|-------|-------|------|
| `InsufficientFunds` | Sender balance < requested | 422 |
| `WalletNotFound` | Sender or recipient has no active wallet | 422 |
| `WalletNotActive` | Wallet is suspended | 422 |
| `SelfTransfer` | sender_id == recipient_id | 400 |
| `InvalidAmount` | amount_minor ≤ 0 | 400 |

---

## Pagination

Transfer listing uses the same keyset pagination pattern as transactions:
- Sort: `created_at DESC, id DESC`
- Cursor: `(before_created_at, before_id)`
- Default limit: 20, max: 100

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/internal/v1/transfers` | Send instant P2P transfer |
| `GET`  | `/internal/v1/transfers` | List transfers for a consumer |
| `GET`  | `/internal/v1/transfers/:id` | Get transfer by ID |

---

## Security Considerations

- `SELECT FOR UPDATE` prevents overdraft under concurrent load.
- Idempotency key must be unique per sender — prevents duplicate charges from retries.
- Transfer amounts are stored in **integer minor units** — no floating-point arithmetic anywhere.
- Every transfer is fully auditable via its `ledger_posting_id`.
