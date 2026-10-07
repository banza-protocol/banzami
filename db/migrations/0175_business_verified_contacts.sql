-- 0175 — Business verified contacts + the two OTP purposes that use them.
--
-- A Business may use email as a proof-of-control factor ONLY when that email has
-- itself been verified by Banzami (an OTP delivered to it was returned). This
-- migration adds the server-side source of truth for that, and the OTP/grant
-- tables for the two DISTINCT security actions that sit on top of it:
--
--   BUSINESS_CONTACT_VERIFY  — prove someone controlling the Business context can
--                              receive mail at an address → persist it as a
--                              verified Business contact.
--   BUSINESS_PROJECT_LINK    — use an already-verified contact to prove control
--                              for linking the Business to a Developer Project.
--
-- These are deliberately separate purposes (purpose isolation): a contact-verify
-- OTP can NEVER authorise a project link, and vice versa. KYB is a third, unrelated
-- assurance and is NOT represented here — email verification is not KYB and is not
-- legal ownership of a company.
--
-- Everything here is NON-FINANCIAL. No money column, no ledger. The gateway's
-- runtime role (bl_gateway_runtime) writes these; grants live in db/authority,
-- never in this migration (0099 keeps audit_log append-only; this file only
-- extends the action allow-list, mirroring 0169/0174).
--
-- Forward-only. Historical records (application emails, synthetic .test addresses)
-- are NOT touched and are NOT retroactively marked verified: a contact is verified
-- only by actually completing an OTP, so every row here is born unverified.

