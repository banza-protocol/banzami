-- The last fail-open environment default.
--
-- 0114 removed DEFAULT 'LIVE' from every environment column in the `public`
-- schema. It did not look anywhere else, and neither did its test, which counted
-- `table_schema='public'` and so could not see what it had missed:
--
--   developer.dev_project_business_link.environment  NOT NULL DEFAULT 'LIVE'
--
-- That table is the Project ↔ Business link created at Live activation. It has
-- no writer yet and no rows. That is exactly why the default must go now rather
-- than later: the first writer to exist will be the one that decides whether a
-- Developer Project is linked to a real-money Business, and if it forgets the
-- column the row must fail, not silently say LIVE.
--
-- What stays, and why:
--   developer.dev_project_sandbox_binding  DEFAULT 'SANDBOX' — pinned by
--     CHECK (environment = 'SANDBOX'). There is exactly one legal value, so the
--     default cannot choose a universe; it restates the only one there is.
--   public.platform_settings                DEFAULT 'GLOBAL'  — a SCOPE, not a
--     universe (0114 explains).
--
-- The data is untouched. Nothing is inserted, updated or deleted.

DO $$
DECLARE mode TEXT;
BEGIN
    SELECT value INTO mode
      FROM platform_settings
     WHERE key = 'platform_mode' AND environment = 'GLOBAL';
    IF mode IS DISTINCT FROM 'SANDBOX' THEN
        RAISE EXCEPTION
            'refusing to remove the environment default: platform_mode is %, not SANDBOX. '
            'Do this on a LIVE platform with someone watching.', COALESCE(mode, '<unset>');
    END IF;
END $$;

-- Nothing may be relying on the default: a row that exists claiming LIVE on a
-- Sandbox platform would mean a writer did.
DO $$
DECLARE live_rows INT;
BEGIN
    SELECT count(*) INTO live_rows
      FROM developer.dev_project_business_link WHERE environment = 'LIVE';
    IF live_rows <> 0 THEN
        RAISE EXCEPTION
            'refusing to remove the environment default: % business link(s) claim LIVE '
            'on a Sandbox platform, so something wrote through the default.', live_rows;
    END IF;
END $$;

ALTER TABLE developer.dev_project_business_link ALTER COLUMN environment DROP DEFAULT;
