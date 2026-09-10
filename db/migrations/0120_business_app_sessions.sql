-- 0120_business_app_sessions.sql
-- Business App sessions: a short access token, renewed by a rotating refresh
-- token the server can revoke.
--
-- A Business App sign-in (@handle + PIN) used to issue one 24-hour bearer
-- token and nothing else. When it expired the app had no way to renew it
-- except asking for the PIN, and a device that had missed that moment kept
-- showing @handle, "Verificado" and a profile while every financial call
-- answered 401 — the screenshot that opened this work showed a session that
-- had expired on 1 August still presented as signed in, in September.
--
-- Now a sign-in opens a SESSION: the access token lives minutes, and the app
-- renews it with a refresh token that is
--   * opaque, stored here only as a SHA-256 hash;
--   * single use — each renewal replaces it (rotation), and presenting a
--     replaced token again revokes the whole sign-in (it was copied);
--   * bounded — a sign-in lasts at most 30 days, however often it is renewed;
--   * revocable — signing out, a suspension, or the handle leaving the
--     Business ends it at the next renewal.
--
-- Additive. No existing table is altered.

CREATE TABLE IF NOT EXISTS merchant_app_sessions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Every rotation of one sign-in shares its family. Revocation is by family.
    family_id           UUID        NOT NULL,
    merchant_id         UUID        NOT NULL REFERENCES merchants (id),
    environment         TEXT        NOT NULL CHECK (environment IN ('SANDBOX', 'LIVE')),
    refresh_token_hash  TEXT        NOT NULL UNIQUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The sign-in's absolute end: rotation carries it forward unchanged.
    expires_at          TIMESTAMPTZ NOT NULL,
    -- Set when this token was exchanged for its successor. Presenting a token
    -- that has a rotated_at is reuse.
    rotated_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    revoked_reason      TEXT
        CHECK (revoked_reason IS NULL OR revoked_reason IN
               ('SIGNED_OUT', 'REUSE_DETECTED', 'BUSINESS_NOT_ACTIVE', 'HANDLE_NOT_OWNED')),
    CONSTRAINT merchant_app_sessions_revocation_coherent
        CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL)),
    CONSTRAINT merchant_app_sessions_expiry_after_creation
        CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_merchant_app_sessions_family
    ON merchant_app_sessions (family_id);
CREATE INDEX IF NOT EXISTS idx_merchant_app_sessions_merchant_live
    ON merchant_app_sessions (merchant_id) WHERE revoked_at IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bl_app_runtime') THEN
        GRANT SELECT, INSERT, UPDATE ON TABLE merchant_app_sessions TO bl_app_runtime;
    END IF;
END
$$;
