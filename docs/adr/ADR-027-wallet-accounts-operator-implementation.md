# ADR-027 — Wallet Accounts (segregated accounts): operator implementation

**Status:** Accepted · **Date:** 2026-06-30 · **Implements:** BANZA ADR-042

> Version: 1.0

---

## Context

DOA (and apps like it) need to isolate funds per campaign without holding
sub-balances outside the operator. The protocol concept — a **Wallet Account**
(segregated account within a wallet) — originates in **BANZA ADR-042**, not here.
This ADR records how the Banzami operator *implements* that protocol concept; it
does not define new financial behaviour. (Protocol-first, per CLAUDE.md §Protocol-first.)

A wallet (one per owner + currency) holds N purpose-tagged accounts. `PRIMARY` is
mandatory, unique per wallet, and is the backward-compatible default. Each account
is backed by its **own LIABILITY ledger account**, so its balance is isolated and,
as always, **derived from the ledger** — never a stored mutable field.

## Decision

### Data model
- `wallet_accounts` (migration `0080`): `id, wallet_id, account_id (UNIQUE),
  merchant_id, currency, purpose, reference_type, reference_id, label, status`.
  Partial unique index enforces one `PRIMARY` per wallet, and one account per
  `(wallet, purpose, reference)` when a reference is set.
- Migration `0081`: a trigger gives **every new wallet** a `PRIMARY` account that
  *adopts* the wallet's existing available account — no money moves.
- Migration `0082`: `qr_codes.wallet_account_id` (nullable FK) binds a dynamic QR
  to a segregated account.

### Engine (core, `routes/wallet_accounts`)
Creating an account provisions a fresh LIABILITY ledger account and maps it — it
**moves no money**. Guards: valid purpose; `PRIMARY` not creatable via API; parent
wallet must be `ACTIVE`; ownership checked; idempotent on `(wallet, purpose,
reference)`. Balances are read from the ledger (negated LIABILITY).

### Payment routing (the chokepoint)
The transfer engine's recipient CREDIT gains an optional, validated
`recipient_account_id`. When set, a **merchant** payment credits that segregated
account; when absent, behaviour is byte-for-byte unchanged. Validation is
fail-closed: the account must belong to the recipient wallet, be `ACTIVE`, and
match the currency; routing is **rejected for consumer (P2P) recipients**. A
dynamic QR carries the binding (`qr_codes.wallet_account_id`), re-validated at pay
time from the signed DB record (so it cannot be tampered).

### Settlement
Application Settlement can source a **specific segregated account**
(`source_wallet_account_id` at the gateway → `source_account_id` in core). Only
that account is debited; the fee is still resolved by the Pricing Engine from a
`fee_policy_ref` (never a number). The completed/failed/cancelled webhook resolves
its merchant from `wallet_accounts` too, so campaign settlements emit correctly.

### Surfaces
- Business API: `POST/GET /v1/business/wallet-accounts` (merchant auth + ownership
  + ACTIVE-merchant KYB gate; `PRIMARY` not creatable; safe DTO — **no ledger
  account ids exposed**).
- BANZADMIN: `GET /admin/v1/wallets/{id}/accounts` (read-only, `CapMerchantView`).

## Consequences
- Banzami remains the **single source of truth** for balances; apps never compute
  or hold sub-balances.
- `PRIMARY` keeps every existing flow working unchanged (default routing).
- Account ids stay encapsulated: apps reference `wallet_id` / `wallet_account_id`;
  the operator resolves ledger accounts server-side.

## Alternatives considered
- **Multiple wallets per merchant** (one wallet per campaign): blocked by the
  `UNIQUE(merchant_id, currency)` invariant and would fragment the wallet concept.
  Segregated accounts keep one wallet per currency with isolated sub-accounts —
  the protocol-sanctioned model (ADR-042).
- **App-side sub-ledgers**: rejected — violates "operator is the source of truth"
  and the SDK-first, no-parallel-financial-logic rule.

## Tests
Gate A (engine, 7 DB tests), Gate B (business API, 5), Gate C (routing, 5 DB
tests: routes-and-isolates, default unchanged, foreign/inactive/consumer
rejected), settlement-from-account (2), webhook merchant-resolution (1).
