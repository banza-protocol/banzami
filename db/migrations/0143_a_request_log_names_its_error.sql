-- A request log line names the error the caller received.
--
-- The Console's API logs showed method, path, status, latency and request_id,
-- but not WHICH error a failed request returned: a 422 could be
-- INSUFFICIENT_FUNDS or REFUND_EXCEEDS_CAPTURED, and the developer had to find
-- the response again to tell. The gateway reads the code from the error body it
-- is already sending (never any other part of the body) and records it here.
--
-- Additive and nullable: a successful request, and every row written before
-- this column, has no code. The CHECK keeps the column to the catalogue's code
-- shape, so nothing else — no message, no identifier — can be stored in it.
ALTER TABLE developer.dev_api_request_logs
    ADD COLUMN IF NOT EXISTS error_code TEXT
    CHECK (error_code IS NULL OR error_code ~ '^[A-Z][A-Z0-9_]{1,63}$');
