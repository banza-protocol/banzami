-- Migration 0041: Merchant team members + access log (Banzami Business teams).
--
-- Operator-side, non-financial data: who can access a merchant's dashboard and
-- with what permission level. Owned by the api-gateway (like webhooks), not the
-- financial core — team membership never touches the ledger.

CREATE TABLE merchant_team_members (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID        NOT NULL,
    email       TEXT        NOT NULL,
    -- VIEWER  → read-only access (consulta).
    -- OPERATOR→ can perform operations (reembolsos, levantamentos, etc.).
    role        TEXT        NOT NULL DEFAULT 'VIEWER'
                            CHECK (role IN ('VIEWER', 'OPERATOR')),
    status      TEXT        NOT NULL DEFAULT 'INVITED'
                            CHECK (status IN ('INVITED', 'ACTIVE', 'REMOVED')),
    invited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    joined_at   TIMESTAMPTZ,
    removed_at  TIMESTAMPTZ
);

-- One active/invited membership per email per merchant (removed rows don't conflict).
CREATE UNIQUE INDEX merchant_team_members_unique_email
    ON merchant_team_members (merchant_id, lower(email))
    WHERE status <> 'REMOVED';

CREATE INDEX merchant_team_members_merchant_idx
    ON merchant_team_members (merchant_id, status);

-- Per-member access / action log.
CREATE TABLE merchant_access_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID        NOT NULL,
    member_id   UUID        REFERENCES merchant_team_members(id) ON DELETE SET NULL,
    actor_email TEXT        NOT NULL,
    action      TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX merchant_access_log_merchant_idx
    ON merchant_access_log (merchant_id, created_at DESC);

COMMENT ON TABLE merchant_team_members IS 'Dashboard team members per merchant with differentiated roles.';
COMMENT ON TABLE merchant_access_log   IS 'Per-member access and action audit trail for a merchant.';
