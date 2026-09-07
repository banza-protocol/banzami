-- Pricing Model V2, step 2: every profile gets an explicit rule per operation.
--
-- Still additive. The wildcard rules stay in place and keep working; the
-- resolver has not been taught to prefer or require the explicit ones yet. This
-- migration only makes the explicit policy EXIST, so the completeness gate can
-- prove it complete before anything depends on it.
--
-- ── THE PROBLEM BEING FIXED ────────────────────────────────────────────────
--
-- Both deployed profile rules leave every dimension NULL except the profile:
--
--   sandbox-default-zero   profile=sandbox-default        0 bps, operation *
--   sandbox-donation-200   profile=sandbox-donation-200 200 bps, operation *
--
-- A wildcard operation means a fee-bearing operation introduced tomorrow
-- inherits that rate the day it ships — free under one profile, 200 bps under
-- the other, with nobody deciding either.
--
-- ── THE RATES, AND WHERE THEY COME FROM ────────────────────────────────────
--
-- Nothing here is invented. Each rate is the one already in force:
--
--   SETTLEMENT 0 bps   the explicit Sandbox zero a self-service owner gets
--   SETTLEMENT 200 bps the current nonzero Sandbox policy
--   PAYOUT     75 bps  Banzami ADR-031, restored under REPAIR_LOG RA-063 and
--                      corroborated by the ledger: 15 processed payouts, gross
--                      1 060 000, fee 7 950 — exactly 0.75% to the minor unit
--
-- Payout is priced identically under every profile because that is what is
-- deployed today: the withdrawal rule carries no profile, so it applies to
-- everyone. Making it per-profile is now POSSIBLE without changing anyone's
-- rate, which is the point.
--
-- ── THE NEW PROFILE CODE ───────────────────────────────────────────────────
--
-- `sandbox-donation-200` names a business vertical and a rate. Neither belongs
-- in an identity: the vertical is not what the profile depends on, and the rate
-- will change. Moving settlement to 150 bps would leave a profile called
-- "…-200" charging 150, or force an identity change that rewrites what
-- historical rows point at.
--
-- `sandbox-reference` names what it is: the priced plan, as opposed to the
-- free default a self-service owner receives. It survives a rate change, and it
-- carries no tenant identity — an ordinary owner assigned the same plan gets
-- identical economics.
--
-- The old profile is NOT retired here. Owners are still assigned to it and
-- historical rows reference it by code; moving them is a later step.

-- ── the stable commercial profile ──────────────────────────────────────────

INSERT INTO pricing_profiles (id, code, name, description, enabled, environment)
SELECT gen_random_uuid(), 'sandbox-reference', 'Sandbox reference',
       'The reference Sandbox plan carrying the operator nonzero policy, as opposed to the free default. Rates live in its per-operation rules, so the code stays valid when a rate changes.',
       true, 'SANDBOX'
 WHERE NOT EXISTS (
   SELECT 1 FROM pricing_profiles WHERE environment = 'SANDBOX' AND code = 'sandbox-reference');

-- ── explicit per-operation rules ───────────────────────────────────────────
--
-- Guarded on (environment, profile, operation) — the resolution key — rather
-- than on rule_key. What must not be duplicated is "a rule that prices this
-- operation for this profile", not "a rule with this name".

INSERT INTO pricing_rules
  (id, rule_key, version, environment, enabled, pricing_profile, pricing_operation,
   rate_bps, flat_minor, rounding, priority, description)
SELECT gen_random_uuid(), 'sandbox-default-settlement', 1, 'SANDBOX', true,
       'sandbox-default', 'SETTLEMENT', 0, 0, 'HALF_UP', 100,
       'Explicit zero settlement for the Sandbox default plan. Zero because a rule says zero, not because none matched.'
 WHERE NOT EXISTS (
   SELECT 1 FROM pricing_rules
    WHERE environment = 'SANDBOX' AND pricing_profile = 'sandbox-default'
      AND pricing_operation = 'SETTLEMENT');

INSERT INTO pricing_rules
  (id, rule_key, version, environment, enabled, pricing_profile, pricing_operation,
   rate_bps, flat_minor, rounding, priority, description)
SELECT gen_random_uuid(), 'sandbox-default-payout', 1, 'SANDBOX', true,
       'sandbox-default', 'PAYOUT', 75, 0, 'HALF_UP', 100,
       'Withdrawal fee 0.75% (Banzami ADR-031), the rate already in force for every Sandbox owner. See REPAIR_LOG RA-063.'
 WHERE NOT EXISTS (
   SELECT 1 FROM pricing_rules
    WHERE environment = 'SANDBOX' AND pricing_profile = 'sandbox-default'
      AND pricing_operation = 'PAYOUT');

INSERT INTO pricing_rules
  (id, rule_key, version, environment, enabled, pricing_profile, pricing_operation,
   rate_bps, flat_minor, rounding, priority, description)
