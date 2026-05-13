-- Settlement domain schema
--
-- A settlement batch groups captured transactions for a merchant over a time
-- window and tracks the lifecycle of the acquirer payout. When confirmed
-- (status = SETTLED), a ledger posting records the actual cash movement from
-- the acquiring bank into the platform's bank account.

CREATE TABLE settlements (
    id                  UUID        PRIMARY KEY,
    merchant_id         UUID        NOT NULL,
    wallet_id           UUID        NOT NULL REFERENCES wallets(id),
    currency            TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING', 'SUBMITTED', 'SETTLED', 'FAILED')),
    gross_amount_minor  BIGINT      NOT NULL CHECK (gross_amount_minor >= 0),
    fee_amount_minor    BIGINT      NOT NULL DEFAULT 0 CHECK (fee_amount_minor >= 0),
    net_amount_minor    BIGINT      NOT NULL CHECK (net_amount_minor >= 0),
    transaction_count   INTEGER     NOT NULL CHECK (transaction_count >= 0),
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    -- Set when status = SETTLED; references the ledger posting that records
    -- the actual cash movement from the acquiring bank.
    ledger_posting_id   UUID,
    failure_reason      TEXT,
    submitted_at        TIMESTAMPTZ,
    settled_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT settlements_period_valid CHECK (period_end > period_start)
);

CREATE INDEX settlements_merchant_id_idx ON settlements (merchant_id);
CREATE INDEX settlements_status_idx      ON settlements (status);
CREATE INDEX settlements_period_idx      ON settlements (period_start DESC, period_end DESC);
