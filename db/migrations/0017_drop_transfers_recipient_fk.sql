-- Drop the FK that restricts transfers.recipient_id to consumers(id).
-- Payment link payments credit merchant wallets (whose UUIDs are NOT in the
-- consumers table), so the FK was preventing those transfers from being
-- recorded. Data integrity is enforced at the application layer: the engine
-- validates both sender and recipient wallets before inserting.
ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_recipient_id_fkey;
