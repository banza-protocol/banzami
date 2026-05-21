use std::sync::Arc;

use chrono::{DateTime, Utc};

use banzami_ledger::{LedgerEngine, PostingBuilder};
use banzami_types::{AccountId, MerchantId, Money, SettlementId, WalletId};

use crate::{
    repository::SettlementRepository,
    Settlement, SettlementError, SettlementStatus,
};

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

pub struct CreateSettlementBatchRequest {
    pub idempotency_key:   String,
    pub merchant_id:       MerchantId,
    pub wallet_id:         WalletId,
    pub gross_amount:      Money,
    /// Must be ≤ gross_amount and in the same currency.
    pub fee_amount:        Money,
    pub transaction_count: u32,
    pub period_start:      DateTime<Utc>,
    pub period_end:        DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait SettlementEngine: Send + Sync {
    async fn create_batch(
        &self,
        req: CreateSettlementBatchRequest,
    ) -> Result<Settlement, SettlementError>;

    /// PENDING → SUBMITTED: batch sent to the acquirer.
    async fn submit(&self, id: SettlementId) -> Result<Settlement, SettlementError>;

    /// SUBMITTED → SETTLED: acquirer confirmed; posts a ledger entry recording
    /// the actual cash movement (DR bank_account, CR transit_account).
    async fn confirm(&self, id: SettlementId) -> Result<Settlement, SettlementError>;

    /// PENDING|SUBMITTED → FAILED.
    async fn fail(
        &self,
        id: SettlementId,
        reason: String,
    ) -> Result<Settlement, SettlementError>;

    async fn get(&self, id: SettlementId) -> Result<Settlement, SettlementError>;

    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
    ) -> Result<Vec<Settlement>, SettlementError>;

    async fn list_all(
        &self,
        limit: i64,
        status: Option<String>,
    ) -> Result<Vec<Settlement>, SettlementError>;
}

// ---------------------------------------------------------------------------
// Production implementation
// ---------------------------------------------------------------------------

pub struct PostgresSettlementEngine<L: LedgerEngine, R: SettlementRepository> {
    ledger:             Arc<L>,
    repo:               R,
    /// ASSET — the platform's actual bank account; debited when the acquirer pays.
    bank_account_id:    AccountId,
    /// ASSET — the acquirer float; credited (reduced) when cash arrives.
    transit_account_id: AccountId,
}

impl<L: LedgerEngine, R: SettlementRepository> PostgresSettlementEngine<L, R> {
    pub fn new(
        ledger: Arc<L>,
        repo: R,
        bank_account_id: AccountId,
        transit_account_id: AccountId,
    ) -> Self {
        Self { ledger, repo, bank_account_id, transit_account_id }
    }
}

impl<L: LedgerEngine + 'static, R: SettlementRepository> SettlementEngine
    for PostgresSettlementEngine<L, R>
{
    async fn create_batch(
        &self,
        req: CreateSettlementBatchRequest,
    ) -> Result<Settlement, SettlementError> {
        if req.fee_amount.amount_minor() > req.gross_amount.amount_minor() {
            return Err(SettlementError::FeeExceedsGross {
                fee:   req.fee_amount,
                gross: req.gross_amount,
            });
        }

        let net_amount = req.gross_amount.checked_sub(req.fee_amount)?;
        let currency = req.gross_amount.currency;
        let now = Utc::now();

        let settlement = Settlement {
            id:                SettlementId::new(),
            merchant_id:       req.merchant_id,
            wallet_id:         req.wallet_id,
            currency,
            status:            SettlementStatus::Pending,
            gross_amount:      req.gross_amount,
            fee_amount:        req.fee_amount,
            net_amount,
            transaction_count: req.transaction_count,
            period_start:      req.period_start,
            period_end:        req.period_end,
            ledger_posting_id: None,
            failure_reason:    None,
            submitted_at:      None,
            settled_at:        None,
            created_at:        now,
            updated_at:        now,
        };

        self.repo.create(settlement).await
    }

    async fn submit(&self, id: SettlementId) -> Result<Settlement, SettlementError> {
        let s = self.repo.get(id).await?;
        guard_transition(&s, SettlementStatus::Submitted)?;

        let updated = self
            .repo
            .update_status(id, SettlementStatus::Submitted, None, None)
            .await?;

        tracing::info!(settlement_id = %id, "settlement submitted to acquirer");
        Ok(updated)
    }

    async fn confirm(&self, id: SettlementId) -> Result<Settlement, SettlementError> {
        let s = self.repo.get(id).await?;
        guard_transition(&s, SettlementStatus::Settled)?;

        // Post the ledger confirmation: acquirer has transferred net funds to
        // the platform bank. DR bank_account, CR transit_account.
        let posting = PostingBuilder::new(
            format!("settlement confirmation — batch {id}"),
            format!("settlement:{id}:confirm"),
        )
        .debit(self.bank_account_id, s.net_amount)
        .credit(self.transit_account_id, s.net_amount)
        .build()
        .map_err(|_| SettlementError::Ledger(banzami_ledger::LedgerError::UnbalancedPosting {
            debits_minor:  s.net_amount.amount_minor(),
            credits_minor: 0,
            currency:      s.currency,
        }))?;

        let posted = self.ledger.post(posting).await?;

        let updated = self
            .repo
            .update_status(id, SettlementStatus::Settled, Some(posted.id), None)
            .await?;

        tracing::info!(
            settlement_id  = %id,
            net_amount     = %s.net_amount,
            posting_id     = %posted.id,
            "settlement confirmed — ledger posted"
        );
        Ok(updated)
    }

    async fn fail(
        &self,
        id: SettlementId,
        reason: String,
    ) -> Result<Settlement, SettlementError> {
        let s = self.repo.get(id).await?;
        guard_transition(&s, SettlementStatus::Failed)?;

        let updated = self
            .repo
            .update_status(id, SettlementStatus::Failed, None, Some(&reason))
            .await?;

        tracing::warn!(settlement_id = %id, reason = %reason, "settlement failed");
        Ok(updated)
    }

    async fn get(&self, id: SettlementId) -> Result<Settlement, SettlementError> {
        self.repo.get(id).await
    }

    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
    ) -> Result<Vec<Settlement>, SettlementError> {
        self.repo.list_for_merchant(merchant_id).await
    }

    async fn list_all(
        &self,
        limit: i64,
        status: Option<String>,
    ) -> Result<Vec<Settlement>, SettlementError> {
        self.repo.list_all(limit, status.as_deref()).await
    }
}

