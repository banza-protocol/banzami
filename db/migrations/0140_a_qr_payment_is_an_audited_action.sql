-- Paying a structured QR is an action the audit log accepts.
--
-- audit_log.action is CHECKed against a list and core writes its audit rows
-- fire-and-forget, so an action missing from the list leaves no record at all —
-- the write is refused and the refusal discarded. That is how consumer pay-link
-- payments went unaudited until 0134.
--
-- QR_PAYMENT_COMPLETED is written by the QR-pay route (CAP-PAY-003). A payment
-- that moves money and leaves no trace of who moved it is exactly what an audit
-- log exists to prevent, so the list is extended before the route ships rather
-- than after somebody notices the gap.
--
-- Additive: 0134's list plus this one. The list only ever grows.

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
    'QR_PAYMENT_COMPLETED',
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
