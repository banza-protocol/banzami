-- 0088_account_identity.sql
-- Account Identity bounded context (ADR-033). A `User` is a human account used
-- for authentication (Email + OTP), sessions and SSO. It NEVER assumes Business
-- or Developer; those contexts reference a user by opaque id only (no
-- cross-context foreign keys). Distinct from the `@banza` payment handle.
--
-- Owns its own physical PostgreSQL schema `account_identity`. It never reads,
-- writes or depends on Business or Core tables. Audit is context-owned and
-- append-only (DB-enforced), never a Business/Admin/Core audit table.
--
-- Security posture:
--   - Email uniqueness is case-insensitive at the DB level (User@x == user@x).
--   - OTP codes are stored as HMAC-SHA-256(code, OTP_PEPPER) with a hash_version;
--     the pepper is environment-specific and NEVER stored in PostgreSQL.
--   - Only one active (unconsumed) OTP may exist per canonical email + purpose;
--     a successful verification consumes it atomically.
--   - Session tokens are stored as a HASH only; the raw token lives solely in a
--     host-only cookie on developer-api.banzami.com.
-- Additive + idempotent. Not applied yet — apply only after go-ahead.

CREATE SCHEMA IF NOT EXISTS account_identity;

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS account_identity.identity_users (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email      TEXT        NOT NULL,                 -- stored canonical (lower) on write
    name       TEXT,
    avatar_url TEXT,
    locale     TEXT,
    timezone   TEXT,
    verified   BOOLEAN     NOT NULL DEFAULT false,
    status     TEXT        NOT NULL DEFAULT 'ACTIVE'
               CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness — the sole email uniqueness constraint.
CREATE UNIQUE INDEX IF NOT EXISTS identity_users_email_lower_unique
    ON account_identity.identity_users (lower(email));

-- ── OTP codes ────────────────────────────────────────────────────────────────
-- `code_hash` = HMAC-SHA-256(code, OTP_PEPPER); never plaintext, never reversible.
-- One-time use via `consumed_at`; bounded by `max_attempts` and `expires_at`
-- (10 minutes). Resend cooldown + rate limiting are enforced at the API layer
-- (Redis). The request endpoint returns uniform response + timing whether or not
-- an Account Identity exists (anti-enumeration).
CREATE TABLE IF NOT EXISTS account_identity.identity_otp_codes (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT        NOT NULL,               -- canonical (lower) email
    purpose      TEXT        NOT NULL DEFAULT 'login'
                 CHECK (purpose IN ('login')),
    code_hash    TEXT        NOT NULL,               -- HMAC-SHA-256(code, OTP_PEPPER)
    hash_version INT         NOT NULL DEFAULT 1,
    attempts     INT         NOT NULL DEFAULT 0,
    max_attempts INT         NOT NULL DEFAULT 5,
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ,
    request_ip   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one active (unconsumed) OTP per canonical email + purpose. A new issue
-- must consume/invalidate any prior active code in the same transaction.
CREATE UNIQUE INDEX IF NOT EXISTS identity_otp_active_unique
    ON account_identity.identity_otp_codes (lower(email), purpose)
    WHERE consumed_at IS NULL;
-- Latest-code lookup + resend cooldown checks.
CREATE INDEX IF NOT EXISTS idx_identity_otp_email_created
    ON account_identity.identity_otp_codes (lower(email), created_at DESC);

-- ── Sessions ─────────────────────────────────────────────────────────────────
-- Server-side session records. The cookie carries an opaque token; only its
-- hash is stored here, so a DB leak cannot reconstruct a live session.
CREATE TABLE IF NOT EXISTS account_identity.identity_sessions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES account_identity.identity_users (id) ON DELETE CASCADE,
    token_hash   TEXT        NOT NULL UNIQUE,        -- hash of the opaque cookie token
    user_agent   TEXT,
    ip           TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_identity_sessions_user
    ON account_identity.identity_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_identity_sessions_live
    ON account_identity.identity_sessions (expires_at)
    WHERE revoked_at IS NULL;

-- ── Context-owned, append-only audit ─────────────────────────────────────────
-- Login, logout, failed login, OTP issue/verify, session revoke. `actor_user_id`
-- is NULL for pre-auth events (e.g. failed login on an unknown email). Never
-- stores OTP codes, tokens or secrets.
CREATE TABLE IF NOT EXISTS account_identity.audit_events (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID,                              -- opaque; NULL when pre-auth
    action        TEXT        NOT NULL,
    subject       TEXT,
    metadata      JSONB       NOT NULL DEFAULT '{}',
    request_ip    TEXT,
    request_id    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_actor
    ON account_identity.audit_events (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_action
    ON account_identity.audit_events (action, created_at DESC);

-- DB-enforced append-only: block UPDATE and DELETE.
CREATE OR REPLACE FUNCTION account_identity.audit_events_append_only()
    RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'account_identity.audit_events is append-only';
END;
$$;
DROP TRIGGER IF EXISTS audit_events_append_only ON account_identity.audit_events;
CREATE TRIGGER audit_events_append_only
    BEFORE UPDATE OR DELETE ON account_identity.audit_events
    FOR EACH ROW EXECUTE FUNCTION account_identity.audit_events_append_only();
