use std::sync::Arc;

use chrono::Utc;

use banzami_ledger::{LedgerEngine, PostingBuilder};
use banzami_pricing::{resolve, BusinessCategory, PricingContext, PricingRuleProvider};
use banzami_types::{AccountId, MerchantId, Money, PayoutId};
use banzami_wallets::WalletRepository;

use crate::{repository::PayoutRepository, CreatePayoutRequest, Payout, PayoutError, PayoutStatus};

/// The operator transaction-type this engine prices against (Banzami ADR-031).
const WITHDRAWAL_TX_TYPE: &str = "wallet_withdrawal";

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

pub struct PostgresPayoutEngine<
    WR: WalletRepository,
    L: LedgerEngine,
    R: PayoutRepository,
    P: PricingRuleProvider,
> {
    wallet_repo: WR,
    ledger: Arc<L>,
    repo: R,
    /// System ASSET account representing our bank balance. Credited at process,
    /// debited on reversal.
    bank_account_id: AccountId,
    /// Operator Pricing Engine (ADR-021/031) — the ONLY place the withdrawal fee
    /// is resolved. Never hard-codes a percentage.
    pricing: Arc<P>,
    /// Internal REVENUE account the withdrawal fee is credited to.
    operator_fee_account_id: AccountId,
    /// Environment (LIVE/SANDBOX) — scopes rule loading.
    environment: String,
}

impl<WR: WalletRepository, L: LedgerEngine, R: PayoutRepository, P: PricingRuleProvider>
    PostgresPayoutEngine<WR, L, R, P>
{
    pub fn new(
        wallet_repo: WR,
        ledger: Arc<L>,
        repo: R,
        bank_account_id: AccountId,
        pricing: Arc<P>,
        operator_fee_account_id: AccountId,
        environment: impl Into<String>,
    ) -> Self {
        Self {
            wallet_repo,
            ledger,
            repo,
            bank_account_id,
            pricing,
            operator_fee_account_id,
            environment: environment.into(),
        }
    }

    /// Resolve the operator withdrawal fee for `gross` from the Pricing Engine
    /// (transaction_type = wallet_withdrawal). No matching/enabled rule → 0 (free,
    /// fail-safe). Guards: fee is non-negative (u32 rate) and never exceeds gross.
    async fn resolve_withdrawal_fee(&self, gross: Money) -> Result<i64, PayoutError> {
        let rules = self
            .pricing
            .load_rules(&self.environment)
            .await
            .map_err(|e| PayoutError::Pricing(e.to_string()))?;
        let ctx = PricingContext {
            amount_minor: gross.amount_minor(),
            currency: gross.currency,
            business_category: BusinessCategory::Other(String::new()),
            pricing_profile: None,
            fee_policy_ref: None,
            country: None,
            transaction_type: Some(WITHDRAWAL_TX_TYPE.to_string()),
            as_of: Utc::now(),
        };
        let fee = resolve(&rules, &ctx).fee_minor;
        if fee > gross.amount_minor() {
            return Err(PayoutError::FeeExceedsGross {
                fee,
                gross: gross.amount_minor(),
            });
        }
        Ok(fee)
    }

    /// Compute merchant-facing available balance from the ledger.
    /// LIABILITY accounts have negative ledger balance; negate for merchant view.
    async fn available_balance(
        &self,
        available_account_id: banzami_types::AccountId,
    ) -> Result<banzami_types::Money, PayoutError> {
        Ok(self.ledger.balance(available_account_id).await?.negate())
    }

    /// Post the initiation entry, splitting the operator withdrawal fee out of
    /// the gross in ONE balanced posting (ADR-031):
    ///   DR merchant_available (LIABILITY) gross
    ///   CR bank (ASSET)                    net  = gross − fee
    ///   CR operator_fee (REVENUE)          fee  (only when fee > 0)
    /// gross = net + fee keeps the posting balanced and `INV-STL-001` intact.
    async fn post_initiation(
        &self,
        payout: &Payout,
        available_account_id: banzami_types::AccountId,
    ) -> Result<banzami_ledger::LedgerPosting, PayoutError> {
        let gross = payout.amount;
        let fee_minor = self.resolve_withdrawal_fee(gross).await?;
        let net = Money::new(gross.amount_minor() - fee_minor, gross.currency);

        let mut builder = PostingBuilder::new(
            format!("Payout {} — initiation", payout.id),
            format!("{}:process", payout.idempotency_key),
        )
        .debit(available_account_id, gross) // LIABILITY ↓ reduce obligation by gross
        .credit(self.bank_account_id, net); // ASSET ↓ net earmarked to leave bank
        if fee_minor > 0 {
            builder = builder.credit(
                self.operator_fee_account_id,
                Money::new(fee_minor, gross.currency), // REVENUE ↑ operator fee
            );
        }
        let posting = builder.build().map_err(|_| {
            PayoutError::Ledger(banzami_ledger::LedgerError::UnbalancedPosting {
                debits_minor: gross.amount_minor(),
                credits_minor: net.amount_minor() + fee_minor,
                currency: gross.currency,
            })
        })?;
        Ok(self.ledger.post(posting).await?)
    }

    /// Reverse a previously posted initiation entry EXACTLY — every leg (gross,
    /// net, fee) is flipped by reversing the stored posting, so nothing is ever
    /// stranded on the fee account and a rule change between process and reversal
    /// can never unbalance it. Idempotent on the reversal idempotency key.
    async fn post_reversal(&self, payout: &Payout, reason: &str) -> Result<(), PayoutError> {
        let Some(posting_id) = payout.ledger_posting_id else {
            return Ok(()); // nothing was posted (never processed) — nothing to reverse
        };
        let original = self.ledger.get_posting(posting_id).await?;
        self.ledger
            .reverse(
                &original,
                format!("Payout {} — {} reversal", payout.id, reason),
                format!("{}:reverse:{}", payout.idempotency_key, reason),
            )
            .await?;
        Ok(())
    }
}

