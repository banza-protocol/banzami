-- Consumer deposits: track Multicaixa Express / acquiring top-ups for consumer wallets.
-- A deposit is initiated by the consumer, processed via the acquiring provider,
-- and results in a credit to the consumer's available wallet balance on confirmation.
--
-- Separate from acquiring_payments (which are merchant payment-link oriented).
-- Consumer deposits route callbacks to consumer wallets; merchant payments to merchant wallets.

CREATE TABLE IF NOT EXISTS consumer_deposits (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id      UUID         NOT NULL REFERENCES consumers(id),
    wallet_id        UUID         NOT NULL,           -- consumer wallet receiving funds
    provider         VARCHAR(50)  NOT NULL,           -- 'SIMULATED' | 'EMIS'
    external_ref     VARCHAR(255) NOT NULL,           -- provider's reference number
    idempotency_key  VARCHAR(255) NOT NULL UNIQUE,   -- callback dedup key
    status           VARCHAR(50)  NOT NULL DEFAULT 'PENDING',  -- PENDING | COMPLETED | FAILED | EXPIRED
    amount_minor     BIGINT       NOT NULL CHECK (amount_minor > 0),
    currency         VARCHAR(10)  NOT NULL DEFAULT 'AOA',
    instructions     JSONB        NOT NULL DEFAULT '{}',
    confirmed_at     TIMESTAMPTZ,
    failed_at        TIMESTAMPTZ,
    failure_reason   TEXT,
    expires_at       TIMESTAMPTZ  NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumer_deposits_consumer_id  ON consumer_deposits (consumer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consumer_deposits_external_ref ON consumer_deposits (external_ref);
CREATE INDEX IF NOT EXISTS idx_consumer_deposits_status       ON consumer_deposits (status) WHERE status = 'PENDING';
