-- 0129 — every consumer's @banza is in the one namespace.
--
-- Consumers created through the identity path (core/identity) were written to
-- `consumers` only, never to `handle_registry`, the table every @banza lookup
-- routes through. 26 consumers created since 2026-09-09 were missing — two of
-- them real people. Their handles could not be named as a settlement party, and
-- a Business could have registered the same name: one @banza, two owners. The
-- identity path now writes both in one transaction; this registers the ones it
-- missed.
--
-- Only a handle nobody else holds is registered (ON CONFLICT DO NOTHING); none
-- of the 26 collided when this was written. A collision would be left for an
-- operator to resolve rather than decided here.

INSERT INTO handle_registry (handle, owner_type, owner_id, created_at)
SELECT c.handle, 'CONSUMER', c.id, c.created_at
  FROM consumers c
 WHERE c.handle IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM handle_registry h WHERE h.handle = c.handle)
ON CONFLICT (handle) DO NOTHING;
