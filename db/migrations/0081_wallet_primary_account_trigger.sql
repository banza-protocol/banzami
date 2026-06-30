-- 0081: every wallet automatically gets a PRIMARY wallet_account (ADR-042).
--
-- 0080 backfilled PRIMARY for wallets that existed at migration time. This trigger
-- makes PRIMARY automatic for every NEW wallet too (any creation path), so the
-- "exactly one PRIMARY per wallet" invariant holds without changing the wallet
-- creation code. The PRIMARY account ADOPTS the wallet's available account — no
-- money moves, no new ledger account.

CREATE OR REPLACE FUNCTION create_primary_wallet_account() RETURNS trigger AS $$
BEGIN
    INSERT INTO wallet_accounts (wallet_id, account_id, merchant_id, currency, purpose, label)
    VALUES (NEW.id, NEW.available_account_id, NEW.merchant_id, NEW.currency, 'PRIMARY', 'Primary')
    ON CONFLICT (account_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallets_primary_account_trg ON wallets;
CREATE TRIGGER wallets_primary_account_trg
    AFTER INSERT ON wallets
    FOR EACH ROW EXECUTE FUNCTION create_primary_wallet_account();
