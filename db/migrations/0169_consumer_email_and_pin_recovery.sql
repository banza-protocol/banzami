-- Consumer verified email + PIN recovery.
--
-- Before the public Sandbox launch the Consumer account gains a proper recovery
-- attribute. Login stays @handle + PIN; email is NOT a password and does NOT
-- replace the handle. Email becomes a verified contact and the channel for
-- "Esqueci o PIN". This migration adds:
--
--   1. email + email_verified_at on `consumers` (Core-owned identity truth,
--      mirroring the existing phone_number column + its one-live-per-value
--      partial unique index). Written by Core at signup; read by public-api.
--
--   2. Two public-api-owned tables for the recovery machinery — an OTP table
--      (email verification at signup, and PIN-reset codes) and an opaque
--      single-use grant table (the proof issued AFTER an OTP is verified; the
--      OTP is never itself the reset token). Both hold only hashes, never a raw
--      code or token.
--
--   3. Three append-only audit actions public-api writes for these flows.
--
-- No PIN is stored here; the PIN stays in public_api_credentials (bcrypt) and
-- consumer_wallets (Argon2id), unchanged. Nothing financial is touched.

-- 1. Email on the consumer identity ----------------------------------------
ALTER TABLE consumers ADD COLUMN email TEXT;
ALTER TABLE consumers ADD COLUMN email_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN consumers.email
    IS 'Verified contact + recovery email. Lower-cased at write. NULL for accounts created before this feature.';
COMMENT ON COLUMN consumers.email_verified_at
    IS 'When the email was verified by OTP. A non-NULL email always carries a verification time (set together).';

-- One live consumer per verified email (CLOSED tombstones release the value),
-- mirroring consumers_phone_idx. Case-insensitive via lower().
CREATE UNIQUE INDEX consumers_email_idx
    ON consumers (lower(email))
    WHERE email IS NOT NULL AND status != 'CLOSED';

-- 2. Recovery machinery (public-api owned) ----------------------------------

-- 2a. OTP codes. One row per issued code; only the HMAC is stored. Purposes:
--   SIGNUP_VERIFY — pre-account email verification, keyed by email (no consumer yet).
--   PIN_RESET     — forgot-PIN, keyed by consumer_id (email is the account's own).
CREATE TABLE consumer_email_otps (
    id             UUID        PRIMARY KEY,
    purpose        TEXT        NOT NULL CHECK (purpose IN ('SIGNUP_VERIFY', 'PIN_RESET')),
    -- For SIGNUP_VERIFY: the (lower-cased) email being verified. For PIN_RESET:
    -- the account's own email, copied here only so delivery has a target.
    email          TEXT        NOT NULL,
    -- Set only for PIN_RESET (the account the reset is for). NULL at signup.
    consumer_id    UUID,
    code_hash      TEXT        NOT NULL,
    hash_version   INT         NOT NULL DEFAULT 1,
    expires_at     TIMESTAMPTZ NOT NULL,
    attempts       INT         NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts   INT         NOT NULL DEFAULT 5,
    consumed_at    TIMESTAMPTZ,
    request_ip     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one live (unconsumed) code per subject+purpose: a new request replaces
-- the old one. The subject is the email for signup, the consumer_id for reset.
CREATE UNIQUE INDEX consumer_email_otps_live_signup_idx
    ON consumer_email_otps (lower(email))
    WHERE purpose = 'SIGNUP_VERIFY' AND consumed_at IS NULL;
CREATE UNIQUE INDEX consumer_email_otps_live_reset_idx
    ON consumer_email_otps (consumer_id)
    WHERE purpose = 'PIN_RESET' AND consumed_at IS NULL;

-- 2b. Grants: the opaque single-use proof issued after an OTP verifies. The OTP
-- is never the reset token; this is. Only the hash is stored.
--   EMAIL_VERIFIED — consumed by register() to prove the signup email is verified.
--   PIN_RESET      — consumed by the set-new-PIN call; bound to one consumer.
CREATE TABLE consumer_auth_grants (
    id             UUID        PRIMARY KEY,
    kind           TEXT        NOT NULL CHECK (kind IN ('EMAIL_VERIFIED', 'PIN_RESET')),
    token_hash     TEXT        NOT NULL UNIQUE,
    -- EMAIL_VERIFIED carries the verified email; PIN_RESET carries the consumer.
    email          TEXT,
    consumer_id    UUID,
    expires_at     TIMESTAMPTZ NOT NULL,
    consumed_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT consumer_auth_grants_subject CHECK (
        (kind = 'EMAIL_VERIFIED' AND email IS NOT NULL)
        OR (kind = 'PIN_RESET' AND consumer_id IS NOT NULL)
    )
);

CREATE INDEX consumer_auth_grants_consumer_idx
    ON consumer_auth_grants (consumer_id)
    WHERE consumer_id IS NOT NULL;

-- 3. Audit actions public-api appends ---------------------------------------
-- audit_log is append-only (0099 immutability triggers); public-api gets INSERT
-- authority via the manifest (db/authority), never via this migration.
ALTER TABLE audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action = ANY (ARRAY[
    'ACCOUNT_FROZEN',
    'ACCOUNT_UNFROZEN',
    'ACQUIRING_CALLBACK_RECEIVED',
    'ACQUIRING_SETTLED',
    'ADMIN_CREDIT',
    'API_KEY_REVOKED',
    'BUSINESS_ACCOUNT_TYPE_CHANGED',
    'BUSINESS_CREDENTIAL_REASSIGNED',
    'BUSINESS_DELETED',
    'CONSUMER_DELETED',
    'CONSUMER_EMAIL_VERIFIED',
    'CONSUMER_PAY_LINK_PAID',
    'CONSUMER_PIN_CHANGED',
    'CONSUMER_PIN_RESET',
    'CONSUMER_SUSPENDED',
    'DEPOSIT_INITIATED',
    'DEPOSIT_SETTLED',
    'DISPUTE_OPENED',
    'DISPUTE_RESOLVED',
    'KYC_STATUS_CHANGED',
    'LEDGER_POSTING',
    'MERCHANT_SUSPENDED',
    'PAYMENT_REQUEST_PAID',
    'PAYOUT_CONFIRMED',
    'PAYOUT_INITIATED',
    'QR_PAYMENT_COMPLETED',
    'RECONCILIATION_RUN',
    'REFUND_PROCESSED',
    'RISK_FLAG_RAISED',
    'RISK_FLAG_RESOLVED',
    'SANDBOX_FUNDS_RETIRED',
    'SETTLEMENT_CONFIRMED',
    'SETTLEMENT_SUBMITTED',
    'SUSPICIOUS_ACTIVITY_DETECTED',
    'TRANSFER_COMPLETED',
    'WALLET_ACCOUNT_CLOSED',
    'WALLET_CREDIT',
    'WALLET_DEBIT'
]::text[]));
