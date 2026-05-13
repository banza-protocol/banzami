-- Consumer identity — human-readable handles for end-users
-- These identities are the public-facing layer for QR payments and P2P transfers.
-- (CLAUDE.md §2.1 — consumers never see raw UUIDs)

CREATE TABLE consumer_identities (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    handle       TEXT        NOT NULL,
    display_name TEXT,
    status       TEXT        NOT NULL DEFAULT 'ACTIVE'
                             CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT consumer_identities_handle_key UNIQUE (handle)
);

COMMENT ON TABLE  consumer_identities        IS 'End-user identities — the human-readable layer above consumer wallets.';
COMMENT ON COLUMN consumer_identities.handle IS 'Normalized lowercase handle (without @). Globally unique. 3–30 chars.';
COMMENT ON COLUMN consumer_identities.status IS 'ACTIVE → SUSPENDED → CLOSED lifecycle.';

-- Case-insensitive handle lookup (handle is already lowercased at insert time).
CREATE INDEX consumer_identities_status_idx ON consumer_identities (status);
