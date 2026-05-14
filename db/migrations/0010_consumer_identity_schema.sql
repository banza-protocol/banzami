-- Consumer identity — human-readable handles for end-users
-- These identities are the public-facing layer for QR payments and P2P transfers.
-- (CLAUDE.md §2.1 — consumers never see raw UUIDs)

CREATE TABLE consumers (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    handle       TEXT        NOT NULL,
    display_name TEXT,
    status       TEXT        NOT NULL DEFAULT 'ACTIVE'
                             CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT consumers_handle_key UNIQUE (handle)
);

COMMENT ON TABLE  consumers        IS 'End-user identities — the human-readable layer above consumer wallets.';
COMMENT ON COLUMN consumers.handle IS 'Normalized lowercase handle (without @). Globally unique. 3–30 chars.';
COMMENT ON COLUMN consumers.status IS 'ACTIVE → SUSPENDED → CLOSED lifecycle.';

CREATE INDEX consumers_status_idx ON consumers (status);
