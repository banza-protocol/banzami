-- 0062_merchant_application_structured_fields.sql
-- Structured Business onboarding fields for merchant_applications.
--
-- The public Business application form (banzami.com/comerciantes/candidatura)
-- collects Angola-first location (province/município), a business subcategory,
-- an address reference, and the legal representative's role/email/phone. These
-- were previously folded into address/legal_representative free-text strings;
-- this migration gives them their own columns so BANZADMIN sees clean,
-- structured data and nothing important is hidden inside concatenated strings.
--
-- Additive + idempotent. Not applied yet — apply only after go-ahead.
-- (estimated_volume + business_activity already exist from 0052.)

ALTER TABLE merchant_applications
    ADD COLUMN IF NOT EXISTS subcategory           TEXT,
    ADD COLUMN IF NOT EXISTS province              TEXT,
    ADD COLUMN IF NOT EXISTS municipality          TEXT,
    ADD COLUMN IF NOT EXISTS address_reference     TEXT,
    ADD COLUMN IF NOT EXISTS representative_role   TEXT,
    ADD COLUMN IF NOT EXISTS representative_email  TEXT,
    ADD COLUMN IF NOT EXISTS representative_phone  TEXT;
