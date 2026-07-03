-- Forward-only, idempotent repair for drifted 0041_merchant_team.
-- 0041 was recorded in _sqlx_migrations without its DDL executing on some
-- environments (migration-history backfill drift). Re-creates the objects
-- idempotently: a no-op where already present, completing where absent.
-- Additive; never edits history/checksums.

CREATE TABLE IF NOT EXISTS merchant_team_members (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID        NOT NULL,
    email       TEXT        NOT NULL,
    role        TEXT        NOT NULL DEFAULT 'VIEWER'
                            CHECK (role IN ('VIEWER', 'OPERATOR')),
    status      TEXT        NOT NULL DEFAULT 'INVITED'
                            CHECK (status IN ('INVITED', 'ACTIVE', 'REMOVED')),
    invited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    joined_at   TIMESTAMPTZ,
    removed_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_team_members_unique_email
    ON merchant_team_members (merchant_id, lower(email))
    WHERE status <> 'REMOVED';

CREATE INDEX IF NOT EXISTS merchant_team_members_merchant_idx
    ON merchant_team_members (merchant_id, status);

CREATE TABLE IF NOT EXISTS merchant_access_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID        NOT NULL,
    member_id   UUID        REFERENCES merchant_team_members(id) ON DELETE SET NULL,
    actor_email TEXT        NOT NULL,
    action      TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_access_log_merchant_idx
    ON merchant_access_log (merchant_id, created_at DESC);

COMMENT ON TABLE merchant_team_members IS 'Dashboard team members per merchant with differentiated roles.';
COMMENT ON TABLE merchant_access_log   IS 'Per-member access and action audit trail for a merchant.';
