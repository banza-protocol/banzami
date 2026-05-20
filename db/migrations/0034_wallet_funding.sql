-- Migration 0034: Wallet funding — full state machine, provider callbacks, reconciliation log
--
-- Extends consumer_deposits with:
--   - Full state machine status values (beyond PENDING/COMPLETED)
--   - ledger_posting_id: link to the ledger posting created at settlement
--   - reversal_posting_id: link to the reversal posting if reversed
--   - reversed_at: timestamp of reversal
--   - reconciliation_attempts: count of reconciliation runs
--
-- Adds:
--   - provider_callbacks: raw callback dedup table
--     UNIQUE(provider, provider_event_id) is the idempotency boundary at the data layer.
--     One row per unique provider event — duplicate callbacks from the same provider
--     are rejected at INSERT and never reach the reconciliation engine.
--
--   - reconciliation_attempts: immutable append-only log of reconciliation job runs.
--     Outcome per attempt: SUCCESS | FAILURE | RETRY.

-- ---------------------------------------------------------------------------
-- 1. Extend consumer_deposits
-- ---------------------------------------------------------------------------

ALTER TABLE consumer_deposits
    ADD COLUMN IF NOT EXISTS ledger_posting_id       UUID        REFERENCES ledger_postings(id),
    ADD COLUMN IF NOT EXISTS reversal_posting_id     UUID        REFERENCES ledger_postings(id),
    ADD COLUMN IF NOT EXISTS reversed_at             TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reconciliation_attempts INT         NOT NULL DEFAULT 0;

-- Widen the status constraint to include the full state machine.
-- Legacy values 'PENDING' and 'COMPLETED' are kept for backward compatibility.
ALTER TABLE consumer_deposits DROP CONSTRAINT IF EXISTS consumer_deposits_status_check;
ALTER TABLE consumer_deposits ADD CONSTRAINT consumer_deposits_status_check
    CHECK (status IN (
        'PENDING',                        -- legacy: initial state (maps to PendingPayment)
        'COMPLETED',                      -- legacy: settled (maps to Settled)
        'PENDING_PAYMENT',                -- reference issued, awaiting consumer payment
        'PENDING_PROVIDER_CONFIRMATION',  -- payment action seen, awaiting provider confirmation
        'RECONCILING',                    -- callback received, validation in progress
        'SETTLED',                        -- ledger posting created, wallet credited
        'FAILED',                         -- permanent failure (unrecoverable)
        'EXPIRED',                        -- TTL exceeded without payment confirmation
        'REVERSED'                        -- settled then reversed by provider or bank
    ));

-- ---------------------------------------------------------------------------
-- 2. provider_callbacks — raw callback dedup table
-- ---------------------------------------------------------------------------
-- One row per unique (provider, provider_event_id) pair.
-- The UNIQUE constraint is the idempotency boundary: a duplicate INSERT
-- raises a unique-violation which the FundingEngine maps to DuplicateCallback.
-- Callbacks are never deleted — this is an immutable audit log.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS provider_callbacks (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    funding_session_id  UUID         REFERENCES consumer_deposits(id),
    provider            VARCHAR(50)  NOT NULL,
    provider_event_id   VARCHAR(255) NOT NULL,
    payload             JSONB        NOT NULL DEFAULT '{}',
    hmac_valid          BOOLEAN      NOT NULL DEFAULT FALSE,
    status              VARCHAR(50)  NOT NULL DEFAULT 'RECEIVED',
    failure_reason      TEXT,
    processed_at        TIMESTAMPTZ,
    received_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT provider_callbacks_status_check
        CHECK (status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'REJECTED')),
    CONSTRAINT provider_callbacks_event_unique
        UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_callbacks_session
    ON provider_callbacks (funding_session_id);

-- Efficient query for the reconciliation worker: pending unprocessed callbacks.
CREATE INDEX IF NOT EXISTS idx_provider_callbacks_unprocessed
    ON provider_callbacks (received_at DESC)
    WHERE status = 'RECEIVED';

-- ---------------------------------------------------------------------------
-- 3. reconciliation_attempts — immutable reconciliation audit log
-- ---------------------------------------------------------------------------
-- Append-only. One row per reconciliation attempt per session.
-- Records outcome (SUCCESS | FAILURE | RETRY) and the resulting ledger posting
-- if the attempt succeeded.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reconciliation_attempts (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    funding_session_id  UUID         NOT NULL REFERENCES consumer_deposits(id),
    attempt_number      INT          NOT NULL,
    outcome             VARCHAR(50)  NOT NULL,
    detail              TEXT,
    ledger_posting_id   UUID         REFERENCES ledger_postings(id),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT reconciliation_attempts_outcome_check
        CHECK (outcome IN ('SUCCESS', 'FAILURE', 'RETRY'))
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_attempts_session
    ON reconciliation_attempts (funding_session_id, attempt_number);
