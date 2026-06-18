-- Transactional outbox for financial webhook events (refunds, disputes).
--
-- The Rust core emits webhook events (refund.completed, dispute.opened,
-- dispute.resolved) by writing a webhook_events row alongside the financial
-- operation. The Go gateway worker then fans those rows out into
-- webhook_deliveries for the merchant's subscribed endpoints and delivers them
-- (signed with Banza-Signature, with retry). This avoids silently dropping
-- financial webhook events.
--
-- - dispatched_at: NULL means "not yet fanned out to deliveries" (outbox row to
--   process). The gateway's inline Dispatch path sets it immediately because it
--   creates deliveries in the same transaction.
-- - idempotency_key: a stable per-logical-event key (e.g. "refund.completed:<id>")
--   so a replay of the source operation does not create a duplicate event.

ALTER TABLE webhook_events ADD COLUMN dispatched_at TIMESTAMPTZ;
ALTER TABLE webhook_events ADD COLUMN idempotency_key TEXT;

-- Existing events were created by the inline Dispatch path and already have
-- their deliveries — mark them dispatched so the outbox worker skips them.
UPDATE webhook_events SET dispatched_at = created_at WHERE dispatched_at IS NULL;

-- Dedupe emitted events by their logical key (multiple NULLs remain allowed for
-- the inline Dispatch path, which does not set a key).
CREATE UNIQUE INDEX uq_webhook_events_idempotency
    ON webhook_events (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- The outbox worker scans for rows awaiting fan-out.
CREATE INDEX idx_webhook_events_undispatched
    ON webhook_events (created_at) WHERE dispatched_at IS NULL;
