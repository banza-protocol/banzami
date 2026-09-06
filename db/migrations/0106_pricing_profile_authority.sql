-- Pricing authority moves from prose to an operator-governed assignment.
--
-- Until now the operator's fee rate was chosen like this:
--
--   merchant_profiles.category      -- free text, proposed by the merchant in
--                                   -- their KYB application
--     → pricingCategoryFromLabel()  -- SUBSTRING MATCH in the gateway
--       → pricing_rules.business_category
--         → rate_bps
--
-- A merchant who wrote "Loja de doações artesanais" — a shop — was priced as a
-- donation platform, because the string contains "doaç". The operator approving
-- that application was approving a business, not choosing a tariff; the tariff
-- was inferred from words, by a match nobody saw. And the developer-key
-- settlement path sent no category at all, so it matched no rule, and no rule
-- meant a fee of zero.
--
-- `pricing_profiles` already existed for exactly this and was never populated or
-- linked. This migration wires it up: a financial owner is ASSIGNED a profile by
-- an operator, and the rate follows the assignment.
--
-- Descriptive category stays where it is. It remains useful for KYB, reporting
-- and operator context. It simply stops deciding what anyone is charged.

BEGIN;

-- ── the assignment ──────────────────────────────────────────────────────────
--
-- On merchant_profiles rather than merchants because that is where a merchant's
-- commercial description already lives, and because the row is created by the
-- same operator-governed KYB approval that would set the profile.
--
-- Nullable: an owner with no assignment is not "free", it is UNPRICED, and the
-- settlement path refuses it. Making it NOT NULL would force a default into the
-- schema, and a default in the schema is exactly the implicit answer this is
-- removing.
ALTER TABLE merchant_profiles
  ADD COLUMN IF NOT EXISTS pricing_profile_id uuid
    REFERENCES pricing_profiles(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS merchant_profiles_pricing_profile_idx
  ON merchant_profiles(pricing_profile_id);

COMMENT ON COLUMN merchant_profiles.pricing_profile_id IS
  'Operator-governed pricing policy for this financial owner. Assigned by an '
  'operator; never derived from category, label or any request field. NULL means '
  'unpriced, which fails closed at settlement — it does not mean free.';

-- ── the two Sandbox profiles ────────────────────────────────────────────────
--
-- sandbox-default is the explicit zero. Every self-provisioned project gets it,
-- so onboarding needs no operator, and its rate is zero because it is CONFIGURED
-- to be zero — not because nothing matched. Those two states must never collapse
-- into each other again.
INSERT INTO pricing_profiles (id, code, name, description, enabled, environment)
SELECT gen_random_uuid(), 'sandbox-default',
       'Sandbox default',
       'Assigned automatically to every self-provisioned Sandbox project. Its rate is explicitly zero; it is not the absence of a rate.',
       true, 'SANDBOX'
 WHERE NOT EXISTS (SELECT 1 FROM pricing_profiles WHERE code = 'sandbox-default' AND environment = 'SANDBOX');

-- sandbox-donation-200 is a generic policy, not a tenant. Any merchant assigned
-- it is priced identically; nothing in it knows who DOA is.
INSERT INTO pricing_profiles (id, code, name, description, enabled, environment)
SELECT gen_random_uuid(), 'sandbox-donation-200',
       'Sandbox donation (200 bps)',
       'A generic Sandbox pricing policy of 200 bps. Assigned by an operator to donation-style tenants; carries no tenant identity.',
       true, 'SANDBOX'
 WHERE NOT EXISTS (SELECT 1 FROM pricing_profiles WHERE code = 'sandbox-donation-200' AND environment = 'SANDBOX');

-- ── their rules ─────────────────────────────────────────────────────────────
--
-- Keyed on pricing_profile, NOT on business_category. The existing
-- DONATION/business_category rule is left in place and untouched: historical
-- settlements referencing it stay explicable, and disabling it is a separate
-- operator decision on evidence rather than a side effect of this migration.
INSERT INTO pricing_rules
  (id, rule_key, version, environment, enabled, pricing_profile, rate_bps, priority, description)
SELECT gen_random_uuid(), 'sandbox-default-zero', 1, 'SANDBOX', true, 'sandbox-default', 0, 100,
       'Explicit zero for the Sandbox default profile. Zero because it says zero.'
 WHERE NOT EXISTS (
   SELECT 1 FROM pricing_rules
    WHERE environment = 'SANDBOX' AND pricing_profile = 'sandbox-default');

INSERT INTO pricing_rules
  (id, rule_key, version, environment, enabled, pricing_profile, rate_bps, priority, description)
SELECT gen_random_uuid(), 'sandbox-donation-200', 1, 'SANDBOX', true, 'sandbox-donation-200', 200, 100,
       'Generic 200 bps Sandbox donation policy.'
 WHERE NOT EXISTS (
   SELECT 1 FROM pricing_rules
    WHERE environment = 'SANDBOX' AND pricing_profile = 'sandbox-donation-200');

-- ── environment safety (§8) ─────────────────────────────────────────────────
--
-- A Sandbox owner must never carry a LIVE profile, or the reverse. The
-- merchant's environment is not on this row, so this cannot be a simple CHECK;
-- it is a trigger that reads the profile's own environment and compares it with
-- the deployment's. Financial LIVE is fail-closed anyway, which makes this a
-- second line rather than the only one — but the only one is code, and code is
-- what just turned out to be selecting tariffs from prose.
CREATE OR REPLACE FUNCTION merchant_profile_pricing_environment_guard()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_env text;
BEGIN
  IF NEW.pricing_profile_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT environment INTO v_env FROM pricing_profiles WHERE id = NEW.pricing_profile_id;
  IF v_env IS NULL THEN
    RAISE EXCEPTION 'pricing profile % does not exist', NEW.pricing_profile_id;
  END IF;
  IF v_env <> 'SANDBOX' THEN
    RAISE EXCEPTION 'refusing to assign a % pricing profile: this deployment is Sandbox-only', v_env;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS merchant_profiles_pricing_env ON merchant_profiles;
CREATE TRIGGER merchant_profiles_pricing_env
  BEFORE INSERT OR UPDATE OF pricing_profile_id ON merchant_profiles
  FOR EACH ROW EXECUTE FUNCTION merchant_profile_pricing_environment_guard();

COMMIT;
