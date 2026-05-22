-- consumer_pay_links: consumer-generated shareable payment request links.
-- Any authenticated consumer can pay via link_code (payer is unknown at creation time).
-- Unlike payment_requests (directed P2P), these are open links for any payer.
-- Used by the Receive screen to generate fixed-amount QR codes and share URLs.

CREATE TABLE IF NOT EXISTS consumer_pay_links (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    link_code            VARCHAR(20) NOT NULL UNIQUE,
    receiver_consumer_id UUID        NOT NULL REFERENCES consumers(id),
    amount_minor         BIGINT      CHECK (amount_minor IS NULL OR amount_minor > 0),
    note                 TEXT,
    currency             VARCHAR(10) NOT NULL DEFAULT 'AOA',
    locked               BOOLEAN     NOT NULL DEFAULT true,
    -- locked=true: payer cannot change the amount; locked=false: open amount
    status               VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    -- ACTIVE | PAID | EXPIRED | CANCELLED
    payer_consumer_id    UUID        REFERENCES consumers(id),
    transfer_id          UUID,
    expires_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_consumer_pay_links_code     ON consumer_pay_links (link_code);
CREATE INDEX IF NOT EXISTS idx_consumer_pay_links_receiver ON consumer_pay_links (receiver_consumer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consumer_pay_links_status   ON consumer_pay_links (status) WHERE status = 'ACTIVE';
