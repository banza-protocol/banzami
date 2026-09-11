-- 0126 — the audit trail can record two operator lifecycles.
--
-- WALLET_ACCOUNT_CLOSED: a segregated wallet account reaches its end state
--   (POST /internal/v1/wallet-accounts/:id/close). Accounts are never deleted;
--   closing is how one leaves every active list and stops receiving or sending.
-- SANDBOX_FUNDS_RETIRED: synthetic Sandbox value leaves circulation by a
--   balanced posting back to the transit account it was issued from
--   (POST /internal/v1/sandbox/retire-funds). Sandbox only.
--
-- Additive: every existing action stays allowed.

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
    'BUSINESS_ACCOUNT_TYPE_CHANGED',
    'BUSINESS_CREDENTIAL_REASSIGNED',
    'WALLET_ACCOUNT_CLOSED',
    'SANDBOX_FUNDS_RETIRED']::text[]));
