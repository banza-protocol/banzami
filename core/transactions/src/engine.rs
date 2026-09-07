use std::sync::Arc;

use chrono::{DateTime, Utc};

use banzami_pricing::{
    BusinessCategory, FeePolicyRef, PricingContext, PricingProfile, PricingRuleProvider,
};
use banzami_types::{AccountId, MerchantId, Money, OperatorFeeId, TransactionId};
use banzami_wallets::{ReleaseRequest, ReserveRequest, SettleRequest, WalletEngine};

use crate::{
    repository::{OperatorFeeInsert, TransactionRepository},
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

pub struct PostgresTransactionEngine<
    W: WalletEngine,
    R: TransactionRepository,
    P: PricingRuleProvider,
> {
    wallet: Arc<W>,
    repo: R,
    /// System ASSET account used as the debit side of wallet reserve / credit
    /// side of wallet release. Represents the acquiring float — money arriving
    /// from or returning to the payment network.
    transit_account_id: AccountId,
    /// Operator Pricing Engine rule source (Banzami ADR-021). The ONLY place
    /// fees are resolved; the engine never hard-codes a percentage.
    pricing: Arc<P>,
    /// Internal REVENUE account the operator fee is credited to (never a merchant
    /// wallet). Fixed at boot, mirroring the transit/bank system accounts.
    operator_fee_account_id: AccountId,
    /// Environment the engine runs in (LIVE/SANDBOX) — scopes rule loading and
    /// the recorded operator_fee row.
    environment: String,
}

impl<W: WalletEngine, R: TransactionRepository, P: PricingRuleProvider>
    PostgresTransactionEngine<W, R, P>
{
    pub fn new(
        wallet: Arc<W>,
        repo: R,
        transit_account_id: AccountId,
        pricing: Arc<P>,
        operator_fee_account_id: AccountId,
        environment: impl Into<String>,
    ) -> Self {
        Self {
            wallet,
            repo,
            transit_account_id,
            pricing,
            operator_fee_account_id,
            environment: environment.into(),
        }
    }
}

impl<W: WalletEngine + 'static, R: TransactionRepository, P: PricingRuleProvider> TransactionEngine
    for PostgresTransactionEngine<W, R, P>
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

        // Authority (RA-056): the body names merchant_id and wallet_id
        // independently. Without this a caller could create a transaction against
        // ANOTHER merchant's wallet — polluting that tenant's books and seeding a
        // source object for later settlement or restitution against a wallet the
        // caller never owned.
        let wallet = self
            .wallet
            .get(req.wallet_id)
            .await
            .map_err(TransactionError::Wallet)?;
        if wallet.merchant_id != req.merchant_id {
            return Err(TransactionError::WalletNotOwned {
                wallet_id: req.wallet_id,
                merchant_id: req.merchant_id,
            });
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
            business_category: req.business_category,
            pricing_profile: req.pricing_profile,
            fee_policy_ref: req.fee_policy_ref,
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

        // --- Resolve the operator fee (Banzami ADR-021 / BANZA ADR-039) -------
        // The fee comes ONLY from the Pricing Engine. An unpriced/unknown
        // category resolves to 0, so capture behaviour is unchanged until a
        // category is configured. No percentage is ever hard-coded here.
        let rules = self
            .pricing
            .load_rules(&self.environment)
            .await
            .map_err(|e| TransactionError::Pricing(e.to_string()))?;

        let ctx = PricingContext {
            amount_minor: tx.amount.amount_minor(),
            currency: tx.currency,
            business_category: tx
                .business_category
                .as_deref()
                .map(BusinessCategory::from_code)
                // Retained as a rule dimension, but it is no longer something a
                // caller supplies: the gateway stops accepting it and stores the
                // merchant's assigned profile instead. An empty reference here
                // simply matches no category-keyed rule.
                .unwrap_or_else(|| BusinessCategory::Other(String::new())),
            pricing_profile: tx.pricing_profile.as_deref().map(PricingProfile::from_code),
            fee_policy_ref: tx.fee_policy_ref.clone().map(FeePolicyRef::new),
            country: None,
            transaction_type: None,
            as_of: Utc::now(),
        };
        let resolution = banzami_pricing::resolve(&rules, &ctx);

        // No applicable rule is a refusal, not a free capture.
        //
        // `resolve` reports a fee of 0 with no rule id when nothing matched, and
        // that is indistinguishable in the ledger from an operator policy that
        // says zero. Capture is the moment money moves, so this is where the two
        // have to be told apart: an explicit 0-bps rule captures at zero, and an
        // absent decision does not capture at all.
        if resolution.snapshot.rule_id.is_none() {
            return Err(TransactionError::PricingNotConfigured);
        }
        let fee_minor = resolution.fee_minor;

        // Net-to-payee guard: a fee may never exceed the amount (loud fail; never
        // a silent clamp, never a negative net). The ledger leg would also reject
        // it, but we fail early with a clear error.
        if fee_minor > tx.amount.amount_minor() {
            return Err(TransactionError::FeeExceedsAmount {
                fee: fee_minor,
                amount: tx.amount.amount_minor(),
            });
        }
        let fee_money = Money::new(fee_minor, tx.currency);
        let capture_key = format!("{}:capture", tx.idempotency_key);

        // --- Settle: payee NET + operator fee, ONE balanced posting ----------
        // Idempotent on `capture_key`: a replay returns the existing posting and
        // never double-charges the fee.
        let (operator_fee, operator_fee_account_id) = if fee_minor > 0 {
            (Some(fee_money), Some(self.operator_fee_account_id))
        } else {
            (None, None)
        };
        let posting_id = self
            .wallet
            .settle(SettleRequest {
                idempotency_key: capture_key.clone(),
                wallet_id: tx.wallet_id,
                amount: tx.amount,
                operator_fee,
                operator_fee_account_id,
            })
            .await
            .map_err(TransactionError::Wallet)?;

        // --- Persist the (immutable) operator_fee record + set tx.fee --------
        // One row per transaction; ON CONFLICT keeps replay idempotent. Recorded
        // even when the fee is 0, for full auditability.
        let operator_fee_id = OperatorFeeId::new();
        let snapshot_json = serde_json::to_value(&resolution.snapshot)
            .map_err(|e| TransactionError::Pricing(format!("snapshot serialize: {e}")))?;
        let fee_record = OperatorFeeInsert {
            id: operator_fee_id,
            transaction_id: tx.id,
            posting_id,
            amount_minor: fee_minor,
            currency: tx.currency,
            business_category: tx.business_category.clone(),
            pricing_profile: tx.pricing_profile.clone(),
            fee_policy_ref: tx.fee_policy_ref.clone(),
            pricing_rule_id: resolution.snapshot.rule_id,
            pricing_rule_version: resolution.snapshot.rule_version,
            engine_version: resolution.snapshot.engine_version as i32,
            snapshot_json,
            environment: self.environment.clone(),
            idempotency_key: capture_key,
        };
        let updated = self
            .repo
            .finalize_capture(tx.id, fee_money, fee_record)
            .await?;

        // --- Internal event (no PII, no commercial rule beyond refs) ---------
        // Operator-internal only; never a public webhook.
        tracing::info!(
            event = "operator.fee.applied",
            operator_fee_id = %operator_fee_id,
            transaction_id = %tx.id,
            amount_minor = fee_minor,
            currency = %tx.currency,
            pricing_rule_id = ?resolution.snapshot.rule_id,
            rule_version = ?resolution.snapshot.rule_version,
            engine_version = resolution.snapshot.engine_version,
            "operator fee applied"
        );
        tracing::info!(tx_id = %tx.id, amount = %tx.amount, fee = %fee_money, "transaction captured");
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
        self.repo
            .list_for_merchant(merchant_id, limit, before_ts, before_id, since_ts)
            .await
    }
}

