-- Extend the audit_log.action CHECK constraint to cover refund and dispute
-- actions. The refund (REF-001) and dispute (REF-002) handlers already call the
-- audit writer with REFUND_PROCESSED / DISPUTE_OPENED / DISPUTE_RESOLVED, but
-- those values were not in the original CHECK list — so the inserts failed the
-- constraint and, because the audit writer swallows errors, the audit trail was
-- silently not recorded. Adding the values makes the audit trail actually land.

ALTER TABLE audit_log DROP CONSTRAINT audit_log_action_check;

ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN (
    -- Financial
    'WALLET_CREDIT',
    'WALLET_DEBIT',
    'LEDGER_POSTING',
    'SETTLEMENT_SUBMITTED',
    'SETTLEMENT_CONFIRMED',
    'PAYOUT_INITIATED',
    'PAYOUT_CONFIRMED',
    'ACQUIRING_CALLBACK_RECEIVED',
    'ACQUIRING_SETTLED',
    'DEPOSIT_INITIATED',
    'DEPOSIT_SETTLED',
    'TRANSFER_COMPLETED',
    -- Refunds & disputes (added 0045)
    'REFUND_PROCESSED',
    'DISPUTE_OPENED',
    'DISPUTE_RESOLVED',
    -- Risk / fraud
    'ACCOUNT_FROZEN',
    'ACCOUNT_UNFROZEN',
    'RISK_FLAG_RAISED',
    'RISK_FLAG_RESOLVED',
    'SUSPICIOUS_ACTIVITY_DETECTED',
    -- Admin
    'ADMIN_CREDIT',
    'MERCHANT_SUSPENDED',
    'CONSUMER_SUSPENDED',
    'API_KEY_REVOKED',
    'KYC_STATUS_CHANGED',
    'RECONCILIATION_RUN'
));
