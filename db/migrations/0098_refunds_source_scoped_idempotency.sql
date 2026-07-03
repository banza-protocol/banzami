-- Source-scoped refund idempotency (Banzami D0 — idempotency-scope fix).
--
-- The refunds table historically enforced a GLOBAL unique on idempotency_key
-- (0027: `idempotency_key VARCHAR(255) NOT NULL UNIQUE`). That contradicts the
-- approved source-scoped idempotency model held by restitution_allocations
-- (UNIQUE (source_type, source_id, origin, idempotency_key)). Under the global
-- rule, the SAME idempotency key on a DIFFERENT source — including a different
-- merchant or a different source_type — collided at the refunds insert, producing
-- a 500 that leaked `refunds_idempotency_key_key`, a cross-tenant key-usage signal
-- and a cross-tenant denial of service.
--
-- This migration makes refunds idempotency SOURCE-SCOPED, matching the allocation
-- model (origin is unnecessary here — every refunds row is a REFUND). Forward-only:
-- the replacement is created and verified BEFORE the global constraint is dropped.
-- History is not rewritten; _sqlx_migrations is untouched. No CONCURRENTLY (small
-- table). Idempotency correctness is still primarily enforced by
-- restitution_allocations (unchanged); this index is the refunds-level guard.

-- 1. Safety: no existing rows may violate the new composite key.
DO $$
DECLARE dups int;
BEGIN
    SELECT count(*) INTO dups FROM (
        SELECT source_type, source_id, idempotency_key
        FROM refunds
        GROUP BY 1, 2, 3
        HAVING count(*) > 1
    ) d;
    IF dups > 0 THEN
        RAISE EXCEPTION 'refunds has % duplicate (source_type, source_id, idempotency_key) tuples — resolve before scoping idempotency', dups;
    END IF;
END $$;

-- 2. Create the source-scoped replacement FIRST.
CREATE UNIQUE INDEX IF NOT EXISTS refunds_source_idem_unique
    ON refunds (source_type, source_id, idempotency_key);

-- 3. Verify the replacement is in place BEFORE removing the old global uniqueness.
DO $$
BEGIN
    IF to_regclass('public.refunds_source_idem_unique') IS NULL THEN
        RAISE EXCEPTION 'refunds_source_idem_unique was not created — aborting before dropping the global constraint';
    END IF;
END $$;

-- 4. Only now drop the global uniqueness (constraint + its backing index).
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_idempotency_key_key;

COMMENT ON INDEX refunds_source_idem_unique IS
    'Source-scoped refund idempotency (D0): (source_type, source_id, idempotency_key). Same key on a different source/merchant/source_type is independent.';
