-- Every action core writes to the audit log is one the log accepts.
--
-- audit_log.action is CHECKed against a list, and core writes its audit rows
-- fire-and-forget. Two actions the code writes were never added to the list, so
-- every such row was refused and the refusal discarded: each consumer pay-link
-- payment (CONSUMER_PAY_LINK_PAID) left no audit record at all, and so would a
-- paid payment request (PAYMENT_REQUEST_PAID; that route is unmounted). Found
-- while giving operator actions their operator (A5-13). Additive: the list is
-- 0126's plus these two, so it only grows, and core now logs a refused write instead of dropping it silently.

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
    'RECONCILIATION_RUN',
    'REFUND_PROCESSED',
    'RISK_FLAG_RAISED',
    'RISK_FLAG_RESOLVED',
    'SANDBOX_FUNDS_RETIRED',
    'SETTLEMENT_CONFIRMED',
    'SETTLEMENT_SUBMITTED',
    'SUSPICIOUS_ACTIVITY_DETECTED',
    'TRANSFER_COMPLETED',
    'WALLET_ACCOUNT_CLOSED',
    'WALLET_CREDIT',
    'WALLET_DEBIT'
]::text[]));
