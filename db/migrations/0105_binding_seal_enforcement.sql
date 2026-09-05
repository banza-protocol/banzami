-- 0105_binding_seal_enforcement.sql
-- A sealed Project binding cannot be moved, disabled or un-sealed (ADR-055).
--
-- `artifact_created` has existed since 0100 and nothing ever set it: the column
-- read as an enforced guarantee and was inert. ADR-055 makes it load-bearing —
-- the first payer-facing payment artifact seals the binding, permanently.
--
-- The rule is enforced here as well as in the service, and that duplication is
-- deliberate. A guard that lives only in a WHERE clause disappears the moment
-- someone writes a different query; a trigger refuses regardless of who is
-- asking or how. Removing either one alone must not remove the guarantee, and a
-- test asserts exactly that.
--
-- What a sealed binding may still change: nothing that alters economic
-- ownership. `updated_at` moves, and re-sealing an already-sealed row is a
-- no-op, because the seal path is idempotent by design.
--
-- Additive. No existing row is modified.

CREATE OR REPLACE FUNCTION developer.dev_binding_seal_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only a SEALED row is protected. An unsealed binding stays correctable,
    -- which is the whole point of sealing on first artifact rather than on
    -- creation.
    IF OLD.artifact_created IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    IF NEW.artifact_created IS NOT TRUE THEN
        RAISE EXCEPTION 'binding % is sealed and cannot be un-sealed (ADR-055)', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.state IS DISTINCT FROM OLD.state THEN
        RAISE EXCEPTION 'binding % is sealed; its state cannot change (ADR-055)', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.merchant_id        IS DISTINCT FROM OLD.merchant_id
       OR NEW.wallet_id         IS DISTINCT FROM OLD.wallet_id
       OR NEW.wallet_account_id IS DISTINCT FROM OLD.wallet_account_id
       OR NEW.project_id        IS DISTINCT FROM OLD.project_id THEN
        RAISE EXCEPTION 'binding % is sealed; its payee cannot change (ADR-055)', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev_binding_seal_guard ON developer.dev_project_sandbox_binding;
CREATE TRIGGER trg_dev_binding_seal_guard
    BEFORE UPDATE ON developer.dev_project_sandbox_binding
    FOR EACH ROW EXECUTE FUNCTION developer.dev_binding_seal_guard();

-- Deleting a sealed binding would erase the authority an issued artifact was
-- created under, which is the same harm by another verb.
CREATE OR REPLACE FUNCTION developer.dev_binding_seal_delete_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.artifact_created IS TRUE THEN
        RAISE EXCEPTION 'binding % is sealed and cannot be deleted (ADR-055)', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev_binding_seal_delete_guard ON developer.dev_project_sandbox_binding;
CREATE TRIGGER trg_dev_binding_seal_delete_guard
    BEFORE DELETE ON developer.dev_project_sandbox_binding
    FOR EACH ROW EXECUTE FUNCTION developer.dev_binding_seal_delete_guard();
