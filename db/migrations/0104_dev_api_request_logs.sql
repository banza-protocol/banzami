-- 0104_dev_api_request_logs.sql
-- Developer API request logs — the data behind the Console's Logs screen.
--
-- The Console previously had no per-request log at all: the screen showed
-- webhook events and delivery attempts, which are real but are not what a
-- developer means by "API logs". A developer debugging an integration wants the
-- request THEY made: what they called, what came back, and the request_id they
-- can quote in support. That record did not exist anywhere queryable, so the
-- page said so instead of inventing it. This table is that record.
--
-- Owned by the `developer` bounded context (ADR-033): it is written by the
-- api-gateway when a Developer Platform project credential authenticates a
-- request, and read only by developer-api, scoped to one project.
--
-- WHAT IS DELIBERATELY NOT HERE
--   No Authorization header, no API key (raw or hashed), no webhook secret, no
--   cookie, no OTP, no request or response body, no header map at all. The
--   columns below are the complete set: there is no JSONB escape hatch through
--   which a future handler could put a payload in. `path` is stored without its
--   query string and with any bz_*_(sk|pk)_ token redacted, because the one way
--   a credential can reach a URL is a caller putting it there.
--
-- This is diagnostic telemetry, NOT an audit record. developer.audit_events is
-- append-only and immutable (0099) and is governed by its own retention; this
-- table is prunable by design and the pruner never touches audit rows.
--
-- Additive. No existing table is altered.

CREATE TABLE IF NOT EXISTS developer.dev_api_request_logs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   UUID        NOT NULL REFERENCES developer.dev_projects (id) ON DELETE CASCADE,
    -- The non-secret identity of the key that authenticated the request. Not a
    -- FK: a rotated or revoked key is deleted from nothing, but if it ever were,
    -- the log line should survive it.
    key_id       UUID,
    environment  TEXT        NOT NULL CHECK (environment IN ('SANDBOX', 'LIVE')),
    method       TEXT        NOT NULL,
    -- The URL path as called, query string stripped. Carries resource ids, which
    -- is the point — a developer looks for the refund they just attempted.
    path         TEXT        NOT NULL,
    -- The chi route pattern, e.g. /v1/business/refunds/{id}: the canonical
    -- operation, low-cardinality, groupable.
    route        TEXT        NOT NULL DEFAULT '',
    status       INT         NOT NULL,
    -- Correlates with the request_id in the error envelope the caller received
    -- and with the gateway's structured logs. Non-secret by construction.
    request_id   TEXT        NOT NULL DEFAULT '',
    latency_ms   INT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The Console's default view: newest first, one project.
CREATE INDEX IF NOT EXISTS idx_dev_api_logs_project_time
    ON developer.dev_api_request_logs (project_id, created_at DESC);

-- "Find the request_id I was given" — the correlation lookup, still project-scoped
-- so it can never become a cross-project oracle.
CREATE INDEX IF NOT EXISTS idx_dev_api_logs_project_request
    ON developer.dev_api_request_logs (project_id, request_id)
    WHERE request_id <> '';

-- Retention pruning scans by age across all projects.
CREATE INDEX IF NOT EXISTS idx_dev_api_logs_created
    ON developer.dev_api_request_logs (created_at);

-- Grants, for the same reason as 0103: table privileges here come from ALTER
-- DEFAULT PRIVILEGES keyed to the creating role, so a migration applied by a
-- different role would otherwise produce a table the runtime cannot write.
-- The gateway writes and prunes; the control plane only reads.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bl_app_runtime') THEN
        GRANT SELECT, INSERT, DELETE ON TABLE developer.dev_api_request_logs TO bl_app_runtime;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bl_control_plane') THEN
        GRANT SELECT ON TABLE developer.dev_api_request_logs TO bl_control_plane;
    END IF;
END
$$;
