-- 0147 — A balance is an obligation, and what backs it is explicit.
--
-- MONEY-MODEL-001 (ADR-063). Every participant balance in Banzami is a LIABILITY
-- account: an obligation of Banzami to that participant, derived from immutable
-- ledger entries. What supports those obligations is a set of ASSET positions
-- outside the network — a bank or custodian account, funds held by an acquirer
-- on their way there. Until now the ledger could only tell them apart by the
-- account's display name, and nothing said which accounts back which.
--
-- This migration gives every account an economic class:
--
--   * System accounts carry an explicit `system_role`, constrained to the only
--     account type that role can have. Core registers the role of the accounts
--     it is configured with at boot (core/api/src/main.rs) and marks them
--     `synthetic` in the Sandbox, where no real bank or provider stands behind
--     them. The existing accounts are backfilled here by the names Core gave
--     them.
--   * Participant accounts are classified by what owns them — a consumer
--     wallet, a Business wallet or one of its wallet accounts — in the view
--     `ledger_account_economic_classes`, so an account created by any path is
--     classified the moment its owner exists, and no second copy of ownership
--     is kept.
--
-- It also creates the account a withdrawal waits in. A payout used to credit the
-- bank ASSET the moment it was processed — before any rail had executed it — and
-- a failure restored the participant from there. The obligation now moves to
-- WITHDRAWALS_IN_FLIGHT when the payout is processed, and the backing asset only
-- decreases when the payout is CONFIRMED (core/payouts).
--
-- Accounts stay immutable in type and currency; nothing here edits an entry, a
-- posting or a balance.

ALTER TABLE ledger_accounts
    ADD COLUMN IF NOT EXISTS system_role TEXT,
    ADD COLUMN IF NOT EXISTS synthetic   BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE ledger_accounts DROP CONSTRAINT IF EXISTS ledger_accounts_system_role_check;
ALTER TABLE ledger_accounts
    ADD CONSTRAINT ledger_accounts_system_role_check CHECK (
        system_role IS NULL
        OR (system_role, account_type) IN (
            -- A bank or approved custodian position that backs participant obligations.
            ('EXTERNAL_BACKING',      'ASSET'),
            -- Funds confirmed at an acquirer/provider, not yet settled to backing.
            ('EXTERNAL_TRANSIT',      'ASSET'),
            -- Obligations reserved for a withdrawal that a rail has not confirmed.
            ('WITHDRAWALS_IN_FLIGHT', 'LIABILITY'),
            -- Fees Banzami has earned: Banzami's own position, never a customer's.
            ('OPERATOR_REVENUE',      'REVENUE'),
            -- What an acquirer or provider kept from value it settled: Banzami's cost.
            ('EXTERNAL_COSTS',        'EXPENSE')
        ));

ALTER TABLE ledger_accounts DROP CONSTRAINT IF EXISTS ledger_accounts_synthetic_is_a_system_account;
ALTER TABLE ledger_accounts
    ADD CONSTRAINT ledger_accounts_synthetic_is_a_system_account CHECK (NOT synthetic OR system_role IS NOT NULL);

COMMENT ON COLUMN ledger_accounts.system_role IS
    'MONEY-MODEL-001: the economic role of a system account. NULL for participant accounts, which are classified by their owner in ledger_account_economic_classes.';
COMMENT ON COLUMN ledger_accounts.synthetic IS
    'MONEY-MODEL-001: true for a system account that stands for no real bank, custodian or provider position (the Public Sandbox). Set by Core at boot from its declared environment.';

-- The names Core has always created its system accounts with (core/api/src/main.rs).
UPDATE ledger_accounts SET system_role = 'EXTERNAL_TRANSIT'
 WHERE system_role IS NULL AND account_type = 'ASSET' AND name = 'System — Acquiring Transit';
UPDATE ledger_accounts SET system_role = 'EXTERNAL_BACKING'
 WHERE system_role IS NULL AND account_type = 'ASSET' AND name = 'System — Bank Settlement';
