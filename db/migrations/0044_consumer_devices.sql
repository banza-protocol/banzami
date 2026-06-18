-- RSK-001 — device signal for consumer payments.
--
-- Records the (hashed) devices a consumer has paid from, so the risk layer can
-- recognise a known device vs a new one. A high-value payment from a device not
-- seen before for that consumer is flagged for operator review (RSK-002).

CREATE TABLE consumer_devices (
    consumer_id    UUID        NOT NULL,
    -- SHA-256 of the client-supplied device identifier; the raw id is never stored.
    device_hash    TEXT        NOT NULL,
    first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer_id, device_hash)
);

CREATE INDEX consumer_devices_consumer_idx ON consumer_devices (consumer_id);

COMMENT ON TABLE consumer_devices IS
    'RSK-001 device signal: hashed devices seen per consumer. A new device on a high-value payment is flagged for review.';
