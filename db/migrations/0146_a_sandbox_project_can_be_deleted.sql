-- 0146 — A Sandbox Project or Workspace can be deleted, whatever it has done.
--
-- Until now a Project that had issued a key, logged a request or received a
-- Financial Setup could only be archived, and a Workspace only once every
-- Project in it was archived. That was retention thinking borrowed from Financial
-- Live. In the Public Sandbox the value is fictitious, and a developer who cannot
-- remove their own test resources accumulates them for ever.
--
-- Deleting is a lifecycle, not a DELETE statement:
--
--   ACTIVE | ARCHIVED ──delete──▶ DELETING ──cleanup──▶ DELETED
--
--   * DELETING is entered in the same transaction that revokes every key of the
--     Project (and, for a Workspace, of every Project in it). Nothing that
--     authenticates as the resource works from that commit on; lists and
--     lookups no longer show it.
--   * Cleanup is Core's canonical Sandbox retirement: test payers retired and
--     their fictitious balances returned to transit through balanced postings,
--     open sessions and links cancelled, the Project's own synthetic Business
--     retired and suspended — never a Business another Project still uses.
--     It is state-based, so it can run again after a crash without posting twice.
--   * DELETED is a tombstone: the id, the Workspace, the timestamps. The display
--     name and slug are released so the same name can be used again for a NEW
--     resource. Keys stay revoked, ledger postings, receipts and audit events stay
--     exactly as they were.
--
-- Sandbox only: Financial Live does not exist, and nothing here gives it a
-- destructive path.

ALTER TABLE developer.dev_projects DROP CONSTRAINT IF EXISTS dev_projects_status_check;
ALTER TABLE developer.dev_projects
    ADD CONSTRAINT dev_projects_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETING', 'DELETED'));
ALTER TABLE developer.dev_projects
    ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_at            TIMESTAMPTZ;
ALTER TABLE developer.dev_projects DROP CONSTRAINT IF EXISTS dev_projects_deletion_timestamps;
ALTER TABLE developer.dev_projects
    ADD CONSTRAINT dev_projects_deletion_timestamps CHECK (
        (status IN ('DELETING', 'DELETED')) = (deletion_requested_at IS NOT NULL)
        AND (status = 'DELETED') = (deleted_at IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_dev_projects_deleting ON developer.dev_projects (deletion_requested_at)
    WHERE status = 'DELETING';

ALTER TABLE developer.dev_workspaces DROP CONSTRAINT IF EXISTS dev_workspaces_status_check;
ALTER TABLE developer.dev_workspaces
    ADD CONSTRAINT dev_workspaces_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED', 'DELETING', 'DELETED'));
ALTER TABLE developer.dev_workspaces
    ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_at            TIMESTAMPTZ;
ALTER TABLE developer.dev_workspaces DROP CONSTRAINT IF EXISTS dev_workspaces_deletion_timestamps;
ALTER TABLE developer.dev_workspaces
    ADD CONSTRAINT dev_workspaces_deletion_timestamps CHECK (
        (status IN ('DELETING', 'DELETED')) = (deletion_requested_at IS NOT NULL)
        AND (status = 'DELETED') = (deleted_at IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_dev_workspaces_deleting ON developer.dev_workspaces (deletion_requested_at)
    WHERE status = 'DELETING';

-- Core's own record that a Project is being retired. Core cannot read the
-- developer schema, and it does not need to: from the first retirement pass on,
-- Core refuses to create a Payment Session or Payment Link for this Project,
-- which closes the window in which a request authorised just before the keys
-- were revoked could still create something payable.
CREATE TABLE IF NOT EXISTS sandbox_retired_projects (
    project_id  UUID        PRIMARY KEY,
    merchant_id UUID        REFERENCES merchants (id),
    retired_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    passes      INTEGER     NOT NULL DEFAULT 1 CHECK (passes > 0)
);

COMMENT ON TABLE sandbox_retired_projects IS
    'Sandbox only. A Developer Project that is being, or has been, deleted. Core refuses new Payment Sessions and Payment Links attributed to it (0146).';

-- The action Core records for each retirement pass. 0142's list plus it; core
-- writes audit rows in the retirement transaction, so a missing action fails it.
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
    'SANDBOX_PROJECT_RETIRED',
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
