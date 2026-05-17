-- Merchant verification flag — admin-assigned trust signal shown in the merchant app profile.
-- false = not yet verified (default). true = admin has verified this merchant.

ALTER TABLE merchants
    ADD COLUMN verified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN merchants.verified
    IS 'Admin-assigned verification. true = verified merchant (blue badge in app).';
