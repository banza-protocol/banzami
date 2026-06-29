-- Operator Pricing Rules (Banzami ADR-021 / BANZA ADR-039).
--
-- This table is OPERATOR POLICY. It is the ONLY place in the whole stack where a
-- fee percentage or pricing rule is stored. The BANZA protocol (~/banza) carries
-- only the references (business_category, pricing_profile, fee_policy_ref) and
-- the resolved minor-unit result — never a rule, table or percentage. Nothing in
-- here is a protocol concept; changing pricing requires NO protocol ADR.
--
-- The Pricing Engine (core/pricing) loads ENABLED rows for an environment and
-- resolves a fee deterministically. It holds no money and never posts to the
-- ledger; the resolved fee_minor is consumed later (increment 3) as one balanced
-- leg of a PaymentIntent fulfilment posting (ADR-002, append-only).
--
-- A rule matches a payment when every NON-NULL matcher equals the corresponding
-- context value (NULL matcher = wildcard). The most specific matching rule wins;
-- `priority` breaks specificity ties. Rules are versioned and time-bounded;
-- existing rows are never rewritten in place to change a price — a new version /
-- new effective window is inserted, so historical fees remain reproducible.

CREATE TABLE IF NOT EXISTS pricing_rules (
    id                  UUID         PRIMARY KEY,                  -- engine-supplied
    rule_key            TEXT         NOT NULL,                     -- stable label, e.g. 'donation-standard'
    version             INTEGER      NOT NULL DEFAULT 1 CHECK (version >= 1),
    environment         TEXT         NOT NULL DEFAULT 'LIVE' CHECK (environment IN ('LIVE','SANDBOX')),
    enabled             BOOLEAN      NOT NULL DEFAULT TRUE,

    -- matchers (NULL = wildcard) ------------------------------------------
    business_category   TEXT,                                      -- BusinessCategory code (reference, never a price)
    pricing_profile     TEXT,                                      -- PricingProfile code
    fee_policy_ref      TEXT,                                      -- opaque FeePolicyRef.ref
    currency            TEXT,                                      -- ISO 4217; NULL = any
    country             TEXT,                                      -- ISO 3166-1 alpha-2; NULL = any

    -- fee components (operator policy — the ONLY numbers) ------------------
    rate_bps            INTEGER      NOT NULL DEFAULT 0 CHECK (rate_bps >= 0),  -- basis points; 200 = 2%
    flat_minor          BIGINT       NOT NULL DEFAULT 0 CHECK (flat_minor >= 0), -- integer minor units; never float
    min_fee_minor       BIGINT       CHECK (min_fee_minor IS NULL OR min_fee_minor >= 0),
    max_fee_minor       BIGINT       CHECK (max_fee_minor IS NULL OR max_fee_minor >= 0),
    rounding            TEXT         NOT NULL DEFAULT 'HALF_UP'
                                     CHECK (rounding IN ('HALF_UP','HALF_EVEN','FLOOR','CEIL')),

    -- selection + lifecycle ----------------------------------------------
    priority            INTEGER      NOT NULL DEFAULT 0,           -- higher wins on a specificity tie
    effective_from      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),       -- inclusive
    effective_to        TIMESTAMPTZ,                               -- exclusive; NULL = open-ended

    description         TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT pricing_rules_minmax CHECK (
        min_fee_minor IS NULL OR max_fee_minor IS NULL OR min_fee_minor <= max_fee_minor
    ),
    CONSTRAINT pricing_rules_window CHECK (
        effective_to IS NULL OR effective_to > effective_from
    ),
    -- one active version per (key, environment) effective window start
    CONSTRAINT pricing_rules_key_version UNIQUE (environment, rule_key, version)
);

-- Hot lookup: the engine loads enabled rows per environment.
CREATE INDEX IF NOT EXISTS idx_pricing_rules_active
    ON pricing_rules (environment)
    WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_pricing_rules_category
    ON pricing_rules (environment, business_category)
    WHERE enabled = TRUE;

COMMENT ON TABLE pricing_rules IS
    'Banzami ADR-021 operator pricing policy. The only place fee percentages/rules exist. Not a protocol concept; the protocol stores only references + the resolved fee_minor. Never rewritten to change a price — new version/window is appended so historical fees stay reproducible.';
COMMENT ON COLUMN pricing_rules.rate_bps IS
    'Percentage in basis points (200 = 2.00%). Operator-internal; never exposed by any public API/SDK/UI.';
COMMENT ON COLUMN pricing_rules.flat_minor IS
    'Fixed fee component in integer minor units. Never float (ADR-002 / §9.3).';
