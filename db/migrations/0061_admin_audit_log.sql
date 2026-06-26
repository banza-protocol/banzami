-- 0061_admin_audit_log.sql
-- Immutable audit trail for every operator mutation in the Banzami Admin portal.
--
-- One row per privileged action (login, operator lifecycle, merchant/KYB
-- decisions, financial confirmations, dispute/risk actions). Rows are
-- append-only: the application never updates or deletes them, and the table
-- is built so that an accidental DELETE/UPDATE is the exception, not the norm.
-- before_json / after_json carry a redacted snapshot where the handler can
-- supply one (never passwords, hashes or tokens).
--
-- Additive + idempotent. Not applied yet — apply only after go-ahead.

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id            UUID        PRIMARY KEY,
    admin_user_id UUID        REFERENCES admin_users(id),  -- null for failed logins / unknown email
    admin_email   TEXT,
    full_name     TEXT,
    role          TEXT,
    action        TEXT        NOT NULL,                    -- LOGIN_SUCCESS, APPROVE_APPLICATION, ...
    entity_type   TEXT,                                    -- operator | application | merchant | ...
    entity_id     TEXT,
    before_json   JSONB,
    after_json    JSONB,
    status_code   INTEGER,                                 -- HTTP result of the action
    ip_address    TEXT,
    user_agent    TEXT,
    request_id    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Common access paths: by operator, by action, and recent-first.
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_user ON admin_audit_log (admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action     ON admin_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity     ON admin_audit_log (entity_type, entity_id);
