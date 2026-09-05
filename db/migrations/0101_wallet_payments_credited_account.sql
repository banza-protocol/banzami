-- RA-061 — a refund must reverse funds from the account that received them.
--
-- A payment into a campaign credits that campaign's own wallet account, but the
-- refund debited the merchant's DEFAULT account: the restitution resolver read
-- `wallets.available_account_id` and had no way to know which sub-account the
-- money actually landed in. The posting balanced, so no ledger invariant fired —
-- it was simply the wrong account.
--
-- The consequence was quiet: after a partial refund the campaign account kept
-- the full amount, so a campaign would settle money already given back while the
-- operating balance silently absorbed it.
--
-- The refundable object now carries the credited child account, so the refund
-- can reverse exactly what the payment credited.
--
-- Nullable on purpose. Rows written before this column existed genuinely do not
-- know their destination account, and inventing one would be worse than
-- admitting it: the resolver falls back to the wallet default for those, which
-- is the pre-existing behaviour, and uses the recorded account whenever it is
-- present.

ALTER TABLE wallet_payments
    ADD COLUMN IF NOT EXISTS wallet_account_id UUID NULL REFERENCES wallet_accounts(id);

COMMENT ON COLUMN wallet_payments.wallet_account_id IS
    'The wallet_accounts row this payment credited (RA-061). A refund debits '
    'this account, not the wallet default. NULL for rows written before the '
    'column existed; those fall back to the wallet default.';

-- Refund resolution looks a payment up by id and then needs its credited
-- account; keeping the pair together avoids a second lookup on the money path.
CREATE INDEX IF NOT EXISTS wallet_payments_credited_account_idx
    ON wallet_payments (wallet_account_id)
    WHERE wallet_account_id IS NOT NULL;
