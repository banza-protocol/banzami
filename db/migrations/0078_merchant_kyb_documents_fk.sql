-- 0078: add the missing foreign key on merchant_kyb_documents.merchant_id.
--
-- The sibling table merchant_application_documents already REFERENCES its parent
-- (0054), but merchant_kyb_documents.merchant_id was a bare UUID NOT NULL with no
-- FK, so referential integrity rested entirely on app-layer check-then-insert
-- (non-atomic) — audit Part 10 / bug #11. ON DELETE RESTRICT keeps KYB history from
-- being orphaned and blocks deleting a merchant that still has KYB documents.
--
-- Pre-checked: zero rows in live `banzami` and sandbox `banzami_staging` violate
-- this constraint, so it applies cleanly (additive, non-destructive).

ALTER TABLE merchant_kyb_documents
  ADD CONSTRAINT merchant_kyb_documents_merchant_id_fkey
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT;
