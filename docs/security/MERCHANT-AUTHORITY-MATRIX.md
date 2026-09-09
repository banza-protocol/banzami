# Merchant-surface authority matrix

**Status:** RA-054 umbrella finding · regression artefact, not a one-time report
**Last verified:** 2026-08-31 against deployed Sandbox build `4430e62db9c2`
**Machine check:** `tools/e2e/security/ra-054-authority.mjs`

> A request field that NAMES a resource is a resource selector. It is not
> authority over that resource.

Seven confirmed instances of one shape now exist. This file records every
merchant-authenticated public route, what identity it accepts from the client,
and **where** the binding to the authenticated principal happens — because
"looks safe" and "is bound" are different claims, and only the second is
checkable.

No credentials, tokens or secrets appear here.

---

## Legend

| Class | Meaning |
|---|---|
| **SAFE** | Client-supplied id is resolved, then compared to the principal before use. Binding site cited. |
| **SAFE (derived)** | No client identity accepted — the subject comes from the principal. |
| **FIXED** | Was defective; repaired in this stage. |
| **N/A** | No identity/resource selector in the request. |

---

## Money-moving routes (audited first)

| Route | Method | Client authority fields | Binding site | Class |
|---|---|---|---|---|
| `/v1/payouts` | POST | `wallet_id` | `core/payouts/src/engine.rs` — `wallet.merchant_id != req.merchant_id`, **before** the balance check | **FIXED** (RA-056) |
| `/v1/payouts/{id}` | GET | path id | `core/api/src/routes/payouts.rs` — required `merchant_id`, foreign → 404 | **FIXED** (RA-056) |
| `/v1/payouts` | GET | — | `list_for_merchant(principal)` | SAFE (derived) |
| `/v1/transactions` | POST | `wallet_id` | `core/transactions/src/engine.rs` — same invariant | **FIXED** (RA-056) |
| `/v1/transactions/{id}`, `/v1/transactions` | GET | — | scoped by `principal.MerchantID` + environment | SAFE (derived) |
| `/v1/refunds` | POST | `source_type`, `source_id` | `core/api/src/routes/restitution.rs:405` `WHERE id=$1 AND merchant_id=$2`; `:458` `wp_merchant != merchant_id` | SAFE |
| `/v1/refunds/{id}`, `/v1/refunds` | GET | — | scoped by principal | SAFE (derived) |
| `/v1/application-settlements` | POST | `source_wallet_id`, `source_wallet_account_id`, beneficiary/fee wallet ids | `handler/application_settlements.go:78-119` — every wallet resolved then `wal.MerchantID != principal.MerchantID`; `ApplicationID` bound (SEC-002) | SAFE |
| `/v1/application-settlements/{id}` | GET | path id | `:182` `st.ApplicationID != principal.MerchantID`, unknown ownership fails closed | SAFE |
| `/v1/application-settlements` | POST | `source_account_id`, `fee_destination_banza_name` | `:235-241` account → parent wallet → `wal.MerchantID != principal.MerchantID` | SAFE |
| `/v1/wallet-accounts` | POST/GET | `wallet_id` | `handler/wallet_accounts.go:45` `authorizeOwnedWallet`; core re-checks | SAFE |
| `/v1/payment-requests/*` | ALL | `requester_id`, `payer_id` | **none — principal never read** | **FIXED** — unmounted (RA-057) |
| `/v1/qr/pay` | POST | `payer` | **none** | FIXED — unmounted (RA-053) |
| `/v1/transfers/*` | ALL | `sender_id`, `consumer_id` | **none** | FIXED — unmounted (SEC-015) |

## Reads of tenant state

