-- 0144 — Value moves inside Banzami; external rails are boundaries (ADR-061).
--
-- Two things, both about who may change what.
--
-- 1. ONE FINANCIAL WRITER
--
-- Every service connects as the same runtime role, so "only Core writes
-- financial state" was a convention: nothing in the database stopped the
-- gateway, public-api, developer-api, admin-api or an operator script from
-- inserting a ledger entry or updating a wallet. The ledger's own immutability
-- triggers (0033) stop UPDATE and DELETE of postings, not an INSERT from the
-- wrong process, and they say nothing about wallets, payments or payouts.
--
-- A statement-level trigger on every table that holds financial state now
-- refuses a write that does not come from Core. Core identifies itself with
-- application_name = 'banzami-core' on every pooled connection (core/api
-- main.rs). The owner of the table — the migration identity, or a superuser
-- in a disposable test database — keeps its rights, so migrations and
-- #[sqlx::test] databases work unchanged.
--
-- This is a guard against an accidental second writer, not a security
-- boundary against a compromised service: application_name is set by the
-- client. The boundary it enforces is architectural — a new gateway handler or
-- script that writes money fails the first time it runs — and it is the reason
-- tools/check-wallet-native-architecture.mjs can prove it behaviourally.
--
-- 2. THE SANDBOX EXTERNAL RAIL
--
-- The Public Sandbox needs to model an external rail that is down without
-- touching real infrastructure. The state is per Business: a developer takes
-- their own simulated rail down, never anybody else's. Core reads it where an
-- operation crosses the rail (acquiring initiation and confirmation, payout
-- submission and confirmation) and nowhere else — a wallet movement never
-- looks at it. Sandbox only: Core refuses to read or write it in LIVE.

CREATE TABLE IF NOT EXISTS sandbox_external_rail_states (
    merchant_id UUID PRIMARY KEY REFERENCES merchants(id),
    state       TEXT NOT NULL CHECK (state IN ('AVAILABLE', 'UNAVAILABLE')),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE sandbox_external_rail_states IS
    'Sandbox only. The simulated external rail of one Business: AVAILABLE or UNAVAILABLE. No row means AVAILABLE. Read by Core only where an operation crosses the rail; never by a wallet movement (ADR-061).';

CREATE OR REPLACE FUNCTION banzami_financial_writer_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    owner_role TEXT;
BEGIN
    IF current_setting('application_name', true) LIKE 'banzami-core%' THEN
        RETURN NULL;
    END IF;
    SELECT tableowner INTO owner_role
      FROM pg_tables
     WHERE schemaname = TG_TABLE_SCHEMA AND tablename = TG_TABLE_NAME;
    IF owner_role IS NOT NULL AND pg_has_role(current_user, owner_role, 'MEMBER') THEN
        RETURN NULL;
    END IF;
    RAISE EXCEPTION 'FINANCIAL_WRITE_OUTSIDE_CORE: % on %.% by role % (application_name "%"): financial state is written by Banzami Core only (ADR-061)',
        TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME, current_user, current_setting('application_name', true)
        USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION banzami_financial_writer_guard() IS
    'ADR-061: refuses INSERT/UPDATE/DELETE/TRUNCATE on financial-state tables from any connection that is not Banzami Core (application_name banzami-core) or the table owner.';

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'ledger_accounts', 'ledger_postings', 'ledger_entries',
        'wallets', 'consumer_wallets', 'wallet_accounts', 'wallet_account_transfers', 'wallet_reservations',
        'wallet_payments', 'transfers', 'transactions',
        'payment_sessions', 'payment_links',
        'refunds', 'refund_events', 'restitution_allocations',
        'acquiring_payments', 'acquiring_callbacks', 'consumer_deposits',
        'payouts', 'app_settlements', 'settlements', 'operator_fees',
        'split_sessions', 'split_contributions'
    ] LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_core_only_writer', t);
            EXECUTE format(
                'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I
                   FOR EACH STATEMENT EXECUTE FUNCTION banzami_financial_writer_guard()',
                t || '_core_only_writer', t);
        END IF;
    END LOOP;
END $$;
