-- 0055_admin_users.sql
-- Operator accounts for the Banzami Admin portal (Painel de Operações).
-- Replaces the shared ADMIN_API_KEY login with per-operator email + password
-- (bcrypt) + admin JWT. Every sensitive admin action is attributed to the
-- authenticated operator (reviewed_by = operator email/full name).
--
-- Additive + idempotent. Not applied yet — apply only after go-ahead, then
-- bootstrap the first SUPER_ADMIN before redeploying.

CREATE TABLE IF NOT EXISTS admin_users (
    id            UUID        PRIMARY KEY,
    email         TEXT        NOT NULL UNIQUE,
    full_name     TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,           -- bcrypt; never returned/logged
    role          TEXT        NOT NULL
                  CHECK (role IN ('SUPER_ADMIN', 'OPERATIONS', 'COMPLIANCE', 'SUPPORT', 'READ_ONLY')),
    status        TEXT        NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive email lookup (login).
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_email_lower ON admin_users (lower(email));
