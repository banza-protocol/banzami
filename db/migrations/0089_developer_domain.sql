-- 0089_developer_domain.sql
-- Developer bounded context (ADR-033): a technical integration principal that
-- integrates Banzami. Independent of Business — a workspace and its Sandbox
-- projects exist with NO Business account. Money is never owned here; the Core
-- remains the single financial truth.
--
-- Owns its own physical PostgreSQL schema `developer`. It never reads, writes or
-- depends on Business, Core or Account Identity tables. Cross-context references
-- (user_id, merchant_id, *_by ids) are OPAQUE UUIDs with NO foreign key; intra-
-- context references (workspace_id, project_id, rotated_from) use real FKs.
-- Audit is context-owned and append-only (DB-enforced).
--
-- Slice 1 issues SANDBOX keys only (bz_test_pk_… / bz_test_sk_…). LIVE prefixes
-- exist as reserved constants in code only — never issued or accepted here.
-- Live issuance is gated behind an active dev_project_business_link (schema/
-- design prepared here, execution deferred to a later slice).
-- Additive + idempotent. Not applied yet — apply only after go-ahead.

CREATE SCHEMA IF NOT EXISTS developer;

-- ── Workspaces ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS developer.dev_workspaces (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    slug       TEXT        NOT NULL UNIQUE,
    created_by UUID        NOT NULL,                 -- opaque identity_users.id (no FK)
    status     TEXT        NOT NULL DEFAULT 'ACTIVE'
               CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Members ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS developer.dev_workspace_members (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID        NOT NULL REFERENCES developer.dev_workspaces (id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL,               -- opaque identity_users.id (no FK)
    role         TEXT        NOT NULL
                 CHECK (role IN ('OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'VIEWER')),
    invited_by   UUID,                               -- opaque identity_users.id (no FK)
    accepted_at  TIMESTAMPTZ,
    status       TEXT        NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dev_members_user ON developer.dev_workspace_members (user_id);

-- ── Invites (by email, before a User exists) ─────────────────────────────────
-- The raw invite token is never stored — only token_hash (with hash_version).
CREATE TABLE IF NOT EXISTS developer.dev_workspace_invites (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID        NOT NULL REFERENCES developer.dev_workspaces (id) ON DELETE CASCADE,
    email           TEXT        NOT NULL,
    role            TEXT        NOT NULL
                    CHECK (role IN ('OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'VIEWER')),
    token_hash      TEXT        NOT NULL UNIQUE,     -- hash of the opaque invite token
    hash_version    INT         NOT NULL DEFAULT 1,
    invited_by_user_id UUID,                         -- opaque identity_users.id (no FK)
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one active (unaccepted, unrevoked) invite per workspace + canonical email.
CREATE UNIQUE INDEX IF NOT EXISTS dev_invites_active_unique
    ON developer.dev_workspace_invites (workspace_id, lower(email))
    WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dev_invites_email ON developer.dev_workspace_invites (lower(email));

-- ── Projects ─────────────────────────────────────────────────────────────────
-- A project spans Sandbox and (later) Live modes. It intentionally has NO
-- business_id/merchant_id column: a project may link to more than one approved
-- Business in future, so the relationship lives only in dev_project_business_link.
CREATE TABLE IF NOT EXISTS developer.dev_projects (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID        NOT NULL REFERENCES developer.dev_workspaces (id) ON DELETE CASCADE,
    name         TEXT        NOT NULL,
    slug         TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, slug)
);

-- ── API keys ─────────────────────────────────────────────────────────────────
-- Prefix convention: bz_<env>_<role>_… (e.g. bz_test_pk_…, bz_test_sk_…).
-- Publishable keys (pk) are non-secret and stored in full (`public_value`) so the
-- dashboard can display them repeatedly. Secret keys (sk) are stored ONLY as
-- key_hash = HMAC-SHA-256(raw_secret, API_KEY_PEPPER) with a hash_version; the raw
-- value is ≥256-bit random, returned exactly once at creation, and never stored,
-- logged, traced or emitted in audit events again. Lookup is constant-time.
CREATE TABLE IF NOT EXISTS developer.dev_api_keys (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   UUID        NOT NULL REFERENCES developer.dev_projects (id) ON DELETE CASCADE,
    environment  TEXT        NOT NULL CHECK (environment IN ('SANDBOX', 'LIVE')),
    kind         TEXT        NOT NULL CHECK (kind IN ('PUBLISHABLE', 'SECRET')),
    name         TEXT        NOT NULL,
    key_prefix   TEXT        NOT NULL,               -- short display identifier, e.g. 'bz_test_pk_51Rz8a4b'
    key_hash     TEXT        NOT NULL UNIQUE,        -- HMAC-SHA-256(raw, API_KEY_PEPPER)
    hash_version INT         NOT NULL DEFAULT 1,
    public_value TEXT,                               -- full pk value (PUBLISHABLE only); NULL for SECRET
    scopes       TEXT[]      NOT NULL DEFAULT '{}',
    last_used_at TIMESTAMPTZ,
    created_by   UUID        NOT NULL,               -- opaque identity_users.id (no FK)
    rotated_from UUID        REFERENCES developer.dev_api_keys (id) ON DELETE SET NULL,
    status       TEXT        NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE', 'REVOKED')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at   TIMESTAMPTZ,
    CONSTRAINT dev_api_keys_public_value_shape CHECK (
        (kind = 'PUBLISHABLE' AND public_value IS NOT NULL) OR
        (kind = 'SECRET'      AND public_value IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_dev_api_keys_project
    ON developer.dev_api_keys (project_id, environment, status);

-- ── Project ↔ Business link (schema/design prep; execution deferred) ─────────
-- The ONLY bridge from Developer to the Business/Core domains — an explicit,
-- auditable, capability-scoped grant created at Live activation. Never a creation
-- dependency. merchant_id is an OPAQUE reference to the Business context (no FK).
CREATE TABLE IF NOT EXISTS developer.dev_project_business_link (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id               UUID        NOT NULL REFERENCES developer.dev_projects (id) ON DELETE CASCADE,
    merchant_id              UUID        NOT NULL,   -- opaque Business/merchant id (no FK)
    environment              TEXT        NOT NULL DEFAULT 'LIVE'
                             CHECK (environment IN ('SANDBOX', 'LIVE')),
    status                   TEXT        NOT NULL DEFAULT 'requested'
                             CHECK (status IN (
                                 'requested', 'awaiting_business_approval', 'awaiting_kyb',
                                 'awaiting_settlement', 'active', 'suspended', 'revoked'
                             )),
    requested_by_user_id     UUID        NOT NULL,   -- opaque identity_users.id (no FK)
    approved_by_user_id      UUID,                   -- opaque identity_users.id (no FK)
    authorization_reference  TEXT,
    capabilities             TEXT[]      NOT NULL DEFAULT '{}',
    kyb_snapshot_status      TEXT,                   -- snapshot only; Business remains source of truth
    settlement_snapshot_status TEXT,
    activated_at             TIMESTAMPTZ,
    revoked_at               TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_link_project ON developer.dev_project_business_link (project_id);
CREATE INDEX IF NOT EXISTS idx_dev_link_merchant ON developer.dev_project_business_link (merchant_id);

-- ── Context-owned, append-only audit ─────────────────────────────────────────
-- Workspace/member/project/key/link actions. Never stores raw secrets or tokens.
CREATE TABLE IF NOT EXISTS developer.audit_events (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID,                              -- opaque identity_users.id (no FK)
    workspace_id  UUID,
    project_id    UUID,
    action        TEXT        NOT NULL,
    subject       TEXT,
    metadata      JSONB       NOT NULL DEFAULT '{}',
    request_ip    TEXT,
    request_id    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_audit_workspace
    ON developer.audit_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_audit_action
    ON developer.audit_events (action, created_at DESC);

-- DB-enforced append-only: block UPDATE and DELETE.
CREATE OR REPLACE FUNCTION developer.audit_events_append_only()
    RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'developer.audit_events is append-only';
END;
$$;
DROP TRIGGER IF EXISTS audit_events_append_only ON developer.audit_events;
CREATE TRIGGER audit_events_append_only
    BEFORE UPDATE OR DELETE ON developer.audit_events
    FOR EACH ROW EXECUTE FUNCTION developer.audit_events_append_only();
