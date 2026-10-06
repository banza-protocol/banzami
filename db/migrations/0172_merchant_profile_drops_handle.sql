-- handle_registry is the sole Business identity authority — drop the duplicate.
--
-- merchant_profiles.handle was never an independent identity: the approval flow
-- wrote the SAME @banza into merchant_profiles.handle, handle_registry (owner_type
-- MERCHANT) and merchant_app_credentials.handle. Payment routing resolves a named
-- party ONLY through handle_registry; the profile copy was a denormalized
-- redundancy with its own UNIQUE + CHECK — a second, independent uniqueness
-- authority for the same identity, which is exactly what we do not want.
--
-- This removes merchant_profiles.handle and everything that depended on it. The
-- @banza of a profile is now derived from handle_registry by merchant_id wherever
-- it is shown. merchant_profiles keeps profile METADATA only (display_name,
-- tagline, description, category, logo/cover, wallet_id, public) keyed by
-- merchant_id (its FK to merchants, ON DELETE CASCADE, is unchanged).
--
-- merchant_app_credentials.handle is deliberately NOT touched: it is the Business
-- login credential, a FOREIGN KEY into handle_registry(handle) (0051) kept in step
-- with the owner by 0117 — a credential reference to the authority, not a second
-- identity.
--
-- The Sandbox is reset after this, so no data backfill is needed; the migration
-- is written to apply cleanly on a fresh DB in sequence.

-- Drop the format CHECK and the lookup index that depend on the column.
ALTER TABLE merchant_profiles DROP CONSTRAINT IF EXISTS chk_handle_format;
DROP INDEX IF EXISTS idx_merchant_profiles_handle;

-- Drop the column. Its inline UNIQUE (merchant_profiles_handle_key) is removed
-- with it. merchant_id's own UNIQUE/FK remains the one row-per-merchant rule.
ALTER TABLE merchant_profiles DROP COLUMN IF EXISTS handle;
