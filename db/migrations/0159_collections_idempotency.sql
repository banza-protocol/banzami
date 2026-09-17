-- 0159 — Collections create idempotency (INV-COLLECTION-008, BANZA spec/idempotency.md).
--
-- COLLECTIONS-PROTOCOL-AND-PRODUCT-001 Phase 1. Two corrections to the folded
-- 0156 schema, both required to make Collection creation idempotent per the
-- ratified protocol spec:
--
-- 1. SCOPE. 0156 declared `idempotency_key VARCHAR(255) UNIQUE` — a GLOBAL unique.
--    The BANZA idempotency spec (spec/idempotency.md §2) is explicit that an
--    idempotency key is NOT globally unique and MUST NOT be treated as such: its
--    identity is the tuple (receiving_implementation, authenticated_caller,
--    operation, idempotency_key). For a Collection create the authenticated caller
--    is the merchant and the receiving implementation is the environment's engine,
--    so the canonical scope on this table is (merchant_id, environment,
--    idempotency_key). A global unique would make two unrelated Businesses that
--    both use "order-001" collide (INV false conflict). We drop the global unique
--    and add the correctly-scoped one.
--
-- 2. REQUEST FINGERPRINT. Idempotency distinguishes a REPLAY (same key, same
--    request → same Collection) from a CONFLICT (same key, different request →
--    error). To decide that deterministically we persist a fingerprint of the
--    create request's semantic fields (spec/idempotency.md §3). NULL for rows
--    created without a key.
--
-- Data-safe: the key was never persisted before this migration (the INSERT
-- omitted the column), so every existing row has idempotency_key IS NULL and
-- neither change can conflict with existing data. Written idempotently
-- (IF EXISTS / IF NOT EXISTS) so it is a no-op on re-run.

-- 1. Drop the incorrect global unique (auto-named by 0156's inline column UNIQUE).
ALTER TABLE collections DROP CONSTRAINT IF EXISTS collections_idempotency_key_key;

-- 2. Persist the request fingerprint (semantic digest of the create request).
ALTER TABLE collections ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

-- 3. Canonical-scope uniqueness. A multi-column unique index treats NULL keys as
--    distinct, so keyless creates stay unconstrained (multiple NULL-key rows for
--    the same merchant are allowed) while a repeated (merchant, env, key) is
--    rejected — the boundary the engine's ON CONFLICT recovery relies on.
CREATE UNIQUE INDEX IF NOT EXISTS collections_idem_scope
    ON collections (merchant_id, environment, idempotency_key);

COMMENT ON COLUMN collections.idempotency_key IS
    'Caller-supplied idempotency key. Scope = (merchant_id, environment, idempotency_key) per BANZA spec/idempotency.md §2 — NEVER globally unique.';
COMMENT ON COLUMN collections.request_fingerprint IS
    'Semantic digest of the create request (spec/idempotency.md §3). Same key + same fingerprint = replay (return the same Collection); same key + different fingerprint = IDEMPOTENCY_CONFLICT.';
