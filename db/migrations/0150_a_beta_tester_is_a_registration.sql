-- 0150 — A beta tester is a registration, not a financial identity.
--
-- APP-BETA-001. The Banzami mobile apps (App Banzami and App Comerciante) are
-- functional and distributed to invited testers through TestFlight (iOS) and
-- Google Play testing (Android). This table is the registry a prospective tester
-- lands in from the public site — one row per email, accumulating which apps and
-- platforms they want to test — and the operator works from in BANZADMIN.
--
-- It is NOT a financial resource: no wallet, no money, no @banza, no Developer
-- Workspace. It holds contact details only, for beta enrolment and test
-- administration. It is not written by Core, not exposed through the Developer
-- API, and not guarded by 0144 (it moves no value). The public registration
-- endpoint (api-gateway) inserts and merges; BANZADMIN (admin-api) reads and
-- advances the lifecycle. A tester is soft-removed (status REMOVED), never
-- deleted here, so the operator can see who asked and when — a privacy deletion
-- is a separate, deliberate act.

CREATE TABLE IF NOT EXISTS beta_testers (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The email a tester will use to install from TestFlight / Google Play,
    -- normalised (trimmed, lower-cased) for the unique key; the original spelling
    -- is kept for display and correspondence.
    email_normalized TEXT        NOT NULL,
    email_display    TEXT        NOT NULL,
    first_name       TEXT        NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 80),
    last_name        TEXT        NOT NULL CHECK (char_length(last_name)  BETWEEN 1 AND 80),
    -- The platforms they want to test, as flags, so re-registering from another
    -- device merges rather than duplicating.
    wants_ios        BOOLEAN     NOT NULL DEFAULT false,
    wants_android    BOOLEAN     NOT NULL DEFAULT false,
    -- The apps they want to test.
    app_banzami      BOOLEAN     NOT NULL DEFAULT false,
    app_merchant     BOOLEAN     NOT NULL DEFAULT false,
    -- Optional QA coverage, never required.
    device_model     TEXT        CHECK (device_model IS NULL OR char_length(device_model) <= 120),
    os_version       TEXT        CHECK (os_version   IS NULL OR char_length(os_version)   <= 60),
    country          TEXT        CHECK (country      IS NULL OR char_length(country)      <= 80),
    -- Where the registration came from (home hero, /testes, a product card), for
    -- the operator's context. Not authority.
    source           TEXT        CHECK (source IS NULL OR char_length(source) <= 40),
    status           TEXT        NOT NULL DEFAULT 'PENDING'
                                 CHECK (status IN ('PENDING', 'INVITED', 'ACTIVE', 'REMOVED')),
    -- An operator's private note on the tester. Never shown publicly.
    note             TEXT        CHECK (note IS NULL OR char_length(note) <= 2000),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    invited_at       TIMESTAMPTZ,
    activated_at     TIMESTAMPTZ,
    removed_at       TIMESTAMPTZ,
    -- A registration is for at least one app.
    CONSTRAINT beta_testers_wants_an_app CHECK (app_banzami OR app_merchant),
    -- …and at least one platform.
    CONSTRAINT beta_testers_wants_a_platform CHECK (wants_ios OR wants_android),
    -- One row per person: re-registering merges their interest.
    CONSTRAINT beta_testers_email_unique UNIQUE (email_normalized)
);

COMMENT ON TABLE beta_testers IS
    'APP-BETA-001: prospective and enrolled mobile beta testers. Contact details only — not a financial identity, not a Developer resource, not written by Core.';
COMMENT ON COLUMN beta_testers.email_normalized IS
    'Trimmed, lower-cased email — the unique key. No provider-specific transforms (Gmail dots are preserved).';
COMMENT ON COLUMN beta_testers.status IS
    'PENDING (registered) → INVITED (added to TestFlight/Play) → ACTIVE (accepted) ; REMOVED (soft, kept for audit).';

CREATE INDEX IF NOT EXISTS idx_beta_testers_status  ON beta_testers (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beta_testers_created ON beta_testers (created_at DESC);
