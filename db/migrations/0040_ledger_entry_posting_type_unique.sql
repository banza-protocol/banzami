-- Defense-in-depth: enforce at most one DEBIT and one CREDIT entry per
-- ledger posting. The application already uses idempotency keys on postings
-- and ON CONFLICT DO NOTHING on entries; this constraint ensures even a
-- concurrent transaction race cannot produce duplicate entries on the same
-- posting.
--
-- Safe to apply: no existing posting should have two entries of the same
-- type (double-entry accounting requires exactly one DEBIT and one CREDIT).

ALTER TABLE ledger_entries
    ADD CONSTRAINT uq_ledger_entry_posting_type
    UNIQUE (posting_id, entry_type);
