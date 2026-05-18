-- Merchant profiles: public-facing network identity for the Banzami merchant ecosystem.
-- Every merchant can have a public handle (@doadoa), description, logo, category,
-- and social links. This is the foundation of merchant discovery and QR storefronts.

CREATE TABLE IF NOT EXISTS merchant_profiles (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID         NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
    handle          VARCHAR(50)  NOT NULL UNIQUE,
    -- lowercase letters, digits, underscores; 3-50 chars; like consumer handles
    display_name    VARCHAR(100) NOT NULL,
    tagline         VARCHAR(200),
    description     TEXT,
    category        VARCHAR(50),
    -- RETAIL | FOOD | TRANSPORT | SERVICES | HEALTH | EDUCATION | ENTERTAINMENT | OTHER
    logo_url        TEXT,
    cover_url       TEXT,
    public          BOOLEAN      NOT NULL DEFAULT true,
    -- false = profile exists but not discoverable
    wallet_id       UUID,
    -- default wallet for QR/direct payments
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_social_links (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id  UUID        NOT NULL REFERENCES merchant_profiles(id) ON DELETE CASCADE,
    platform    VARCHAR(30) NOT NULL,
    -- WEBSITE | INSTAGRAM | FACEBOOK | WHATSAPP | TIKTOK
    url         TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (profile_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_merchant_profiles_handle      ON merchant_profiles (handle);
CREATE INDEX IF NOT EXISTS idx_merchant_profiles_category    ON merchant_profiles (category) WHERE public = true;
CREATE INDEX IF NOT EXISTS idx_merchant_profiles_merchant_id ON merchant_profiles (merchant_id);

-- Handle format constraint (mirrors consumer identity rules)
ALTER TABLE merchant_profiles
    ADD CONSTRAINT chk_handle_format
    CHECK (handle ~ '^[a-z0-9][a-z0-9_]{1,48}[a-z0-9]$');
