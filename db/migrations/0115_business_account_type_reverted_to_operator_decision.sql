-- Classification goes back to being an operator decision.
--
-- ADR-028's taxonomy decides who may take an application fee: only an
-- APPLICATION or PLATFORM Business Account can be an application-fee
-- destination. Like the pricing profile that decides whether there is a fee at
-- all, it is the operator's call — ADR-028 says so, and the admin route that
-- re-tags an account exists for exactly that purpose.
--
-- For a few days it was not. Settlement validated a named fee destination even
-- when the operator's pricing charged no fee, so an ordinary Project on a
-- zero-rate profile that named its own account was refused with
-- FEE_DESTINATION_TYPE_NOT_ALLOWED. The fix applied at the time was to make the
-- Sandbox readiness route (and the self-service provisioner) classify every
-- developer-project Business as APPLICATION — which removed the symptom by
-- granting every developer the privilege the rule reserves.
--
-- Settlement now validates the destination only when pricing resolves a fee,
-- so that workaround is no longer needed and is removed from the code. This
-- reverts the rows it wrote, so that the only APPLICATION/PLATFORM accounts are
-- the ones an operator chose.
--
-- Scope, precisely:
--   - Business Accounts that hold a Developer Project binding (any state), AND
--   - are APPLICATION or PLATFORM, AND
--   - have NO operator classification in the admin audit trail.
-- Before the workaround every one of these was MERCHANT; the audit trail shows
-- the automated promotion on each. No operator had classified any of them —
-- there is no such record — so nothing an operator decided is touched.
--
-- Idempotent: a second run matches nothing. Atomic: one transaction. The money
-- is untouched — this is classification metadata, not a balance.

DO $$
DECLARE mode TEXT;
BEGIN
    SELECT value INTO mode
      FROM platform_settings
     WHERE key = 'platform_mode' AND environment = 'GLOBAL';
    IF mode IS DISTINCT FROM 'SANDBOX' THEN
        RAISE EXCEPTION
            'refusing to revert business account classification: platform_mode is %, not SANDBOX. '
            'The automated promotion only ever ran in the Sandbox.', COALESCE(mode, '<unset>');
    END IF;
END $$;

-- A classification change is an auditable event, and audit_log only accepts a
-- closed vocabulary — which did not include it. So a type change, by an
-- operator or by this migration, was a mutation the system trail could not
-- record. The vocabulary gains the one action both need.
ALTER TABLE audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action = ANY (ARRAY[
    'WALLET_CREDIT', 'WALLET_DEBIT', 'LEDGER_POSTING', 'SETTLEMENT_SUBMITTED',
    'SETTLEMENT_CONFIRMED', 'PAYOUT_INITIATED', 'PAYOUT_CONFIRMED',
    'ACQUIRING_CALLBACK_RECEIVED', 'ACQUIRING_SETTLED', 'DEPOSIT_INITIATED',
    'DEPOSIT_SETTLED', 'TRANSFER_COMPLETED', 'REFUND_PROCESSED', 'DISPUTE_OPENED',
    'DISPUTE_RESOLVED', 'ACCOUNT_FROZEN', 'ACCOUNT_UNFROZEN', 'RISK_FLAG_RAISED',
    'RISK_FLAG_RESOLVED', 'SUSPICIOUS_ACTIVITY_DETECTED', 'ADMIN_CREDIT',
    'MERCHANT_SUSPENDED', 'CONSUMER_SUSPENDED', 'API_KEY_REVOKED',
    'KYC_STATUS_CHANGED', 'RECONCILIATION_RUN',
    'BUSINESS_ACCOUNT_TYPE_CHANGED']::text[]));

-- Record what is reverted BEFORE reverting it, so the trail says which accounts
-- this migration touched and what they were.
INSERT INTO audit_log (actor, action, subject, metadata)
SELECT 'MIGRATION:0115',
       'BUSINESS_ACCOUNT_TYPE_CHANGED',
       'merchant:' || m.id,
       jsonb_build_object(
           'from', m.business_account_type,
           'to', 'MERCHANT',
           'source', 'migration_0115',
           'reason', 'automated APPLICATION promotion withdrawn; classification is an operator decision (ADR-028)')
  FROM merchants m
 WHERE m.business_account_type IN ('APPLICATION', 'PLATFORM')
   AND EXISTS (SELECT 1 FROM developer.dev_project_sandbox_binding b WHERE b.merchant_id = m.id)
   AND NOT EXISTS (
         SELECT 1 FROM admin_audit_log a
          WHERE a.entity_type = 'merchant'
            AND a.entity_id = m.id::text
            AND a.action = 'MERCHANT_BUSINESS_ACCOUNT_TYPE_CHANGED');

UPDATE merchants m
   SET business_account_type = 'MERCHANT', updated_at = now()
 WHERE m.business_account_type IN ('APPLICATION', 'PLATFORM')
   AND EXISTS (SELECT 1 FROM developer.dev_project_sandbox_binding b WHERE b.merchant_id = m.id)
   AND NOT EXISTS (
         SELECT 1 FROM admin_audit_log a
          WHERE a.entity_type = 'merchant'
            AND a.entity_id = m.id::text
            AND a.action = 'MERCHANT_BUSINESS_ACCOUNT_TYPE_CHANGED');
