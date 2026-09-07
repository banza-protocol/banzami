-- The Banzami Pricing Model — schema.
--
-- This is the first canonical pricing architecture. It has never shipped, so
-- there is no earlier model to migrate from and no compatibility story to keep.
-- What came before it in this repository was a set of transitional steps against
-- a pre-release Sandbox that has since been rebuilt from zero; they are gone.
--
-- ── WHAT THE MODEL IS ───────────────────────────────────────────────────────
--
--   Pricing Profile  a commercial policy bundle the operator assigns to a
--                    financial owner. Stable identity. It does not carry a
--                    rate, a business vertical, or a tenant name.
--
--   Pricing Rule     the price of ONE explicit fee-bearing operation under one
--                    profile. Rates live here, so a rate change never forces an
--                    identity change.
--
-- Resolution is deterministic and has no ranking step:
--
--   0 applicable rules  → PRICING_NOT_CONFIGURED   (refuse; absent ≠ zero)
--   1 applicable rule   → apply it
--   >1 applicable rules → PRICING_CONFIGURATION_ERROR (refuse; never guess)
--
-- ── WHY AN OPERATION DIMENSION ──────────────────────────────────────────────
--
-- Without one, the engine cannot tell a settlement from a capture, and a rule
-- that names no operation applies to EVERYTHING. That is backwards. A rule that
-- names no operation must apply to NOTHING, so that adding a future fee-bearing
-- operation cannot make it silently inherit an existing rate.
--
-- The fee-bearing set is currently SETTLEMENT and PAYOUT. Transfer, payment,
-- capture and refund resolve no operator pricing at all — capture does not even
-- link the pricing engine.
--
-- ── WHY THE ASSIGNMENT LIVES ON `merchants` ─────────────────────────────────
--
-- `merchants` is the financial owner: the thing that holds wallets, receives
-- settlements and is charged. Every one of them exists by definition. The
-- obvious-looking alternative, `merchant_profiles`, is created by KYB approval —
-- so a self-provisioned Sandbox owner has no such row and could never be priced.
--
-- Nullable on purpose: an owner with no assignment is UNPRICED, not free, and
-- the settlement path refuses it. A NOT NULL column would need a default, and a
-- default in the schema is precisely the implicit answer this model removes.

BEGIN;

-- ── profile assignment on the financial owner ───────────────────────────────

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS pricing_profile_id uuid
    REFERENCES pricing_profiles(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS merchants_pricing_profile_idx
  ON merchants(pricing_profile_id);

COMMENT ON COLUMN merchants.pricing_profile_id IS
  'Operator-governed pricing policy for this financial owner. Assigned by an '
  'operator or by self-service provisioning (which assigns the explicit Sandbox '
  'default); never derived from category, label, or any request field. NULL is '
  'UNPRICED and fails closed at settlement — it does not mean free.';

-- A Sandbox owner must never carry a LIVE profile, or the reverse. The owner's
-- environment is not on this row, so this cannot be a CHECK; it reads the
-- profile's own environment. Financial LIVE is fail-closed in code as well —
-- this is the second line, not the only one.
CREATE OR REPLACE FUNCTION merchant_pricing_environment_guard()
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

DROP TRIGGER IF EXISTS merchants_pricing_env ON merchants;
CREATE TRIGGER merchants_pricing_env
  BEFORE INSERT OR UPDATE OF pricing_profile_id ON merchants
  FOR EACH ROW EXECUTE FUNCTION merchant_pricing_environment_guard();

-- ── the operation dimension ─────────────────────────────────────────────────

ALTER TABLE pricing_rules
  ADD COLUMN IF NOT EXISTS pricing_operation text;

ALTER TABLE pricing_rules
  DROP CONSTRAINT IF EXISTS pricing_rules_operation_check;
ALTER TABLE pricing_rules
  ADD CONSTRAINT pricing_rules_operation_check
  CHECK (pricing_operation IS NULL OR pricing_operation IN ('SETTLEMENT', 'PAYOUT'));

-- No wildcard pricing, on EITHER dimension. An enabled rule must name both the
-- profile it belongs to and the operation it prices.
--
-- The operation half stops a future fee-bearing operation inheriting a rate that
-- was never written for it. The profile half closes the same hole one axis over:
-- a rule with no profile would apply to every profile, including profiles
-- created years later by someone who never saw this row.
--
-- Disabled rows are exempt, so history stays readable.
ALTER TABLE pricing_rules
  DROP CONSTRAINT IF EXISTS pricing_rules_enabled_requires_operation;
ALTER TABLE pricing_rules
  ADD CONSTRAINT pricing_rules_enabled_requires_operation
  CHECK (NOT enabled OR (pricing_operation IS NOT NULL AND pricing_profile IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_pricing_rules_profile_operation
  ON pricing_rules (environment, pricing_profile, pricing_operation) WHERE enabled;

-- Ambiguity is impossible rather than merely refused: at most one enabled,
-- still-open rule per (environment, profile, operation). The runtime resolver
-- ALSO fails closed on >1, because a constraint that is dropped in a future
-- migration must not silently re-enable guessing.
CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_one_per_profile_operation
  ON pricing_rules (environment, pricing_profile, pricing_operation)
  WHERE enabled AND pricing_operation IS NOT NULL AND effective_to IS NULL;

COMMENT ON COLUMN pricing_rules.pricing_operation IS
  'The fee-bearing economic operation this rule prices: SETTLEMENT or PAYOUT. '
  'Required on every enabled rule. A rule naming no operation prices NOTHING — '
  'it is never a wildcard.';

-- ── the payout pricing snapshot ─────────────────────────────────────────────
--
-- A completed payout must answer "what was I charged and why" from its own row:
-- base, rule, version, rate, fee, net, and when the decision was taken. Later
-- rule edits must not rewrite finished economics, and nobody should have to
-- reconstruct a price from ledger archaeology.

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

ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_fee_within_gross;
ALTER TABLE payouts
  ADD CONSTRAINT payouts_fee_within_gross
  CHECK (fee_minor IS NULL OR fee_minor <= amount_minor);

COMMENT ON COLUMN payouts.pricing_rule_id IS
  'The rule that priced this payout, captured at decision time. Together with '
  'pricing_rule_version, pricing_rate_bps and pricing_decided_at it makes the '
  'fee attributable without re-resolving anything.';

COMMIT;
