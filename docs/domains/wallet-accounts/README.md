# Domain: Wallet Accounts (segregated accounts)

**Crate/module:** `core/api/src/routes/wallet_accounts.rs` (+ transfer/QR/settlement integration)
**ADRs:** Banzami ADR-027 · BANZA ADR-020
**Version:** 1.0

---

## Business Purpose

A **Wallet Account** is a segregated, purpose-tagged account inside a wallet. One
wallet (per owner + currency) holds many accounts so a Business Account can isolate
funds — e.g. DOA opens one `CAMPAIGN` account per campaign — while Banzami stays
the single source of truth for every balance. Apps never hold sub-balances.

## Model

```
Wallet (owner + currency, 1 per pair)
├── PRIMARY      ← mandatory, unique, the backward-compatible default account
├── CAMPAIGN:camp_A   ← own LIABILITY ledger account, isolated balance
├── CAMPAIGN:camp_B
└── PROJECT/EVENT/STORE/ESCROW/RESERVE/SETTLEMENT/CUSTOM …
```

- Each account is backed by its **own LIABILITY ledger account**. Balance is always
  derived from the ledger (`-(sum signed entries)`), never stored.
- `PRIMARY` is created with the wallet (trigger, migration `0081`) and adopts the
  wallet's available account — creating it moves no money.

## Flows

### Open an account (DOA → campaign)
`POST /v1/wallet-accounts {wallet_id, purpose, reference_type,
reference_id, label}` → merchant auth + ownership + ACTIVE-merchant gate →
provisions a LIABILITY ledger account → returns the safe DTO (no ledger ids).
Idempotent on `(wallet, purpose, reference)`.

### Receive into an account
A dynamic QR bound to the account (`wallet_account_id`) routes incoming merchant
payments to it. The transfer engine validates the account at pay time (belongs to
the recipient wallet, ACTIVE, currency match) and credits it instead of the default
account. Plain QRs and P2P are unaffected.

### Settle out of an account
`POST /v1/application-settlements {source_account_id, beneficiary_banza_name,
fee_destination_banza_name}` → gross = the account's balance → only that account is
debited → the fee is **operator-priced** from the `SETTLEMENT` rule of the owner's
assigned pricing profile ([ADR-057](../../adr/ADR-057-project-financial-readiness.md));
the fee destination is required and validated (ADR-028) only when that fee is > 0 →
`application_settlement.completed` webhook. The request carries no rate: a caller
pricing field (`application_fee_bps`, `fee_policy_ref`, …) is refused with 400
`PRICING_FIELD_NOT_ACCEPTED`. (*Historical:* the ADR-029 app-defined
`application_fee_bps` path is removed.)

## Invariants
- Exactly one `PRIMARY` per wallet (partial unique index).
- An account's balance is ledger-derived; no mutable balance field.
- Incoming routing is rejected unless the account belongs to the recipient
  **merchant** wallet, is `ACTIVE`, and matches the currency (fail-closed).
- `PRIMARY` cannot be created through the public API.

## Failure scenarios
- Foreign / inactive / wrong-currency account on routing → `InvalidWalletAccount`
  (the payment fails; QR claim released).
- Suspended/closed merchant → cannot open accounts (`MERCHANT_NOT_ACTIVE`).
- Settlement from an empty account → `NOTHING_TO_SETTLE`.

## Security
- Ledger account ids are never exposed to apps (safe DTO).
- All write surfaces require merchant auth + wallet ownership.
- BANZADMIN visibility is read-only (`CapMerchantView`).
