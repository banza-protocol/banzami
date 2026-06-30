-- find-merchant-orphans.sql — read-only reconciliation for the merchant approval
-- flow (audit Part 8 / bug #5).
--
-- Provisioning Phase B (gateway: profile + handle + credentials + activation) is a
-- single atomic transaction, so a merchant created in Phase A whose approval then
-- failed never gets a merchant_profiles row. A merchant with NO profile is therefore
-- a likely provisioning orphan. The approval flow's forward-recovery now prevents
-- NEW duplicates on retry; this query surfaces any PRE-EXISTING orphans for an admin
-- to finish provisioning or clean up. Strictly read-only.
--
-- Usage: psql "$DATABASE_URL" -f tools/find-merchant-orphans.sql

SELECT m.id,
       m.name,
       m.email,
       m.created_at,
       (SELECT count(*) FROM merchant_app_credentials c WHERE c.merchant_id = m.id) AS credentials,
       EXISTS (SELECT 1 FROM merchant_applications a
                WHERE a.created_merchant_id = m.id AND a.status = 'APPROVED')        AS has_approved_app
  FROM merchants m
  LEFT JOIN merchant_profiles p ON p.merchant_id = m.id
 WHERE p.merchant_id IS NULL
 ORDER BY m.created_at DESC;
