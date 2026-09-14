-- The Public Sandbox is self-service (ADR-060).
--
-- A Developer Project in the Sandbox gets a Business without an operator, pays
-- with its own test payers, tries the API from the Console and tests its webhook
-- endpoint on demand. Each of those needs a place in the schema that says
-- honestly what it is.

-- ── 1. A synthetic Sandbox Business is not a reviewed one ─────────────────────
-- ADR-058 retired the one-click setup because it wrote APPROVED for a Business
-- nobody reviewed. A self-service Sandbox Business carries its own status
-- instead. merchants.verified follows only APPROVED (0122), so it stays false.
-- Core refuses to write this value outside the Sandbox.
ALTER TABLE merchant_compliance DROP CONSTRAINT IF EXISTS merchant_compliance_kyb_status_check;
ALTER TABLE merchant_compliance ADD CONSTRAINT merchant_compliance_kyb_status_check
    CHECK (kyb_status IN ('PENDING', 'APPROVED', 'REJECTED', 'UNDER_REVIEW', 'SUSPENDED', 'SANDBOX_SYNTHETIC'));

-- One synthetic Business per Project, found again on a retry.
CREATE TABLE IF NOT EXISTS sandbox_businesses (
    merchant_id   UUID        PRIMARY KEY REFERENCES merchants (id),
    project_id    UUID        NOT NULL UNIQUE,
    use_case      TEXT        NOT NULL CHECK (use_case IN ('STANDARD', 'APPLICATION')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Test payers belong to a Project ───────────────────────────────────────
-- A consumer created for a Project's tests. project_id comes from the
-- authenticated key, never from a request body; every read filters on it.
CREATE TABLE IF NOT EXISTS sandbox_test_payers (
    consumer_id   UUID        PRIMARY KEY REFERENCES consumers (id),
    project_id    UUID        NOT NULL,
    label         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    retired_at    TIMESTAMPTZ,
    CONSTRAINT sandbox_test_payers_label_length CHECK (label IS NULL OR char_length(label) <= 60)
);
CREATE INDEX IF NOT EXISTS idx_sandbox_test_payers_project
    ON sandbox_test_payers (project_id, created_at DESC);

-- Fictitious value added to test payers, per Project, for daily quotas and for
-- the record. The value itself moves by ledger posting; this row is the request.
CREATE TABLE IF NOT EXISTS sandbox_test_fundings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID        NOT NULL,
    consumer_id     UUID        NOT NULL REFERENCES consumers (id),
    amount_minor    BIGINT      NOT NULL CHECK (amount_minor > 0),
    kind            TEXT        NOT NULL CHECK (kind IN ('GRANT', 'TOP_UP')),
    idempotency_key TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sandbox_test_fundings_key UNIQUE (project_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_sandbox_test_fundings_project_day
    ON sandbox_test_fundings (project_id, created_at DESC);

-- ── 3. A Project that owns a Business can consent for it ─────────────────────
-- Link codes were issued only from the Business App. A synthetic Business has
-- no Business App login; the Project that owns it issues the code instead.
ALTER TABLE business_link_codes ADD COLUMN IF NOT EXISTS issued_by_project_id UUID;

-- ── 4. API Explorer keys are short-lived and never listed ────────────────────
ALTER TABLE developer.dev_api_keys ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE developer.dev_api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dev_api_keys_purpose_known') THEN
        ALTER TABLE developer.dev_api_keys ADD CONSTRAINT dev_api_keys_purpose_known
            CHECK (purpose IN ('STANDARD', 'EXPLORER'));
    END IF;
    -- An Explorer key always expires, and only Explorer keys do.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dev_api_keys_explorer_expires') THEN
        ALTER TABLE developer.dev_api_keys ADD CONSTRAINT dev_api_keys_explorer_expires
            CHECK ((purpose = 'EXPLORER') = (expires_at IS NOT NULL));
    END IF;
END $$;

-- The Sandbox use case a Project chose, shown in the Console.
ALTER TABLE developer.dev_project_sandbox_binding ADD COLUMN IF NOT EXISTS sandbox_use_case TEXT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dev_project_sandbox_binding_use_case_known') THEN
        ALTER TABLE developer.dev_project_sandbox_binding ADD CONSTRAINT dev_project_sandbox_binding_use_case_known
            CHECK (sandbox_use_case IS NULL OR sandbox_use_case IN ('STANDARD', 'APPLICATION'));
    END IF;
END $$;

-- ── 5. A webhook test delivery is not a financial event ──────────────────────
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS synthetic BOOLEAN NOT NULL DEFAULT false;

-- ── 6. The audit log accepts what the self-service Sandbox writes ────────────
-- 0140's list plus the Sandbox provisioning, pricing-by-policy, test payer,
-- funding and reset actions. core writes audit rows fire-and-forget, so an
-- action missing here would leave no record at all.
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
    'CONSUMER_PAY_LINK_PAID',
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
    'PRICING_PROFILE_ASSIGNED',
    'QR_PAYMENT_COMPLETED',
    'RECONCILIATION_RUN',
    'REFUND_PROCESSED',
    'RISK_FLAG_RAISED',
    'RISK_FLAG_RESOLVED',
    'SANDBOX_BUSINESS_PROVISIONED',
    'SANDBOX_FUNDS_RETIRED',
    'SANDBOX_RESET',
    'SANDBOX_TEST_FUNDING',
    'SANDBOX_TEST_PAYER_CREATED',
    'SANDBOX_TEST_PAYER_RETIRED',
    'SETTLEMENT_CONFIRMED',
    'SETTLEMENT_SUBMITTED',
    'SUSPICIOUS_ACTIVITY_DETECTED',
    'TRANSFER_COMPLETED',
    'WALLET_ACCOUNT_CLOSED',
    'WALLET_CREDIT',
    'WALLET_DEBIT'
]::text[]));