fn guard_transition(
    s: &Settlement,
    to: SettlementStatus,
) -> Result<(), SettlementError> {
    if s.status.can_transition_to(to) {
        Ok(())
    } else {
        Err(SettlementError::InvalidStatusTransition { from: s.status, to })
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use banzami_ledger::{LedgerEngine, LedgerError, Account, LedgerEntry, LedgerPosting};
    use banzami_types::{AccountId, Currency, LedgerPostingId, MerchantId, Money, SettlementId, WalletId};

    use super::*;
    use crate::{repository::SettlementRepository, Settlement, SettlementError, SettlementStatus};

    // -----------------------------------------------------------------------
    // Mock ledger — records postings in memory
    // -----------------------------------------------------------------------

    struct MockLedger {
        postings: Mutex<Vec<LedgerPosting>>,
    }

    impl MockLedger {
        fn new() -> Self {
            Self { postings: Mutex::new(vec![]) }
        }

        fn posting_count(&self) -> usize {
            self.postings.lock().unwrap().len()
        }
    }

    impl LedgerEngine for MockLedger {
        async fn create_account(&self, account: Account) -> Result<Account, LedgerError> {
            Ok(account)
        }

        async fn post(&self, posting: LedgerPosting) -> Result<LedgerPosting, LedgerError> {
            posting.assert_balanced()?;
            self.postings.lock().unwrap().push(posting.clone());
            Ok(posting)
        }

        async fn balance(&self, _: AccountId) -> Result<Money, LedgerError> {
            Ok(Money::zero(Currency::AOA))
        }

        async fn entries_for_account(
            &self,
            _: AccountId,
        ) -> Result<Vec<LedgerEntry>, LedgerError> {
            Ok(vec![])
        }

        async fn reverse(
            &self,
            _original: &LedgerPosting,
            _description: impl Into<String> + Send,
            _new_idempotency_key: impl Into<String> + Send,
        ) -> Result<LedgerPosting, LedgerError> {
            unimplemented!("reverse not needed in settlement unit tests")
        }

        async fn get_posting(
            &self,
            _posting_id: LedgerPostingId,
        ) -> Result<LedgerPosting, LedgerError> {
            unimplemented!("get_posting not needed in settlement unit tests")
        }
    }

    // -----------------------------------------------------------------------
    // Mock repository
    // -----------------------------------------------------------------------

    struct MockSettlementRepo {
        rows: Mutex<Vec<Settlement>>,
    }

    impl MockSettlementRepo {
        fn new() -> Self {
            Self { rows: Mutex::new(vec![]) }
        }
    }

    impl SettlementRepository for MockSettlementRepo {
        async fn create(&self, s: Settlement) -> Result<Settlement, SettlementError> {
            self.rows.lock().unwrap().push(s.clone());
            Ok(s)
        }

        async fn get(&self, id: SettlementId) -> Result<Settlement, SettlementError> {
            self.rows
                .lock()
                .unwrap()
                .iter()
                .find(|s| s.id == id)
                .cloned()
                .ok_or(SettlementError::NotFound(id))
        }

        async fn list_for_merchant(
            &self,
            merchant_id: MerchantId,
        ) -> Result<Vec<Settlement>, SettlementError> {
            Ok(self
                .rows
                .lock()
                .unwrap()
                .iter()
                .filter(|s| s.merchant_id == merchant_id)
                .cloned()
                .collect())
        }

        async fn list_all(
            &self,
            _limit: i64,
            status: Option<&str>,
        ) -> Result<Vec<Settlement>, SettlementError> {
            let rows = self.rows.lock().unwrap();
            Ok(rows
                .iter()
                .filter(|s| {
                    status.map_or(true, |st| format!("{:?}", s.status).to_uppercase() == st.to_uppercase())
                })
                .cloned()
                .collect())
        }

        async fn update_status(
            &self,
            id: SettlementId,
            status: SettlementStatus,
            posting_id: Option<banzami_types::LedgerPostingId>,
            failure_reason: Option<&str>,
        ) -> Result<Settlement, SettlementError> {
            let mut rows = self.rows.lock().unwrap();
            let s = rows
                .iter_mut()
                .find(|s| s.id == id)
                .ok_or(SettlementError::NotFound(id))?;
            s.status = status;
            s.ledger_posting_id = posting_id;
            s.failure_reason = failure_reason.map(str::to_owned);
            if status == SettlementStatus::Submitted {
                s.submitted_at = Some(Utc::now());
            }
            if status == SettlementStatus::Settled {
                s.settled_at = Some(Utc::now());
            }
            s.updated_at = Utc::now();
            Ok(s.clone())
        }
    }

    fn make_engine() -> PostgresSettlementEngine<MockLedger, MockSettlementRepo> {
        PostgresSettlementEngine::new(
            Arc::new(MockLedger::new()),
            MockSettlementRepo::new(),
            AccountId::new(), // bank
            AccountId::new(), // transit
        )
    }

    fn kz(minor: i64) -> Money {
        Money::new(minor, Currency::AOA)
    }

    async fn pending_batch(
        engine: &PostgresSettlementEngine<MockLedger, MockSettlementRepo>,
    ) -> Settlement {
        engine
            .create_batch(CreateSettlementBatchRequest {
                idempotency_key:   "settle-001".into(),
                merchant_id:       MerchantId::new(),
                wallet_id:         WalletId::new(),
                gross_amount:      kz(100_000),
                fee_amount:        kz(2_000),
                transaction_count: 5,
                period_start:      Utc::now(),
                period_end:        Utc::now(),
            })
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn create_batch_is_pending_with_correct_net() {
        let engine = make_engine();
        let s = pending_batch(&engine).await;
        assert_eq!(s.status, SettlementStatus::Pending);
        assert_eq!(s.net_amount, kz(98_000));
        assert_eq!(s.transaction_count, 5);
    }

    #[tokio::test]
    async fn submit_transitions_to_submitted() {
        let engine = make_engine();
        let s = pending_batch(&engine).await;
        let submitted = engine.submit(s.id).await.unwrap();
        assert_eq!(submitted.status, SettlementStatus::Submitted);
        assert!(submitted.submitted_at.is_some());
    }

    #[tokio::test]
    async fn confirm_transitions_to_settled_and_posts_ledger() {
        let ledger = Arc::new(MockLedger::new());
        let engine = PostgresSettlementEngine::new(
            ledger.clone(),
            MockSettlementRepo::new(),
            AccountId::new(),
            AccountId::new(),
        );
        let s = pending_batch(&engine).await;
        engine.submit(s.id).await.unwrap();
        let settled = engine.confirm(s.id).await.unwrap();

        assert_eq!(settled.status, SettlementStatus::Settled);
        assert!(settled.settled_at.is_some());
        assert!(settled.ledger_posting_id.is_some());
        assert_eq!(ledger.posting_count(), 1);
    }

    #[tokio::test]
    async fn fail_from_pending_is_valid() {
        let engine = make_engine();
        let s = pending_batch(&engine).await;
        let failed = engine.fail(s.id, "acquirer timeout".into()).await.unwrap();
        assert_eq!(failed.status, SettlementStatus::Failed);
        assert_eq!(failed.failure_reason.as_deref(), Some("acquirer timeout"));
    }

    #[tokio::test]
    async fn fail_from_submitted_is_valid() {
        let engine = make_engine();
        let s = pending_batch(&engine).await;
        engine.submit(s.id).await.unwrap();
        let failed = engine.fail(s.id, "rejected".into()).await.unwrap();
        assert_eq!(failed.status, SettlementStatus::Failed);
    }

    #[tokio::test]
    async fn invalid_transition_pending_to_settled_is_rejected() {
        let engine = make_engine();
        let s = pending_batch(&engine).await;
        let result = engine.confirm(s.id).await;
        assert!(matches!(result, Err(SettlementError::InvalidStatusTransition { .. })));
    }

    #[tokio::test]
    async fn fee_exceeding_gross_is_rejected() {
        let engine = make_engine();
        let result = engine
            .create_batch(CreateSettlementBatchRequest {
                idempotency_key:   "settle-bad".into(),
                merchant_id:       MerchantId::new(),
                wallet_id:         WalletId::new(),
                gross_amount:      kz(1_000),
                fee_amount:        kz(1_001), // more than gross
                transaction_count: 1,
                period_start:      Utc::now(),
                period_end:        Utc::now(),
            })
            .await;
        assert!(matches!(result, Err(SettlementError::FeeExceedsGross { .. })));
    }
}
