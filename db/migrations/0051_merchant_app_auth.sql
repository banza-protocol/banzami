-- Merchant app login by @handle + PIN (operator-level auth, additive).
--
-- This is a purely ADDITIVE migration: it creates two new tables and seeds
-- reserved handles. It does NOT alter consumers, merchants, api_keys, the
-- ledger, or settlement. The existing API-key login (POST /v1/auth/token)
-- is untouched and remains the developer/integration credential.

-- ---------------------------------------------------------------------------
-- Global handle registry — one namespace for @handles across consumers,
-- merchants and reserved/system names, so a public handle is unique globally.
-- No format CHECK here (application validates on claim); this table only
-- guarantees uniqueness and records ownership.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS handle_registry (
    handle          TEXT        PRIMARY KEY,
    owner_type      TEXT        NOT NULL CHECK (owner_type IN ('CONSUMER', 'MERCHANT', 'SYSTEM')),
    owner_id        UUID,                 -- NULL for SYSTEM/reserved
    reserved_reason TEXT,                 -- set for SYSTEM/reserved entries
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Merchant app credentials: @handle + PIN for logging into Banzami Business.
-- PIN is bcrypt-hashed (never plaintext). Environment-scoped like api_keys.
-- One credential per (merchant, environment). Separate from api_keys.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_app_credentials (
    merchant_id     UUID        NOT NULL,
    environment     TEXT        NOT NULL CHECK (environment IN ('LIVE', 'SANDBOX')),
    handle          TEXT        NOT NULL UNIQUE REFERENCES handle_registry (handle),
    pin_hash        TEXT        NOT NULL,
    failed_attempts INT         NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_merchant_app_creds_handle ON merchant_app_credentials (handle);

-- ---------------------------------------------------------------------------
-- Seed reserved / system handles. "doa" is intentionally NOT reserved so the
-- Doa merchant can claim it as its official live handle later (sandbox uses
-- "doa_sandbox").
-- ---------------------------------------------------------------------------
INSERT INTO handle_registry (handle, owner_type, reserved_reason) VALUES
    ('admin',         'SYSTEM', 'reserved'),
    ('administrator', 'SYSTEM', 'reserved'),
    ('support',       'SYSTEM', 'reserved'),
    ('help',          'SYSTEM', 'reserved'),
    ('banzami',       'SYSTEM', 'reserved'),
    ('banza',         'SYSTEM', 'reserved'),
    ('api',           'SYSTEM', 'reserved'),
    ('root',          'SYSTEM', 'reserved'),
    ('system',        'SYSTEM', 'reserved'),
    ('merchant',      'SYSTEM', 'reserved'),
    ('business',      'SYSTEM', 'reserved'),
    ('pay',           'SYSTEM', 'reserved'),
    ('payment',       'SYSTEM', 'reserved'),
    ('wallet',        'SYSTEM', 'reserved'),
    ('test',          'SYSTEM', 'reserved'),
    ('sandbox',       'SYSTEM', 'reserved')
ON CONFLICT (handle) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Backfill existing CONSUMER handles into the registry so a merchant can never
-- claim a handle already used by a consumer (enforces global uniqueness
-- against current data). Read-only on consumers; additive insert only.
-- ---------------------------------------------------------------------------
INSERT INTO handle_registry (handle, owner_type, owner_id)
SELECT handle, 'CONSUMER', id FROM consumers
ON CONFLICT (handle) DO NOTHING;