fn guard_transition(tx: &Transaction, to: TransactionStatus) -> Result<(), TransactionError> {
    if tx.status.can_transition_to(to) {
        Ok(())
    } else {
        Err(TransactionError::InvalidStatusTransition {
            from: tx.status,
            to,
        })
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
        WalletEngine, WalletError, WalletStatus,
    };

    use super::*;
    use crate::{
        repository::TransactionRepository, Transaction, TransactionError, TransactionStatus,
        TransactionType,
    };

    // -----------------------------------------------------------------------
    // Mock wallet engine — no-op; state machine tests don't need real wallet ops
    // -----------------------------------------------------------------------

    /// The merchant every mock wallet belongs to. Stable for the whole test
    /// binary so a request built with `test_owner()` is genuinely authorised,
    /// and one built with a fresh `MerchantId::new()` genuinely is not.
    fn test_owner() -> MerchantId {
        static OWNER: std::sync::OnceLock<MerchantId> = std::sync::OnceLock::new();
        *OWNER.get_or_init(MerchantId::new)
    }

    struct MockWallet;

    impl WalletEngine for MockWallet {
        async fn create(&self, _: CreateWalletRequest) -> Result<Wallet, WalletError> {
            unimplemented!()
        }
        /// Returns a wallet owned by `test_owner()`. `create` now resolves the
        /// wallet to check ownership (RA-056), so this can no longer be a
        /// panicking stub.
        async fn get(&self, id: WalletId) -> Result<Wallet, WalletError> {
            Ok(Wallet {
                id,
                merchant_id: test_owner(),
                currency: Currency::AOA,
                status: WalletStatus::Active,
                available_account_id: AccountId::new(),
                reserved_account_id: AccountId::new(),
                created_at: Utc::now(),
            })
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
        async fn settle(
            &self,
            _: SettleRequest,
        ) -> Result<banzami_types::LedgerPostingId, WalletError> {
            Ok(banzami_types::LedgerPostingId::new())
        }
    }

    // Mock pricing provider — an EXPLICIT 0-bps wildcard rule.
    //
    // It used to return no rules at all, with the note "no rules => every
    // category resolves to a zero fee, so these state-machine tests exercise
    // capture with net == gross". The first half became false: capture now
    // refuses when nothing matched. Keeping net == gross is still what these
    // state-machine tests want, so the zero comes from a rule that says zero —
    // which is the distinction the whole change is about, applied to the
    // fixture instead of worked around in it.
    fn zero_bps_wildcard() -> banzami_pricing::PricingRule {
        banzami_pricing::PricingRule {
            id: banzami_types::PricingRuleId::new(),
            key: "test-explicit-zero".into(),
            version: 1,
            business_category: None,
            pricing_profile: None,
            fee_policy_ref: None,
            currency: None,
            country: None,
            transaction_type: None,
            rate_bps: 0,
            flat_minor: 0,
            min_fee_minor: None,
            max_fee_minor: None,
            rounding: banzami_pricing::RoundingMode::HalfUp,
            priority: 0,
            effective_from: DateTime::from_timestamp(0, 0).expect("epoch"),
            effective_to: None,
        }
    }

    struct MockPricing;
    impl PricingRuleProvider for MockPricing {
        async fn load_rules(
            &self,
            _environment: &str,
        ) -> Result<Vec<banzami_pricing::PricingRule>, banzami_pricing::PricingError> {
            Ok(vec![zero_bps_wildcard()])
        }
    }

    /// A provider that has nothing to say — the state the refusal exists for.
    struct UnpricedMockPricing;
    impl PricingRuleProvider for UnpricedMockPricing {
        async fn load_rules(
            &self,
            _environment: &str,
        ) -> Result<Vec<banzami_pricing::PricingRule>, banzami_pricing::PricingError> {
            Ok(vec![])
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
            Self {
                rows: Mutex::new(vec![]),
            }
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

        async fn finalize_capture(
            &self,
            id: TransactionId,
            fee: Money,
            _fee_record: crate::repository::OperatorFeeInsert,
        ) -> Result<Transaction, TransactionError> {
            let mut rows = self.rows.lock().unwrap();
            let tx = rows
                .iter_mut()
                .find(|r| r.id == id)
                .ok_or(TransactionError::NotFound(id))?;
            tx.status = TransactionStatus::Captured;
            tx.fee = fee;
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
                .filter(|tx| since_ts.is_none_or(|since| tx.created_at >= since))
                .take(limit as usize)
                .cloned()
                .collect())
        }
    }

    fn make_engine() -> PostgresTransactionEngine<MockWallet, MockRepo, MockPricing> {
        PostgresTransactionEngine::new(
            Arc::new(MockWallet),
            MockRepo::new(),
            AccountId::new(),
            Arc::new(MockPricing),
            AccountId::new(),
            "SANDBOX",
        )
    }

    fn kz(minor: i64) -> Money {
        Money::new(minor, Currency::AOA)
    }

    fn make_unpriced_engine() -> PostgresTransactionEngine<MockWallet, MockRepo, UnpricedMockPricing>
    {
        PostgresTransactionEngine::new(
            Arc::new(MockWallet),
            MockRepo::new(),
            AccountId::new(),
            Arc::new(UnpricedMockPricing),
            AccountId::new(),
            "SANDBOX",
        )
    }

    // Generic over the pricing provider so the same setup serves both the
    // priced and the unpriced engine — the two fixtures differ only in whether
    // a rule exists, which is the point being tested.
    async fn pending_tx<P: PricingRuleProvider>(
        engine: &PostgresTransactionEngine<MockWallet, MockRepo, P>,
    ) -> Transaction {
        engine
            .create(CreateTransactionRequest {
                idempotency_key: "idem-001".into(),
                transaction_type: TransactionType::Payment,
                amount: kz(50_000),
                merchant_id: test_owner(),
                wallet_id: WalletId::new(),
                description: None,
                business_category: None,
                pricing_profile: None,
                fee_policy_ref: None,
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
                merchant_id: test_owner(),
                wallet_id: WalletId::new(),
                description: None,
                business_category: None,
                pricing_profile: None,
                fee_policy_ref: None,
            })
            .await
            .unwrap();
        assert_eq!(
            tx1.id, tx2.id,
            "idempotent create must return the same transaction"
        );
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
            .capture(CaptureRequest {
                tx_id: authorized.id,
            })
            .await
            .unwrap();

        assert_eq!(captured.status, TransactionStatus::Captured);
    }

    /// The state machine does NOT advance when nobody has priced the payment.
    ///
    /// The companion to the test above: that one proves capture works when a
    /// rule says zero, this one proves it refuses when no rule says anything.
    /// Without both, "fee 0, CAPTURED" has two causes and the tests cannot tell
    /// which one they just exercised.
    #[tokio::test]
    async fn capture_refuses_when_no_rule_applies() {
        let engine = make_unpriced_engine();
        let tx = pending_tx(&engine).await;
        let authorized = engine
            .authorize(AuthorizeRequest { tx_id: tx.id })
            .await
            .unwrap();

        let err = engine
            .capture(CaptureRequest {
                tx_id: authorized.id,
            })
            .await
            .expect_err("an unpriced capture must refuse");
        assert!(
            matches!(err, TransactionError::PricingNotConfigured),
            "expected PricingNotConfigured, got {err:?}"
        );

        let after = engine.get(authorized.id).await.unwrap();
        assert_eq!(
            after.status,
            TransactionStatus::Authorized,
            "a refused capture leaves the transaction where it was"
        );
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
            .reverse(ReverseRequest {
                tx_id: authorized.id,
            })
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
        assert_eq!(failed.failure_reason.as_deref(), Some("acquirer declined"));
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
        let result = engine.capture(CaptureRequest { tx_id: tx.id }).await;

        assert!(
            matches!(
                result,
                Err(TransactionError::InvalidStatusTransition { .. })
            ),
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
        let result = engine.authorize(AuthorizeRequest { tx_id: tx.id }).await;

        assert!(
            matches!(
                result,
                Err(TransactionError::InvalidStatusTransition { .. })
            ),
            "double authorize must be rejected"
        );
    }

    // -----------------------------------------------------------------------
    // RA-056 — wallet authority
    // -----------------------------------------------------------------------

    /// The body names merchant_id and wallet_id independently. Naming a wallet
    /// is not authority over it, so a merchant that does not own the wallet must
    /// be refused — and no transaction may be recorded against that wallet.
    #[tokio::test]
    async fn create_against_a_foreign_wallet_is_refused() {
        let engine = make_engine();
        let stranger = MerchantId::new();
        let wallet_id = WalletId::new();

        let err = engine
            .create(CreateTransactionRequest {
                idempotency_key: "ra056-foreign".into(),
                transaction_type: TransactionType::Payment,
                amount: kz(50_000),
                merchant_id: stranger,
                wallet_id,
                description: None,
                business_category: None,
                pricing_profile: None,
                fee_policy_ref: None,
            })
            .await
            .expect_err("a merchant must not transact against a wallet it does not own");

        match err {
            TransactionError::WalletNotOwned {
                wallet_id: w,
                merchant_id: m,
            } => {
                assert_eq!(w, wallet_id);
                assert_eq!(m, stranger);
            }
            other => panic!("expected WalletNotOwned, got {other:?}"),
        }

        // State assertion: refusing is not enough — nothing may have been written.
        assert!(
            engine
                .list(stranger, 10, None, None, None)
                .await
                .unwrap()
                .is_empty(),
            "a refused create must leave no transaction behind"
        );
    }

    /// The owner is still served. A fix that breaks the legitimate path is not a fix.
    #[tokio::test]
    async fn create_against_an_owned_wallet_still_succeeds() {
        let engine = make_engine();
        let tx = engine
            .create(CreateTransactionRequest {
                idempotency_key: "ra056-owned".into(),
                transaction_type: TransactionType::Payment,
                amount: kz(50_000),
                merchant_id: test_owner(),
                wallet_id: WalletId::new(),
                description: None,
                business_category: None,
                pricing_profile: None,
                fee_policy_ref: None,
            })
            .await
            .expect("the wallet owner must still be able to create a transaction");
        assert_eq!(tx.merchant_id, test_owner());
        assert_eq!(tx.status, TransactionStatus::Pending);
    }
}
