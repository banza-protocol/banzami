-- Platform Mode — central source of truth for SANDBOX/LIVE (Banzami).
--
-- A single, audited, persistent setting read by the public website, the BANZADMIN
-- console, and the public onboarding flows. The platform is in SANDBOX until a
-- SUPER_ADMIN explicitly flips it to LIVE (with a typed confirmation). History is
-- never deleted. The safe default is SANDBOX — readers fall back to SANDBOX on any
-- failure, never LIVE.

CREATE TABLE IF NOT EXISTS platform_settings (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key         TEXT        NOT NULL UNIQUE,
    value       TEXT        NOT NULL,
    environment TEXT        NOT NULL DEFAULT 'GLOBAL',
    reason      TEXT,
    updated_by  TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    version     INTEGER     NOT NULL DEFAULT 1
);

-- Immutable change history (never deleted).
CREATE TABLE IF NOT EXISTS platform_settings_history (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key       TEXT        NOT NULL,
    old_value         TEXT,
    new_value         TEXT        NOT NULL,
    changed_by        TEXT,
    reason            TEXT,
    confirmation_text TEXT,
    changed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_settings_history_key_idx
    ON platform_settings_history (setting_key, changed_at DESC);

-- Seed the platform mode. SANDBOX is the safe initial value (the platform is not
-- yet in real production). Never overwrites an existing value.
INSERT INTO platform_settings (key, value, reason, updated_by)
VALUES ('platform_mode', 'SANDBOX', 'initial seed', 'system')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE platform_settings IS
    'Central platform settings (platform_mode = SANDBOX|LIVE). Audited; history in platform_settings_history; readers default to SANDBOX on failure.';
