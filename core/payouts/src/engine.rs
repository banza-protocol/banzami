use std::sync::Arc;

use chrono::Utc;

use banzami_ledger::{LedgerEngine, PostingBuilder};
use banzami_types::{AccountId, MerchantId, PayoutId};
use banzami_wallets::WalletRepository;

use crate::{
    repository::PayoutRepository,
    CreatePayoutRequest, Payout, PayoutError, PayoutStatus,
};

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait PayoutEngine: Send + Sync {
    /// Create a payout record (Pending). Validates balance; does NOT post the ledger yet.
    async fn initiate(&self, req: CreatePayoutRequest) -> Result<Payout, PayoutError>;

    /// Pending → Processing: post ledger entry (DR available / CR bank).
    async fn process(&self, id: PayoutId) -> Result<Payout, PayoutError>;

    /// Processing → Sent: record bank submission.
    async fn mark_sent(&self, id: PayoutId) -> Result<Payout, PayoutError>;

    /// Sent → Confirmed: bank confirmed receipt (no ledger change — already balanced).
    async fn confirm(&self, id: PayoutId) -> Result<Payout, PayoutError>;

    /// Any non-terminal → Failed. Reverses ledger if posting_id exists.
    async fn fail(&self, id: PayoutId, reason: String) -> Result<Payout, PayoutError>;

    /// Sent → Returned: bank returned funds. Reverses ledger.
    async fn mark_returned(&self, id: PayoutId) -> Result<Payout, PayoutError>;

    async fn get(&self, id: PayoutId) -> Result<Payout, PayoutError>;
    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
        limit: i64,
    ) -> Result<Vec<Payout>, PayoutError>;
    async fn list_all(
        &self,
        limit: i64,
        status: Option<String>,
    ) -> Result<Vec<Payout>, PayoutError>;
}

// ---------------------------------------------------------------------------
// Production implementation
// ---------------------------------------------------------------------------

pub struct PostgresPayoutEngine<WR: WalletRepository, L: LedgerEngine, R: PayoutRepository> {
    wallet_repo:     WR,
    ledger:          Arc<L>,
    repo:            R,
    /// System ASSET account representing our bank balance. Credited at process,
    /// debited on reversal.
    bank_account_id: AccountId,
}

impl<WR: WalletRepository, L: LedgerEngine, R: PayoutRepository>
    PostgresPayoutEngine<WR, L, R>
{
    pub fn new(
        wallet_repo: WR,
        ledger: Arc<L>,
        repo: R,
        bank_account_id: AccountId,
    ) -> Self {
        Self { wallet_repo, ledger, repo, bank_account_id }
    }

    /// Compute merchant-facing available balance from the ledger.
    /// LIABILITY accounts have negative ledger balance; negate for merchant view.
    async fn available_balance(
        &self,
        available_account_id: banzami_types::AccountId,
    ) -> Result<banzami_types::Money, PayoutError> {
        Ok(self.ledger.balance(available_account_id).await?.negate())
    }

    /// Post the initiation entry: DR merchant_available (LIABILITY) / CR bank (ASSET).
    async fn post_initiation(
        &self,
        payout: &Payout,
        available_account_id: banzami_types::AccountId,
    ) -> Result<banzami_ledger::LedgerPosting, PayoutError> {
        let posting = PostingBuilder::new(
            format!("Payout {} — initiation", payout.id),
            format!("{}:process", payout.idempotency_key),
        )
        .debit(available_account_id, payout.amount)  // LIABILITY ↓ reduce obligation
        .credit(self.bank_account_id, payout.amount) // ASSET ↓ earmarked to leave bank
        .build()
        .map_err(|_| PayoutError::Ledger(banzami_ledger::LedgerError::UnbalancedPosting {
            debits_minor:  payout.amount.amount_minor(),
            credits_minor: 0,
            currency:      payout.amount.currency,
        }))?;
        Ok(self.ledger.post(posting).await?)
    }

    /// Reverse a previously posted initiation entry.
    async fn post_reversal(
        &self,
        payout: &Payout,
        available_account_id: banzami_types::AccountId,
        reason: &str,
    ) -> Result<(), PayoutError> {
        let posting = PostingBuilder::new(
            format!("Payout {} — {} reversal", payout.id, reason),
            format!("{}:reverse:{}", payout.idempotency_key, reason),
        )
        .debit(self.bank_account_id, payout.amount)  // ASSET ↑ money comes back
        .credit(available_account_id, payout.amount) // LIABILITY ↑ restore obligation
        .build()
        .map_err(|_| PayoutError::Ledger(banzami_ledger::LedgerError::UnbalancedPosting {
            debits_minor:  payout.amount.amount_minor(),
            credits_minor: 0,
            currency:      payout.amount.currency,
        }))?;
        self.ledger.post(posting).await?;
        Ok(())
    }
}

