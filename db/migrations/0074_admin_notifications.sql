-- Operator Notification Center (Banzami ADR-022, slice 3).
--
-- A persistent, per-environment notification layer for BANZADMIN: the operator
-- sees new KYB/KYC documents, business applications, failed settlements, open
-- disputes and pricing changes without opening each page. Rows are GENERATED
-- (idempotently) from existing source events — never invented: each row carries a
-- unique `source_key` derived from the originating event/row, so re-running
-- generation is a no-op (ON CONFLICT DO NOTHING).
--
-- This is operator UX state only. It holds NO financial truth, NO PII beyond a
-- display name already shown elsewhere, NO storage keys and NO signed URLs.

CREATE TABLE IF NOT EXISTS admin_notifications (
    id            UUID         PRIMARY KEY,
    environment   TEXT         NOT NULL,                     -- LIVE | SANDBOX
    type          TEXT         NOT NULL,                     -- KYB_DOC_SUBMITTED, KYC_APPROVED, ...
    severity      TEXT         NOT NULL DEFAULT 'info',      -- info | success | warning | error
    entity_type   TEXT,                                      -- merchant | kyc_case | merchant_application | ...
    entity_id     TEXT,
    title         TEXT         NOT NULL,
    message       TEXT,
    href          TEXT,                                      -- BANZADMIN route the notification links to
    status        TEXT         NOT NULL DEFAULT 'UNREAD',    -- UNREAD | READ | DISMISSED
    source_key    TEXT         NOT NULL,                     -- idempotent generation key (unique)
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    read_at       TIMESTAMPTZ,
    dismissed_at  TIMESTAMPTZ,
    metadata_json JSONB        NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT admin_notifications_severity_check CHECK (severity IN ('info','success','warning','error')),
    CONSTRAINT admin_notifications_status_check   CHECK (status   IN ('UNREAD','READ','DISMISSED'))
);

-- Idempotent generation: one notification per source event.
CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_source_key_idx
    ON admin_notifications (source_key);

-- The feed/bell read path: newest-first, filtered by environment + status.
CREATE INDEX IF NOT EXISTS admin_notifications_feed_idx
    ON admin_notifications (environment, status, created_at DESC);

COMMENT ON TABLE admin_notifications IS
    'Operator notification center (ADR-022 s3). Generated idempotently from source events via source_key; UX state only, no financial truth.';
