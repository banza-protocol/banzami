-- 0145 — Authority is a role, not a name; a Project's simulated rail is its own.
--
-- 1. WHO MAY WRITE FINANCIAL STATE
--
-- 0144 refused financial writes from a connection that did not name itself
-- banzami-core. A name is chosen by the client, so that guard detects a second
-- writer; it cannot stop a service that claims to be Core. The authority is now
-- PostgreSQL privilege: every service connects as its own role, and only
-- bl_core_runtime is granted INSERT, UPDATE or DELETE on a financial table
-- (db/authority/runtime-authority.sql, generated from the manifest beside it
-- and applied after every migration). The guard stays, as detection.
--
-- 2. A PROJECT'S SIMULATED RAIL
--
-- 0144 kept one simulated rail per Business. A Business can be shared: a
-- Project issues a consent code for its synthetic Business and a Project in
-- another Workspace connects to it. A switch per Business would let one
-- developer take the rail down under another developer's integration. The
-- self-service switch is now per (Project, Business):
--
--   * a test payment through a Project's key reads that Project's rail;
--   * a hosted payment reads the rail of the Project that created the Payment
--     Link or Session behind it, recorded in sandbox_link_projects at creation
--     from the authenticated key — never from a request body;
--   * sandbox_external_rail_states remains the Business-wide rail, set only
--     through Core's internal operator route: payouts, and hosted payments no
--     Project created, read it.
--
-- Sandbox only. Core refuses to record or read any of this in LIVE.

COMMENT ON FUNCTION banzami_financial_writer_guard() IS
    'ADR-061, detection and observability. The authority over financial state is PostgreSQL privilege (only bl_core_runtime is granted writes, db/authority/runtime-authority.sql). This trigger additionally refuses a write from a connection that does not name itself banzami-core.';

CREATE TABLE IF NOT EXISTS sandbox_project_rail_states (
    project_id  UUID        NOT NULL,
    merchant_id UUID        NOT NULL REFERENCES merchants (id),
    state       TEXT        NOT NULL CHECK (state IN ('AVAILABLE', 'UNAVAILABLE')),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, merchant_id)
);

COMMENT ON TABLE sandbox_project_rail_states IS
    'Sandbox only. The simulated external rail one Developer Project set for the Business its key is bound to. Affects that Project''s test payments and the hosted payments of links and sessions that Project created — nobody else''s (ADR-061 §5).';

CREATE TABLE IF NOT EXISTS sandbox_link_projects (
    payment_link_id UUID        PRIMARY KEY REFERENCES payment_links (id),
    project_id      UUID        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sandbox_link_projects_project ON sandbox_link_projects (project_id);

COMMENT ON TABLE sandbox_link_projects IS
    'Sandbox only. The Developer Project whose authenticated key created a Payment Link (directly, or as a Payment Session''s link interface). Recorded by Core at creation; read only to find whose simulated rail a hosted payment uses.';

COMMENT ON TABLE sandbox_external_rail_states IS
    'Sandbox only. The Business-wide simulated external rail, set only through Core''s internal operator route. Read by payouts and by hosted payments no Project created. A Project''s self-service switch is sandbox_project_rail_states (0145).';
