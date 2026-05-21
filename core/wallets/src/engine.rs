use std::sync::Arc;

use chrono::Utc;

use banzami_ledger::{Account, AccountType, LedgerEngine, PostingBuilder};
use banzami_types::{Currency, MerchantId, WalletId};

use crate::{
    repository::WalletRepository,
    wallet::{CreateWalletRequest, ReleaseRequest, ReserveRequest, SettleRequest, Wallet,
             WalletBalance, WalletStatus},
    WalletError,
};

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

/// High-level operations on merchant wallets.
///
/// All money movement is expressed as balanced ledger postings — the wallet engine
/// never mutates a balance column directly. (CLAUDE.md §2.1)
///
/// # Balance derivation
///
/// Wallet accounts are `LIABILITY` type, so their ledger balance (sum of
/// signed_minor_units) is negative when funds are present. The engine negates
/// the raw ledger value to produce the merchant-facing positive balance.
#[allow(async_fn_in_trait)]
pub trait WalletEngine: Send + Sync {
    async fn create(&self, req: CreateWalletRequest) -> Result<Wallet, WalletError>;
    async fn get(&self, wallet_id: WalletId) -> Result<Wallet, WalletError>;
    async fn get_for_merchant(
        &self,
        merchant_id: MerchantId,
        currency: Currency,
    ) -> Result<Wallet, WalletError>;
    async fn balance(&self, wallet_id: WalletId) -> Result<WalletBalance, WalletError>;
    async fn reserve(&self, req: ReserveRequest) -> Result<(), WalletError>;
    async fn release(&self, req: ReleaseRequest) -> Result<(), WalletError>;
    async fn settle(&self, req: SettleRequest) -> Result<(), WalletError>;
}

// ---------------------------------------------------------------------------
// Production implementation
// ---------------------------------------------------------------------------

pub struct PostgresWalletEngine<L: LedgerEngine, R: WalletRepository> {
    pub(crate) ledger: Arc<L>,
    repo: R,
}

impl<L: LedgerEngine, R: WalletRepository> PostgresWalletEngine<L, R> {
    pub fn new(ledger: Arc<L>, repo: R) -> Self {
        Self { ledger, repo }
    }
}

