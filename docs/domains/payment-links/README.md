# Domain: Payment Links

## Business Purpose

Payment links are shareable URLs that allow merchants to receive payments without integrating a full checkout flow. A merchant creates a link, shares it via WhatsApp, Instagram DM, or SMS, and the customer opens it in any browser to pay.

This is the primary commerce primitive for Angola's informal economy, where merchants often operate without a website or POS terminal.

---

## Link Anatomy

```
https://pay.banzami.org/{slug}
```

- **slug** — 12 hex characters derived from the first 12 characters of a UUID v4 `simple` (no-hyphens) string.  
  Example: `slug = uuid::Uuid::new_v4().simple().to_string()[..12]` → `a3f7c2d19b40`
- Slugs are unique at the database level via a `UNIQUE` constraint.
- A slug is generated at creation time; it cannot be changed.

---

## Link Types

| Type | `amount_minor` | Use Case |
|------|---------------|----------|
| **Fixed** | Set (e.g. `50_000`) | Specific invoice — customer cannot change amount |
| **Open** | `null` | Donations, tips, informal trade — customer enters amount |

---

## State Machine

```
                  ┌──────────────────────────────────┐
                  │              ACTIVE               │
                  │  Created, not yet paid, not expired│
                  └──────┬──────────┬────────────────┘
                         │          │
               cancel()  │          │ mark_used()
                         │          │
                    ┌────▼───┐   ┌──▼──────┐
                    │CANCELLED│   │  USED   │
                    └────────┘   └─────────┘
                         
                  ACTIVE → EXPIRED  (background expiry worker)
```

**Transitions:**

| From | Event | To | Guard |
|------|-------|----|-------|
| `ACTIVE` | `cancel()` | `CANCELLED` | — |
| `ACTIVE` | `mark_used()` | `USED` | — |
| `ACTIVE` | expiry worker tick | `EXPIRED` | `NOW() >= expires_at` |
| Any terminal | any | error | `NotActive` |

Terminal states (`USED`, `CANCELLED`, `EXPIRED`) are immutable.

---

## Core Invariants

1. **Positive amount** — if `amount_minor` is set, it must be `> 0`. Zero and negative amounts are rejected at creation.
2. **Future expiry** — if `expires_at` is set, it must be strictly in the future at the moment of creation.
3. **Unique slug** — the database enforces `UNIQUE` on `slug`. The engine retries slug generation on collision (extremely rare).
4. **Idempotent mark-used** — calling `mark_used` on an already-`USED` link returns `NotActive`; the transfer that already succeeded is unaffected.
5. **Double-entry correctness** — `mark_used` does not move money; money movement happens via the transfers domain. The link is a payment intent, not a ledger actor.

---

## Payment Flow (Consumer-Initiated)

```
Consumer opens pay.banzami.org/{slug}
  │
  ├─ GET /public/pay/{slug}          ← no auth, api-gateway
  │    Returns: link details
  │
  ├─ Consumer sees QR / amount / description
  │
  ├─ POST /v1/payment-links/{slug}/pay   ← JWT auth, public-api
  │    1. Fetch link by slug
  │    2. Verify status == ACTIVE
  │    3. Resolve consumer wallet (currency matches link)
  │    4. POST /internal/v1/transfers    ← sender=consumer wallet, recipient=merchant wallet
  │    5. POST /internal/v1/payment-links/{id}/mark-used
  │    6. Return updated link
  │
  └─ Consumer sees "Payment successful" screen
```

---

## Expiry Worker

The background expiry worker runs in the Rust core-api process on a configurable interval (default: 60 seconds).

```rust
// core/payment-links/src/expiry_worker.rs
tokio::time::interval(interval)
  → repo.expire_overdue()           // UPDATE payment_links SET status='EXPIRED'
                                    // WHERE status='ACTIVE' AND expires_at <= NOW()
```

Only `ACTIVE` links with a non-null `expires_at` in the past are affected. The operation is idempotent — running it multiple times produces no additional changes.

---

## Failure Scenarios

| Scenario | Behaviour |
|----------|-----------|
| Transfer succeeds but `mark_used` fails | Public-api returns 500. Link remains `ACTIVE`. The expiry worker will eventually expire it if `expires_at` is set. Merchants can also manually cancel via the dashboard. No double-charge is possible because the same `idempotency_key` (`pl-pay-{link.id}`) is used — a second payment attempt returns the original transfer. |
| Consumer pays an expired link | `GET /v1/payment-links/{slug}` returns status `EXPIRED`; the pay page shows an error before the consumer attempts payment. |
| Slug collision at creation | The engine catches the `UNIQUE` violation from the database and returns a creation error. The caller retries. In practice, 12 hex chars = 2^48 space; collision probability at 1M links is ~0.01%. |
| Link cancelled mid-payment | `mark_used` returns `NotActive`. The transfer was never initiated (status check is before the transfer). |

---

## Database Schema

```sql
CREATE TABLE payment_links (
    id          UUID PRIMARY KEY,
    slug        VARCHAR(24) NOT NULL UNIQUE,
    merchant_id UUID NOT NULL,
    wallet_id   UUID NOT NULL,
    amount_minor BIGINT,                        -- NULL for open links
    currency    VARCHAR(8) NOT NULL,
    description TEXT,
    status      VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    expires_at  TIMESTAMPTZ,
    paid_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Merchant dashboard listing (reverse-chronological)
CREATE INDEX idx_payment_links_merchant_id ON payment_links (merchant_id, created_at DESC);
-- Slug lookup (pay page)
CREATE INDEX idx_payment_links_slug        ON payment_links (slug);
-- Expiry worker scan (partial — only ACTIVE with expiry)
CREATE INDEX idx_payment_links_active_expiry
    ON payment_links (expires_at)
    WHERE status = 'ACTIVE' AND expires_at IS NOT NULL;
```

---

## Security Assumptions

- **Slugs are not secret.** A 12-character hex slug provides 2^48 ≈ 281 trillion values. Brute-forcing a valid active slug requires an impractical number of requests and is rate-limited at the API gateway.
- **Fixed-amount links cannot be overpaid.** The amount is locked at creation; the consumer cannot submit a different amount.
- **Open links require authentication.** The `POST /v1/payment-links/{slug}/pay` endpoint requires a valid consumer JWT. Anonymous payments are not supported.
- **Idempotency key format** `pl-pay-{link.id}` ensures that even if the pay endpoint is called twice (network retry), the transfer is processed only once.
