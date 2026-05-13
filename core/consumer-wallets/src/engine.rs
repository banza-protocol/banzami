use std::sync::Arc;

use chrono::Utc;

use banzami_ledger::{Account, AccountType, LedgerEngine};
use banzami_types::{ConsumerId, ConsumerWalletId, Currency};

use crate::{
    repository::ConsumerWalletRepository,
    wallet::{
        ConsumerWallet, ConsumerWalletBalance, ConsumerWalletStatus, CreateConsumerWalletRequest,
    },
    ConsumerWalletError,
};

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

/// High-level operations on consumer wallets.
///
/// Balances are always derived from the ledger — never from stored columns.
/// All money movement happens through balanced ledger postings. (`CLAUDE.md §2.1`)
#[allow(async_fn_in_trait)]
pub trait ConsumerWalletEngine: Send + Sync {
    async fn create(
        &self,
        req: CreateConsumerWalletRequest,
    ) -> Result<ConsumerWallet, ConsumerWalletError>;

    async fn get_or_create(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError>;

    async fn get(&self, wallet_id: ConsumerWalletId)
        -> Result<ConsumerWallet, ConsumerWalletError>;

    async fn get_for_consumer(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError>;

    async fn balance(
        &self,
        wallet_id: ConsumerWalletId,
    ) -> Result<ConsumerWalletBalance, ConsumerWalletError>;
}

// ---------------------------------------------------------------------------
// Production implementation
// ---------------------------------------------------------------------------

pub struct PostgresConsumerWalletEngine<L: LedgerEngine, R: ConsumerWalletRepository> {
    ledger: Arc<L>,
    repo:   R,
}

impl<L: LedgerEngine, R: ConsumerWalletRepository> PostgresConsumerWalletEngine<L, R> {
    pub fn new(ledger: Arc<L>, repo: R) -> Self {
        Self { ledger, repo }
    }
}

impl<L: LedgerEngine + 'static, R: ConsumerWalletRepository> ConsumerWalletEngine
    for PostgresConsumerWalletEngine<L, R>
{
    async fn create(
        &self,
        req: CreateConsumerWalletRequest,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        let available = self
            .ledger
            .create_account(Account::new(
                AccountType::Liability,
                format!("Consumer {} — {} Available", req.consumer_id, req.currency.code()),
                req.currency,
            ))
            .await
            .map_err(ConsumerWalletError::Ledger)?;

        let reserved = self
            .ledger
            .create_account(Account::new(
                AccountType::Liability,
                format!("Consumer {} — {} Reserved", req.consumer_id, req.currency.code()),
                req.currency,
            ))
            .await
            .map_err(ConsumerWalletError::Ledger)?;

        let wallet = self
            .repo
            .create(ConsumerWallet {
                id:                   ConsumerWalletId::new(),
                consumer_id:          req.consumer_id,
                currency:             req.currency,
                status:               ConsumerWalletStatus::Active,
                available_account_id: available.id,
                reserved_account_id:  reserved.id,
                created_at:           Utc::now(),
            })
            .await?;

        Ok(wallet)
    }

    async fn get_or_create(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        if let Some(wallet) = self.repo.find_for_consumer(consumer_id, currency).await? {
            return Ok(wallet);
        }
        self.create(CreateConsumerWalletRequest { consumer_id, currency }).await
    }

    async fn get(
        &self,
        wallet_id: ConsumerWalletId,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        self.repo.get(wallet_id).await
    }

    async fn get_for_consumer(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        self.repo.get_for_consumer(consumer_id, currency).await
    }

    async fn balance(
        &self,
        wallet_id: ConsumerWalletId,
    ) -> Result<ConsumerWalletBalance, ConsumerWalletError> {
        let wallet = self.repo.get(wallet_id).await?;

        // LIABILITY accounts: ledger balance is negative when funds are held.
        // Negate to get the consumer-facing positive balance.
        let available = self
            .ledger
            .balance(wallet.available_account_id)
            .await
            .map_err(ConsumerWalletError::Ledger)?
            .negate();

        let reserved = self
            .ledger
            .balance(wallet.reserved_account_id)
            .await
            .map_err(ConsumerWalletError::Ledger)?
            .negate();

        let total = available.checked_add(reserved).map_err(ConsumerWalletError::Money)?;

        Ok(ConsumerWalletBalance {
            wallet_id:   wallet.id,
            consumer_id: wallet.consumer_id,
            currency:    wallet.currency,
            available,
            reserved,
            total,
            computed_at: Utc::now(),
        })
    }
}

// ---------------------------------------------------------------------------
// Tests — financial invariant tests (CLAUDE.md §8.2)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use banzami_ledger::{Account, AccountType, LedgerEngine, LedgerEntry, LedgerPosting};
    use banzami_types::{AccountId, ConsumerId, ConsumerWalletId, Currency, Money};

    use super::*;
    use crate::{ConsumerWallet, ConsumerWalletError, ConsumerWalletStatus};

    // -----------------------------------------------------------------------
    // Minimal mock ledger
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
        async fn create_account(
            &self,
            account: Account,
        ) -> Result<Account, banzami_ledger::LedgerError> {
            self.accounts.lock().unwrap().push(account.clone());
            Ok(account)
        }

        async fn post(
            &self,
            posting: LedgerPosting,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            self.entries.lock().unwrap().extend(posting.entries.clone());
            Ok(posting)
        }

        async fn balance(
            &self,
            account_id: AccountId,
        ) -> Result<Money, banzami_ledger::LedgerError> {
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
            Ok(self
                .entries
                .lock()
                .unwrap()
                .iter()
                .filter(|e| e.account_id == account_id)
                .cloned()
                .collect())
        }
    }

