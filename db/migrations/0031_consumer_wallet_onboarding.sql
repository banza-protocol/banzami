-- Consumer wallet onboarding infrastructure — ADR-017 §1–§2
--
-- Schema changes:
--   1. consumer_onboarding   — transient pre-activation state (PENDING_OTP, PENDING_PIN)
--   2. consumer_wallets      — adds LOCKED status, PIN persistence, KYC state, audit fields
--   3. consumers             — adds phone_number for post-activation identity reference
--
-- Architecture note (ADR-017 §9):
--   consumer_onboarding rows are transient — deleted atomically on activation.
--   consumer_wallets rows only exist for activated wallets (ACTIVE, LOCKED, SUSPENDED, CLOSED).
--   NOT NULL on available_account_id / reserved_account_id enforces INV-WALLET-007.

-- ─── 1. Transient onboarding table ───────────────────────────────────────────
--
-- Tracks pre-activation phone verification and handle reservation.
-- Background jobs clean up rows where expires_at < now().

CREATE TABLE consumer_onboarding (
    id                               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- E.164 phone number submitted at onboarding start.
    phone_number                     TEXT        NOT NULL,

    -- SHA-256(otp_plaintext). Cleared to NULL after successful verification.
    -- Plaintext OTP is never stored.
    otp_code_hash                    TEXT,
    otp_expires_at                   TIMESTAMPTZ,

    -- Tentative @banza handle reserved during PENDING_PIN.
    -- Not yet inserted into consumers. Released on session expiry.
    desired_handle                   TEXT,

    currency                         CHAR(3)     NOT NULL DEFAULT 'AOA',

    status                           TEXT        NOT NULL DEFAULT 'PENDING_OTP'
        CHECK (status IN ('PENDING_OTP', 'PENDING_PIN')),

    -- Provisioned at PENDING_OTP → PENDING_PIN transition.
    -- NULL while status = PENDING_OTP; NOT NULL when status = PENDING_PIN.
    provisional_available_account_id UUID        REFERENCES ledger_accounts(id),
    provisional_reserved_account_id  UUID        REFERENCES ledger_accounts(id),

    created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Absolute expiry for stale_onboarding cleanup job.
    -- PENDING_OTP sessions expire in OTP_TTL_MINUTES (default 5).
    -- PENDING_PIN sessions expire in ONBOARDING_TTL_MINUTES (default 30).
    expires_at                       TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE  consumer_onboarding
    IS 'Transient pre-activation state. Rows deleted atomically on wallet activation or by the stale_onboarding background job.';
COMMENT ON COLUMN consumer_onboarding.otp_code_hash
    IS 'SHA-256(otp_plaintext). Cleared after verification. Never the plaintext OTP.';
COMMENT ON COLUMN consumer_onboarding.desired_handle
    IS 'Tentative @banza handle. Released if session expires before activation.';
COMMENT ON COLUMN consumer_onboarding.provisional_available_account_id
    IS 'Ledger account provisioned during PENDING_OTP → PENDING_PIN. Bound to wallet on activation.';

-- One active onboarding attempt per phone number at a time.
CREATE UNIQUE INDEX consumer_onboarding_phone_idx
    ON consumer_onboarding (phone_number);

-- Lookup indices for engine operations and background jobs.
CREATE INDEX consumer_onboarding_status_idx  ON consumer_onboarding (status);
CREATE INDEX consumer_onboarding_expires_idx ON consumer_onboarding (expires_at);
CREATE INDEX consumer_onboarding_handle_idx  ON consumer_onboarding (desired_handle)
    WHERE desired_handle IS NOT NULL;

-- ─── 2. Extend consumer_wallets ──────────────────────────────────────────────
--
-- New columns support: PIN security, KYC state, lockout, audit timestamps.
-- Status extended to include LOCKED (INV-WALLET-006).

ALTER TABLE consumer_wallets
    ADD COLUMN kyc_status           TEXT        NOT NULL DEFAULT 'NONE'
        CHECK (kyc_status IN ('NONE', 'PENDING', 'VERIFIED')),
    ADD COLUMN pin_hash             TEXT,
    ADD COLUMN failed_pin_attempts  INT         NOT NULL DEFAULT 0
        CHECK (failed_pin_attempts >= 0),
    ADD COLUMN locked_at            TIMESTAMPTZ,
    ADD COLUMN updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN activated_at         TIMESTAMPTZ,
    ADD COLUMN closed_at            TIMESTAMPTZ;

COMMENT ON COLUMN consumer_wallets.pin_hash
    IS 'Argon2id PHC hash of the consumer PIN. NULL until first activation. Never plaintext.';
COMMENT ON COLUMN consumer_wallets.failed_pin_attempts
    IS 'Consecutive failed PIN verifications. Resets to 0 on success. Wallet locks at 5.';
COMMENT ON COLUMN consumer_wallets.kyc_status
    IS 'KYC verification level. Controls transaction limits (INV-KYC-002).';

-- Drop the existing status check constraint (defined inline in 0011, auto-named).
-- The DO block finds and drops it by introspection so the migration is name-agnostic.
DO $$
DECLARE
    v_conname TEXT;
BEGIN
    SELECT conname INTO v_conname
    FROM   pg_constraint
    WHERE  conrelid = 'consumer_wallets'::regclass
      AND  contype  = 'c'
      AND  pg_get_constraintdef(oid) LIKE '%ACTIVE%SUSPENDED%CLOSED%'
      AND  pg_get_constraintdef(oid) NOT LIKE '%LOCKED%';

    IF v_conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE consumer_wallets DROP CONSTRAINT %I', v_conname);
    END IF;
END $$;

-- Recreate with LOCKED added.
ALTER TABLE consumer_wallets
    ADD CONSTRAINT consumer_wallets_status_check
    CHECK (status IN ('ACTIVE', 'LOCKED', 'SUSPENDED', 'CLOSED'));

COMMENT ON CONSTRAINT consumer_wallets_status_check ON consumer_wallets
    IS 'INV-WALLET-006: only legal post-activation states. Pre-activation state lives in consumer_onboarding.';

-- Backfill audit timestamps for existing rows.
UPDATE consumer_wallets
    SET  activated_at = created_at,
         updated_at   = now()
    WHERE activated_at IS NULL;

-- ─── 3. Phone number on consumers ────────────────────────────────────────────
--
-- Post-activation reference — set during complete_onboarding() atomically.
-- NULL for accounts created before ADR-017 (legacy).

ALTER TABLE consumers
    ADD COLUMN phone_number TEXT;

COMMENT ON COLUMN consumers.phone_number
    IS 'E.164 phone number. Set at wallet activation. NULL for pre-ADR-017 accounts.';

-- Enforce one live consumer per phone number.
CREATE UNIQUE INDEX consumers_phone_idx
    ON consumers (phone_number)
    WHERE phone_number IS NOT NULL AND status != 'CLOSED';

-- ─── Invariant enforcement summary ───────────────────────────────────────────
-- INV-WALLET-004: consumer_wallets_consumer_currency_idx (from 0011) — one wallet per consumer/currency
-- INV-WALLET-005: currency immutability — enforced at application layer; no UPDATE permitted
-- INV-WALLET-006: consumer_wallets_status_check above (ACTIVE/LOCKED/SUSPENDED/CLOSED only)
-- INV-WALLET-007: available_account_id + reserved_account_id are NOT NULL in consumer_wallets
-- INV-WALLET-008: consumers.consumers_handle_key UNIQUE constraint (from 0010)
