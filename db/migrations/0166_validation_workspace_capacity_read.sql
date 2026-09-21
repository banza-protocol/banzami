-- 0166 — the control plane may READ the workspace quota it must gate on.
--
-- Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001).
--
-- WHY
--
-- BZV-20260921-0001 was ABANDONED with the shared fixture actor at 20/20
-- workspace creations while every readiness gate printed green: workspace
-- capacity was not gated at all. It is now — two families, per actor, at owner
-- readiness, at Prepare, at Start and again before the executor claims.
--
-- The control plane's half of that needs one thing it did not have: the ability
-- to ask developer.dev_workspaces the same question the limiter asks
-- (services/developer-api/internal/developer/store_pg.go,
-- WorkspaceCreationCounts). Without it the checks answer UNKNOWN_CAPACITY —
-- which is the correct fail-closed behaviour, and also means the gate can never
-- open for a reason that has nothing to do with capacity.
--
-- WHAT THIS DOES NOT GRANT
--
-- SELECT, on ONE table, to ONE role. No INSERT, no UPDATE, no DELETE, and
-- nothing else in the schema. The control plane prepares, describes and
-- cancels; it does not create workspaces, and this must not become the grant
-- that lets it. The Developer domain stays owned by developer-api.
--
-- Forward-only. Re-runnable: every statement is idempotent, and the role guard
-- means a database where the per-service roles were never bootstrapped applies
-- this as a no-op rather than failing.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bl_admin_api_runtime') THEN
        RAISE NOTICE '0166: bl_admin_api_runtime absent; nothing to grant';
        RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'developer') THEN
        RAISE NOTICE '0166: schema developer absent; nothing to grant';
        RETURN;
    END IF;

    -- USAGE is reach, not read: without it the SELECT below is invisible.
    GRANT USAGE ON SCHEMA developer TO bl_admin_api_runtime;

    -- The ONE table the capacity gate reads. Named explicitly rather than
    -- granted over the schema, so a table added to the Developer domain
    -- tomorrow does not silently become readable by the control plane.
    GRANT SELECT ON TABLE developer.dev_workspaces TO bl_admin_api_runtime;
END
$$;