SELECT gen_random_uuid(), 'sandbox-reference-settlement', 1, 'SANDBOX', true,
       'sandbox-reference', 'SETTLEMENT', 200, 0, 'HALF_UP', 100,
       'Settlement at 200 bps — the current nonzero Sandbox policy, carried over from sandbox-donation-200 unchanged.'
 WHERE NOT EXISTS (
   SELECT 1 FROM pricing_rules
    WHERE environment = 'SANDBOX' AND pricing_profile = 'sandbox-reference'
      AND pricing_operation = 'SETTLEMENT');

INSERT INTO pricing_rules
  (id, rule_key, version, environment, enabled, pricing_profile, pricing_operation,
   rate_bps, flat_minor, rounding, priority, description)
SELECT gen_random_uuid(), 'sandbox-reference-payout', 1, 'SANDBOX', true,
       'sandbox-reference', 'PAYOUT', 75, 0, 'HALF_UP', 100,
       'Withdrawal fee 0.75% (Banzami ADR-031). Identical to the default plan because that is the rate deployed for everyone today.'
 WHERE NOT EXISTS (
   SELECT 1 FROM pricing_rules
    WHERE environment = 'SANDBOX' AND pricing_profile = 'sandbox-reference'
      AND pricing_operation = 'PAYOUT');

-- Transitional, for owners still assigned to the old profile: the same rates,
-- named by operation, so they resolve correctly under the operation-aware
-- resolver during the window before they are moved.
INSERT INTO pricing_rules
  (id, rule_key, version, environment, enabled, pricing_profile, pricing_operation,
   rate_bps, flat_minor, rounding, priority, description)
SELECT gen_random_uuid(), 'sandbox-donation-200-settlement', 1, 'SANDBOX', true,
       'sandbox-donation-200', 'SETTLEMENT', 200, 0, 'HALF_UP', 100,
       'Transitional: the same 200 bps settlement, named by operation, for owners not yet moved to sandbox-reference.'
 WHERE NOT EXISTS (
   SELECT 1 FROM pricing_rules
    WHERE environment = 'SANDBOX' AND pricing_profile = 'sandbox-donation-200'
      AND pricing_operation = 'SETTLEMENT');

INSERT INTO pricing_rules
  (id, rule_key, version, environment, enabled, pricing_profile, pricing_operation,
   rate_bps, flat_minor, rounding, priority, description)
SELECT gen_random_uuid(), 'sandbox-donation-200-payout', 1, 'SANDBOX', true,
       'sandbox-donation-200', 'PAYOUT', 75, 0, 'HALF_UP', 100,
       'Transitional: withdrawal at the deployed 0.75%, named by operation.'
 WHERE NOT EXISTS (
   SELECT 1 FROM pricing_rules
    WHERE environment = 'SANDBOX' AND pricing_profile = 'sandbox-donation-200'
      AND pricing_operation = 'PAYOUT');

-- ── the network-wide withdrawal rule names its operation ──────────────────
--
-- 0108 seeded wallet_withdrawal_default before pricing_operation existed, so it
-- carries none — and under the V2 resolver an operation-less rule applies to
-- NOTHING, not to everything. Left as it was, every withdrawal would resolve no
-- rule the moment the operation-aware resolver deployed.
--
-- This rule is deliberately not profile-pinned: the deployed withdrawal rate is
-- network-wide, applying to every owner. Under V2 a rule with no profile prices
-- every profile, which preserves exactly that.
--
-- Found by the payout integration suite: the bank leg carried the gross instead
-- of the net, because the fee resolved to zero. Which is the resolver being
-- right and the migration being incomplete.
-- It is superseded rather than relabelled.
--
-- Naming its operation was the first instinct and it created a collision the
-- completeness gate caught immediately: a rule with no profile prices EVERY
-- profile, so sandbox-reference would have had two applicable PAYOUT rules —
-- its own, and this one. That is precisely the ambiguity the model now refuses,
-- introduced by the migration meant to remove ambiguity.
--
-- So its effective window is CLOSED instead. The rule is not deleted and not
-- disabled: it was genuinely in force until this moment, and a payout priced by
-- it must stay explicable. Closing the window is the truthful record — in force
-- until here, superseded by the per-profile rules from here.
--
-- The per-profile rules open at the same instant, so there is no interval in
-- which a withdrawal resolves nothing.
UPDATE pricing_rules
   SET effective_to = now(),
       description  = COALESCE(description, '')
                      || ' Superseded by the per-profile PAYOUT rules (0110); window closed rather than deleted so payouts priced by it stay explicable.'
 WHERE environment = 'SANDBOX'
   AND transaction_type = 'wallet_withdrawal'
   AND pricing_operation IS NULL
   AND effective_to IS NULL;

-- ── overlap prevention ─────────────────────────────────────────────────────
--
-- One rule per (environment, profile, operation) among ENABLED, open-ended
-- rules. This makes the ">1 applicable rules" case impossible in the database
-- rather than resolved at runtime by comparing UUIDs, which is what the engine
-- does today and must stop doing.
--
-- Scoped to open-ended rules because a closed window is history: two rules may
-- legitimately exist for the same key at different times.
CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_one_per_profile_operation
  ON pricing_rules (environment, pricing_profile, pricing_operation)
  WHERE enabled AND pricing_operation IS NOT NULL AND effective_to IS NULL;
