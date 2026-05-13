-- Merchant domain schema
--
-- Merchants are the platform's direct customers: businesses that integrate
-- Banzami to accept payments. Each merchant gets one or more API keys for
-- programmatic access; keys are stored as SHA-256 hashes and never in plaintext.

CREATE TABLE merchants (
    id         UUID        PRIMARY KEY,
    name       TEXT        NOT NULL,
    -- Globally unique; used for login and deduplication.
    email      TEXT        NOT NULL UNIQUE,
    status     TEXT        NOT NULL DEFAULT 'ACTIVE'
                   CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX merchants_status_idx ON merchants (status);

-- ---------------------------------------------------------------------------
-- API keys
-- ---------------------------------------------------------------------------
CREATE TABLE api_keys (
    id           UUID        PRIMARY KEY,
    merchant_id  UUID        NOT NULL REFERENCES merchants(id),
    name         TEXT        NOT NULL,
    -- First 8 hex chars of the key body — safe to display for identification.
    key_prefix   TEXT        NOT NULL,
    -- SHA-256 of the full raw key, hex-encoded. Never returned to API consumers.
    key_hash     TEXT        NOT NULL UNIQUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    -- NULL means the key is active; non-NULL means revoked at that timestamp.
    revoked_at   TIMESTAMPTZ
);

CREATE INDEX api_keys_merchant_id_idx ON api_keys (merchant_id);
-- Hot path: every authenticated request hashes the raw key and looks up here.
CREATE INDEX api_keys_key_hash_idx    ON api_keys (key_hash);
