-- Add suspension_notes to consumers for admin audit trail
-- Mirrors the notes field already present on merchant_compliance for consistency.

ALTER TABLE consumers ADD COLUMN suspension_notes TEXT;

COMMENT ON COLUMN consumers.suspension_notes IS 'Admin notes recorded at the time of suspension. NULL when not suspended.';
