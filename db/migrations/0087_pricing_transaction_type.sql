-- 0087_pricing_transaction_type.sql
-- ADR-031: add an optional transaction_type matching dimension to pricing_rules.
-- Nullable and backward-compatible — existing rules (transaction_type NULL) match
-- exactly as before; only rules that set it become transaction-type-specific.
-- Reference only, never a price (mirrors business_category).

ALTER TABLE pricing_rules
  ADD COLUMN IF NOT EXISTS transaction_type TEXT;

-- Hot lookup for the engine when a transaction type is present.
CREATE INDEX IF NOT EXISTS idx_pricing_rules_env_txtype
  ON pricing_rules (environment, transaction_type)
  WHERE transaction_type IS NOT NULL;
