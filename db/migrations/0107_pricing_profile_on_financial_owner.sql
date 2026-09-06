-- The pricing assignment belongs to the financial owner, not to its public profile.
--
-- 0106 put pricing_profile_id on merchant_profiles, because that is where a
-- merchant's commercial description lives and where the KYB approval writes.
-- Applying it immediately showed the flaw: a self-provisioned Sandbox owner has
-- no merchant_profiles row at all. That row is created by KYB approval, and a
-- developer who clicks "configure Sandbox financial environment" has no KYB.
--
-- So the assignment moves to `merchants`. That is the financial owner — the
-- thing that holds wallets, receives settlements and is charged — and every one
-- of them exists by definition. It also separates the two ideas properly:
-- merchant_profiles describes a business to the public; this decides what the
-- operator charges it, and those should not share a row's lifecycle.
--
-- 0106's column is dropped rather than left behind. A second place to write a
-- pricing assignment is a second place for them to disagree.

BEGIN;

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

-- Carry across anything 0106 already assigned, so no decision is lost.
UPDATE merchants m
   SET pricing_profile_id = mp.pricing_profile_id
  FROM merchant_profiles mp
 WHERE mp.merchant_id = m.id
   AND mp.pricing_profile_id IS NOT NULL
   AND m.pricing_profile_id IS NULL;

-- The environment guard moves with the column.
DROP TRIGGER IF EXISTS merchant_profiles_pricing_env ON merchant_profiles;

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

ALTER TABLE merchant_profiles DROP COLUMN IF EXISTS pricing_profile_id;
DROP FUNCTION IF EXISTS merchant_profile_pricing_environment_guard();

COMMIT;
