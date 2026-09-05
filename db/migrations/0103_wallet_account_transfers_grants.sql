-- Grants for wallet_account_transfers.
--
-- Table privileges in this database come from ALTER DEFAULT PRIVILEGES keyed to
-- the role that creates the object. 0102 was applied by a role outside that
-- arrangement, so the table was created without the runtime role's grants and
-- every transfer failed with "permission denied for table
-- wallet_account_transfers" — a 500 at the gateway that said nothing about
-- permissions.
--
-- Granting explicitly here makes the table's access independent of which role
-- happened to run the migration. That is the durable property: a migration
-- should not produce a different result depending on who applies it.
--
-- Guarded on role existence so the migration is valid in environments that do
-- not use this role model (CI creates a throwaway database as a single owner).

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bl_app_runtime') THEN
        GRANT SELECT, INSERT, UPDATE ON TABLE wallet_account_transfers TO bl_app_runtime;
    END IF;
    -- The read-only plane never writes; it is granted separately and only SELECT.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bl_control_plane') THEN
        GRANT SELECT ON TABLE wallet_account_transfers TO bl_control_plane;
    END IF;
END
$$;
