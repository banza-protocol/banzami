-- 0119_webhook_delivery_attempts.sql
-- Every webhook delivery attempt, as it happened.
--
-- webhook_deliveries is one row per event per endpoint (UNIQUE (event_id,
-- endpoint_id)) and that is the design: an event can never be delivered as two
-- separate deliveries. But each retry OVERWROTE the row's status_code and
-- last_error, so a delivery that the receiver refused twice and accepted on the
-- third attempt read, afterwards, as "SUCCESS 200, 3 attempts" — the two
-- refusals, their HTTP results and when they happened were gone. A developer
-- debugging their endpoint, and the Console page that shows them their
-- deliveries, could see that it retried but not what their server answered.
--
-- This table is that history: one row per attempt, written by the dispatcher
-- in the same transaction that updates the delivery, never updated afterwards.
--
-- WHAT IS DELIBERATELY NOT HERE
--   No payload, no signature, no signing secret, no request headers, no
--   response body and no raw error text (which can quote resolved addresses).
--   error_class is a closed vocabulary; the receiver's HTTP status is the
--   diagnostic a developer needs.
--
-- Additive. No existing table is altered.

CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id     UUID        NOT NULL REFERENCES webhook_deliveries (id) ON DELETE CASCADE,
    attempt_number  INTEGER     NOT NULL CHECK (attempt_number >= 1),
    outcome         TEXT        NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILED')),
    -- The receiver's HTTP status; NULL when no response arrived at all.
    status_code     INTEGER,
    -- Why a FAILED attempt failed, when it was not an HTTP status.
    error_class     TEXT
        CHECK (error_class IS NULL OR error_class IN ('http_status', 'timeout', 'connection', 'tls', 'dns', 'other')),
    duration_ms     INTEGER     CHECK (duration_ms IS NULL OR duration_ms >= 0),
    attempted_at    TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- An attempt number happens once per delivery.
    UNIQUE (delivery_id, attempt_number),
    -- A successful attempt is an HTTP answer below 400; a failed one names why.
    CONSTRAINT webhook_delivery_attempts_outcome_coherent CHECK (
        (outcome = 'SUCCESS' AND status_code IS NOT NULL AND status_code < 400 AND error_class IS NULL)
     OR (outcome = 'FAILED'  AND error_class IS NOT NULL)
    )
);

-- The deliveries view reads one delivery's attempts in order.
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_attempts_delivery
    ON webhook_delivery_attempts (delivery_id, attempt_number);

-- Append-only: an attempt that happened does not change.
CREATE OR REPLACE FUNCTION webhook_delivery_attempts_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'webhook_delivery_attempts is append-only';
END;
$$;

DROP TRIGGER IF EXISTS webhook_delivery_attempts_no_update ON webhook_delivery_attempts;
CREATE TRIGGER webhook_delivery_attempts_no_update
    BEFORE UPDATE ON webhook_delivery_attempts
    FOR EACH ROW EXECUTE FUNCTION webhook_delivery_attempts_immutable();

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bl_app_runtime') THEN
        -- DELETE only through the delivery's cascade (fixture retirement).
        GRANT SELECT, INSERT ON TABLE webhook_delivery_attempts TO bl_app_runtime;
    END IF;
END
$$;