    // -----------------------------------------------------------------------
    // Minimal mock repository
    // -----------------------------------------------------------------------

    struct MockRepo {
        wallets: Mutex<Vec<ConsumerWallet>>,
    }

    impl MockRepo {
        fn new() -> Self {
            Self { wallets: Mutex::new(vec![]) }
        }
    }

    impl ConsumerWalletRepository for MockRepo {
        async fn create(
            &self,
            wallet: ConsumerWallet,
        ) -> Result<ConsumerWallet, ConsumerWalletError> {
            self.wallets.lock().unwrap().push(wallet.clone());
            Ok(wallet)
        }

        async fn get(
            &self,
            id: ConsumerWalletId,
        ) -> Result<ConsumerWallet, ConsumerWalletError> {
            self.wallets
                .lock()
                .unwrap()
                .iter()
                .find(|w| w.id == id)
                .cloned()
                .ok_or(ConsumerWalletError::NotFound(id))
        }

        async fn get_for_consumer(
            &self,
            consumer_id: ConsumerId,
            currency:    Currency,
        ) -> Result<ConsumerWallet, ConsumerWalletError> {
            self.find_for_consumer(consumer_id, currency)
                .await?
                .ok_or(ConsumerWalletError::NoWalletForConsumer { consumer_id, currency })
        }

        async fn find_for_consumer(
            &self,
            consumer_id: ConsumerId,
            currency:    Currency,
        ) -> Result<Option<ConsumerWallet>, ConsumerWalletError> {
            Ok(self
                .wallets
                .lock()
                .unwrap()
                .iter()
                .find(|w| {
                    w.consumer_id == consumer_id
                        && w.currency == currency
                        && w.status != ConsumerWalletStatus::Closed
                })
                .cloned())
        }
    }

    fn make_engine() -> PostgresConsumerWalletEngine<MockLedger, MockRepo> {
        PostgresConsumerWalletEngine::new(Arc::new(MockLedger::new()), MockRepo::new())
    }

    #[tokio::test]
    async fn fresh_wallet_has_zero_balance() {
        let eng = make_engine();
        let wallet = eng
            .create(CreateConsumerWalletRequest {
                consumer_id: ConsumerId::new(),
                currency:    Currency::AOA,
            })
            .await
            .unwrap();

        let balance = eng.balance(wallet.id).await.unwrap();
        assert!(balance.available.is_zero());
        assert!(balance.reserved.is_zero());
        assert!(balance.total.is_zero());
    }

    #[tokio::test]
    async fn get_or_create_returns_existing_wallet() {
        let eng    = make_engine();
        let cid    = ConsumerId::new();
        let first  = eng.get_or_create(cid, Currency::AOA).await.unwrap();
        let second = eng.get_or_create(cid, Currency::AOA).await.unwrap();
        assert_eq!(first.id, second.id, "get_or_create must not create duplicates");
    }
}
