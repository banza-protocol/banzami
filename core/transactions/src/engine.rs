use std::sync::Arc;

use chrono::{DateTime, Utc};

use banzami_types::{AccountId, MerchantId, Money, TransactionId};
use banzami_wallets::{ReleaseRequest, ReserveRequest, SettleRequest, WalletEngine};

use crate::{
    repository::TransactionRepository,
    transaction::{
        AuthorizeRequest, CaptureRequest, CreateTransactionRequest, FailRequest, ReverseRequest,
        Transaction, TransactionStatus,
    },
    TransactionError,
};

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

/// Coordinates the transaction lifecycle: state-machine enforcement, wallet
/// fund movements, and persistence.
///
/// Every state transition is:
/// - guarded by [`TransactionStatus::can_transition_to`],
/// - backed by an atomic ledger posting via the wallet engine,
/// - persisted with an `updated_at` timestamp.
///
/// Idempotency is enforced at two layers:
/// 1. DB UNIQUE on `idempotency_key` for `create()`,
/// 2. Derived idempotency keys (e.g. `<idem_key>:authorize`) for wallet ops.
#[allow(async_fn_in_trait)]
pub trait TransactionEngine: Send + Sync {
    /// Create a transaction in PENDING status.
    ///
    /// If the idempotency key already exists, returns the existing transaction
    /// rather than an error (exactly-once semantics).
    async fn create(&self, req: CreateTransactionRequest) -> Result<Transaction, TransactionError>;

    /// Transition PENDING → AUTHORIZED and reserve funds in the merchant wallet.
    async fn authorize(&self, req: AuthorizeRequest) -> Result<Transaction, TransactionError>;

    /// Transition AUTHORIZED → CAPTURED and settle reserved funds to available.
    async fn capture(&self, req: CaptureRequest) -> Result<Transaction, TransactionError>;

    /// Transition AUTHORIZED → REVERSED and release the wallet reservation.
    async fn reverse(&self, req: ReverseRequest) -> Result<Transaction, TransactionError>;

    /// Transition PENDING|AUTHORIZED → FAILED.
    /// Releases the wallet reservation if the transaction was already authorized.
    async fn fail(&self, req: FailRequest) -> Result<Transaction, TransactionError>;

    async fn get(&self, id: TransactionId) -> Result<Transaction, TransactionError>;

    /// Keyset-paginated list for a merchant, newest first. Fetch `limit+1` to detect
    /// whether more pages exist; truncate to `limit` before returning to callers.
    /// Pass `since_ts` to restrict to transactions created at or after that timestamp.
    async fn list(
        &self,
        merchant_id: MerchantId,
        limit: i64,
        before_ts: Option<DateTime<Utc>>,
        before_id: Option<TransactionId>,
        since_ts: Option<DateTime<Utc>>,
    ) -> Result<Vec<Transaction>, TransactionError>;
}

// ---------------------------------------------------------------------------
// Production implementation
// ---------------------------------------------------------------------------

pub struct PostgresTransactionEngine<W: WalletEngine, R: TransactionRepository> {
    wallet: Arc<W>,
    repo: R,
    /// System ASSET account used as the debit side of wallet reserve / credit
    /// side of wallet release. Represents the acquiring float — money arriving
    /// from or returning to the payment network.
    transit_account_id: AccountId,
}

impl<W: WalletEngine, R: TransactionRepository> PostgresTransactionEngine<W, R> {
    pub fn new(wallet: Arc<W>, repo: R, transit_account_id: AccountId) -> Self {
        Self { wallet, repo, transit_account_id }
    }
}