impl<L: LedgerEngine + 'static, R: WalletRepository> WalletEngine
    for PostgresWalletEngine<L, R>
{
    async fn create(&self, req: CreateWalletRequest) -> Result<Wallet, WalletError> {
        // Provision the two LIABILITY ledger accounts that back this wallet.
        let available = self
            .ledger
            .create_account(Account::new(
                AccountType::Liability,
                format!(
                    "Merchant {} — {} Available",
                    req.merchant_id,
                    req.currency.code()
                ),
                req.currency,
            ))
            .await
            .map_err(WalletError::Ledger)?;

        let reserved = self
            .ledger
            .create_account(Account::new(
                AccountType::Liability,
                format!(
                    "Merchant {} — {} Reserved",
                    req.merchant_id,
                    req.currency.code()
                ),
                req.currency,
            ))
            .await
            .map_err(WalletError::Ledger)?;

        let wallet = self
            .repo
            .create(Wallet {
                id: WalletId::new(),
                merchant_id: req.merchant_id,
                currency: req.currency,
                status: WalletStatus::Active,
                available_account_id: available.id,
                reserved_account_id: reserved.id,
                created_at: Utc::now(),
            })
            .await?;

        Ok(wallet)
    }

    async fn get(&self, wallet_id: WalletId) -> Result<Wallet, WalletError> {
        self.repo.get(wallet_id).await
    }

    async fn get_for_merchant(
        &self,
        merchant_id: MerchantId,
        currency: Currency,
    ) -> Result<Wallet, WalletError> {
        self.repo.get_for_merchant(merchant_id, currency).await
    }

    async fn balance(&self, wallet_id: WalletId) -> Result<WalletBalance, WalletError> {
        let wallet = self.repo.get(wallet_id).await?;

        // LIABILITY accounts: ledger balance is the negative sum of signed_minor_units
        // (credits dominate). We negate to get the merchant-facing positive balance.
        let available = self
            .ledger
            .balance(wallet.available_account_id)
            .await
            .map_err(WalletError::Ledger)?
            .negate();

        let reserved = self
            .ledger
            .balance(wallet.reserved_account_id)
            .await
            .map_err(WalletError::Ledger)?
            .negate();

        let total = available.checked_add(reserved).map_err(WalletError::Money)?;

        Ok(WalletBalance {
            wallet_id: wallet.id,
            currency: wallet.currency,
            available,
            reserved,
            total,
            computed_at: Utc::now(),
        })
    }

    async fn reserve(&self, req: ReserveRequest) -> Result<(), WalletError> {
        let wallet = self.repo.get(req.wallet_id).await?;
        if wallet.status != WalletStatus::Active {
            return Err(WalletError::NotActive(wallet.id));
        }

        let posting = PostingBuilder::new(
            format!("Reserve {} on wallet {}", req.amount, wallet.id),
            req.idempotency_key,
        )
        .debit(req.from_account_id, req.amount)        // ASSET ↑ money arriving
        .credit(wallet.reserved_account_id, req.amount) // LIABILITY ↑ Banzami owes merchant
        .build()
        .map_err(|e| WalletError::Posting(e.to_string()))?;

        self.ledger.post(posting).await.map_err(WalletError::Ledger)?;
        Ok(())
    }

    async fn release(&self, req: ReleaseRequest) -> Result<(), WalletError> {
        let wallet = self.repo.get(req.wallet_id).await?;

        let posting = PostingBuilder::new(
            format!("Release {} from wallet {} reserved", req.amount, wallet.id),
            req.idempotency_key,
        )
        .debit(wallet.reserved_account_id, req.amount) // LIABILITY ↓ obligation cancelled
        .credit(req.to_account_id, req.amount)          // ASSET ↓ funds not received
        .build()
        .map_err(|e| WalletError::Posting(e.to_string()))?;

        self.ledger.post(posting).await.map_err(WalletError::Ledger)?;
        Ok(())
    }

    async fn settle(&self, req: SettleRequest) -> Result<(), WalletError> {
        let wallet = self.repo.get(req.wallet_id).await?;

        let posting = PostingBuilder::new(
            format!("Settle {} to wallet {} available", req.amount, wallet.id),
            req.idempotency_key,
        )
        .debit(wallet.reserved_account_id, req.amount)  // LIABILITY ↓ reservation cleared
        .credit(wallet.available_account_id, req.amount) // LIABILITY ↑ now withdrawable
        .build()
        .map_err(|e| WalletError::Posting(e.to_string()))?;

        self.ledger.post(posting).await.map_err(WalletError::Ledger)?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Financial invariant tests (CLAUDE.md §8.2)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use banzami_ledger::{Account, AccountType, LedgerEngine, LedgerEntry, LedgerPosting};
    use banzami_types::{AccountId, Currency, LedgerPostingId, MerchantId, Money, WalletId};

    use super::*;
    use crate::{repository::WalletRepository, Wallet, WalletError, WalletStatus};

    // -----------------------------------------------------------------------
    // In-memory mock ledger
    // -----------------------------------------------------------------------

    struct MockLedger {
        accounts: Mutex<Vec<Account>>,
        entries:  Mutex<Vec<LedgerEntry>>,
    }

    impl MockLedger {
        fn new() -> Self {
            Self {
                accounts: Mutex::new(vec![]),
                entries:  Mutex::new(vec![]),
            }
        }
    }

    impl LedgerEngine for MockLedger {
        async fn create_account(&self, account: Account) -> Result<Account, banzami_ledger::LedgerError> {
            self.accounts.lock().unwrap().push(account.clone());
            Ok(account)
        }

        async fn post(&self, posting: LedgerPosting) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            self.entries.lock().unwrap().extend(posting.entries.clone());
            Ok(posting)
        }

        async fn balance(&self, account_id: AccountId) -> Result<Money, banzami_ledger::LedgerError> {
            let accounts = self.accounts.lock().unwrap();
            let account = accounts
                .iter()
                .find(|a| a.id == account_id)
                .ok_or(banzami_ledger::LedgerError::AccountNotFound(account_id))?;

            let entries = self.entries.lock().unwrap();
            let net: i64 = entries
                .iter()
                .filter(|e| e.account_id == account_id)
                .map(|e| e.signed_minor_units())
                .sum();

            Ok(Money::new(net, account.currency))
        }

        async fn entries_for_account(
            &self,
            account_id: AccountId,
        ) -> Result<Vec<LedgerEntry>, banzami_ledger::LedgerError> {
            let entries = self.entries.lock().unwrap();
            Ok(entries.iter().filter(|e| e.account_id == account_id).cloned().collect())
        }

        async fn reverse(
            &self,
            _original: &LedgerPosting,
            _description: impl Into<String> + Send,
            _new_idempotency_key: impl Into<String> + Send,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            unimplemented!("reverse not needed in wallet unit tests")
        }

        async fn get_posting(
            &self,
            _posting_id: LedgerPostingId,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            unimplemented!("get_posting not needed in wallet unit tests")
        }
    }

    // -----------------------------------------------------------------------
    // In-memory mock repository
    // -----------------------------------------------------------------------

    struct MockWalletRepo {
        wallets: Mutex<Vec<Wallet>>,
    }

    impl MockWalletRepo {
        fn new() -> Self {
            Self { wallets: Mutex::new(vec![]) }
        }
    }

    impl WalletRepository for MockWalletRepo {
        async fn create(&self, wallet: Wallet) -> Result<Wallet, WalletError> {
            self.wallets.lock().unwrap().push(wallet.clone());
            Ok(wallet)
        }

        async fn get(&self, id: WalletId) -> Result<Wallet, WalletError> {
            self.wallets
                .lock()
                .unwrap()
                .iter()
                .find(|w| w.id == id)
                .cloned()
                .ok_or(WalletError::NotFound(id))
        }

        async fn get_for_merchant(
            &self,
            merchant_id: MerchantId,
            currency: Currency,
        ) -> Result<Wallet, WalletError> {
            self.wallets
                .lock()
                .unwrap()
                .iter()
                .find(|w| w.merchant_id == merchant_id && w.currency == currency)
                .cloned()
                .ok_or(WalletError::NoWalletForMerchant { merchant_id, currency })
        }
    }

    fn make_engine() -> PostgresWalletEngine<MockLedger, MockWalletRepo> {
        PostgresWalletEngine::new(Arc::new(MockLedger::new()), MockWalletRepo::new())
    }

    fn kz(minor: i64) -> Money {
        Money::new(minor, Currency::AOA)
    }

    // -----------------------------------------------------------------------
    // Tests
    // -----------------------------------------------------------------------

    /// Reserve then settle: reserved funds become available.
    #[tokio::test]
    async fn reserve_then_settle_moves_funds_to_available() {
        let engine = make_engine();
        let transit_id = AccountId::new(); // system account; not registered in mock
        // (mock post() doesn't validate account existence for system accounts)
        // Register the transit account so balance() can find it.
        engine
            .ledger
            .create_account(Account::new(AccountType::Asset, "Transit", Currency::AOA))
            .await
            .unwrap();

        let wallet = engine
            .create(CreateWalletRequest {
                merchant_id: MerchantId::new(),
                currency: Currency::AOA,
            })
            .await
            .unwrap();

        // The transit account is provided by the caller; its ID is arbitrary in tests.
        let transit = Account {
            id: transit_id,
            account_type: AccountType::Asset,
            name: "Transit".into(),
            currency: Currency::AOA,
            created_at: Utc::now(),
        };
        engine.ledger.create_account(transit).await.unwrap();

        engine
            .reserve(ReserveRequest {
                idempotency_key: "rsv-001".into(),
                wallet_id: wallet.id,
                amount: kz(100_000),
                from_account_id: transit_id,
            })
            .await
            .unwrap();

        let b = engine.balance(wallet.id).await.unwrap();
        assert_eq!(b.available.amount_minor(), 0,       "before settle: nothing available");
        assert_eq!(b.reserved.amount_minor(),  100_000, "before settle: full amount reserved");
        assert_eq!(b.total.amount_minor(),     100_000);

        engine
            .settle(SettleRequest {
                idempotency_key: "stl-001".into(),
                wallet_id: wallet.id,
                amount: kz(100_000),
            })
            .await
            .unwrap();

        let b = engine.balance(wallet.id).await.unwrap();
        assert_eq!(b.available.amount_minor(), 100_000, "after settle: fully available");
        assert_eq!(b.reserved.amount_minor(),  0,       "after settle: nothing reserved");
        assert_eq!(b.total.amount_minor(),     100_000);
    }

    /// Reserve then release: both accounts return to zero.
    #[tokio::test]
    async fn reserve_then_release_restores_zero_balance() {
        let engine = make_engine();
        let transit_id = AccountId::new();

        let transit = Account {
            id: transit_id,
            account_type: AccountType::Asset,
            name: "Transit".into(),
            currency: Currency::AOA,
            created_at: Utc::now(),
        };
        engine.ledger.create_account(transit).await.unwrap();

        let wallet = engine
            .create(CreateWalletRequest {
                merchant_id: MerchantId::new(),
                currency: Currency::AOA,
            })
            .await
            .unwrap();

        engine
            .reserve(ReserveRequest {
                idempotency_key: "rsv-002".into(),
                wallet_id: wallet.id,
                amount: kz(50_000),
                from_account_id: transit_id,
            })
            .await
            .unwrap();

        engine
            .release(ReleaseRequest {
                idempotency_key: "rls-002".into(),
                wallet_id: wallet.id,
                amount: kz(50_000),
                to_account_id: transit_id,
            })
            .await
            .unwrap();

        let b = engine.balance(wallet.id).await.unwrap();
        assert!(b.available.is_zero(), "released: available must be zero");
        assert!(b.reserved.is_zero(),  "released: reserved must be zero");
        assert!(b.total.is_zero(),     "released: total must be zero");
    }

    /// Inactive wallet must be rejected on reserve.
    #[tokio::test]
    async fn inactive_wallet_is_rejected_on_reserve() {
        let engine = make_engine();
        let transit_id = AccountId::new();

        // Manually insert a suspended wallet into the repo.
        let account_a = Account::new(AccountType::Liability, "Available", Currency::AOA);
        let account_r = Account::new(AccountType::Liability, "Reserved", Currency::AOA);
        engine.ledger.create_account(account_a.clone()).await.unwrap();
        engine.ledger.create_account(account_r.clone()).await.unwrap();

        let suspended_wallet = Wallet {
            id: WalletId::new(),
            merchant_id: MerchantId::new(),
            currency: Currency::AOA,
            status: WalletStatus::Suspended,
            available_account_id: account_a.id,
            reserved_account_id: account_r.id,
            created_at: Utc::now(),
        };
        engine.repo.create(suspended_wallet.clone()).await.unwrap();

        let result = engine
            .reserve(ReserveRequest {
                idempotency_key: "rsv-003".into(),
                wallet_id: suspended_wallet.id,
                amount: kz(1_000),
                from_account_id: transit_id,
            })
            .await;

        assert!(
            matches!(result, Err(WalletError::NotActive(_))),
            "suspended wallet must be rejected"
        );
    }

    /// Partial settle: only part of reserved funds move to available.
    #[tokio::test]
    async fn partial_settle_leaves_remainder_reserved() {
        let engine = make_engine();
        let transit_id = AccountId::new();

        let transit = Account {
            id: transit_id,
            account_type: AccountType::Asset,
            name: "Transit".into(),
            currency: Currency::AOA,
            created_at: Utc::now(),
        };
        engine.ledger.create_account(transit).await.unwrap();

        let wallet = engine
            .create(CreateWalletRequest {
                merchant_id: MerchantId::new(),
                currency: Currency::AOA,
            })
            .await
            .unwrap();

        // Reserve 200_000, settle only 120_000.
        engine
            .reserve(ReserveRequest {
                idempotency_key: "rsv-004".into(),
                wallet_id: wallet.id,
                amount: kz(200_000),
                from_account_id: transit_id,
            })
            .await
            .unwrap();

        engine
            .settle(SettleRequest {
                idempotency_key: "stl-004".into(),
                wallet_id: wallet.id,
                amount: kz(120_000),
            })
            .await
            .unwrap();

        let b = engine.balance(wallet.id).await.unwrap();
        assert_eq!(b.available.amount_minor(), 120_000);
        assert_eq!(b.reserved.amount_minor(),   80_000);
        assert_eq!(b.total.amount_minor(),      200_000);
    }
}
