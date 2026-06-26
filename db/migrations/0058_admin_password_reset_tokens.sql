-- 0058_admin_password_reset_tokens.sql
-- Single-use password set/reset tokens for BANZADMIN operators. The raw token
-- is emailed (or returned to a SUPER_ADMIN in dry-run); only its sha256 hash is
-- stored. Tokens expire in 24h and can be used once.
--
-- Additive + idempotent. Not applied yet.

CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
    id            UUID        PRIMARY KEY,
    admin_user_id UUID        NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash    TEXT        NOT NULL UNIQUE,   -- sha256(raw token); raw is never stored
    purpose       TEXT        NOT NULL DEFAULT 'PASSWORD_RESET',
    expires_at    TIMESTAMPTZ NOT NULL,
    used_at       TIMESTAMPTZ,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_reset_tokens_user ON admin_password_reset_tokens (admin_user_id, created_at);
