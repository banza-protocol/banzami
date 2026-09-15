-- 0151 — A consumer declares a full name (not a verified legal identity).
--
-- ACCOUNT-ONBOARDING-NAME-001. Every Banzami Consumer has two identity facts:
-- a unique public @banza (where value is sent) and a user-declared full name
-- (who a human is dealing with). The full name is REQUIRED at account creation
-- and is stored in the existing `consumers.display_name` column — we reuse that
-- column as the canonical declared-name field rather than adding a parallel
-- `full_name` (avoids schema churn and ambiguous name/display_name/full_name
-- triplication). Its semantics are hereby fixed as:
--
--     consumers.display_name = REQUIRED user-declared full name.
--
-- It is NOT proof of verified identity. Sandbox performs no KYC; identity
-- verification is a separate capability (kyc_* tables, 0050/0067) and is not
-- required for current Sandbox use. The full name never carries financial
-- authority — authority is the consumer/wallet/handle resolution in Core; the
-- name is display information for profiles, P2P recipient confirmation, history
-- and receipts. It is not unique: two people may legitimately share a name, and
-- transfers always resolve by @banza, never by name.
--
-- Enforcement. The canonical API boundary (public-api /v1/auth/register) already
-- rejects an empty/over-long/control-character name with a typed 4xx. This
-- migration adds defence-in-depth at the database so no path can persist a
-- name-less NEW row. It is added NOT VALID on purpose: legacy consumers created
-- while the name was optional (display_name NULL/blank) are NOT retro-failed or
-- fake-backfilled — they complete their name truthfully through the app's
-- profile-completion flow on next authenticated use. Once those rows carry a
-- real name, the constraint can be VALIDATEd (a separate, later migration) and
-- the column tightened to NOT NULL. Until then the CHECK guards every INSERT and
-- every UPDATE of display_name.
--
-- Reversible: DROP CONSTRAINT consumers_display_name_present.

ALTER TABLE consumers
    ADD CONSTRAINT consumers_display_name_present
    CHECK (display_name IS NOT NULL AND btrim(display_name) <> '')
    NOT VALID;
