-- Migration 0009: Webhook delivery schema
--
-- Webhook delivery is owned entirely by the Go api-gateway. The Rust core never
-- touches these tables. Three tables form the delivery pipeline:
--
--   webhook_endpoints  — merchant-registered delivery targets
--   webhook_events     — immutable record of domain events to be delivered
--   webhook_deliveries — one row per (event × endpoint); tracks delivery attempts
--
-- Idempotency: each (event_id, endpoint_id) pair has exactly one delivery row.
-- Retries are tracked via attempt_count and scheduled_at (exponential backoff).
-- A delivery is terminal when status = 'SUCCESS' or attempt_count >= max_attempts.

-- ---------------------------------------------------------------------------
-- Endpoints
-- ---------------------------------------------------------------------------

CREATE TABLE webhook_endpoints (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID        NOT NULL,
    url         TEXT        NOT NULL,
    -- Subscribes to all events when '*' is present.
    events      TEXT[]      NOT NULL DEFAULT '{}',
    active      BOOLEAN     NOT NULL DEFAULT true,
    -- Raw HMAC secret returned only at creation; stored in plaintext because
    -- it is needed to sign every outgoing delivery (not used for authentication).
    secret      TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX webhook_endpoints_merchant_id_idx ON webhook_endpoints (merchant_id);
CREATE INDEX webhook_endpoints_active_idx      ON webhook_endpoints (merchant_id, active)
    WHERE active = true;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

CREATE TABLE webhook_events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID        NOT NULL,
    event_type  TEXT        NOT NULL,
    -- Full event envelope: {"id":…,"type":…,"created_at":…,"data":{…}}
    payload     JSONB       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX webhook_events_merchant_id_idx ON webhook_events (merchant_id);
CREATE INDEX webhook_events_created_at_idx  ON webhook_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- Deliveries
-- ---------------------------------------------------------------------------

CREATE TABLE webhook_deliveries (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id      UUID        NOT NULL REFERENCES webhook_events(id),
    endpoint_id   UUID        NOT NULL REFERENCES webhook_endpoints(id),
    -- Incremented on each attempt. The first delivery sets this to 1.
    attempt_count INTEGER     NOT NULL DEFAULT 0,
    max_attempts  INTEGER     NOT NULL DEFAULT 5,
    -- PENDING → SUCCESS (terminal) or PENDING → FAILED (terminal after max attempts)
    status        TEXT        NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    status_code   INTEGER,
    response_body TEXT,
    last_error    TEXT,
    -- Worker picks up rows where status='PENDING' AND scheduled_at <= NOW().
    scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One delivery row per event+endpoint pair.
    UNIQUE (event_id, endpoint_id)
);

-- Hot path: worker polls this index every tick.
CREATE INDEX webhook_deliveries_pending_idx ON webhook_deliveries (scheduled_at)
    WHERE status = 'PENDING';

CREATE INDEX webhook_deliveries_event_id_idx ON webhook_deliveries (event_id);
