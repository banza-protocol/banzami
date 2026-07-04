-- Audit log immutability enforcement — Phase 2 assurance defect D1
-- (docs/quality/REPAIR_LOG.md, programme BANZAMI-SANDBOX-RELEASE-ASSURANCE-001)
--
-- audit_log was declared append-only in 0025 but enforced only by
-- application-layer convention. A direct SQL UPDATE/DELETE (compromised
-- service, operator error, injection) could silently rewrite audit history.
-- This applies the same fail-closed trigger pattern used for ledger tables
-- in 0033: corrections are new rows, never mutations.

CREATE FUNCTION raise_audit_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
        'Audit records are immutable (table: %). '
        'Append a new audit entry to correct or annotate — never mutate history.',
        TG_TABLE_NAME;
END;
$$;

COMMENT ON FUNCTION raise_audit_immutable() IS
    'Trigger function that enforces append-only semantics on audit_log.';

CREATE TRIGGER audit_log_immutable_on_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION raise_audit_immutable();

CREATE TRIGGER audit_log_immutable_on_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION raise_audit_immutable();