UPDATE ledger_accounts SET system_role = 'OPERATOR_REVENUE'
 WHERE system_role IS NULL AND account_type = 'REVENUE' AND name = 'Operator — Fee Revenue';

-- One in-flight account per currency. Its id is a constant of Core
-- (banzami_ledger::system::WITHDRAWALS_IN_FLIGHT_AOA), so every database that
-- runs this migration has it and no environment variable can point elsewhere.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_accounts_one_in_flight_per_currency
    ON ledger_accounts (currency) WHERE system_role = 'WITHDRAWALS_IN_FLIGHT';

INSERT INTO ledger_accounts (id, account_type, name, currency, system_role)
VALUES ('0a11f170-0000-4000-8000-00000000a0a0', 'LIABILITY', 'System — Withdrawals In Flight', 'AOA', 'WITHDRAWALS_IN_FLIGHT')
ON CONFLICT (id) DO NOTHING;

-- An acquirer settles a batch net of its fee. The confirmation used to move only
-- the net from transit to backing and recognise the fee nowhere, so the fee stayed
-- in transit as value no provider held. It is now an expense (core/settlement).
CREATE UNIQUE INDEX IF NOT EXISTS ledger_accounts_one_external_costs_per_currency
    ON ledger_accounts (currency) WHERE system_role = 'EXTERNAL_COSTS';

INSERT INTO ledger_accounts (id, account_type, name, currency, system_role)
VALUES ('0a11f170-0000-4000-8000-00000000a0a1', 'EXPENSE', 'System — Acquirer Fees', 'AOA', 'EXTERNAL_COSTS')
ON CONFLICT (id) DO NOTHING;

-- Every account, and what it is economically. Precedence: an explicit system
-- role; then the owner. An account nothing owns and nothing ever posted to is
-- UNOWNED_EMPTY (an onboarding that stopped after creating it) and holds no
-- value; an account nothing owns that HAS entries is UNCLASSIFIED, which the
-- economic integrity check treats as a defect.
CREATE OR REPLACE VIEW ledger_account_economic_classes AS
SELECT
    a.id           AS account_id,
    a.account_type,
    a.currency,
    a.synthetic,
    CASE
        WHEN a.system_role IS NOT NULL THEN a.system_role
        WHEN EXISTS (SELECT 1 FROM consumer_wallets w WHERE w.available_account_id = a.id) THEN 'PARTICIPANT_AVAILABLE'
        WHEN EXISTS (SELECT 1 FROM consumer_wallets w WHERE w.reserved_account_id  = a.id) THEN 'PARTICIPANT_RESERVED'
        WHEN EXISTS (SELECT 1 FROM wallets w WHERE w.available_account_id = a.id)
          OR EXISTS (SELECT 1 FROM wallet_accounts w WHERE w.account_id = a.id)           THEN 'BUSINESS_AVAILABLE'
        WHEN EXISTS (SELECT 1 FROM wallets w WHERE w.reserved_account_id = a.id)          THEN 'BUSINESS_RESERVED'
        WHEN NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.account_id = a.id)        THEN 'UNOWNED_EMPTY'
        ELSE 'UNCLASSIFIED'
    END AS economic_class
FROM ledger_accounts a;

COMMENT ON VIEW ledger_account_economic_classes IS
    'MONEY-MODEL-001: the economic class of every ledger account — a system role, or the owner that makes it a participant or Business obligation.';

-- A payout that a rail was asked to execute is only failed or returned on the
-- rail's word: the provider's rejection or return reference is recorded with it.
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS failure_evidence_ref TEXT;
COMMENT ON COLUMN payouts.failure_evidence_ref IS
    'MONEY-MODEL-001: the external evidence (provider rejection or return reference) that a SENT payout did not execute. Required to fail or return a SENT payout: a timeout is not a failure.';
