-- 0123_application_origin_explicit.sql
-- Every writer names where an application came from.
--
-- 0121 added merchant_applications.origin with a default of
-- STANDALONE_BUSINESS for one reason: the Gateway running when it landed did
-- not name an origin yet. Every writer now does — the public form sends
-- STANDALONE_BUSINESS, a Developer Project's Financial Setup sends
-- DEVELOPER_PROJECT with its Project — so the default is removed. A writer that
-- forgets is refused instead of being filed, silently, as the public form (the
-- lesson of the environment defaults removed by 0114 and 0116).
--
-- Fail-closed precondition: no row may be without an origin.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM merchant_applications WHERE origin IS NULL) THEN
        RAISE EXCEPTION 'merchant_applications has rows without an origin';
    END IF;
END
$$;

ALTER TABLE merchant_applications ALTER COLUMN origin DROP DEFAULT;
