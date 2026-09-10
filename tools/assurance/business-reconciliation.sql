-- business-reconciliation.sql — read-only: every ACTIVE Business Account
-- classified against the canonical onboarding model (ADR-059).
--
--   SQL=/tmp/business-reconciliation.sql /tmp/sbq.sh -At     (on the Sandbox VM)
--
-- Classes (a Business is in exactly one):
--   REVIEWED_APPLICATION     KYB approved, and an application an operator decided
--                            resolved to it (approved new, or linked).
--   UNREVIEWED_APPLICATION   KYB approved through an application nobody reviewed
--                            (the retired Sandbox auto-approval).
--   KYB_WITHOUT_APPLICATION  KYB approved with no application at all: an operator
--                            setup, the retired Console one-click owner, or a
--                            consolidation. Legitimate history; the KYB decision
--                            stands and is not asked again.
--   KYB_PENDING              no KYB decision yet.
-- And, across classes:
--   DEVELOPER_BOUND          at least one Developer Project receives into it.
--   ORPHAN_OWNER             no @handle, no Project, no login, no application —
--                            a financial owner nobody can reach. Operator review.
-- Counts only; nothing is written.

WITH b AS (
  SELECT m.id,
         COALESCE(c.kyb_status, 'PENDING') AS kyb,
         EXISTS (SELECT 1 FROM merchant_applications a
                  WHERE a.created_merchant_id = m.id AND a.status = 'APPROVED'
                    AND a.reviewed_by IS NOT NULL AND NOT a.sandbox_auto_approved) AS reviewed_app,
         EXISTS (SELECT 1 FROM merchant_applications a WHERE a.created_merchant_id = m.id) AS any_app,
         EXISTS (SELECT 1 FROM handle_registry hr WHERE hr.owner_type = 'MERCHANT' AND hr.owner_id = m.id) AS has_handle,
         EXISTS (SELECT 1 FROM developer.dev_project_sandbox_binding pb WHERE pb.merchant_id = m.id AND pb.state = 'ACTIVE') AS bound,
         EXISTS (SELECT 1 FROM merchant_app_credentials mc WHERE mc.merchant_id = m.id) AS has_login
    FROM merchants m
    LEFT JOIN merchant_compliance c ON c.merchant_id = m.id
   WHERE m.status = 'ACTIVE')
SELECT CASE
         WHEN kyb <> 'APPROVED' THEN 'KYB_PENDING'
         WHEN reviewed_app THEN 'REVIEWED_APPLICATION'
         WHEN any_app THEN 'UNREVIEWED_APPLICATION'
         ELSE 'KYB_WITHOUT_APPLICATION'
       END AS class, count(*)
  FROM b GROUP BY 1 ORDER BY 1;

SELECT 'DEVELOPER_BOUND', count(*) FROM merchants m
 WHERE m.status = 'ACTIVE'
   AND EXISTS (SELECT 1 FROM developer.dev_project_sandbox_binding pb WHERE pb.merchant_id = m.id AND pb.state = 'ACTIVE');

SELECT 'ORPHAN_OWNER', count(*) FROM merchants m
 WHERE m.status = 'ACTIVE'
   AND NOT EXISTS (SELECT 1 FROM handle_registry hr WHERE hr.owner_type = 'MERCHANT' AND hr.owner_id = m.id)
   AND NOT EXISTS (SELECT 1 FROM developer.dev_project_sandbox_binding pb WHERE pb.merchant_id = m.id AND pb.state = 'ACTIVE')
   AND NOT EXISTS (SELECT 1 FROM merchant_app_credentials mc WHERE mc.merchant_id = m.id)
   AND NOT EXISTS (SELECT 1 FROM merchant_applications a WHERE a.created_merchant_id = m.id);

SELECT 'ORPHAN_OWNER_IDS', string_agg(left(m.id::text, 8), ',' ORDER BY m.created_at) FROM merchants m
 WHERE m.status = 'ACTIVE'
   AND NOT EXISTS (SELECT 1 FROM handle_registry hr WHERE hr.owner_type = 'MERCHANT' AND hr.owner_id = m.id)
   AND NOT EXISTS (SELECT 1 FROM developer.dev_project_sandbox_binding pb WHERE pb.merchant_id = m.id AND pb.state = 'ACTIVE')
   AND NOT EXISTS (SELECT 1 FROM merchant_app_credentials mc WHERE mc.merchant_id = m.id)
   AND NOT EXISTS (SELECT 1 FROM merchant_applications a WHERE a.created_merchant_id = m.id);

SELECT 'BUSINESSES_WITH_TWO_HANDLES', count(*) FROM (
  SELECT owner_id FROM handle_registry WHERE owner_type = 'MERCHANT' GROUP BY owner_id HAVING count(*) > 1) x;
