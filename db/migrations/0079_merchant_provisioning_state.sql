-- 0079: provisioning recovery state for Business onboarding (Phase 1 Unit 4).
--
-- Merchant provisioning Phase A makes non-transactional core calls (merchant,
-- wallet, api-key, compliance) before the atomic gateway Phase B. Recording each
-- created resource on the application makes a retried approval RESUME each step
-- (idempotent) instead of duplicating it, lets a failed provisioning be MARKED
-- (PROVISIONING_FAILED) and surfaced to operators, and lets it be reprocessed.
-- created_merchant_id already exists (0052) and tracks the merchant step.

ALTER TABLE merchant_applications
  ADD COLUMN IF NOT EXISTS provisioning_wallet_id       UUID,
  ADD COLUMN IF NOT EXISTS provisioning_api_key_prefix  TEXT,
  ADD COLUMN IF NOT EXISTS provisioning_compliance_done BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provisioning_error           TEXT,
  ADD COLUMN IF NOT EXISTS provisioning_attempts        INT     NOT NULL DEFAULT 0;

-- PROVISIONING_FAILED: a provisioning step errored after the application was
-- approved-for-provisioning; the application is recoverable (reprocessable),
-- never silently "approved" while the merchant cannot actually sign in.
ALTER TABLE merchant_applications DROP CONSTRAINT IF EXISTS merchant_applications_status_check;
ALTER TABLE merchant_applications ADD CONSTRAINT merchant_applications_status_check
  CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','CANCELLED','PROVISIONING_FAILED'));
