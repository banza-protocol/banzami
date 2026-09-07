-- The withdrawal rate becomes a repository fact, not a row someone remembered
-- to re-add.
--
-- WHY THIS EXISTS
--
-- core/payouts prices withdrawals against transaction_type = 'wallet_withdrawal'
-- and treats "no matching rule" as a fee of zero. That is the same defect class
-- closed on capture and settlement — an absent decision and a decision of zero
-- are the same number in a ledger — and on this path it has already happened.
--
-- evidence/assurance/payouts/cap-payout-001-sandbox-e2e.json records it: the
-- first run of the payout harness measured a fee of ZERO because pricing_rules
-- was empty on the deployed Sandbox after a financial reset. The operator moved
-- money out and charged nothing, and the only thing that noticed was a test
-- asserting an amount. The repair (REPAIR_LOG RA-063) was to re-add the row by
-- hand, which restored the rate and left the identical failure available for the
-- next time the row is absent.
--
-- So the rate is written down here. Nothing about this migration changes
-- behaviour: it makes the rule survive a reset.
--
-- WHAT RATE
--
-- Exactly the rule currently live in the Sandbox, read from it rather than
-- chosen:
--
--   rule_key           wallet_withdrawal_default
--   transaction_type   wallet_withdrawal
--   rate_bps           75          (0.75%, Banzami ADR-031)
--   flat_minor         0
--   rounding           HALF_UP
--   priority           100
--   environment        SANDBOX
--
-- SANDBOX only. LIVE financial operation is NOT READY and fail-closed, and
-- seeding a LIVE rate here would quietly create the authority for one.
--
-- Idempotent on (environment, transaction_type): re-running touches nothing,
-- and the deployed Sandbox — which already carries this rule — is unchanged by
-- it. The guard is on the MATCHING DIMENSION rather than on rule_key, because
-- what must not be duplicated is "a rule that applies to a Sandbox withdrawal",
-- not "a rule with this name".

INSERT INTO pricing_rules
  (id, rule_key, version, environment, enabled, transaction_type,
   rate_bps, flat_minor, rounding, priority, description)
SELECT gen_random_uuid(), 'wallet_withdrawal_default', 1, 'SANDBOX', true, 'wallet_withdrawal',
       75, 0, 'HALF_UP', 100,
       'Operator withdrawal fee 0.75% (Banzami ADR-031). Seeded durably so a financial reset cannot silently make withdrawals free — see REPAIR_LOG RA-063.'
 WHERE NOT EXISTS (
   SELECT 1 FROM pricing_rules
    WHERE environment = 'SANDBOX'
      AND transaction_type = 'wallet_withdrawal'
      AND enabled);