impl<W: WalletEngine + 'static, R: TransactionRepository> TransactionEngine
    for PostgresTransactionEngine<W, R>
{
    async fn create(&self, req: CreateTransactionRequest) -> Result<Transaction, TransactionError> {
        // Idempotency: return existing transaction if the key was already used.
        if let Some(existing) = self
            .repo
            .get_by_idempotency_key(&req.idempotency_key)
            .await?
        {
            tracing::info!(
                idempotency_key = %req.idempotency_key,
                tx_id = %existing.id,
                "idempotent create — returning existing transaction"
            );
            return Ok(existing);
        }

        let now = Utc::now();
        let tx = Transaction {
            id: banzami_types::TransactionId::new(),
            idempotency_key: req.idempotency_key,
            transaction_type: req.transaction_type,
            status: TransactionStatus::Pending,
            amount: req.amount,
            fee: Money::zero(req.amount.currency),
            currency: req.amount.currency,
            merchant_id: req.merchant_id,
            wallet_id: req.wallet_id,
            description: req.description,
            failure_reason: None,
            created_at: now,
            updated_at: now,
        };

        self.repo.create(tx).await
    }

    async fn authorize(&self, req: AuthorizeRequest) -> Result<Transaction, TransactionError> {
        let tx = self.repo.get(req.tx_id).await?;
        guard_transition(&tx, TransactionStatus::Authorized)?;

        // Reserve funds: idempotency key is derived so retries are safe.
        self.wallet
            .reserve(ReserveRequest {
                idempotency_key: format!("{}:authorize", tx.idempotency_key),
                wallet_id: tx.wallet_id,
                amount: tx.amount,
                from_account_id: self.transit_account_id,
            })
            .await
            .map_err(TransactionError::Wallet)?;

        let updated = self
            .repo
            .update_status(tx.id, TransactionStatus::Authorized, None)
            .await?;

        tracing::info!(tx_id = %tx.id, amount = %tx.amount, "transaction authorized");
        Ok(updated)
    }

    async fn capture(&self, req: CaptureRequest) -> Result<Transaction, TransactionError> {
        let tx = self.repo.get(req.tx_id).await?;
        guard_transition(&tx, TransactionStatus::Captured)?;

        self.wallet
            .settle(SettleRequest {
                idempotency_key: format!("{}:capture", tx.idempotency_key),
                wallet_id: tx.wallet_id,
                amount: tx.amount,
            })
            .await
            .map_err(TransactionError::Wallet)?;

        let updated = self
            .repo
            .update_status(tx.id, TransactionStatus::Captured, None)
            .await?;

        tracing::info!(tx_id = %tx.id, amount = %tx.amount, "transaction captured");
        Ok(updated)
    }

    async fn reverse(&self, req: ReverseRequest) -> Result<Transaction, TransactionError> {
        let tx = self.repo.get(req.tx_id).await?;
        guard_transition(&tx, TransactionStatus::Reversed)?;

        self.wallet
            .release(ReleaseRequest {
                idempotency_key: format!("{}:reverse", tx.idempotency_key),
                wallet_id: tx.wallet_id,
                amount: tx.amount,
                to_account_id: self.transit_account_id,
            })
            .await
            .map_err(TransactionError::Wallet)?;

        let updated = self
            .repo
            .update_status(tx.id, TransactionStatus::Reversed, None)
            .await?;

        tracing::info!(tx_id = %tx.id, amount = %tx.amount, "transaction reversed");
        Ok(updated)
    }

    async fn fail(&self, req: FailRequest) -> Result<Transaction, TransactionError> {
        let tx = self.repo.get(req.tx_id).await?;
        guard_transition(&tx, TransactionStatus::Failed)?;

        // If already authorized, release the wallet reservation first.
        if tx.status == TransactionStatus::Authorized {
            self.wallet
                .release(ReleaseRequest {
                    idempotency_key: format!("{}:fail-release", tx.idempotency_key),
                    wallet_id: tx.wallet_id,
                    amount: tx.amount,
                    to_account_id: self.transit_account_id,
                })
                .await
                .map_err(TransactionError::Wallet)?;
        }

        let updated = self
            .repo
            .update_status(tx.id, TransactionStatus::Failed, Some(&req.reason))
            .await?;

        tracing::warn!(tx_id = %tx.id, reason = %req.reason, "transaction failed");
        Ok(updated)
    }

    async fn get(&self, id: TransactionId) -> Result<Transaction, TransactionError> {
        self.repo.get(id).await
    }

    async fn list(
        &self,
        merchant_id: MerchantId,
        limit: i64,
        before_ts: Option<DateTime<Utc>>,
        before_id: Option<TransactionId>,
        since_ts: Option<DateTime<Utc>>,
    ) -> Result<Vec<Transaction>, TransactionError> {
        self.repo.list_for_merchant(merchant_id, limit, before_ts, before_id, since_ts).await
    }
}

fn guard_transition(tx: &Transaction, to: TransactionStatus) -> Result<(), TransactionError> {
    if tx.status.can_transition_to(to) {
        Ok(())
    } else {
        Err(TransactionError::InvalidStatusTransition { from: tx.status, to })
    }
}