-- 1. The verified-contact truth ---------------------------------------------
-- First-class Business contacts so phone/SMS can be added later without changing
-- the Business→contact relationship. For this release only EMAIL is used, and a
-- Business normally has one primary verified email contact per environment.
CREATE TABLE business_contacts (
    id               UUID        PRIMARY KEY,
    merchant_id      UUID        NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    -- EMAIL now; PHONE is reserved for a future LIVE SMS factor (not built here).
    contact_type     TEXT        NOT NULL CHECK (contact_type IN ('EMAIL', 'PHONE')),
    -- The normalised address (lower-cased email). Never a raw/for-display form.
    value_normalized TEXT        NOT NULL,
    is_primary       BOOLEAN     NOT NULL DEFAULT TRUE,
    -- NULL until an OTP to this exact address is returned. A contact is a proof
    -- factor ONLY while this is non-NULL and revoked_at IS NULL.
    verified_at      TIMESTAMPTZ,
    -- Named, never inferred (same discipline as the rest of the Sandbox).
    environment      TEXT        NOT NULL CHECK (environment IN ('SANDBOX', 'LIVE')),
    revoked_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one active (non-revoked) primary EMAIL contact per Business+environment:
-- the destination a BUSINESS_PROJECT_LINK OTP is sent to is unambiguous.
CREATE UNIQUE INDEX business_contacts_one_primary_email_idx
    ON business_contacts (merchant_id, environment)
    WHERE contact_type = 'EMAIL' AND is_primary = TRUE AND revoked_at IS NULL;

CREATE INDEX business_contacts_merchant_idx ON business_contacts (merchant_id);

-- 2. OTPs for the two Business purposes --------------------------------------
-- Mirrors consumer_email_otps (0169) and the gateway's account-deletion OTP: only
-- the HMAC of the code is stored, the attempt counter is claimed before the
-- comparison, and a live code is single per subject+purpose.
--
-- subject is a project_id for a FIRST provisioning (Path A: no merchant exists
-- yet) and a merchant_id for enrolment on / linking an existing Business. It is an
-- opaque UUID either way; the CHECK keys meaning off purpose.
CREATE TABLE business_contact_otps (
    id             UUID        PRIMARY KEY,
    purpose        TEXT        NOT NULL CHECK (purpose IN ('BUSINESS_CONTACT_VERIFY', 'BUSINESS_PROJECT_LINK')),
    -- The subject the OTP is bound to: project_id (CONTACT_VERIFY pre-provision)
    -- or merchant_id (enrolment / link). Opaque; never a handle.
    subject_id     UUID        NOT NULL,
    -- For BUSINESS_PROJECT_LINK: the Project the link grant will be bound to.
    project_id     UUID,
    -- The exact (lower-cased) address the code was sent to — the only place it is
    -- ever sent. For a link OTP this is the Business's verified contact, resolved
    -- server-side, never a request-supplied address.
    contact_value  TEXT        NOT NULL,
    environment    TEXT        NOT NULL CHECK (environment IN ('SANDBOX', 'LIVE')),
    code_hash      TEXT        NOT NULL,
    hash_version   INT         NOT NULL DEFAULT 1,
    expires_at     TIMESTAMPTZ NOT NULL,
    attempts       INT         NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts   INT         NOT NULL DEFAULT 5,
    consumed_at    TIMESTAMPTZ,
    request_ip     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A link OTP must name the Project it is for; a contact-verify OTP must not.
    CONSTRAINT business_contact_otps_project CHECK (
        (purpose = 'BUSINESS_PROJECT_LINK' AND project_id IS NOT NULL)
        OR (purpose = 'BUSINESS_CONTACT_VERIFY' AND project_id IS NULL)
    )
);

-- One live (unconsumed) code per subject+purpose (+project for a link). A new
-- request supersedes the old one; the window/cooldown are enforced in code.
CREATE UNIQUE INDEX business_contact_otps_live_verify_idx
    ON business_contact_otps (subject_id)
    WHERE purpose = 'BUSINESS_CONTACT_VERIFY' AND consumed_at IS NULL;
CREATE UNIQUE INDEX business_contact_otps_live_link_idx
    ON business_contact_otps (subject_id, project_id)
    WHERE purpose = 'BUSINESS_PROJECT_LINK' AND consumed_at IS NULL;

CREATE INDEX business_contact_otps_issue_window_idx
    ON business_contact_otps (subject_id, purpose, created_at);

-- 3. Grants: the opaque single-use proof issued after an OTP verifies ---------
-- The OTP is never the long-lived authorisation; this is. Only the hash is kept.
--   CONTACT_VERIFIED      — consumed by Path A finalize / existing-business enrol
--                           to persist the Business verified contact (subject +
--                           contact-bound).
--   BUSINESS_PROJECT_LINK — consumed by the link mutation (merchant + project
--                           bound). Proves control via the verified contact.
CREATE TABLE business_link_grants (
    id             UUID        PRIMARY KEY,
    kind           TEXT        NOT NULL CHECK (kind IN ('CONTACT_VERIFIED', 'BUSINESS_PROJECT_LINK')),
    token_hash     TEXT        NOT NULL UNIQUE,
    -- subject_id: project_id for CONTACT_VERIFIED pre-provision, else merchant_id.
    subject_id     UUID        NOT NULL,
    -- Set for BUSINESS_PROJECT_LINK (the Project the link is scoped to) and for an
    -- existing-business CONTACT_VERIFIED enrol (NULL for Path A pre-provision).
    merchant_id    UUID,
    project_id     UUID,
    contact_value  TEXT        NOT NULL,
    environment    TEXT        NOT NULL CHECK (environment IN ('SANDBOX', 'LIVE')),
    expires_at     TIMESTAMPTZ NOT NULL,
    consumed_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT business_link_grants_link_subject CHECK (
        kind <> 'BUSINESS_PROJECT_LINK'
        OR (merchant_id IS NOT NULL AND project_id IS NOT NULL)
    )
);

CREATE INDEX business_link_grants_subject_idx ON business_link_grants (subject_id);

-- 4. Audit actions the gateway appends for these flows -----------------------
-- audit_log is append-only (0099 immutability triggers). The allow-list is itself
-- append-only (tests/ops/audit-action-list-only-grows + the Rust risk.rs guard):
-- the new constraint is the FULL historical union from 0174 PLUS the four actions
-- below — never a subset. Grants come from db/authority, not here.
ALTER TABLE audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action = ANY (ARRAY[
    'ACCOUNT_FROZEN',
    'ACCOUNT_UNFROZEN',
    'ACQUIRING_CALLBACK_RECEIVED',
    'ACQUIRING_SETTLED',
    'ADMIN_CREDIT',
    'API_KEY_REVOKED',
    'BUSINESS_ACCOUNT_TYPE_CHANGED',
    'BUSINESS_CONTACT_VERIFICATION_STARTED',
    'BUSINESS_CONTACT_VERIFIED',
    'BUSINESS_CREDENTIAL_REASSIGNED',
    'BUSINESS_DELETED',
    'BUSINESS_PROJECT_LINK_VERIFICATION_STARTED',
    'BUSINESS_PROJECT_LINKED',
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
    'PRICING_PROFILE_ASSIGNED',
    'QR_PAYMENT_COMPLETED',
    'RECONCILIATION_RUN',
    'RECOVERY_EMAIL_ADDED',
    'REFUND_PROCESSED',
    'RISK_FLAG_RAISED',
    'RISK_FLAG_RESOLVED',
    'SANDBOX_BUSINESS_PROVISIONED',
    'SANDBOX_FUNDS_RETIRED',
    'SANDBOX_PENDING_CASH_IN_FAILED',
    'SANDBOX_PROJECT_RETIRED',
    'SANDBOX_RESET',
    'SANDBOX_TEST_FUNDING',
    'SANDBOX_TEST_PAYER_CREATED',
    'SANDBOX_TEST_PAYER_RETIRED',
    'SETTLEMENT_CONFIRMED',
    'SETTLEMENT_SUBMITTED',
    'SOURCE_RATE_LIMITED',
    'SUSPICIOUS_ACTIVITY_DETECTED',
    'TRANSFER_COMPLETED',
    'WALLET_ACCOUNT_CLOSED',
    'WALLET_CREDIT',
    'WALLET_DEBIT'
]));
