-- P2P-001: snapshot the normalized @banza handle used to route the transfer.
-- Nullable — pre-existing transfers routed by UUID have no handle snapshot.
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS recipient_handle TEXT;

-- Enables "show all transfers sent to @ana" without a join to consumers.
CREATE INDEX IF NOT EXISTS transfers_recipient_handle_idx
    ON transfers (recipient_handle)
    WHERE recipient_handle IS NOT NULL;
