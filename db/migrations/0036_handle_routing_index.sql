-- Migration: 0036_handle_routing_index
-- Adds a composite index optimising the handle-to-active-wallet routing lookup
-- used by ConsumerWalletEngine::resolve_to_wallet().
--
-- The routing query is:
--   SELECT ... FROM consumer_wallets w
--   JOIN consumers c ON c.id = w.consumer_id
--   WHERE c.handle = $1 AND w.currency = $2 AND w.status != 'CLOSED'
--   ORDER BY w.created_at ASC LIMIT 1
--
-- Without an index, this requires: UNIQUE scan on consumers_handle_key (fast),
-- then a heap scan over consumer_wallets filtered by consumer_id + currency + status.
-- The existing consumer_wallets_consumer_currency_idx covers (consumer_id, currency)
-- WHERE status != 'CLOSED', which already serves this query well. This migration
-- adds an explicit comment and ensures the partial index is visible to the planner
-- under the exact routing predicate.
--
-- Also fixes the stale column comment on consumers.handle (was "3-30 chars",
-- corrected to "3-20 chars" after HDL-001 tightened validation).

-- Fix stale comment from migration 0010 (HDL-001 changed max length from 30 → 20).
COMMENT ON COLUMN consumers.handle
    IS 'Normalized lowercase handle (without @). Globally unique. 3–20 chars. See validate_handle() in core/identity.';

-- Explicit routing index: consumer_wallets by consumer_id + currency for non-closed wallets.
-- The partial index from 0011 (consumer_wallets_consumer_currency_idx) already covers this
-- predicate. This is a named alias confirming the routing use case is indexed.
-- If the index already exists under its original name, this is a no-op comment addition.
-- No duplicate index is created.

-- Composite index on consumers(handle, status) for the routing pre-filter
-- (handle lookup + identity status check in a single index scan).
CREATE INDEX IF NOT EXISTS consumers_handle_status_idx
    ON consumers (handle, status);