impl<WR: WalletRepository, L: LedgerEngine, R: PayoutRepository, P: PricingRuleProvider> PayoutEngine
    for PostgresPayoutEngine<WR, L, R, P>
{
    async fn initiate(&self, req: CreatePayoutRequest) -> Result<Payout, PayoutError> {
        // A payout must move a positive amount — a zero/negative withdrawal is rejected.
        if req.amount.amount_minor() <= 0 {
            return Err(PayoutError::InvalidAmount);
        }
        // Idempotency: return existing payout if key already exists.
        if let Some(existing) = self
            .repo
            .get_by_idempotency_key(&req.idempotency_key)
            .await?
        {
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
            id: PayoutId::new(),
            merchant_id: req.merchant_id,
            wallet_id: req.wallet_id,
            idempotency_key: req.idempotency_key,
            status: PayoutStatus::Pending,
            amount: req.amount,
            destination: req.destination,
            ledger_posting_id: None,
            failure_reason: None,
            created_at: Utc::now(),
            sent_at: None,
            confirmed_at: None,
            returned_at: None,
            failed_at: None,
        };
        self.repo.create(&payout).await?;
        Ok(payout)
    }

    async fn process(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Processing) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to: PayoutStatus::Processing,
            });
        }

        let wallet = self
            .wallet_repo
            .get(payout.wallet_id)
            .await
            .map_err(|e| PayoutError::Wallet(e.to_string()))?;

        let posting = self
            .post_initiation(&payout, wallet.available_account_id)
            .await?;

        self.repo
            .update_status(id, PayoutStatus::Processing, Some(posting.id), None)
            .await
    }

    async fn mark_sent(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Sent) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to: PayoutStatus::Sent,
            });
        }
        self.repo
            .update_status(id, PayoutStatus::Sent, None, None)
            .await
    }

    async fn confirm(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Confirmed) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to: PayoutStatus::Confirmed,
            });
        }
        // Ledger is already balanced from process() — no additional entry needed.
        self.repo
            .update_status(id, PayoutStatus::Confirmed, None, None)
            .await
    }

    async fn fail(&self, id: PayoutId, reason: String) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Failed) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to: PayoutStatus::Failed,
            });
        }

        // Reverse the ledger posting if it was already made (i.e., we reached Processing/Sent).
        if payout.ledger_posting_id.is_some() {
            self.post_reversal(&payout, "fail").await?;
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
                to: PayoutStatus::Returned,
            });
        }

        self.post_reversal(&payout, "return").await?;

        self.repo
            .update_status(id, PayoutStatus::Returned, None, None)
            .await
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

    use banzami_ledger::{
        Account, AccountType, EntryType, LedgerEngine, LedgerEntry, LedgerPosting,
    };
    use banzami_types::{
        AccountId, Currency, LedgerEntryId, LedgerPostingId, MerchantId, Money, PayoutId, WalletId,
    };
    use banzami_wallets::{Wallet, WalletError, WalletRepository, WalletStatus};
    use banzami_pricing::{PricingError, PricingRule, PricingRuleProvider, RoundingMode};
    use banzami_types::PricingRuleId;

    use super::*;
    use crate::{BankDestination, CreatePayoutRequest, PayoutError, PayoutStatus};

    // -----------------------------------------------------------------------
    // In-memory mocks
    // -----------------------------------------------------------------------

    struct MockLedger {
        accounts: Mutex<Vec<Account>>,
        entries: Mutex<Vec<LedgerEntry>>,
        postings: Mutex<Vec<LedgerPosting>>,
    }

    impl MockLedger {
        fn with_account(account: Account) -> Self {
            Self {
                accounts: Mutex::new(vec![account]),
                entries: Mutex::new(vec![]),
                postings: Mutex::new(vec![]),
            }
        }
    }

    impl LedgerEngine for MockLedger {
        async fn create_account(&self, a: Account) -> Result<Account, banzami_ledger::LedgerError> {
            self.accounts.lock().unwrap().push(a.clone());
            Ok(a)
        }
        async fn post(
            &self,
            p: LedgerPosting,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            // Idempotent on idempotency_key, mirroring the real ledger: a replay
            // returns the existing posting and never double-applies entries.
            let mut postings = self.postings.lock().unwrap();
            if let Some(existing) = postings
                .iter()
                .find(|x| x.idempotency_key == p.idempotency_key)
                .cloned()
            {
                return Ok(existing);
            }
            self.entries.lock().unwrap().extend(p.entries.clone());
            postings.push(p.clone());
            Ok(p)
        }
        async fn reverse(
            &self,
            original: &LedgerPosting,
            description: impl Into<String> + Send,
            new_idempotency_key: impl Into<String> + Send,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            // Flip every leg (DEBIT↔CREDIT) and post — idempotent via `post`.
            let mut builder = PostingBuilder::new(description.into(), new_idempotency_key.into());
            for e in &original.entries {
                builder = match e.entry_type {
                    EntryType::Debit => builder.credit(e.account_id, e.amount),
                    EntryType::Credit => builder.debit(e.account_id, e.amount),
                };
            }
            let reversal = builder
                .build()
                .map_err(|_| banzami_ledger::LedgerError::InsufficientEntries)?;
            self.post(reversal).await
        }
        async fn get_posting(
            &self,
            posting_id: LedgerPostingId,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            self.postings
                .lock()
                .unwrap()
                .iter()
                .find(|p| p.id == posting_id)
                .cloned()
                .ok_or(banzami_ledger::LedgerError::PostingNotFound(posting_id))
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

    struct MockWalletRepo {
        wallet: Wallet,
    }

    impl WalletRepository for MockWalletRepo {
        async fn create(&self, w: Wallet) -> Result<Wallet, WalletError> {
            Ok(w)
        }
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
        fn new() -> Self {
            Self {
                payouts: Mutex::new(vec![]),
            }
        }
    }

    impl PayoutRepository for MockPayoutRepo {
        async fn create(&self, p: &Payout) -> Result<(), PayoutError> {
            let mut lock = self.payouts.lock().unwrap();
            if lock.iter().any(|x| x.idempotency_key == p.idempotency_key) {
                return Err(PayoutError::DuplicateIdempotencyKey(
                    p.idempotency_key.clone(),
                ));
            }
            lock.push(p.clone());
            Ok(())
        }
        async fn get(&self, id: PayoutId) -> Result<Payout, PayoutError> {
            self.payouts
                .lock()
                .unwrap()
                .iter()
                .find(|p| p.id == id)
                .cloned()
                .ok_or(PayoutError::NotFound(id))
        }
        async fn get_by_idempotency_key(&self, key: &str) -> Result<Option<Payout>, PayoutError> {
            Ok(self
                .payouts
                .lock()
                .unwrap()
                .iter()
                .find(|p| p.idempotency_key == key)
                .cloned())
        }
        async fn list_for_merchant(
            &self,
            merchant_id: MerchantId,
            _: i64,
        ) -> Result<Vec<Payout>, PayoutError> {
            Ok(self
                .payouts
                .lock()
                .unwrap()
                .iter()
                .filter(|p| p.merchant_id == merchant_id)
                .cloned()
                .collect())
        }
        async fn list_all(
            &self,
            _limit: i64,
            _status: Option<&str>,
        ) -> Result<Vec<Payout>, PayoutError> {
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
            let p = lock
                .iter_mut()
                .find(|p| p.id == id)
                .ok_or(PayoutError::NotFound(id))?;
            p.status = status;
            if let Some(pid) = posting_id {
                p.ledger_posting_id = Some(pid);
            }
            if let Some(r) = failure_reason {
                p.failure_reason = Some(r);
            }
            match status {
                PayoutStatus::Sent => {
                    p.sent_at = Some(Utc::now());
                }
                PayoutStatus::Confirmed => {
                    p.confirmed_at = Some(Utc::now());
                }
                PayoutStatus::Returned => {
                    p.returned_at = Some(Utc::now());
                }
                PayoutStatus::Failed => {
                    p.failed_at = Some(Utc::now());
                }
                _ => {}
            }
            Ok(p.clone())
        }
    }

    // -----------------------------------------------------------------------
    // Mock pricing provider (ADR-031)
    // -----------------------------------------------------------------------

    struct MockPricing {
        rules: Vec<PricingRule>,
    }

    impl PricingRuleProvider for MockPricing {
        async fn load_rules(&self, _environment: &str) -> Result<Vec<PricingRule>, PricingError> {
            Ok(self.rules.clone())
        }
    }

    /// A wallet_withdrawal rule at `bps`, FLOOR rounding (matches the documented
    /// `floor(gross*bps/10000)`), AOA, effective since 2020, no version bounds.
    fn withdrawal_rule(bps: u32) -> PricingRule {
        PricingRule {
            id: PricingRuleId::new(),
            key: "wallet-withdrawal-standard".into(),
            version: 1,
            business_category: None,
            pricing_profile: None,
            fee_policy_ref: None,
            currency: Some(Currency::AOA),
            country: None,
            transaction_type: Some("wallet_withdrawal".into()),
            rate_bps: bps,
            flat_minor: 0,
            min_fee_minor: None,
            max_fee_minor: None,
            rounding: RoundingMode::Floor,
            priority: 0,
            effective_from: chrono::DateTime::from_timestamp(1_600_000_000, 0).unwrap(),
            effective_to: None,
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    fn kz(minor: i64) -> Money {
        Money::new(minor, Currency::AOA)
    }

    type PayoutEngineT = PostgresPayoutEngine<MockWalletRepo, MockLedger, MockPayoutRepo, MockPricing>;

    /// No-fee engine (empty rule set) — preserves the pre-ADR-031 behaviour used
    /// by the lifecycle tests.
    fn make_engine(available_balance_minor: i64) -> (PayoutEngineT, WalletId, AccountId) {
        let (e, w, a, _bank, _opfee) = make_engine_with(available_balance_minor, vec![]);
        (e, w, a)
    }

    /// Full engine with a configurable pricing rule set. Returns the extra
    /// account ids (bank, operator-fee) so fee tests can assert on the ledger.
    fn make_engine_with(
        available_balance_minor: i64,
        rules: Vec<PricingRule>,
    ) -> (PayoutEngineT, WalletId, AccountId, AccountId, AccountId) {
        let avail_id = AccountId::new();
        let bank_id = AccountId::new();
        let opfee_id = AccountId::new();

        let avail_account = Account {
            id: avail_id,
            account_type: AccountType::Liability,
            name: "Available".into(),
            currency: Currency::AOA,
            created_at: Utc::now(),
        };
        let bank_account = Account {
            id: bank_id,
            account_type: AccountType::Asset,
            name: "Bank".into(),
            currency: Currency::AOA,
            created_at: Utc::now(),
        };
        let opfee_account = Account {
            id: opfee_id,
            account_type: AccountType::Revenue,
            name: "Operator — Fee Revenue".into(),
            currency: Currency::AOA,
            created_at: Utc::now(),
        };

        let ledger = MockLedger::with_account(avail_account);
        ledger.accounts.lock().unwrap().push(bank_account);
        ledger.accounts.lock().unwrap().push(opfee_account);

        // Simulate available balance: LIABILITY account with credit balance = negative net.
        // Credit on LIABILITY → signed_minor_units() = -amount → balance().negate() = +amount.
        ledger.entries.lock().unwrap().push(LedgerEntry {
            id: LedgerEntryId::new(),
            posting_id: LedgerPostingId::new(),
            account_id: avail_id,
            entry_type: EntryType::Credit,
            amount: Money::new(available_balance_minor, Currency::AOA),
            created_at: Utc::now(),
        });

        let wallet_id = WalletId::new();
        let wallet = Wallet {
            id: wallet_id,
            merchant_id: MerchantId::new(),
            currency: Currency::AOA,
            status: WalletStatus::Active,
            available_account_id: avail_id,
            reserved_account_id: AccountId::new(),
            created_at: Utc::now(),
        };

        let engine = PostgresPayoutEngine::new(
            MockWalletRepo { wallet },
            Arc::new(ledger),
            MockPayoutRepo::new(),
            bank_id,
            Arc::new(MockPricing { rules }),
            opfee_id,
            "SANDBOX",
        );
        (engine, wallet_id, avail_id, bank_id, opfee_id)
    }

    fn dest() -> BankDestination {
        BankDestination {
            account_number: "123456789".into(),
            bank_code: "BAI".into(),
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
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-001".into(),
                merchant_id,
                wallet_id,
                amount: kz(50_000),
                destination: dest(),
            })
            .await
            .unwrap();
        assert_eq!(payout.status, PayoutStatus::Pending);
        assert!(payout.ledger_posting_id.is_none());
    }

    #[tokio::test]
    async fn process_posts_ledger_and_moves_to_processing() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-002".into(),
                merchant_id: MerchantId::new(),
                wallet_id,
                amount: kz(60_000),
                destination: dest(),
            })
            .await
            .unwrap();

        let processed = engine.process(payout.id).await.unwrap();
        assert_eq!(processed.status, PayoutStatus::Processing);
        assert!(
            processed.ledger_posting_id.is_some(),
            "ledger must be posted at process time"
        );
    }

    #[tokio::test]
    async fn full_happy_path_pending_to_confirmed() {
        let (engine, wallet_id, _) = make_engine(200_000);
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-003".into(),
                merchant_id: MerchantId::new(),
                wallet_id,
                amount: kz(80_000),
                destination: dest(),
            })
            .await
            .unwrap();

        engine.process(payout.id).await.unwrap();
        engine.mark_sent(payout.id).await.unwrap();
        let confirmed = engine.confirm(payout.id).await.unwrap();
        assert_eq!(confirmed.status, PayoutStatus::Confirmed);
        assert!(confirmed.confirmed_at.is_some());
    }

    #[tokio::test]
    async fn fail_from_pending_requires_no_reversal() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-004".into(),
                merchant_id: MerchantId::new(),
                wallet_id,
                amount: kz(10_000),
                destination: dest(),
            })
            .await
            .unwrap();

        let failed = engine
            .fail(payout.id, "cancelled by operator".into())
            .await
            .unwrap();
        assert_eq!(failed.status, PayoutStatus::Failed);
        // No ledger posting was made, so no reversal — ledger entries should be just the initial balance.
    }

    #[tokio::test]
    async fn fail_from_processing_reverses_ledger() {
        let (engine, wallet_id, avail_id) = make_engine(100_000);
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-005".into(),
                merchant_id: MerchantId::new(),
                wallet_id,
                amount: kz(40_000),
                destination: dest(),
            })
            .await
            .unwrap();

        engine.process(payout.id).await.unwrap();

        // After process: available should be 60_000 (100_000 - 40_000).
        let avail_after_process = engine.ledger.balance(avail_id).await.unwrap().negate();
        assert_eq!(avail_after_process.amount_minor(), 60_000);

        engine
            .fail(payout.id, "bank rejected".into())
            .await
            .unwrap();

        // After fail reversal: available should be back to 100_000.
        let avail_after_fail = engine.ledger.balance(avail_id).await.unwrap().negate();
        assert_eq!(
            avail_after_fail.amount_minor(),
            100_000,
            "ledger must be reversed on fail"
        );
    }

    #[tokio::test]
    async fn mark_returned_reverses_ledger() {
        let (engine, wallet_id, avail_id) = make_engine(100_000);
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-006".into(),
                merchant_id: MerchantId::new(),
                wallet_id,
                amount: kz(30_000),
                destination: dest(),
            })
            .await
            .unwrap();

        engine.process(payout.id).await.unwrap();
        engine.mark_sent(payout.id).await.unwrap();
        engine.mark_returned(payout.id).await.unwrap();

        let avail = engine.ledger.balance(avail_id).await.unwrap().negate();
        assert_eq!(
            avail.amount_minor(),
            100_000,
            "returned funds must be credited back"
        );
    }

    #[tokio::test]
    async fn insufficient_balance_is_rejected() {
        let (engine, wallet_id, _) = make_engine(10_000);
        let result = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-007".into(),
                merchant_id: MerchantId::new(),
                wallet_id,
                amount: kz(50_000), // more than the 10_000 available
                destination: dest(),
            })
            .await;
        assert!(matches!(
            result,
            Err(PayoutError::InsufficientBalance { .. })
        ));
    }

    #[tokio::test]
    async fn idempotency_returns_existing_payout() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let req1 = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-008".into(),
                merchant_id: MerchantId::new(),
                wallet_id,
                amount: kz(5_000),
                destination: dest(),
            })
            .await
            .unwrap();

        let req2 = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-008".into(),
                merchant_id: MerchantId::new(),
                wallet_id,
                amount: kz(5_000),
                destination: dest(),
            })
            .await
            .unwrap();

        assert_eq!(
            req1.id, req2.id,
            "same idempotency key must return same payout"
        );
    }

    #[tokio::test]
    async fn invalid_transition_is_rejected() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-009".into(),
                merchant_id: MerchantId::new(),
                wallet_id,
                amount: kz(1_000),
                destination: dest(),
            })
            .await
            .unwrap();

        // Cannot confirm directly from Pending — must go Pending → Processing → Sent → Confirmed.
        let result = engine.confirm(payout.id).await;
        assert!(matches!(
            result,
            Err(PayoutError::InvalidStatusTransition { .. })
        ));
    }

    // -----------------------------------------------------------------------
    // Withdrawal fee — ADR-031 (0,75%)
    // -----------------------------------------------------------------------

    /// Signed net of an account from the mock ledger (credits +, debits −).
    async fn net_of(engine: &PayoutEngineT, id: AccountId) -> i64 {
        engine
            .ledger
            .entries_for_account(id)
            .await
            .unwrap()
            .iter()
            .map(|e| match e.entry_type {
                EntryType::Credit => e.amount.amount_minor(),
                EntryType::Debit => -e.amount.amount_minor(),
            })
            .sum()
    }

    async fn init_process(
        engine: &PayoutEngineT,
        wallet_id: WalletId,
        key: &str,
        amount: i64,
    ) -> Payout {
        let p = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: key.into(),
                merchant_id: MerchantId::new(),
                wallet_id,
                amount: kz(amount),
                destination: dest(),
            })
            .await
            .unwrap();
        engine.process(p.id).await.unwrap()
    }

    #[tokio::test]
    async fn payout_without_rule_is_free() {
        let (engine, wallet_id, avail_id, bank_id, opfee_id) = make_engine_with(200_000, vec![]);
        init_process(&engine, wallet_id, "w-free", 100_000).await;
        // No rule → fee 0: bank gets the full gross, operator fee untouched.
        assert_eq!(net_of(&engine, opfee_id).await, 0);
        assert_eq!(net_of(&engine, bank_id).await, 100_000); // ASSET credited full gross
        assert_eq!(net_of(&engine, avail_id).await, 100_000); // LIABILITY: 200k cr − 100k dr
    }

    #[tokio::test]
    async fn withdrawal_charges_075_percent() {
        let (engine, wallet_id, avail_id, bank_id, opfee_id) =
            make_engine_with(200_000, vec![withdrawal_rule(75)]);
        init_process(&engine, wallet_id, "w-fee", 100_000).await;
        // gross 100000 → fee 750 → net 99250
        assert_eq!(net_of(&engine, opfee_id).await, 750, "operator fee = 0,75%");
        assert_eq!(net_of(&engine, bank_id).await, 99_250, "bank receives net");
        // merchant available reduced by the full gross (200k − 100k)
        assert_eq!(net_of(&engine, avail_id).await, 100_000);
    }

    #[tokio::test]
    async fn ledger_balanced_gross_equals_net_plus_fee() {
        let (engine, wallet_id, _avail, bank_id, opfee_id) =
            make_engine_with(200_000, vec![withdrawal_rule(75)]);
        init_process(&engine, wallet_id, "w-bal", 100_000).await;
        // Balanced posting: DR available gross == CR bank net + CR operator_fee fee.
        assert_eq!(
            net_of(&engine, bank_id).await + net_of(&engine, opfee_id).await,
            100_000
        );
    }

    #[tokio::test]
    async fn failed_payout_reverses_gross_and_fee() {
        let (engine, wallet_id, avail_id, bank_id, opfee_id) =
            make_engine_with(200_000, vec![withdrawal_rule(75)]);
        let p = init_process(&engine, wallet_id, "w-fail", 100_000).await;
        engine.fail(p.id, "bank rejected".into()).await.unwrap();
        // Everything back to square one — nothing stranded on the fee account.
        assert_eq!(net_of(&engine, opfee_id).await, 0, "fee reversed");
        assert_eq!(net_of(&engine, bank_id).await, 0, "bank reversed");
        assert_eq!(net_of(&engine, avail_id).await, 200_000, "merchant restored");
    }

    #[tokio::test]
    async fn returned_payout_reverses_gross_and_fee() {
        let (engine, wallet_id, avail_id, _bank, opfee_id) =
            make_engine_with(200_000, vec![withdrawal_rule(75)]);
        let p = init_process(&engine, wallet_id, "w-ret", 100_000).await;
        engine.mark_sent(p.id).await.unwrap();
        engine.mark_returned(p.id).await.unwrap();
        assert_eq!(net_of(&engine, opfee_id).await, 0);
        assert_eq!(net_of(&engine, avail_id).await, 200_000);
    }

    #[tokio::test]
    async fn double_reversal_is_prevented() {
        let (engine, wallet_id, avail_id, _bank, opfee_id) =
            make_engine_with(200_000, vec![withdrawal_rule(75)]);
        let p = init_process(&engine, wallet_id, "w-dbl", 100_000).await;
        engine.fail(p.id, "x".into()).await.unwrap();
        // A second terminal transition is refused → no second reversal.
        assert!(matches!(
            engine.fail(p.id, "again".into()).await,
            Err(PayoutError::InvalidStatusTransition { .. })
        ));
        assert_eq!(net_of(&engine, opfee_id).await, 0);
        assert_eq!(net_of(&engine, avail_id).await, 200_000);
    }

    #[tokio::test]
    async fn zero_amount_is_rejected() {
        let (engine, wallet_id, ..) = make_engine_with(200_000, vec![withdrawal_rule(75)]);
        let r = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "w-zero".into(),
                merchant_id: MerchantId::new(),
                wallet_id,
                amount: kz(0),
                destination: dest(),
            })
            .await;
        assert!(matches!(r, Err(PayoutError::InvalidAmount)));
    }

    #[tokio::test]
    async fn fee_uses_floor_rounding() {
        // 13333 * 75 / 10000 = 99.9975 → floor = 99, net = 13234.
        let (engine, wallet_id, _avail, bank_id, opfee_id) =
            make_engine_with(200_000, vec![withdrawal_rule(75)]);
        init_process(&engine, wallet_id, "w-floor", 13_333).await;
        assert_eq!(net_of(&engine, opfee_id).await, 99);
        assert_eq!(net_of(&engine, bank_id).await, 13_234);
    }

    #[tokio::test]
    async fn fee_exceeding_gross_is_rejected() {
        // A pathological 200% rule (2000000... > gross) must fail loudly, never
        // produce a negative net.
        let (engine, wallet_id, ..) = make_engine_with(500_000, vec![withdrawal_rule(20_000)]);
        let p = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "w-exceed".into(),
                merchant_id: MerchantId::new(),
                wallet_id,
                amount: kz(100_000),
                destination: dest(),
            })
            .await
            .unwrap();
        assert!(matches!(
            engine.process(p.id).await,
            Err(PayoutError::FeeExceedsGross { .. })
        ));
    }

    #[tokio::test]
    async fn future_dated_rule_is_not_applied() {
        // A rule effective only in the future must not price today → free.
        let mut future = withdrawal_rule(75);
        future.effective_from = Utc::now() + chrono::Duration::days(365);
        let (engine, wallet_id, _avail, _bank, opfee_id) =
            make_engine_with(200_000, vec![future]);
        init_process(&engine, wallet_id, "w-future", 100_000).await;
        assert_eq!(net_of(&engine, opfee_id).await, 0);
    }
}
