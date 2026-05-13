-- Payment links: shareable URLs for WhatsApp/Instagram commerce and informal merchants.
-- A payment link is a public, optionally fixed-amount URL that any Banzami consumer
-- can pay without being embedded in a full checkout SDK integration.

CREATE TABLE IF NOT EXISTS payment_links (
    id           UUID        PRIMARY KEY,
    slug         VARCHAR(24) NOT NULL UNIQUE,           -- short URL-safe identifier
    merchant_id  UUID        NOT NULL,
    wallet_id    UUID        NOT NULL,
    amount_minor BIGINT,                                -- NULL = payer sets amount
    currency     VARCHAR(8)  NOT NULL,
    description  TEXT,
    status       VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | USED | EXPIRED | CANCELLED
    expires_at   TIMESTAMPTZ,
    paid_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_merchant_id   ON payment_links (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_links_slug          ON payment_links (slug);
CREATE INDEX IF NOT EXISTS idx_payment_links_active_expiry ON payment_links (expires_at)
    WHERE status = 'ACTIVE' AND expires_at IS NOT NULL;
