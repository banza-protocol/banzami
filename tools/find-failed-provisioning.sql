-- find-failed-provisioning.sql — reconciliation for Business onboarding (Unit 4).
--
-- Lists applications whose provisioning did not complete (status PROVISIONING_FAILED)
-- with the failing step, the resources already created (so an operator knows what is
-- partially provisioned), and the attempt count. Reprocess by re-approving the
-- application: Approve() resumes each recorded step instead of duplicating it.
-- Strictly read-only.
--
-- Usage: psql "$DATABASE_URL" -f tools/find-failed-provisioning.sql

SELECT id,
       business_name,
       desired_handle,
       environment,
       provisioning_error,
       provisioning_attempts,
       (created_merchant_id   IS NOT NULL) AS merchant_done,
       (provisioning_wallet_id IS NOT NULL) AS wallet_done,
       (provisioning_api_key_prefix IS NOT NULL) AS api_key_done,
       provisioning_compliance_done         AS compliance_done,
       updated_at
  FROM merchant_applications
 WHERE status = 'PROVISIONING_FAILED'
 ORDER BY updated_at DESC;
