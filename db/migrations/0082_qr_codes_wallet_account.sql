-- 0082: bind a dynamic QR to a segregated wallet account (ADR-042).
--
-- A campaign-bound QR (e.g. a DOA campaign) carries the wallet_account it should
-- credit. NULL keeps the existing behaviour: the payment credits the owner's
-- default wallet account. Dynamic QR only — static QR has no DB-bound account.
-- The transfer engine re-validates this account at pay time (must belong to the
-- recipient wallet, be ACTIVE, and match the currency), so this column is a
-- routing hint, never an authority over balances.

ALTER TABLE qr_codes
    ADD COLUMN IF NOT EXISTS wallet_account_id UUID REFERENCES wallet_accounts(id);

CREATE INDEX IF NOT EXISTS qr_codes_wallet_account_idx
    ON qr_codes (wallet_account_id)
    WHERE wallet_account_id IS NOT NULL;

COMMENT ON COLUMN qr_codes.wallet_account_id IS
    'ADR-042: segregated wallet account to credit (dynamic QR). NULL = default account.';
