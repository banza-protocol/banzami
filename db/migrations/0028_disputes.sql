-- Disputes: consumer-initiated chargebacks and merchant counter-evidence.
-- Required for EMIS production certification and payment network trust.
-- Admin resolves disputes; winning consumer triggers a refund posting.

CREATE TABLE IF NOT EXISTS disputes (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id    UUID         NOT NULL,
    merchant_id       UUID         NOT NULL,
    consumer_id       UUID         NOT NULL,
    amount_minor      BIGINT       NOT NULL CHECK (amount_minor > 0),
    currency          VARCHAR(10)  NOT NULL DEFAULT 'AOA',
    reason            TEXT         NOT NULL,
    status            VARCHAR(50)  NOT NULL DEFAULT 'OPEN',
    -- OPEN | UNDER_REVIEW | EVIDENCE_REQUIRED | WON_BY_CONSUMER | WON_BY_MERCHANT | CLOSED
    evidence_deadline TIMESTAMPTZ,
    resolution_notes  TEXT,
    resolved_by       UUID,                           -- admin user id
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dispute_evidence (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id   UUID        NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    submitted_by UUID        NOT NULL,               -- consumer or merchant id
    party        VARCHAR(20) NOT NULL,               -- 'CONSUMER' | 'MERCHANT'
    description  TEXT        NOT NULL,
    file_url     TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_transaction_id ON disputes (transaction_id);
CREATE INDEX IF NOT EXISTS idx_disputes_merchant_id    ON disputes (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_consumer_id    ON disputes (consumer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_status         ON disputes (status) WHERE status IN ('OPEN','UNDER_REVIEW','EVIDENCE_REQUIRED');
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON dispute_evidence (dispute_id, created_at DESC);