impl<WR: WalletRepository, L: LedgerEngine, R: PayoutRepository> PayoutEngine
    for PostgresPayoutEngine<WR, L, R>
{
    async fn initiate(&self, req: CreatePayoutRequest) -> Result<Payout, PayoutError> {
        // Idempotency: return existing payout if key already exists.
        if let Some(existing) = self.repo.get_by_idempotency_key(&req.idempotency_key).await? {
            return Ok(existing);
        }

        let wallet = self
            .wallet_repo
            .get(req.wallet_id)
            .await
            .map_err(|e| PayoutError::Wallet(e.to_string()))?;

        // Balance check — prevents overdrawing the merchant's available account.
        let available = self.available_balance(wallet.available_account_id).await?;
        if available.amount_minor() < req.amount.amount_minor() {
            return Err(PayoutError::InsufficientBalance {
                available,
                requested: req.amount,
            });
        }

        let payout = Payout {
            id:                PayoutId::new(),
            merchant_id:       req.merchant_id,
            wallet_id:         req.wallet_id,
            idempotency_key:   req.idempotency_key,
            status:            PayoutStatus::Pending,
            amount:            req.amount,
            destination:       req.destination,
            ledger_posting_id: None,
            failure_reason:    None,
            created_at:        Utc::now(),
            sent_at:           None,
            confirmed_at:      None,
            returned_at:       None,
            failed_at:         None,
        };
        self.repo.create(&payout).await?;
        Ok(payout)
    }

    async fn process(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Processing) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to:   PayoutStatus::Processing,
            });
        }

        let wallet = self
            .wallet_repo
            .get(payout.wallet_id)
            .await
            .map_err(|e| PayoutError::Wallet(e.to_string()))?;

        let posting = self.post_initiation(&payout, wallet.available_account_id).await?;

        self.repo
            .update_status(id, PayoutStatus::Processing, Some(posting.id), None)
            .await
    }

    async fn mark_sent(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Sent) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to:   PayoutStatus::Sent,
            });
        }
        self.repo.update_status(id, PayoutStatus::Sent, None, None).await
    }

    async fn confirm(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Confirmed) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to:   PayoutStatus::Confirmed,
            });
        }
        // Ledger is already balanced from process() — no additional entry needed.
        self.repo.update_status(id, PayoutStatus::Confirmed, None, None).await
    }

    async fn fail(&self, id: PayoutId, reason: String) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Failed) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to:   PayoutStatus::Failed,
            });
        }

        // Reverse the ledger posting if it was already made (i.e., we reached Processing/Sent).
        if payout.ledger_posting_id.is_some() {
            let wallet = self
                .wallet_repo
                .get(payout.wallet_id)
                .await
                .map_err(|e| PayoutError::Wallet(e.to_string()))?;
            self.post_reversal(&payout, wallet.available_account_id, "fail").await?;
        }

        self.repo
            .update_status(id, PayoutStatus::Failed, None, Some(reason))
            .await
    }

    async fn mark_returned(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Returned) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to:   PayoutStatus::Returned,
            });
        }

        let wallet = self
            .wallet_repo
            .get(payout.wallet_id)
            .await
            .map_err(|e| PayoutError::Wallet(e.to_string()))?;
        self.post_reversal(&payout, wallet.available_account_id, "return").await?;

        self.repo.update_status(id, PayoutStatus::Returned, None, None).await
    }

    async fn get(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        self.repo.get(id).await
    }

    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
        limit: i64,
    ) -> Result<Vec<Payout>, PayoutError> {
        self.repo.list_for_merchant(merchant_id, limit).await
    }

    async fn list_all(
        &self,
        limit: i64,
        status: Option<String>,
    ) -> Result<Vec<Payout>, PayoutError> {
        self.repo.list_all(limit, status.as_deref()).await
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use banzami_ledger::{Account, AccountType, EntryType, LedgerEngine, LedgerEntry, LedgerPosting};
    use banzami_types::{AccountId, Currency, LedgerEntryId, LedgerPostingId, MerchantId, Money, PayoutId, WalletId};
    use banzami_wallets::{Wallet, WalletError, WalletRepository, WalletStatus};

    use super::*;
    use crate::{BankDestination, CreatePayoutRequest, PayoutError, PayoutStatus};

    // -----------------------------------------------------------------------
    // In-memory mocks
    // -----------------------------------------------------------------------

    struct MockLedger {
        accounts: Mutex<Vec<Account>>,
        entries:  Mutex<Vec<LedgerEntry>>,
    }

    impl MockLedger {
        fn with_account(account: Account) -> Self {
            Self {
                accounts: Mutex::new(vec![account]),
                entries:  Mutex::new(vec![]),
            }
        }
    }

    impl LedgerEngine for MockLedger {
        async fn create_account(&self, a: Account) -> Result<Account, banzami_ledger::LedgerError> {
            self.accounts.lock().unwrap().push(a.clone());
            Ok(a)
        }
        async fn post(&self, p: LedgerPosting) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            self.entries.lock().unwrap().extend(p.entries.clone());
            Ok(p)
        }
        async fn reverse(
            &self,
            _original: &LedgerPosting,
            _description: impl Into<String> + Send,
            _new_idempotency_key: impl Into<String> + Send,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            unimplemented!("reverse not needed in payout unit tests")
        }
        async fn get_posting(
            &self,
            _posting_id: LedgerPostingId,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            unimplemented!("get_posting not needed in payout unit tests")
        }
        async fn balance(&self, account_id: AccountId) -> Result<Money, banzami_ledger::LedgerError> {
            let accounts = self.accounts.lock().unwrap();
            let account  = accounts
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
            Ok(self.entries.lock().unwrap().iter().filter(|e| e.account_id == account_id).cloned().collect())
        }
    }

    struct MockWalletRepo {
        wallet: Wallet,
    }

    impl WalletRepository for MockWalletRepo {
        async fn create(&self, w: Wallet) -> Result<Wallet, WalletError> { Ok(w) }
        async fn get(&self, id: WalletId) -> Result<Wallet, WalletError> {
            if id == self.wallet.id {
                Ok(self.wallet.clone())
            } else {
                Err(WalletError::NotFound(id))
            }
        }
        async fn get_for_merchant(
            &self,
            _: MerchantId,
            _: Currency,
        ) -> Result<Wallet, WalletError> {
            Ok(self.wallet.clone())
        }
    }

    struct MockPayoutRepo {
        payouts: Mutex<Vec<Payout>>,
    }

    impl MockPayoutRepo {
        fn new() -> Self { Self { payouts: Mutex::new(vec![]) } }
    }

    impl PayoutRepository for MockPayoutRepo {
        async fn create(&self, p: &Payout) -> Result<(), PayoutError> {
            let mut lock = self.payouts.lock().unwrap();
            if lock.iter().any(|x| x.idempotency_key == p.idempotency_key) {
                return Err(PayoutError::DuplicateIdempotencyKey(p.idempotency_key.clone()));
            }
            lock.push(p.clone());
            Ok(())
        }
        async fn get(&self, id: PayoutId) -> Result<Payout, PayoutError> {
            self.payouts.lock().unwrap().iter().find(|p| p.id == id)
                .cloned().ok_or(PayoutError::NotFound(id))
        }
        async fn get_by_idempotency_key(&self, key: &str) -> Result<Option<Payout>, PayoutError> {
            Ok(self.payouts.lock().unwrap().iter().find(|p| p.idempotency_key == key).cloned())
        }
        async fn list_for_merchant(&self, merchant_id: MerchantId, _: i64) -> Result<Vec<Payout>, PayoutError> {
            Ok(self.payouts.lock().unwrap().iter().filter(|p| p.merchant_id == merchant_id).cloned().collect())
        }
        async fn list_all(&self, _limit: i64, _status: Option<&str>) -> Result<Vec<Payout>, PayoutError> {
            Ok(self.payouts.lock().unwrap().clone())
        }
        async fn update_status(
            &self,
            id: PayoutId,
            status: PayoutStatus,
            posting_id: Option<banzami_types::LedgerPostingId>,
            failure_reason: Option<String>,
        ) -> Result<Payout, PayoutError> {
            let mut lock = self.payouts.lock().unwrap();
            let p = lock.iter_mut().find(|p| p.id == id).ok_or(PayoutError::NotFound(id))?;
            p.status = status;
            if let Some(pid) = posting_id { p.ledger_posting_id = Some(pid); }
            if let Some(r) = failure_reason { p.failure_reason = Some(r); }
            match status {
                PayoutStatus::Sent      => { p.sent_at      = Some(Utc::now()); }
                PayoutStatus::Confirmed => { p.confirmed_at = Some(Utc::now()); }
                PayoutStatus::Returned  => { p.returned_at  = Some(Utc::now()); }
                PayoutStatus::Failed    => { p.failed_at    = Some(Utc::now()); }
                _ => {}
            }
            Ok(p.clone())
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    fn kz(minor: i64) -> Money { Money::new(minor, Currency::AOA) }

    fn make_engine(available_balance_minor: i64) -> (
        PostgresPayoutEngine<MockWalletRepo, MockLedger, MockPayoutRepo>,
        WalletId,
        AccountId, // available_account_id (so tests can assert on ledger)
    ) {
        let avail_id = AccountId::new();
        let bank_id  = AccountId::new();

        // Pre-credit the available account to simulate existing merchant balance.
        let avail_account = Account {
            id:           avail_id,
            account_type: AccountType::Liability,
            name:         "Available".into(),
            currency:     Currency::AOA,
            created_at:   Utc::now(),
        };
        let bank_account = Account {
            id:           bank_id,
            account_type: AccountType::Asset,
            name:         "Bank".into(),
            currency:     Currency::AOA,
            created_at:   Utc::now(),
        };

        let ledger = MockLedger::with_account(avail_account.clone());
        ledger.accounts.lock().unwrap().push(bank_account);

        // Simulate available balance: LIABILITY account with credit balance = negative net.
        // Credit on LIABILITY → signed_minor_units() = -amount → balance().negate() = +amount.
        ledger.entries.lock().unwrap().push(LedgerEntry {
            id:         LedgerEntryId::new(),
            posting_id: LedgerPostingId::new(),
            account_id: avail_id,
            entry_type: EntryType::Credit,
            amount:     Money::new(available_balance_minor, Currency::AOA),
            created_at: Utc::now(),
        });

        let wallet_id = WalletId::new();
        let wallet = Wallet {
            id:                   wallet_id,
            merchant_id:          MerchantId::new(),
            currency:             Currency::AOA,
            status:               WalletStatus::Active,
            available_account_id: avail_id,
            reserved_account_id:  AccountId::new(),
            created_at:           Utc::now(),
        };

        let engine = PostgresPayoutEngine::new(
            MockWalletRepo { wallet },
            Arc::new(ledger),
            MockPayoutRepo::new(),
            bank_id,
        );
        (engine, wallet_id, avail_id)
    }

    fn dest() -> BankDestination {
        BankDestination {
            account_number:      "123456789".into(),
            bank_code:           "BAI".into(),
            account_holder_name: "Merchant SARL".into(),
        }
    }

    // -----------------------------------------------------------------------
    // Tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn initiate_creates_pending_payout() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let merchant_id = MerchantId::new();
        let payout = engine.initiate(CreatePayoutRequest {
            idempotency_key: "pay-001".into(),
            merchant_id,
            wallet_id,
            amount: kz(50_000),
            destination: dest(),
        }).await.unwrap();
        assert_eq!(payout.status, PayoutStatus::Pending);
        assert!(payout.ledger_posting_id.is_none());
    }

    #[tokio::test]
    async fn process_posts_ledger_and_moves_to_processing() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let payout = engine.initiate(CreatePayoutRequest {
            idempotency_key: "pay-002".into(),
            merchant_id: MerchantId::new(),
            wallet_id,
            amount: kz(60_000),
            destination: dest(),
        }).await.unwrap();

        let processed = engine.process(payout.id).await.unwrap();
        assert_eq!(processed.status, PayoutStatus::Processing);
        assert!(processed.ledger_posting_id.is_some(), "ledger must be posted at process time");
    }

    #[tokio::test]
    async fn full_happy_path_pending_to_confirmed() {
        let (engine, wallet_id, _) = make_engine(200_000);
        let payout = engine.initiate(CreatePayoutRequest {
            idempotency_key: "pay-003".into(),
            merchant_id: MerchantId::new(),
            wallet_id,
            amount: kz(80_000),
            destination: dest(),
        }).await.unwrap();

        engine.process(payout.id).await.unwrap();
        engine.mark_sent(payout.id).await.unwrap();
        let confirmed = engine.confirm(payout.id).await.unwrap();
        assert_eq!(confirmed.status, PayoutStatus::Confirmed);
        assert!(confirmed.confirmed_at.is_some());
    }

    #[tokio::test]
    async fn fail_from_pending_requires_no_reversal() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let payout = engine.initiate(CreatePayoutRequest {
            idempotency_key: "pay-004".into(),
            merchant_id: MerchantId::new(),
            wallet_id,
            amount: kz(10_000),
            destination: dest(),
        }).await.unwrap();

        let failed = engine.fail(payout.id, "cancelled by operator".into()).await.unwrap();
        assert_eq!(failed.status, PayoutStatus::Failed);
        // No ledger posting was made, so no reversal — ledger entries should be just the initial balance.
    }

    #[tokio::test]
    async fn fail_from_processing_reverses_ledger() {
        let (engine, wallet_id, avail_id) = make_engine(100_000);
        let payout = engine.initiate(CreatePayoutRequest {
            idempotency_key: "pay-005".into(),
            merchant_id: MerchantId::new(),
            wallet_id,
            amount: kz(40_000),
            destination: dest(),
        }).await.unwrap();

        engine.process(payout.id).await.unwrap();

        // After process: available should be 60_000 (100_000 - 40_000).
        let avail_after_process = engine.ledger.balance(avail_id).await.unwrap().negate();
        assert_eq!(avail_after_process.amount_minor(), 60_000);

        engine.fail(payout.id, "bank rejected".into()).await.unwrap();

        // After fail reversal: available should be back to 100_000.
        let avail_after_fail = engine.ledger.balance(avail_id).await.unwrap().negate();
        assert_eq!(avail_after_fail.amount_minor(), 100_000, "ledger must be reversed on fail");
    }

    #[tokio::test]
    async fn mark_returned_reverses_ledger() {
        let (engine, wallet_id, avail_id) = make_engine(100_000);
        let payout = engine.initiate(CreatePayoutRequest {
            idempotency_key: "pay-006".into(),
            merchant_id: MerchantId::new(),
            wallet_id,
            amount: kz(30_000),
            destination: dest(),
        }).await.unwrap();

        engine.process(payout.id).await.unwrap();
        engine.mark_sent(payout.id).await.unwrap();
        engine.mark_returned(payout.id).await.unwrap();

        let avail = engine.ledger.balance(avail_id).await.unwrap().negate();
        assert_eq!(avail.amount_minor(), 100_000, "returned funds must be credited back");
    }

    #[tokio::test]
    async fn insufficient_balance_is_rejected() {
        let (engine, wallet_id, _) = make_engine(10_000);
        let result = engine.initiate(CreatePayoutRequest {
            idempotency_key: "pay-007".into(),
            merchant_id: MerchantId::new(),
            wallet_id,
            amount: kz(50_000), // more than the 10_000 available
            destination: dest(),
        }).await;
        assert!(matches!(result, Err(PayoutError::InsufficientBalance { .. })));
    }

    #[tokio::test]
    async fn idempotency_returns_existing_payout() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let req1 = engine.initiate(CreatePayoutRequest {
            idempotency_key: "pay-008".into(),
            merchant_id: MerchantId::new(),
            wallet_id,
            amount: kz(5_000),
            destination: dest(),
        }).await.unwrap();

        let req2 = engine.initiate(CreatePayoutRequest {
            idempotency_key: "pay-008".into(),
            merchant_id: MerchantId::new(),
            wallet_id,
            amount: kz(5_000),
            destination: dest(),
        }).await.unwrap();

        assert_eq!(req1.id, req2.id, "same idempotency key must return same payout");
    }

    #[tokio::test]
    async fn invalid_transition_is_rejected() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let payout = engine.initiate(CreatePayoutRequest {
            idempotency_key: "pay-009".into(),
            merchant_id: MerchantId::new(),
            wallet_id,
            amount: kz(1_000),
            destination: dest(),
        }).await.unwrap();

        // Cannot confirm directly from Pending — must go Pending → Processing → Sent → Confirmed.
        let result = engine.confirm(payout.id).await;
        assert!(matches!(result, Err(PayoutError::InvalidStatusTransition { .. })));
    }
}
