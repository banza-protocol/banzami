-- Consumer verification badge — admin-assigned trust signal shown in the mobile app.
-- NULL = no badge (default). CONSUMER = gold individual badge. MERCHANT = blue merchant badge.

ALTER TABLE consumers
    ADD COLUMN verification_badge TEXT
        CHECK (verification_badge IN ('CONSUMER', 'MERCHANT'));

COMMENT ON COLUMN consumers.verification_badge
    IS 'Admin-assigned badge. NULL = none. CONSUMER = verified individual (gold). MERCHANT = verified business (blue).';
