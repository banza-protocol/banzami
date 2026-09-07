-- Pricing Model V2, step 1: give a rule an OPERATION, and give a payout a memory.
--
-- Purely additive. Nothing refuses yet, nothing is removed, and every existing
-- rule keeps working exactly as it does today. The refusals come later, after
-- the completeness gate proves they would refuse nothing legitimate.
--
-- ── WHY AN OPERATION DIMENSION ──────────────────────────────────────────────
--
-- The audit's P0: the engine could not tell a settlement from a capture.
-- `transaction_type` was the only operation discriminator and only the payout
-- path ever set it — capture and application settlement both passed NULL. So a
-- rule pinned to an operation could never match either of them, and a rule that
-- matched settlement necessarily also matched capture. There was no way to
-- write a settlement-only rate.
--
-- `pricing_operation` is that missing dimension, and it is deliberately NOT
-- `transaction_type` reused. A transaction type describes a row in
-- `transactions`; a pricing operation names an economic act the operator
-- charges for. Conflating them is what produced a rule
-- (`donation-standard`, transaction_type = 'payment') that has never matched
-- anything and cannot.
--
-- Released values are SETTLEMENT and PAYOUT — the only two fee-bearing
-- operations under the confirmed economic model. Transfer is neutral because it
-- also carries P2P; payment and donation credit gross; capture is leaving
-- operator pricing entirely; refund creates no new fee.
--
-- NULL is still permitted at this step, because every existing rule has no
-- operation and the resolver has not been taught to require one. A later
-- migration adds the NOT NULL once nothing legitimate is NULL.
--
-- ── WHY PAYOUTS GET A SNAPSHOT ──────────────────────────────────────────────
--
-- `payouts` recorded no pricing evidence at all: amount_minor and nothing else.
-- Capture writes `operator_fees` and settlement writes `pricing_snapshot_json`;
-- a withdrawal's decision survived only as a ledger posting.
--
-- Reconstructing the RA-063 incident required joining `payouts` to
-- `ledger_postings` on a derived idempotency key (`<key>:process:fee`) to
-- discover that one 80 000 withdrawal on 2026-09-05 06:55:36 carried no fee
-- because the rule was created 73 seconds later. A completed payout should be
-- able to answer "what rule, what version, what rate, what fee" from its own
-- row.
--
-- All nullable: historical payouts genuinely have no snapshot, and inventing
-- one for them would be worse than admitting it.

ALTER TABLE pricing_rules
  ADD COLUMN IF NOT EXISTS pricing_operation text;

-- The released set. Extending it is an economic decision: a new value here
-- means a new place the operator charges, and the completeness gate is written
-- so that adding one without a policy fails.
ALTER TABLE pricing_rules
  DROP CONSTRAINT IF EXISTS pricing_rules_operation_check;
ALTER TABLE pricing_rules
  ADD CONSTRAINT pricing_rules_operation_check
  CHECK (pricing_operation IS NULL OR pricing_operation IN ('SETTLEMENT', 'PAYOUT'));

-- Resolution is (profile, operation, environment) + time. This index is the
-- shape of that lookup.
CREATE INDEX IF NOT EXISTS idx_pricing_rules_profile_operation
  ON pricing_rules (environment, pricing_profile, pricing_operation)
  WHERE enabled;

-- ── payout pricing snapshot ────────────────────────────────────────────────

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS fee_minor            bigint;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS net_minor            bigint;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS pricing_rule_id      uuid;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS pricing_rule_version integer;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS pricing_rate_bps     integer;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS pricing_decided_at   timestamptz;

ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_fee_nonneg;
ALTER TABLE payouts
  ADD CONSTRAINT payouts_fee_nonneg
  CHECK (fee_minor IS NULL OR fee_minor >= 0);

-- A fee can never exceed the gross it was taken from. The engine already
-- refuses this; the database says so too, because an invariant worth enforcing
-- in one place is worth enforcing in the place that cannot be bypassed.
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_fee_within_gross;
ALTER TABLE payouts
  ADD CONSTRAINT payouts_fee_within_gross
  CHECK (fee_minor IS NULL OR fee_minor <= amount_minor);

COMMENT ON COLUMN pricing_rules.pricing_operation IS
  'The fee-bearing economic operation this rule prices: SETTLEMENT or PAYOUT. NULL is legacy and will become invalid once every runtime rule names its operation.';
COMMENT ON COLUMN payouts.pricing_rule_id IS
  'The rule that priced this payout, captured at the decision point. NULL for payouts processed before the snapshot existed.';
