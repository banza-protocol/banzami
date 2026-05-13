-- Migration 0006: Payouts schema
-- Tracks outbound disbursements from merchant wallets to external bank accounts.
-- Idempotency enforced via UNIQUE(idempotency_key).

CREATE TABLE payouts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID        NOT NULL,
    wallet_id           UUID        NOT NULL,
    idempotency_key     TEXT        NOT NULL,
    status              TEXT        NOT NULL CHECK (status IN (
                            'PENDING', 'PROCESSING', 'SENT',
                            'CONFIRMED', 'FAILED', 'RETURNED'
                        )),
    amount_minor        BIGINT      NOT NULL CHECK (amount_minor > 0),
    currency            CHAR(3)     NOT NULL,

    -- Destination bank account (denormalised — external to Banzami)
    bank_account_number TEXT        NOT NULL,
    bank_code           TEXT        NOT NULL,
    account_holder_name TEXT        NOT NULL,

    -- Set when the accounting entry is posted at process() time
    ledger_posting_id   UUID,

    failure_reason      TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at             TIMESTAMPTZ,
    confirmed_at        TIMESTAMPTZ,
    returned_at         TIMESTAMPTZ,
    failed_at           TIMESTAMPTZ,

    UNIQUE (idempotency_key)
);

CREATE INDEX payouts_merchant_id_idx ON payouts (merchant_id);
CREATE INDEX payouts_wallet_id_idx   ON payouts (wallet_id);
-- Partial index only covers non-terminal states — used by the processing job.
CREATE INDEX payouts_active_status_idx ON payouts (status, created_at)
    WHERE status NOT IN ('CONFIRMED', 'FAILED', 'RETURNED');
