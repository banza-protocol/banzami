-- Migration 0025: Immutable audit log
--
-- audit_log stores every significant system action with actor, subject,
-- and a JSONB payload. It is append-only — no row is ever updated or deleted.
-- This satisfies: traceability, replay protection, and compliance export.

CREATE TABLE audit_log (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Who performed the action: 'SYSTEM', 'ADMIN:<id>', 'MERCHANT:<id>', 'CONSUMER:<id>'
    actor         TEXT        NOT NULL,
    action        TEXT        NOT NULL CHECK (action IN (
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
                  )),
    -- Subject of the action: 'WALLET:<id>', 'MERCHANT:<id>', etc.
    subject       TEXT        NOT NULL,
    -- Freeform details: amounts, reasons, request IDs, etc.
    metadata      JSONB       NOT NULL DEFAULT '{}',
    -- The request correlation ID from X-Request-ID, if available.
    request_id    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optimised for compliance queries: by subject (all actions on one entity),
-- by action (all settlements, all freezes), and by time.
CREATE INDEX audit_log_subject_idx    ON audit_log (subject, created_at DESC);
CREATE INDEX audit_log_action_idx     ON audit_log (action, created_at DESC);
CREATE INDEX audit_log_actor_idx      ON audit_log (actor, created_at DESC);
CREATE INDEX audit_log_request_id_idx ON audit_log (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);

-- Prevent any future accidental UPDATE/DELETE via a rule.
-- (Actual immutability enforced at the application layer — no ORM should
-- issue updates to this table.)
COMMENT ON TABLE audit_log IS
    'Immutable financial and operational audit trail. Never update or delete rows.';
