-- A1-06. Idempotency keys were globally unique, so one tenant could learn that
-- another's key existed (409 on reuse) and could pre-claim predictable keys of
-- a tenant that had not used them yet. A key belongs to the owner that chose
-- it: the same text from two owners is two operations.
--
-- Not transfers: a transfer's key on the hosted rail is 'pl-pay-<link>', shared
-- on purpose so a second payer's transfer collides BEFORE any money moves
-- (RA-100). That one stays global.
--
-- Existing rows satisfy the new indexes: global uniqueness implies uniqueness
-- per owner.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_idempotency_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_owner_idempotency_key
    ON transactions (merchant_id, idempotency_key);

ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_idempotency_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS payouts_owner_idempotency_key
    ON payouts (merchant_id, idempotency_key);

-- For a settlement the owner is the Business that made it (application_id, the
-- SEC-002 binding), NOT owner_ref — that is a reference the caller writes.
-- application_id is nullable on older rows, so they are keyed together under ''.
ALTER TABLE app_settlements DROP CONSTRAINT IF EXISTS app_settlements_idempotency_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS app_settlements_owner_idempotency_key
    ON app_settlements (COALESCE(application_id, ''), idempotency_key);
