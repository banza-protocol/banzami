-- 0086_sandbox_auto_approved.sql
-- Flags a merchant application that was auto-approved by the SANDBOX assisted
-- onboarding flow (no manual review). This is a SANDBOX-only convenience: LIVE
-- applications always go through manual review and this flag stays false.
-- Purely a metadata/audit column — the provisioning itself reuses the same
-- Approve path as a manual approval.

ALTER TABLE merchant_applications
  ADD COLUMN IF NOT EXISTS sandbox_auto_approved BOOLEAN NOT NULL DEFAULT false;
