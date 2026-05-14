-- Acquiring layer: external payment lifecycle management.
--
-- An acquiring_payment bridges a Banzami payment_link to an external provider
-- (EMIS Multicaixa Express, bank transfer, etc.). One payment_link can have at
-- most one active acquiring_payment at a time.
--
-- acquiring_callbacks is an append-only audit log of every inbound webhook from
-- external providers. Idempotency is enforced via the unique constraint on
-- idempotency_key — duplicate callbacks are recorded but not reprocessed.

CREATE TABLE IF NOT EXISTS acquiring_payments (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_link_id  UUID         NOT NULL REFERENCES payment_links(id),
    provider         TEXT         NOT NULL,                          -- 'EMIS_MULTICAIXA' | 'EMIS_MULTICAIXA_SIMULATED'
    external_ref     TEXT         NOT NULL UNIQUE,                   -- provider reference (9-digit Multicaixa ref)
    status           TEXT         NOT NULL DEFAULT 'PENDING'
                                  CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED')),
    amount_minor     BIGINT       NOT NULL CHECK (amount_minor > 0),
    currency         CHAR(3)      NOT NULL,
    -- JSON: { method, entity, reference } — instructions shown to the customer
    instructions     JSONB        NOT NULL,
    confirmed_at     TIMESTAMPTZ,
    failed_at        TIMESTAMPTZ,
    failure_reason   TEXT,
    expires_at       TIMESTAMPTZ  NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acquiring_payments_link
    ON acquiring_payments (payment_link_id);
CREATE INDEX IF NOT EXISTS idx_acquiring_payments_status
    ON acquiring_payments (status, created_at DESC)
    WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS acquiring_callbacks (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    provider         TEXT         NOT NULL,
    raw_payload      JSONB        NOT NULL,
    signature        TEXT         NOT NULL,
    external_ref     TEXT,                                           -- extracted from payload for indexing
    idempotency_key  TEXT         NOT NULL UNIQUE,                   -- replay protection
    processed        BOOLEAN      NOT NULL DEFAULT FALSE,
    processed_at     TIMESTAMPTZ,
    error            TEXT,                                           -- set if processing failed
    received_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acquiring_callbacks_ref
    ON acquiring_callbacks (external_ref)
    WHERE external_ref IS NOT NULL;
