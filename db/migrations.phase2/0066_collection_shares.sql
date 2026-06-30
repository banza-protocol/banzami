-- CollectionShare (BANZA ADR-036) — one payer's portion of a Collection. Its own
-- aggregate root (scales to thousands of shares). NEVER contains a balance and
-- NEVER references the ledger. Its only money anchor is transfer_id (a pointer to
-- the real settling Transfer). Settled via its own PaymentIntent (0065).
-- Mirrors contracts/collections/collection-share.schema.json in ~/banza.

CREATE TABLE IF NOT EXISTS collection_shares (
    id                 UUID         PRIMARY KEY,
    collection_id      UUID         NOT NULL REFERENCES collections(id),
    merchant_id        UUID         NOT NULL,                       -- denormalized for ownership-scoped queries
    participant        TEXT,                                        -- @banza/wallet when known; null until paid for open contributions
    amount_minor       BIGINT       NOT NULL CHECK (amount_minor > 0),  -- integer minor units
    currency           TEXT         NOT NULL DEFAULT 'AOA',
    status             TEXT         NOT NULL DEFAULT 'PENDING'
                                    CHECK (status IN ('PENDING','LINK_CREATED','PAID','EXPIRED','CANCELLED','FAILED')),
    payment_intent_id  UUID         REFERENCES payment_intents(id), -- PaymentIntent backing this share
    transfer_id        UUID,                                        -- real settling Transfer; set ONLY when status=PAID
    environment        TEXT         NOT NULL DEFAULT 'LIVE' CHECK (environment IN ('LIVE','SANDBOX')),
    idempotency_key    VARCHAR(255) UNIQUE,
    expires_at         TIMESTAMPTZ,
    paid_at            TIMESTAMPTZ,
    metadata           JSONB        NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_shares_collection
    ON collection_shares (collection_id, created_at);
CREATE INDEX IF NOT EXISTS idx_collection_shares_merchant
    ON collection_shares (merchant_id, environment, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_shares_payment_intent
    ON collection_shares (payment_intent_id) WHERE payment_intent_id IS NOT NULL;

COMMENT ON TABLE collection_shares IS
    'BANZA ADR-036 CollectionShare: one payer portion. Holds no balance, no ledger reference. PAID only via a real confirmed Transfer (INV-COLLECTION-005); PAID is terminal — no double payment (INV-COLLECTION-006).';
