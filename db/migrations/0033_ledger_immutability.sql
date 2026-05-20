-- Ledger immutability enforcement — INV-LED-001-2
--
-- Prevents UPDATE and DELETE on ledger_entries and ledger_postings.
-- Corrections must always be made through new reversal postings (new INSERTs).
-- Mutating financial history is forbidden: each row is final once committed.
-- (CLAUDE.md §10.1 — "immutable entries, append-only philosophy")

CREATE FUNCTION raise_ledger_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
        'Ledger records are immutable (table: %). '
        'Use a reversal posting to correct an error — never mutate existing entries.',
        TG_TABLE_NAME;
END;
$$;

COMMENT ON FUNCTION raise_ledger_immutable() IS
    'Trigger function that enforces append-only semantics on ledger tables.';

-- ledger_entries

CREATE TRIGGER ledger_entries_immutable_on_update
    BEFORE UPDATE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION raise_ledger_immutable();

CREATE TRIGGER ledger_entries_immutable_on_delete
    BEFORE DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION raise_ledger_immutable();

-- ledger_postings

CREATE TRIGGER ledger_postings_immutable_on_update
    BEFORE UPDATE ON ledger_postings
    FOR EACH ROW EXECUTE FUNCTION raise_ledger_immutable();

CREATE TRIGGER ledger_postings_immutable_on_delete
    BEFORE DELETE ON ledger_postings
    FOR EACH ROW EXECUTE FUNCTION raise_ledger_immutable();
