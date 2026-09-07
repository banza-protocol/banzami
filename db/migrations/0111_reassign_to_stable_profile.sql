-- Pricing Model V2, step 3: move owners onto the stable profile identity.
--
-- Like for like. `sandbox-reference` charges exactly what `sandbox-donation-200`
-- charges — 200 bps settlement, 75 bps payout — because 0110 seeded it from the
-- rates already in force. No owner's economics change by one minor unit.
--
-- ── WHY MOVE AT ALL ────────────────────────────────────────────────────────
--
-- `sandbox-donation-200` encodes two things that do not belong in a stable
-- identity: a business vertical the profile does not depend on, and a rate that
-- will change. Moving settlement to 150 bps would leave a profile called
-- "…-200" charging 150, or force an identity change that rewrites what
-- historical rows point at.
--
-- A profile names a commercial policy. A rule names what that policy charges for
-- one operation at one time. Changing a rate is a new rule version, never a new
-- profile.
--
-- ── WHY THE OLD PROFILE IS NOT RETIRED HERE ────────────────────────────────
--
-- Historical settlements reference it by CODE, not by id: `app_settlements`
-- carries `pricing_profile` as text. Disabling or deleting it would leave those
-- rows pointing at something that no longer explains itself. It stays enabled,
-- with its transitional per-operation rules, until nothing references it — and
-- that is a separate decision on evidence, not a side effect of this migration.
--
-- ── SAFETY ────────────────────────────────────────────────────────────────
--
-- Scoped to SANDBOX and to owners actually on the old profile. The environment
-- guard trigger on `merchants.pricing_profile_id` still applies, so a mismatched
-- environment would be refused rather than silently written.

UPDATE merchants m
   SET pricing_profile_id = (
         SELECT id FROM pricing_profiles
          WHERE environment = 'SANDBOX' AND code = 'sandbox-reference')
 WHERE m.pricing_profile_id = (
         SELECT id FROM pricing_profiles
          WHERE environment = 'SANDBOX' AND code = 'sandbox-donation-200')
   AND EXISTS (
         SELECT 1 FROM pricing_profiles
          WHERE environment = 'SANDBOX' AND code = 'sandbox-reference');

COMMENT ON TABLE pricing_profiles IS
  'Operator-assigned commercial policies. A profile names a POLICY; its per-operation rules name what that policy charges, and at what version. Changing a rate is a new rule version, never a new profile — which is why codes must not contain rates or business verticals.';
