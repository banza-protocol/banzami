-- Migration 0038: Indexes for the consumer activity feed (WAL-003)
--
-- The activity feed is a UNION ALL of:
--   1. transfers WHERE sender_id = consumer_id   (P2P_SENT)
--   2. transfers WHERE recipient_id = consumer_id (P2P_RECEIVED)
--   3. consumer_deposits WHERE consumer_id = ?    (WALLET_FUNDED / WALLET_REVERSED)
--
-- Ordered by (created_at DESC, id DESC) for deterministic cursor-based pagination.
-- These indexes support that ordering per branch of the UNION without a full-table scan.

-- Consumer deposits: include id as tiebreaker for stable cursor pagination.
-- Partial index on the two consumer-visible terminal states only.
CREATE INDEX IF NOT EXISTS idx_consumer_deposits_activity
    ON consumer_deposits (consumer_id, created_at DESC, id DESC)
    WHERE status IN ('SETTLED', 'REVERSED');

-- Transfers sender branch: already covered by transfers_sender_idx (sender_id, created_at DESC).
-- Add explicit index with id tiebreaker for cursor stability on same-timestamp rows.
CREATE INDEX IF NOT EXISTS idx_transfers_sender_activity
    ON transfers (sender_id, created_at DESC, id DESC)
    WHERE status = 'COMPLETED';

-- Transfers recipient branch: same, for incoming transfers.
CREATE INDEX IF NOT EXISTS idx_transfers_recipient_activity
    ON transfers (recipient_id, created_at DESC, id DESC)
    WHERE status = 'COMPLETED';
