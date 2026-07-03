-- Forward-only, idempotent repair for drifted 0044_consumer_devices.
-- Re-creates the RSK-001 device-signal table + index idempotently.
-- Additive; never edits history/checksums.

CREATE TABLE IF NOT EXISTS consumer_devices (
    consumer_id    UUID        NOT NULL,
    device_hash    TEXT        NOT NULL,
    first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer_id, device_hash)
);

CREATE INDEX IF NOT EXISTS consumer_devices_consumer_idx ON consumer_devices (consumer_id);

COMMENT ON TABLE consumer_devices IS
    'RSK-001 device signal: hashed devices seen per consumer. A new device on a high-value payment is flagged for review.';
