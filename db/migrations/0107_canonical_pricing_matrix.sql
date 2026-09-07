-- The canonical Sandbox pricing matrix.
--
--   | profile           | SETTLEMENT | PAYOUT |
--   |-------------------|------------|--------|
--   | sandbox-default   | 0 bps      | 75 bps |
--   | sandbox-reference | 200 bps    | 75 bps |
--
-- Four rules, two profiles, every cell explicit. Nothing is a wildcard and
-- nothing is implied: sandbox-default settles at zero because a rule SAYS zero,
-- not because no rule matched. Those two states are the same number and
-- completely different facts, and keeping them distinct is the point of the
-- whole model.
--
-- ── WHY THESE TWO PROFILES ──────────────────────────────────────────────────
--
-- sandbox-default    the self-service policy. Every self-provisioned Sandbox
--                    project gets it, so onboarding never needs an operator.
--
-- sandbox-reference  the controlled nonzero assurance policy. It exists so that
--                    nonzero economics are exercised by an ORDINARY tenant on an
--                    ORDINARY profile. It is assigned to DOA and to a plain
--                    assurance tenant alike; nothing in it knows who DOA is.
--
-- Neither name encodes a business vertical, a tenant, or a rate. A profile
-- called "…-donation-200" would have to be renamed the day donations move to
-- 150 bps or the day a non-donation tenant is assigned it — and renaming an
-- identity rewrites what completed operations appear to have been priced under.
--
-- ── WHY 75 bps FOR PAYOUT ───────────────────────────────────────────────────
--
-- Banzami ADR-031 fixes the wallet withdrawal fee at 0.75%. The deployed ledger
-- agreed before this file existed: 15 consecutive payouts, gross 1 060 000,
-- fee 7 950 — exactly 0.75% to the minor unit. No later decision supersedes it.
--
-- ── WHY 200 bps FOR sandbox-reference SETTLEMENT ────────────────────────────
--
-- It is the assurance rate already in force for the nonzero settlement path. The
-- number is a policy choice, not a protocol fact: changing it means editing this
-- rule's rate, which is exactly the change the model is designed to absorb
-- without touching profile identity.

BEGIN;

-- ── profiles ────────────────────────────────────────────────────────────────

INSERT INTO pricing_profiles (id, code, name, description, enabled, environment)
SELECT gen_random_uuid(), 'sandbox-default',
       'Sandbox default',
       'Assigned automatically to every self-provisioned Sandbox project. Its settlement rate is explicitly zero; that is a configured price, not the absence of one.',
       true, 'SANDBOX'
 WHERE NOT EXISTS (SELECT 1 FROM pricing_profiles
                    WHERE code = 'sandbox-default' AND environment = 'SANDBOX');

INSERT INTO pricing_profiles (id, code, name, description, enabled, environment)
SELECT gen_random_uuid(), 'sandbox-reference',
       'Sandbox reference',
       'The controlled nonzero Sandbox assurance policy. Carries no tenant identity, no business vertical and no rate in its name.',
       true, 'SANDBOX'
 WHERE NOT EXISTS (SELECT 1 FROM pricing_profiles
                    WHERE code = 'sandbox-reference' AND environment = 'SANDBOX');

-- ── rules: one per (profile, operation) ─────────────────────────────────────
--
-- Guarded on the resolution key itself — (environment, profile, operation) —
-- so re-running this migration can never create the ambiguity the unique index
-- in 0106 exists to prevent.

INSERT INTO pricing_rules
  (id, rule_key, version, environment, enabled, pricing_profile, pricing_operation,
   rate_bps, flat_minor, rounding, priority, description)
SELECT gen_random_uuid(), 'sandbox-default-settlement', 1, 'SANDBOX', true,
       'sandbox-default', 'SETTLEMENT', 0, 0, 'HALF_UP', 100,
       'Settlement is free on the Sandbox default policy. Explicitly zero, and attributable to this rule.'
 WHERE NOT EXISTS (SELECT 1 FROM pricing_rules
                    WHERE environment = 'SANDBOX' AND pricing_profile = 'sandbox-default'
                      AND pricing_operation = 'SETTLEMENT' AND enabled AND effective_to IS NULL);

INSERT INTO pricing_rules
  (id, rule_key, version, environment, enabled, pricing_profile, pricing_operation,
   rate_bps, flat_minor, rounding, priority, description)
SELECT gen_random_uuid(), 'sandbox-default-payout', 1, 'SANDBOX', true,
       'sandbox-default', 'PAYOUT', 75, 0, 'HALF_UP', 100,
       'Withdrawal fee 0.75% (Banzami ADR-031).'
 WHERE NOT EXISTS (SELECT 1 FROM pricing_rules
                    WHERE environment = 'SANDBOX' AND pricing_profile = 'sandbox-default'
                      AND pricing_operation = 'PAYOUT' AND enabled AND effective_to IS NULL);

INSERT INTO pricing_rules
  (id, rule_key, version, environment, enabled, pricing_profile, pricing_operation,
   rate_bps, flat_minor, rounding, priority, description)
SELECT gen_random_uuid(), 'sandbox-reference-settlement', 1, 'SANDBOX', true,
       'sandbox-reference', 'SETTLEMENT', 200, 0, 'HALF_UP', 100,
       'Controlled nonzero settlement assurance rate: 2.00%.'
 WHERE NOT EXISTS (SELECT 1 FROM pricing_rules
                    WHERE environment = 'SANDBOX' AND pricing_profile = 'sandbox-reference'
                      AND pricing_operation = 'SETTLEMENT' AND enabled AND effective_to IS NULL);

INSERT INTO pricing_rules
  (id, rule_key, version, environment, enabled, pricing_profile, pricing_operation,
   rate_bps, flat_minor, rounding, priority, description)
SELECT gen_random_uuid(), 'sandbox-reference-payout', 1, 'SANDBOX', true,
       'sandbox-reference', 'PAYOUT', 75, 0, 'HALF_UP', 100,
       'Withdrawal fee 0.75% (Banzami ADR-031). Identical to the default policy — the payout rate does not differ by profile today, and saying so explicitly is what stops it being inherited by accident.'
 WHERE NOT EXISTS (SELECT 1 FROM pricing_rules
                    WHERE environment = 'SANDBOX' AND pricing_profile = 'sandbox-reference'
                      AND pricing_operation = 'PAYOUT' AND enabled AND effective_to IS NULL);

COMMIT;
