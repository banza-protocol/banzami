-- 0149 — A retired Sandbox Business keeps no pending cash-in.
--
-- MONEY-MODEL-001. Sandbox retirement now fails hosted payments still waiting
-- for the simulated rail on the links it cancels (core/api/src/routes/
-- sandbox_reset.rs, fail_pending_cash_in): a later confirmation of one would
-- have credited a Business that no longer exists for anyone. Businesses retired
-- before that change can have such a payment left; Core's operator route
-- POST /internal/v1/sandbox/businesses/:merchant_id/fail-pending-cash-in applies
-- the same step to an already-retired Business, and records it under this
-- action. It moves no value: the payments never credited anything.

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
    'PRICING_PROFILE_ASSIGNED',
    'QR_PAYMENT_COMPLETED',
    'RECONCILIATION_RUN',
    'REFUND_PROCESSED',
    'RISK_FLAG_RAISED',
    'RISK_FLAG_RESOLVED',
    'SANDBOX_BUSINESS_PROVISIONED',
    'SANDBOX_FUNDS_RETIRED',
    'SANDBOX_PENDING_CASH_IN_FAILED',
    'SANDBOX_PROJECT_RETIRED',
    'SANDBOX_RESET',
    'SANDBOX_TEST_FUNDING',
    'SANDBOX_TEST_PAYER_CREATED',
    'SANDBOX_TEST_PAYER_RETIRED',
    'SETTLEMENT_CONFIRMED',
    'SETTLEMENT_SUBMITTED',
    'SUSPICIOUS_ACTIVITY_DETECTED',
    'TRANSFER_COMPLETED',
    'WALLET_ACCOUNT_CLOSED',
    'WALLET_CREDIT',
    'WALLET_DEBIT'
]::text[]));