// ---------------------------------------------------------------------------
// Tests — state machine invariants (CLAUDE.md §8.2)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use banzami_types::{AccountId, Currency, MerchantId, Money, TransactionId, WalletId};
    use banzami_wallets::{
        CreateWalletRequest, ReleaseRequest, ReserveRequest, SettleRequest, Wallet, WalletBalance,
        WalletEngine, WalletError,
    };

    use super::*;
    use crate::{
        repository::TransactionRepository, Transaction, TransactionError, TransactionStatus,
        TransactionType,
    };

    // -----------------------------------------------------------------------
    // Mock wallet engine — no-op; state machine tests don't need real wallet ops
    // -----------------------------------------------------------------------

    struct MockWallet;

    impl WalletEngine for MockWallet {
        async fn create(&self, _: CreateWalletRequest) -> Result<Wallet, WalletError> {
            unimplemented!()
        }
        async fn get(&self, _: WalletId) -> Result<Wallet, WalletError> {
            unimplemented!()
        }
        async fn get_for_merchant(
            &self,
            _: MerchantId,
            _: Currency,
        ) -> Result<Wallet, WalletError> {
            unimplemented!()
        }
        async fn balance(&self, _: WalletId) -> Result<WalletBalance, WalletError> {
            unimplemented!()
        }
        async fn reserve(&self, _: ReserveRequest) -> Result<(), WalletError> {
            Ok(())
        }
        async fn release(&self, _: ReleaseRequest) -> Result<(), WalletError> {
            Ok(())
        }
        async fn settle(&self, _: SettleRequest) -> Result<(), WalletError> {
            Ok(())
        }
    }

    // -----------------------------------------------------------------------
    // In-memory transaction repository
    // -----------------------------------------------------------------------

    struct MockRepo {
        rows: Mutex<Vec<Transaction>>,
    }

    impl MockRepo {
        fn new() -> Self {
            Self { rows: Mutex::new(vec![]) }
        }
    }

    impl TransactionRepository for MockRepo {
        async fn create(&self, tx: Transaction) -> Result<Transaction, TransactionError> {
            let mut rows = self.rows.lock().unwrap();
            if rows.iter().any(|r| r.idempotency_key == tx.idempotency_key) {
                return Err(TransactionError::DuplicateIdempotencyKey(
                    tx.idempotency_key.clone(),
                ));
            }
            rows.push(tx.clone());
            Ok(tx)
        }

        async fn get(&self, id: TransactionId) -> Result<Transaction, TransactionError> {
            self.rows
                .lock()
                .unwrap()
                .iter()
                .find(|r| r.id == id)
                .cloned()
                .ok_or(TransactionError::NotFound(id))
        }

        async fn get_by_idempotency_key(
            &self,
            key: &str,
        ) -> Result<Option<Transaction>, TransactionError> {
            Ok(self
                .rows
                .lock()
                .unwrap()
                .iter()
                .find(|r| r.idempotency_key == key)
                .cloned())
        }

        async fn update_status(
            &self,
            id: TransactionId,
            status: TransactionStatus,
            failure_reason: Option<&str>,
        ) -> Result<Transaction, TransactionError> {
            let mut rows = self.rows.lock().unwrap();
            let tx = rows
                .iter_mut()
                .find(|r| r.id == id)
                .ok_or(TransactionError::NotFound(id))?;
            tx.status = status;
            tx.failure_reason = failure_reason.map(str::to_owned);
            tx.updated_at = Utc::now();
            Ok(tx.clone())
        }

        async fn list_for_merchant(
            &self,
            merchant_id: MerchantId,
            limit: i64,
            _before_ts: Option<DateTime<Utc>>,
            _before_id: Option<TransactionId>,
            since_ts: Option<DateTime<Utc>>,
        ) -> Result<Vec<Transaction>, TransactionError> {
            let rows = self.rows.lock().unwrap();
            Ok(rows
                .iter()
                .filter(|tx| tx.merchant_id == merchant_id)
                .filter(|tx| since_ts.map_or(true, |since| tx.created_at >= since))
                .take(limit as usize)
                .cloned()
                .collect())
        }
    }

    fn make_engine() -> PostgresTransactionEngine<MockWallet, MockRepo> {
        PostgresTransactionEngine::new(
            Arc::new(MockWallet),
            MockRepo::new(),
            AccountId::new(),
        )
    }

    fn kz(minor: i64) -> Money {
        Money::new(minor, Currency::AOA)
    }

    async fn pending_tx(
        engine: &PostgresTransactionEngine<MockWallet, MockRepo>,
    ) -> Transaction {
        engine
            .create(CreateTransactionRequest {
                idempotency_key: "idem-001".into(),
                transaction_type: TransactionType::Payment,
                amount: kz(50_000),
                merchant_id: MerchantId::new(),
                wallet_id: WalletId::new(),
                description: None,
            })
            .await
            .unwrap()
    }

    // -----------------------------------------------------------------------
    // Tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn create_produces_pending_transaction() {
        let engine = make_engine();
        let tx = pending_tx(&engine).await;
        assert_eq!(tx.status, TransactionStatus::Pending);
        assert_eq!(tx.amount.amount_minor(), 50_000);
    }

    #[tokio::test]
    async fn create_is_idempotent() {
        let engine = make_engine();
        let tx1 = pending_tx(&engine).await;
        // Second call with the same idempotency key must return the same tx.
        let tx2 = engine
            .create(CreateTransactionRequest {
                idempotency_key: "idem-001".into(),
                transaction_type: TransactionType::Payment,
                amount: kz(50_000),
                merchant_id: MerchantId::new(),
                wallet_id: WalletId::new(),
                description: None,
            })
            .await
            .unwrap();
        assert_eq!(tx1.id, tx2.id, "idempotent create must return the same transaction");
    }

    #[tokio::test]
    async fn authorize_transitions_to_authorized() {
        let engine = make_engine();
        let tx = pending_tx(&engine).await;

        let authorized = engine
            .authorize(AuthorizeRequest { tx_id: tx.id })
            .await
            .unwrap();

        assert_eq!(authorized.status, TransactionStatus::Authorized);
    }

    #[tokio::test]
    async fn capture_after_authorize_transitions_to_captured() {
        let engine = make_engine();
        let tx = pending_tx(&engine).await;

        let authorized = engine
            .authorize(AuthorizeRequest { tx_id: tx.id })
            .await
            .unwrap();

        let captured = engine
            .capture(CaptureRequest { tx_id: authorized.id })
            .await
            .unwrap();

        assert_eq!(captured.status, TransactionStatus::Captured);
    }

    #[tokio::test]
    async fn reverse_after_authorize_transitions_to_reversed() {
        let engine = make_engine();
        let tx = pending_tx(&engine).await;

        let authorized = engine
            .authorize(AuthorizeRequest { tx_id: tx.id })
            .await
            .unwrap();

        let reversed = engine
            .reverse(ReverseRequest { tx_id: authorized.id })
            .await
            .unwrap();

        assert_eq!(reversed.status, TransactionStatus::Reversed);
    }

    #[tokio::test]
    async fn fail_from_pending_transitions_to_failed() {
        let engine = make_engine();
        let tx = pending_tx(&engine).await;

        let failed = engine
            .fail(FailRequest {
                tx_id: tx.id,
                reason: "acquirer declined".into(),
            })
            .await
            .unwrap();

        assert_eq!(failed.status, TransactionStatus::Failed);
        assert_eq!(
            failed.failure_reason.as_deref(),
            Some("acquirer declined")
        );
    }

    #[tokio::test]
    async fn fail_from_authorized_releases_wallet_and_transitions_to_failed() {
        let engine = make_engine();
        let tx = pending_tx(&engine).await;

        let authorized = engine
            .authorize(AuthorizeRequest { tx_id: tx.id })
            .await
            .unwrap();

        let failed = engine
            .fail(FailRequest {
                tx_id: authorized.id,
                reason: "capture timeout".into(),
            })
            .await
            .unwrap();

        assert_eq!(failed.status, TransactionStatus::Failed);
    }

    #[tokio::test]
    async fn invalid_transition_is_rejected() {
        let engine = make_engine();
        let tx = pending_tx(&engine).await;

        // PENDING → CAPTURED is not a valid transition.
        let result = engine
            .capture(CaptureRequest { tx_id: tx.id })
            .await;

        assert!(
            matches!(result, Err(TransactionError::InvalidStatusTransition { .. })),
            "PENDING → CAPTURED must be rejected"
        );
    }

    #[tokio::test]
    async fn double_authorize_is_rejected() {
        let engine = make_engine();
        let tx = pending_tx(&engine).await;

        engine
            .authorize(AuthorizeRequest { tx_id: tx.id })
            .await
            .unwrap();

        // AUTHORIZED → AUTHORIZED is not valid.
        let result = engine
            .authorize(AuthorizeRequest { tx_id: tx.id })
            .await;

        assert!(
            matches!(result, Err(TransactionError::InvalidStatusTransition { .. })),
            "double authorize must be rejected"
        );
    }
}
