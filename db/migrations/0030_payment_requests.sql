-- Payment requests: receiver-initiated money requests (pull payments).
-- Consumer A requests money from Consumer B. B receives a notification,
-- can approve (triggers immediate P2P transfer) or decline.
-- This is the "request money" pattern essential for network effects.

CREATE TABLE IF NOT EXISTS payment_requests (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id  UUID        NOT NULL REFERENCES consumers(id),
    -- the consumer who wants to receive money
    payer_id      UUID        NOT NULL REFERENCES consumers(id),
    -- the consumer who will send money
    amount_minor  BIGINT      NOT NULL CHECK (amount_minor > 0),
    currency      VARCHAR(10) NOT NULL DEFAULT 'AOA',
    message       TEXT,
    status        VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    -- PENDING | PAID | DECLINED | EXPIRED | CANCELLED
    idempotency_key VARCHAR(255) UNIQUE,
    transfer_id   UUID,
    -- populated when status = PAID; links to transfers.id
    expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at       TIMESTAMPTZ,
    declined_at   TIMESTAMPTZ,
    CONSTRAINT chk_no_self_request CHECK (requester_id <> payer_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_requester ON payment_requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_payer     ON payment_requests (payer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status    ON payment_requests (status)
    WHERE status IN ('PENDING');
CREATE INDEX IF NOT EXISTS idx_payment_requests_expires   ON payment_requests (expires_at)
    WHERE status = 'PENDING';
