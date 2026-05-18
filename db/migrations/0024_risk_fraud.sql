-- Migration 0024: Risk & fraud infrastructure
--
-- risk_flags         — persistent risk signals on any entity (merchant/consumer)
-- account_freezes    — immutable freeze record; unfreeze is a separate row with lifted_at
-- suspicious_activity_events — audit trail of detected anomalies
-- velocity_counters  — rolling window counts/amounts used by the risk engine

-- ---------------------------------------------------------------------------
-- ENUM-style domains (TEXT CHECK is sufficient for append-only audit data)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- risk_flags: a persistent flag per entity, set by the risk engine or admin
-- ---------------------------------------------------------------------------
CREATE TABLE risk_flags (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type   TEXT        NOT NULL CHECK (entity_type IN ('MERCHANT', 'CONSUMER')),
    entity_id     UUID        NOT NULL,
    flag_type     TEXT        NOT NULL CHECK (flag_type IN (
                      'VELOCITY_BREACH',
                      'LARGE_AMOUNT',
                      'RAPID_FIRE_QR',
                      'DUPLICATE_CALLBACK',
                      'SUSPICIOUS_FUNDING',
                      'MANUAL'
                  )),
    severity      TEXT        NOT NULL DEFAULT 'LOW' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    description   TEXT        NOT NULL,
    resolved      BOOLEAN     NOT NULL DEFAULT FALSE,
    resolved_at   TIMESTAMPTZ,
    resolved_by   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX risk_flags_entity_idx      ON risk_flags (entity_type, entity_id) WHERE resolved = FALSE;
CREATE INDEX risk_flags_flag_type_idx   ON risk_flags (flag_type, created_at DESC);
CREATE INDEX risk_flags_unresolved_idx  ON risk_flags (created_at DESC) WHERE resolved = FALSE;

-- ---------------------------------------------------------------------------
-- account_freezes: one row per freeze event; lifting is a separate update
-- ---------------------------------------------------------------------------
CREATE TABLE account_freezes (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type   TEXT        NOT NULL CHECK (entity_type IN ('MERCHANT', 'CONSUMER')),
    entity_id     UUID        NOT NULL,
    reason        TEXT        NOT NULL,
    frozen_by     TEXT        NOT NULL DEFAULT 'SYSTEM',
    lifted_at     TIMESTAMPTZ,
    lifted_by     TEXT,
    lift_reason   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX account_freezes_entity_idx  ON account_freezes (entity_type, entity_id);
CREATE INDEX account_freezes_active_idx  ON account_freezes (entity_type, entity_id) WHERE lifted_at IS NULL;

-- ---------------------------------------------------------------------------
-- suspicious_activity_events: immutable audit trail of anomalies
-- ---------------------------------------------------------------------------
CREATE TABLE suspicious_activity_events (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type   TEXT        NOT NULL CHECK (entity_type IN ('MERCHANT', 'CONSUMER')),
    entity_id     UUID        NOT NULL,
    event_type    TEXT        NOT NULL CHECK (event_type IN (
                      'VELOCITY_BREACH',
                      'LARGE_DEPOSIT',
                      'RAPID_QR_PAYMENTS',
                      'DUPLICATE_CALLBACK',
                      'FROZEN_ACCOUNT_ATTEMPT',
                      'KYC_LIMIT_EXCEEDED',
                      'MANUAL_FLAG'
                  )),
    description   TEXT        NOT NULL,
    metadata      JSONB       NOT NULL DEFAULT '{}',
    related_tx_id UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sae_entity_idx     ON suspicious_activity_events (entity_type, entity_id, created_at DESC);
CREATE INDEX sae_event_type_idx ON suspicious_activity_events (event_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- velocity_counters: rolling window state per entity for risk checks
-- Counters are upserted (ON CONFLICT) by the risk engine on each transaction.
-- ---------------------------------------------------------------------------
CREATE TABLE velocity_counters (
    entity_type        TEXT        NOT NULL CHECK (entity_type IN ('MERCHANT', 'CONSUMER')),
    entity_id          UUID        NOT NULL,
    time_window        TEXT        NOT NULL CHECK (time_window IN ('HOURLY', 'DAILY', 'MONTHLY')),
    window_start       TIMESTAMPTZ NOT NULL,
    tx_count           BIGINT      NOT NULL DEFAULT 0,
    amount_minor_total BIGINT      NOT NULL DEFAULT 0,
    currency           CHAR(3)     NOT NULL DEFAULT 'AOA',
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entity_type, entity_id, time_window, window_start)
);

CREATE INDEX velocity_counters_entity_idx ON velocity_counters (entity_type, entity_id, time_window, window_start DESC);
