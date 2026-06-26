-- 0056_admin_login_lockout.sql
-- Brute-force protection for BANZADMIN operator login: lock an account for 15
-- minutes after 5 consecutive failed attempts, and keep an auditable trail of
-- login attempts. No password or token is ever stored.
--
-- Additive + idempotent. Not applied yet.

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS admin_login_attempts (
    id               UUID        PRIMARY KEY,
    email_normalized TEXT        NOT NULL,
    admin_user_id    UUID,                       -- NULL for unknown emails
    ip               TEXT,
    user_agent       TEXT,
    success          BOOLEAN     NOT NULL,
    failure_reason   TEXT,                       -- e.g. BAD_PASSWORD, LOCKED, SUSPENDED, UNKNOWN_EMAIL
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_email ON admin_login_attempts (email_normalized, created_at);