| Route | Method | Client authority fields | Binding site | Class |
|---|---|---|---|---|
| `/v1/wallets/{id}`, `/balance`, `/analytics` | GET | path id | core scopes to owner → 404 (**verified**: foreign → 404) | SAFE |
| `/v1/wallets`, `POST /v1/wallets` | GET/POST | — | derived from principal | SAFE (derived) |
| `/v1/merchants/{id}`, `/suspend`, `/api-keys` | ALL | path id | SEC-004 + core ownership → 404 (**verified**: foreign → 404 on read, key-create and suspend) | SAFE |
| `/v1/consumer-wallets/*` | ALL | `consumer_id`, path id | **none** | **FIXED** — unmounted (RA-058) |
| `/v1/consumers/{id}` | GET | path id | none — any merchant may read any consumer's handle/status/created_at | **See note 1** |
| `/v1/consumers/handle/{handle}` | GET | handle | none — by design: handle lookup is how a payer is addressed | SAFE (directory) |
| `/v1/merchant/wallet-payments` | GET | — | scoped by principal | SAFE (derived) |
| `/v1/integration` | GET | — | self-scoped | SAFE (derived) |
| `/v1/merchant/transactions/{id}/receipt.pdf` | GET | path id | wallet_payments scoped by principal | SAFE |

## Merchant-owned resources

| Route | Method | Client authority fields | Binding site | Class |
|---|---|---|---|---|
| `/v1/payment-links/*` | ALL | `merchant_id`, `wallet_id` | `handler/payment_links.go` — `requireOwnedLink`, foreign `merchant_id` → 403, ownership checked before mutation | SAFE (RA-047) |
| `/v1/payment-sessions/*` | ALL | `wallet_account_id` | payee derived from principal or Project binding (ADR-047) | SAFE |
| `/v1/qr/static`, `/qr/dynamic` | POST | `owner_id`, `owner_type` | `handler/qr.go:41` `requireOwnQrOwner` | SAFE (RA-049) |
| `/v1/qr/{id}`, `/{id}/use` | GET/POST | path id | `:201` owner must equal principal | SAFE (RA-049) |
| `/v1/collections/*`, `/collection-shares/{id}/surface` | ALL | — | merchant_id + environment derived; core 404s cross-tenant | SAFE (derived) |
| `/v1/webhooks/*` | ALL | path ids only | scoped by principal — **no merchant identity field in any body** | SAFE (derived) |
| `/v1/team/*` | ALL | — | scoped by principal | SAFE (derived) |
| `/v1/merchant/kyb/*`, `/v1/compliance/*` | ALL | — | subject is the principal | SAFE (derived) |
| `/v1/disputes` | POST | `consumer_id` | see note 2 | **See note 2** |
| `/v1/sandbox/*` | ALL | `wallet_id` | environment-gated; funding is per-principal and rate-limited | SAFE |
| `/v1/merchant/auth/claim` | POST | — | already-authenticated principal | SAFE (derived) |
| `/v1/splits*` | ALL | — | 410 at the edge, never proxied | N/A |

---

### Note 1 — `GET /v1/consumers/{id}`

Any merchant can read any consumer's handle, status and creation date by id.
Verified (HTTP 200). Classified as a **design question, not a defect**: the
response carries no financial data, and the sibling handle lookup is deliberately
a public directory — that is how a payer is addressed at all. Enumerating
consumers by id has no merchant use case, so it should be withdrawn, but it does
not disclose money or permit mutation and is not treated as a security defect
here.

### Note 2 — `POST /v1/disputes`

`consumer_id` is client-supplied with no principal binding. A probe with a
non-existent transaction returned **500 `INTERNAL_ERROR` carrying "resource not
found"** — a not-found leaking as a 500, which is separately wrong (the RA-050
shape). Whether a dispute can be opened against another tenant's transaction was
**not** established: it needs a settled transaction belonging to the victim, and
CAP-PAY-003 execution is unavailable. Recorded as **unproven, not safe** — the
one honest gap in this matrix. It is not counted as SAFE.

---

## What this matrix is for

The four historical instances were each found by a separate audit, one stage at a
time. The point of writing ownership down per route is that the next reviewer
checks a claim ("bound at `qr.go:41`") rather than re-deriving it, and the suite
checks the money-moving subset on every run.

Adding a merchant route means adding a row. A row that cannot cite a binding site
is not finished.
