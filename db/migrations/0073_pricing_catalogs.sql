-- Pricing catalogs (Banzami ADR-021) — increment 5.8.
--
-- Turns the free-string `pricing_profile` and `fee_policy_ref` references into
-- operator-managed CATALOGS. These are reference catalogs only: they name and
-- describe a profile / fee policy. They carry NO percentages — fee values live
-- ONLY in pricing_rules. A FeePolicy merely identifies a commercial policy; the
-- numbers behind it remain in pricing_rules.
--
-- Existing pricing_rules that reference a profile/policy by string keep working:
-- nothing here enforces a foreign key onto pricing_rules (old free-string refs
-- are never broken). The catalogs drive the BANZADMIN dropdowns and let the
-- operator enable/disable a code.

CREATE TABLE IF NOT EXISTS pricing_profiles (
    id          UUID         PRIMARY KEY,
    code        TEXT         NOT NULL,                 -- e.g. STANDARD, PARTNER, NGO
    name        TEXT         NOT NULL,
    description TEXT,
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    environment TEXT         NOT NULL DEFAULT 'LIVE' CHECK (environment IN ('LIVE','SANDBOX')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT pricing_profiles_code_env UNIQUE (environment, code)
);

CREATE TABLE IF NOT EXISTS fee_policies (
    id          UUID         PRIMARY KEY,
    code        TEXT         NOT NULL,                 -- the FeePolicyRef, e.g. pol_donation_standard
    name        TEXT         NOT NULL,
    description TEXT,
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    environment TEXT         NOT NULL DEFAULT 'LIVE' CHECK (environment IN ('LIVE','SANDBOX')),
    metadata    JSONB        NOT NULL DEFAULT '{}',    -- internal documentation; NEVER a percentage
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT fee_policies_code_env UNIQUE (environment, code)
);

CREATE INDEX IF NOT EXISTS idx_pricing_profiles_env ON pricing_profiles (environment) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_fee_policies_env ON fee_policies (environment) WHERE enabled = TRUE;

COMMENT ON TABLE pricing_profiles IS
    'Banzami ADR-021 reference catalog of pricing profiles. Reference only — carries NO percentages. Fee values live only in pricing_rules. Not FK-linked to pricing_rules so existing string refs never break.';
COMMENT ON TABLE fee_policies IS
    'Banzami ADR-021 reference catalog of fee policies (FeePolicyRef). Identifies a commercial policy by code + internal documentation; carries NO percentages — those live only in pricing_rules.';
COMMENT ON COLUMN fee_policies.metadata IS
    'Internal documentation only (e.g. notes, owner). Never a percentage, rate or table.';
