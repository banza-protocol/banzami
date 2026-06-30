-- 0084: route a payment link to a segregated wallet account (ADR-030 Payment Sessions).
--
-- A payment link created from a Payment Session carries the destination
-- wallet_account (e.g. a DOA CAMPAIGN account), so when it is paid the transfer
-- credits THAT account — not the wallet's default available account. NULL keeps the
-- legacy behaviour: the link credits the wallet's PRIMARY/available account exactly
-- as before. The transfer engine re-validates the account at pay time (ADR-042:
-- belongs to the recipient wallet, ACTIVE, currency match), so this is a routing
-- hint, never an authority over balances.

ALTER TABLE payment_links
    ADD COLUMN IF NOT EXISTS wallet_account_id UUID REFERENCES wallet_accounts(id);

CREATE INDEX IF NOT EXISTS payment_links_wallet_account_idx
    ON payment_links (wallet_account_id)
    WHERE wallet_account_id IS NOT NULL;

COMMENT ON COLUMN payment_links.wallet_account_id IS
    'ADR-030: segregated wallet account to credit when paid (Payment Session). NULL = default account.';
