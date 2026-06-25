-- 0053_merchant_activation.sql
-- Activation-token onboarding (Merchant Lifecycle, Track 4).
--
-- Replaces the temporary-PIN-by-email model. On approval the credential is
-- created WITHOUT a PIN (pin_hash NULL, activated_at NULL) and a single-use
-- activation token is emailed as a link. The merchant chooses their own PIN on
-- banzami.com/comerciantes/activar; only then is pin_hash set + activated_at
-- stamped. lookup.can_login stays false until activated. No PIN ever travels by
-- email; the token is stored hashed (sha256), single-use, with an expiry.
--
-- Additive + idempotent. Sandbox first. Non-destructive.

-- ---------------------------------------------------------------------------
-- merchant_app_credentials: PIN is now set at activation, not at creation.
-- ---------------------------------------------------------------------------
ALTER TABLE merchant_app_credentials ALTER COLUMN pin_hash DROP NOT NULL;
ALTER TABLE merchant_app_credentials ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Backfill: any pre-existing credential already has a PIN, so treat it as
-- activated (keeps @doa_sandbox and any seeded merchants logging in).
UPDATE merchant_app_credentials
   SET activated_at = COALESCE(activated_at, created_at)
 WHERE pin_hash IS NOT NULL AND activated_at IS NULL;

-- ---------------------------------------------------------------------------
-- merchant_activation_tokens: single-use, hashed, expiring activation links.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_activation_tokens (
    id          UUID        PRIMARY KEY,
    merchant_id UUID        NOT NULL,
    environment TEXT        NOT NULL CHECK (environment IN ('LIVE', 'SANDBOX')),
    token_hash  TEXT        NOT NULL UNIQUE,   -- sha256(raw token), hex; raw never stored
    purpose     TEXT        NOT NULL DEFAULT 'ACTIVATION' CHECK (purpose IN ('ACTIVATION')),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,                   -- set once on completion
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activation_tokens_merchant ON merchant_activation_tokens (merchant_id, environment);
