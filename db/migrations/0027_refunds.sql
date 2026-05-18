-- Refunds: full and partial refunds against captured/settled transactions.
-- A refund reverses merchant-wallet funds back to the originating consumer wallet
-- through the double-entry ledger. Multiple partial refunds are permitted up to
-- the total captured amount.

CREATE TABLE IF NOT EXISTS refunds (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id   UUID         NOT NULL,           -- originating captured transaction
    merchant_id      UUID         NOT NULL,           -- merchant being debited
    consumer_id      UUID,                            -- consumer receiving credit (null = card txn)
    wallet_id        UUID         NOT NULL,           -- merchant wallet being debited
    amount_minor     BIGINT       NOT NULL CHECK (amount_minor > 0),
    currency         VARCHAR(10)  NOT NULL DEFAULT 'AOA',
    reason           TEXT,                            -- admin/merchant reason
    status           VARCHAR(50)  NOT NULL DEFAULT 'PENDING',
    -- PENDING | PROCESSING | SUCCEEDED | FAILED
    idempotency_key  VARCHAR(255) NOT NULL UNIQUE,
    failure_reason   TEXT,
    processed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refund_events (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id    UUID        NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
    event_type   VARCHAR(50) NOT NULL,
    -- refund.created | refund.processing | refund.succeeded | refund.failed
    payload      JSONB       NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_transaction_id ON refunds (transaction_id);
CREATE INDEX IF NOT EXISTS idx_refunds_merchant_id    ON refunds (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_consumer_id    ON refunds (consumer_id)  WHERE consumer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_status         ON refunds (status)       WHERE status IN ('PENDING','PROCESSING');
CREATE INDEX IF NOT EXISTS idx_refund_events_refund   ON refund_events (refund_id, created_at DESC);
