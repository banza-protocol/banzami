-- Transaction lifecycle schema
--
-- Transactions are append-oriented: the `status` field is the only column that
-- changes after creation. All monetary movements are recorded in the ledger via
-- the wallet engine; this table is the authoritative source for transaction state.

CREATE TABLE transactions (
    id               UUID        PRIMARY KEY,
    idempotency_key  TEXT        NOT NULL UNIQUE,
    transaction_type TEXT        NOT NULL
                         CHECK (transaction_type IN ('PAYMENT', 'REFUND', 'REVERSAL', 'PAYOUT')),
    status           TEXT        NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING', 'AUTHORIZED', 'CAPTURED',
                                           'FAILED', 'REVERSED', 'REFUNDED')),
    -- Gross amount before fees; always positive minor units.
    amount_minor     BIGINT      NOT NULL CHECK (amount_minor > 0),
    -- Platform fee retained; zero until the fee engine is wired.
    fee_minor        BIGINT      NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
    currency         TEXT        NOT NULL,
    merchant_id      UUID        NOT NULL,
    -- Wallet that receives or releases funds for this transaction.
    wallet_id        UUID        NOT NULL REFERENCES wallets(id),
    description      TEXT,
    failure_reason   TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Common query patterns: merchant dashboard, status filtering, time-range reports.
CREATE INDEX transactions_merchant_id_idx  ON transactions (merchant_id);
CREATE INDEX transactions_status_idx       ON transactions (status);
CREATE INDEX transactions_created_at_idx   ON transactions (created_at DESC);
