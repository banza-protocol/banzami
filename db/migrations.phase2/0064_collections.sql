-- Collections (BANZA ADR-036) — operator-side persistence of the canonical
-- protocol concept. A Collection is a COMPOSITE FINANCIAL OBLIGATION, never money:
-- it holds no balance and never posts to the ledger. Value moves only when each
-- share's PaymentIntent settles into a Transfer (see 0065/0066).
--
-- This operator implements the protocol concept exactly; it invents no Banzami
-- semantics. Status/rule/fields mirror contracts/collections/collection.schema.json
-- in ~/banza.

CREATE TABLE IF NOT EXISTS collections (
    id                  UUID         PRIMARY KEY,                  -- engine-supplied (payment-links style)
    operator_id         TEXT         NOT NULL,                     -- BANZA: operator that owns the collection
    creator             TEXT         NOT NULL,                     -- principal that created it
    owner               TEXT         NOT NULL,                     -- principal that controls it (mutate/close/cancel)
    merchant_id         UUID         NOT NULL,                     -- payee merchant; ownership/scoping key
    wallet_id           UUID         NOT NULL,                     -- payee wallet shares settle into (operator-side)
    title               TEXT,
    description         TEXT,
    currency            TEXT         NOT NULL DEFAULT 'AOA',
    total_amount_minor  BIGINT       NOT NULL CHECK (total_amount_minor >= 0),  -- integer minor units; never float
    status              TEXT         NOT NULL DEFAULT 'DRAFT'
                                     CHECK (status IN ('DRAFT','OPEN','PARTIALLY_COMPLETED','COMPLETED','EXPIRED','CANCELLED','FAILED')),
    rule                JSONB        NOT NULL,                     -- CollectionRule (tagged strategy) — collection-rule.schema.json
    environment         TEXT         NOT NULL DEFAULT 'LIVE' CHECK (environment IN ('LIVE','SANDBOX')),
    idempotency_key     VARCHAR(255) UNIQUE,
    expires_at          TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    metadata            JSONB        NOT NULL DEFAULT '{}',
    version             INTEGER      NOT NULL DEFAULT 1,           -- optimistic concurrency
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collections_merchant
    ON collections (merchant_id, environment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collections_active_expiry
    ON collections (expires_at)
    WHERE status IN ('OPEN','PARTIALLY_COMPLETED') AND expires_at IS NOT NULL;

COMMENT ON TABLE collections IS
    'BANZA ADR-036 Collection: composite financial obligation. Holds no money, never posts to the ledger. collected_amount is DERIVED from PAID shares, never stored as money here.';
COMMENT ON COLUMN collections.total_amount_minor IS
    'Hard total for closed rules; target/goal for open rules. Immutable after OPEN for closed rules (INV-COLLECTION-007).';
