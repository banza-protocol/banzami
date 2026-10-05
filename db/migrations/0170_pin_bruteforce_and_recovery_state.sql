-- PIN brute-force escalation, PIN_RECOVERY_REQUIRED, persistent anti-DoS source
-- throttle, and LIVE-readiness phone verification column.
--
-- Login stays @banza + PIN. This hardens the credential against guessing:
--   - 3 wrong PINs → a 1-minute credential lock (the credential, not the
--     consumer lifecycle: consumers.status stays ACTIVE);
--   - a further 3 wrong PINs within the security window → PIN_RECOVERY_REQUIRED,
--     a persistent state where PIN login is disabled (even the correct PIN) and
--     time does not clear it — only identity recovery (Forgot-PIN) clears it.
--
-- A persistent per-source (IP/device) throttle stops a single source from
-- forcing many accounts into recovery just by knowing their public @banza.
--
-- phone_verified_at is added now for the LIVE recovery architecture (verified
-- phone + SMS OTP); it stays NULL and unused in Sandbox.

-- 1. Credential escalation state -------------------------------------------
-- failed_attempts + locked_until already exist (0132). Add the escalation
-- counters. lock_count = how many 1-minute locks have been applied in the
-- current window; last_failed_at bounds the window; pin_recovery_required_at,
-- when set, disables PIN login until recovery clears it.
ALTER TABLE public_api_credentials ADD COLUMN lock_count INT NOT NULL DEFAULT 0 CHECK (lock_count >= 0);
ALTER TABLE public_api_credentials ADD COLUMN last_failed_at TIMESTAMPTZ;
ALTER TABLE public_api_credentials ADD COLUMN pin_recovery_required_at TIMESTAMPTZ;

COMMENT ON COLUMN public_api_credentials.pin_recovery_required_at
    IS 'When set, PIN login is disabled (even with the correct PIN) until identity recovery clears it. The consumer stays ACTIVE — this is a credential state, not a lifecycle change.';

-- 2. Persistent anti-DoS source throttle -----------------------------------
-- One row per login source (an opaque key derived from the client IP, and later
-- a device identifier). Counts failed PIN attempts across ALL handles in a
-- window and blocks the source when it exceeds the cap, BEFORE it can reach an
-- account's credential logic — so a single source cannot drive many @banza into
-- a lock/recovery state. Persistent: survives restarts and spans instances.
CREATE TABLE consumer_login_source_throttle (
    source            TEXT        PRIMARY KEY,
    attempts          INT         NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    blocked_until     TIMESTAMPTZ,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX consumer_login_source_throttle_blocked_idx
    ON consumer_login_source_throttle (blocked_until)
    WHERE blocked_until IS NOT NULL;

-- 3. LIVE recovery readiness: verified phone on the consumer identity -------
-- phone_number already exists (0031). A verified phone (phone_verified_at) is
-- the LIVE recovery factor; it is collected + SMS-verified only before LIVE
-- operations and is unused in Sandbox. Added now so the schema supports the LIVE
-- recovery architecture without a future migration.
ALTER TABLE consumers ADD COLUMN phone_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN consumers.phone_verified_at
    IS 'When the mobile phone was verified by SMS OTP. The LIVE recovery factor (real money); NULL and unused in Sandbox, where email is the recovery factor.';

-- 4. Audit actions for the security + recovery events ----------------------
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
    'OTP_RATE_LIMITED',
    'PAYMENT_REQUEST_PAID',
    'PAYOUT_CONFIRMED',
    'PAYOUT_INITIATED',
    'PIN_LOGIN_LOCKED',
    'PIN_RECOVERY_COMPLETED',
    'PIN_RECOVERY_REQUIRED',
    'QR_PAYMENT_COMPLETED',
    'RECONCILIATION_RUN',
    'RECOVERY_EMAIL_ADDED',
    'REFUND_PROCESSED',
    'RISK_FLAG_RAISED',
    'RISK_FLAG_RESOLVED',
    'SANDBOX_FUNDS_RETIRED',
    'SETTLEMENT_CONFIRMED',
    'SETTLEMENT_SUBMITTED',
    'SOURCE_RATE_LIMITED',
    'SUSPICIOUS_ACTIVITY_DETECTED',
    'TRANSFER_COMPLETED',
    'WALLET_ACCOUNT_CLOSED',
    'WALLET_CREDIT',
    'WALLET_DEBIT'
]::text[]));
