-- The last two environment defaults are removed.
--
-- 0114 removed DEFAULT 'LIVE' from eighteen tables. Two columns kept a default
-- because neither could fail open:
--
--   developer.dev_project_sandbox_binding.environment  DEFAULT 'SANDBOX'
--       the table holds Sandbox bindings only (CHECK environment = 'SANDBOX');
--   platform_settings.environment                      DEFAULT 'GLOBAL'
--       platform mode is one setting for the whole platform, not per environment.
--
-- Safe, but still a runtime dependency on a default: their writers named no
-- environment and let the database answer. The writers now name it
-- ('SANDBOX' and 'GLOBAL'), deployed before this migration — the same two-phase
-- order 0114 used — so after this every environment column in the service
-- schemas is NOT NULL with no default, and a writer that forgets it fails at
-- the write.
--
-- No row is inserted, updated or deleted.

DO $$
BEGIN
    -- What this migration assumes; if either changed, stop and look.
    IF EXISTS (SELECT 1 FROM developer.dev_project_sandbox_binding WHERE environment IS DISTINCT FROM 'SANDBOX') THEN
        RAISE EXCEPTION 'dev_project_sandbox_binding holds a non-SANDBOX row; refusing to change its environment column';
    END IF;
    IF EXISTS (SELECT 1 FROM platform_settings WHERE environment IS DISTINCT FROM 'GLOBAL') THEN
        RAISE EXCEPTION 'platform_settings holds a non-GLOBAL row; refusing to change its environment column';
    END IF;
END $$;

ALTER TABLE developer.dev_project_sandbox_binding ALTER COLUMN environment DROP DEFAULT;
ALTER TABLE platform_settings ALTER COLUMN environment DROP DEFAULT;
