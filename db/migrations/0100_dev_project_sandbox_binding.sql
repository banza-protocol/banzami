-- Project→Merchant Sandbox binding (ADR-047, Release Train 04).
--
-- developer-api is the single authority for a Console Project's SANDBOX payee
-- binding. The Gateway derives payment authority ONLY from this binding (via
-- introspection) and keeps no competing table. The binding is operator-
-- provisioned (never public self-service): the merchant + wallet are created in
-- core and their ids recorded here (opaque — no FK to core schema).
--
-- Invariants:
--   * one ACTIVE binding per project (partial unique index);
--   * SANDBOX only (environment CHECK);
--   * artifact_created marks the binding immutable (once the project has created
--     a payment artifact, its payee cannot change — no retroactive reattribution);
--   * append-only audit lives in developer.audit_events (not erased on delete).

CREATE TABLE developer.dev_project_sandbox_binding (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         UUID NOT NULL REFERENCES developer.dev_projects(id) ON DELETE CASCADE,
    environment        TEXT NOT NULL DEFAULT 'SANDBOX' CHECK (environment = 'SANDBOX'),
    merchant_id        UUID NOT NULL,   -- opaque core id (payee merchant)
    wallet_id          UUID NOT NULL,   -- opaque core id
    wallet_account_id  UUID NOT NULL,   -- opaque core id (PRIMARY payee account)
    state              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'DISABLED')),
    artifact_created   BOOLEAN NOT NULL DEFAULT false,  -- set true once a session/link exists
    created_by_user_id UUID NOT NULL,   -- opaque identity_users.id (provisioning authority)
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one ACTIVE binding per project (DB-enforced, ADR-047 §3.1).
CREATE UNIQUE INDEX dev_project_sandbox_binding_one_active
    ON developer.dev_project_sandbox_binding (project_id)
    WHERE state = 'ACTIVE';

CREATE INDEX dev_project_sandbox_binding_project ON developer.dev_project_sandbox_binding (project_id);
