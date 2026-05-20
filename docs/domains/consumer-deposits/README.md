# Consumer Deposits Domain

Consumer deposits allow consumers to top up their Banzami wallet by paying via Multicaixa Express. They are architecturally separate from merchant payment links — deposits credit consumer wallets, not merchant wallets.

## Flow

```
Consumer requests top-up (amount + currency)
        ↓
POST /internal/v1/consumer-deposits
        ↓
Provider generates Multicaixa reference + instructions
        ↓
Consumer pays via Multicaixa Express app
        ↓
EMIS sends HMAC-signed callback
        ↓
POST /internal/v1/consumer-deposits/callback
        ↓
Consumer wallet credited: system:transit DR / consumer_wallet:available CR
        ↓
Deposit status → COMPLETED
```

## API

### Initiate deposit
```
POST /internal/v1/consumer-deposits
{
  "consumer_id":  "<uuid>",
  "amount_minor": 500000,
  "currency":     "AOA"
}
```
Returns payment instructions (entity + reference) to display to the consumer.

### Get deposit status
```
GET /internal/v1/consumer-deposits/:id
```

### Process inbound callback (production EMIS)
```
POST /internal/v1/consumer-deposits/callback
Headers: Banza-Signature: <hmac>
Body: <raw EMIS callback>
```

### Simulate confirmation (development/sandbox only)
```
POST /internal/v1/consumer-deposits/test-confirm?external_ref=<ref>
```

## Table: `consumer_deposits`

| Column           | Purpose                                      |
|------------------|----------------------------------------------|
| `id`             | Internal deposit UUID                        |
| `consumer_id`    | The consumer initiating the top-up           |
| `wallet_id`      | Consumer's wallet that will be credited      |
| `provider`       | `SIMULATED` or `EMIS`                       |
| `external_ref`   | Multicaixa reference number                  |
| `idempotency_key`| Callback dedup key (UNIQUE)                  |
| `status`         | `PENDING` → `COMPLETED` / `FAILED` / `EXPIRED` |
| `amount_minor`   | Amount in minor currency units               |
| `instructions`   | JSON: `{method, entity, reference}`          |

## Separation from Merchant Acquiring

| Aspect              | Merchant Acquiring           | Consumer Deposits          |
|---------------------|------------------------------|----------------------------|
| Initiator           | Customer (scans QR)          | Consumer (requests top-up) |
| Table               | `acquiring_payments`         | `consumer_deposits`         |
| Callback endpoint   | `/acquiring/callbacks/emis`  | `/consumer-deposits/callback` |
| Wallet credited     | Merchant's `wallets`         | Consumer's `consumer_wallets` |
| Linked to           | `payment_links`              | Consumer identity          |

## Invariants

- Consumer wallet must be ACTIVE before initiating a deposit
- Wallet credit is idempotent via `ledger_postings.idempotency_key`
- Callback signature is validated before any state change
- A `COMPLETED` deposit triggers exactly one ledger posting
