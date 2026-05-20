-- Migration: 0035_handle_format_constraint
-- Adds a DB-level CHECK constraint enforcing the canonical @banza handle format.
--
-- Rules (mirrors application-layer validate_handle in core/identity):
--   • 3–20 characters
--   • Starts with a lowercase letter (a-z)
--   • Contains only a-z, 0-9, underscore
--   • No consecutive underscores
--   • No trailing underscore
--
-- The UNIQUE constraint (consumers_handle_key) already exists from 0010.
-- This constraint closes the gap where application validation could be
-- bypassed by direct DB writes or future migrations that skip the engine.

ALTER TABLE consumers
    ADD CONSTRAINT consumers_handle_format CHECK (
        handle ~ '^[a-z][a-z0-9_]{2,19}$'
        AND handle !~ '__'
        AND handle !~ '_$'
    );
