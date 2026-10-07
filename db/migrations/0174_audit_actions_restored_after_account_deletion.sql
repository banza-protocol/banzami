-- 0174 — Restore the audited actions dropped by 0168 (audit list is append-only).
--
-- 0168 (account deletion) rebuilt audit_log_action_check from scratch to add
-- CONSUMER_DELETED / BUSINESS_DELETED, but restated the ARRAY from an incomplete
-- snapshot and silently dropped EIGHT actions that 0142/0146/0149 had added:
--
--   * PRICING_PROFILE_ASSIGNED      — an operator assigns a pricing profile.   (live)
--   * SANDBOX_BUSINESS_PROVISIONED  — self-service Sandbox provisioning, and    (live)
--                                     the setup every project-deletion test runs.
--   * SANDBOX_PENDING_CASH_IN_FAILED, SANDBOX_PROJECT_RETIRED, SANDBOX_RESET,
--     SANDBOX_TEST_FUNDING, SANDBOX_TEST_PAYER_CREATED, SANDBOX_TEST_PAYER_RETIRED
--                                     — once-valid Sandbox actions (append-only).
--
-- The two live actions make every code path that records them fail closed with a
-- 500 (new row violates audit_log_action_check): the Rust guard
-- core/api/src/routes/risk.rs (every_audited_action_is_accepted_by_the_log)
-- catches the drift, and the sandbox_project_deletion tests hit it directly.
--
-- The audit allow-list is append-only (tests/ops/audit-action-list-only-grows):
-- once an action is valid it stays valid, because audit_log is append-only. An
-- applied migration is immutable (sqlx checksums), so the only safe correction is
-- a forward repair that restores the full historical union. This ARRAY is exactly
-- that union. Schema-only; no value moves.

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
    'BUSINESS_DELETED',
    'CONSUMER_DELETED',
    'CONSUMER_EMAIL_VERIFIED',
    'CONSUMER_PAY_LINK_PAID',
    'CONSUMER_PIN_CHANGED',
    'CONSUMER_PIN_RESET',
    'CONSUMER_SUSPENDED',
    'DEPOSIT_INITIATED',
    'DEPOSIT_SETTLED',
    'DISPUTE_OPENED',
    'DISPUTE_RESOLVED',
    'KYC_STATUS_CHANGED',
    'LEDGER_POSTING',
    'MERCHANT_SUSPENDED',
    'OTP_RATE_LIMITED',
    'PAYMENT_REQUEST_PAID',
    'PAYOUT_CONFIRMED',
    'PAYOUT_INITIATED',
    'PIN_LOGIN_LOCKED',
    'PIN_RECOVERY_COMPLETED',
    'PIN_RECOVERY_REQUIRED',
    'PRICING_PROFILE_ASSIGNED',
    'QR_PAYMENT_COMPLETED',
    'RECONCILIATION_RUN',
    'RECOVERY_EMAIL_ADDED',
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
    'SOURCE_RATE_LIMITED',
    'SUSPICIOUS_ACTIVITY_DETECTED',
    'TRANSFER_COMPLETED',
    'WALLET_ACCOUNT_CLOSED',
    'WALLET_CREDIT',
    'WALLET_DEBIT'
]));
