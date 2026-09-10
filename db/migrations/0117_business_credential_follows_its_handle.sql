-- A Business App credential signs in as the owner of its handle.
--
-- `merchant_app_credentials` is the Business App login: a @handle and a PIN. The
-- handle is a foreign key into the global registry, which says who owns it. The
-- credential also carries its own `merchant_id` — and nothing required the two to
-- agree. When a handle moved (0112 consolidated one onto the canonical owner of a
-- sealed Developer Project binding, and moved the public profile with it), the
-- credential stayed behind. Signing in with that handle then issued a session
-- for the PREVIOUS owner: the app showed the handle, and every financial call
-- read a different Business Account than the one the handle, the Project and the
-- funds belong to.
--
-- This moves any such credential to the handle's current owner, under
-- preconditions that make the move safe. It names no business and no handle:
-- it is the invariant, applied to whatever rows violate it. The login path
-- enforces the same invariant from now on (a credential whose merchant does not
-- own its handle cannot sign in), so a future move cannot recreate the split
-- silently.
--
-- Preconditions, each fail-closed — a credential is the authority to act for a
-- Business, and moving authority must not be possible if it would hijack
-- anything:
--   - the handle's current owner is a MERCHANT, and ACTIVE;
--   - that owner has no credential of its own in the same environment;
--   - the credential's current merchant owns NO handle at all (it lost this one
--     and has no other identity the credential could still mean);
--   - the credential's current merchant has no financial history.
-- Idempotent: afterwards no row violates the invariant, so a re-run moves none.

-- The system trail must be able to record the move.
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
    'BUSINESS_CREDENTIAL_REASSIGNED']::text[]));

DO $$
DECLARE
    r RECORD;
    v_owner_status TEXT;
    v_owner_has_cred INT;
    v_from_handles INT;
    v_from_entries INT;
BEGIN
    FOR r IN
        SELECT c.handle, c.environment, c.merchant_id AS from_merchant,
               hr.owner_id AS to_merchant, hr.owner_type
          FROM merchant_app_credentials c
          JOIN handle_registry hr ON hr.handle = c.handle
         WHERE hr.owner_id IS DISTINCT FROM c.merchant_id
    LOOP
        IF r.owner_type IS DISTINCT FROM 'MERCHANT' OR r.to_merchant IS NULL THEN
            RAISE EXCEPTION '0117: @% is owned by % %, not a merchant — refusing to move its Business credential',
                r.handle, r.owner_type, r.to_merchant;
        END IF;

        SELECT status INTO v_owner_status FROM merchants WHERE id = r.to_merchant;
        IF v_owner_status IS DISTINCT FROM 'ACTIVE' THEN
            RAISE EXCEPTION '0117: the owner of @% is %, not ACTIVE', r.handle, COALESCE(v_owner_status, '<missing>');
        END IF;

        SELECT count(*) INTO v_owner_has_cred
          FROM merchant_app_credentials
         WHERE merchant_id = r.to_merchant AND environment = r.environment;
        IF v_owner_has_cred <> 0 THEN
            RAISE EXCEPTION '0117: the owner of @% already has a % Business credential — two would compete', r.handle, r.environment;
        END IF;

        SELECT count(*) INTO v_from_handles
          FROM handle_registry WHERE owner_type = 'MERCHANT' AND owner_id = r.from_merchant;
        IF v_from_handles <> 0 THEN
            RAISE EXCEPTION '0117: the credential''s merchant still owns % handle(s) — refusing to move its login', v_from_handles;
        END IF;

        SELECT count(e.id) INTO v_from_entries
          FROM ledger_entries e
         WHERE e.account_id IN (
                SELECT available_account_id FROM wallets WHERE merchant_id = r.from_merchant
                UNION SELECT reserved_account_id FROM wallets WHERE merchant_id = r.from_merchant
                UNION SELECT wa.account_id FROM wallet_accounts wa
                        JOIN wallets w ON w.id = wa.wallet_id WHERE w.merchant_id = r.from_merchant);
        IF v_from_entries <> 0 THEN
            RAISE EXCEPTION '0117: the credential''s merchant has financial history (% entries) — not a stale login', v_from_entries;
        END IF;

        INSERT INTO audit_log (actor, action, subject, metadata)
        VALUES ('MIGRATION:0117', 'BUSINESS_CREDENTIAL_REASSIGNED', 'merchant:' || r.to_merchant,
                jsonb_build_object('handle', r.handle, 'environment', r.environment,
                                   'from_merchant', r.from_merchant, 'to_merchant', r.to_merchant,
                                   'reason', 'the Business credential follows the owner of its handle'));

        -- The PIN is the person's, not the row's: it moves with the credential.
        -- Lockout counters reset — they described attempts against the old owner.
        UPDATE merchant_app_credentials
           SET merchant_id = r.to_merchant, failed_attempts = 0, locked_until = NULL, updated_at = now()
         WHERE handle = r.handle;
    END LOOP;
END $$;
