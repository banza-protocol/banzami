use chrono::Utc;

use banzami_types::{CustomerId, MerchantId, Money};

use crate::{
    provider::{
        CustomerVerificationRequest, KycProvider, KycProviderError, MerchantVerificationRequest,
        VerificationDecision,
    },
    repository::{ComplianceRepository, MerchantDecision},
    ComplianceError, ComplianceStatus, CustomerCompliance, KycLevel, MerchantCompliance,
    OperationType, TransactionAuthorization, UNVERIFIED_INBOUND_CAP_MINOR,
};

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait ComplianceEngine: Send + Sync {
    // --- Merchant (KYB + AML) ---

    /// Return the merchant's compliance record, or create a Pending one on first access.
    async fn get_or_create_merchant(
        &self,
        merchant_id: MerchantId,
    ) -> Result<MerchantCompliance, ComplianceError>;

    /// Check that a merchant is allowed to process a transaction of the given amount.
    /// Returns Ok(()) if allowed, or a descriptive error if blocked.
    async fn check_merchant_can_transact(
        &self,
        merchant_id: MerchantId,
        amount: &Money,
    ) -> Result<(), ComplianceError>;

    async fn approve_merchant(
        &self,
        merchant_id: MerchantId,
    ) -> Result<MerchantCompliance, ComplianceError>;

    async fn reject_merchant(
        &self,
        merchant_id: MerchantId,
        notes: String,
    ) -> Result<MerchantCompliance, ComplianceError>;

    async fn suspend_merchant(
        &self,
        merchant_id: MerchantId,
        notes: String,
    ) -> Result<MerchantCompliance, ComplianceError>;

    async fn flag_merchant_for_aml_review(
        &self,
        merchant_id: MerchantId,
        notes: String,
    ) -> Result<MerchantCompliance, ComplianceError>;

    // --- Customer (KYC) ---

    /// Return the customer's compliance record, or create a None-level one on first access.
    async fn get_or_create_customer(
        &self,
        customer_id: CustomerId,
    ) -> Result<CustomerCompliance, ComplianceError>;

    async fn upgrade_kyc(
        &self,
        customer_id: CustomerId,
        new_level: KycLevel,
    ) -> Result<CustomerCompliance, ComplianceError>;

    async fn check_customer_can_transact(
        &self,
        customer_id: CustomerId,
        amount_minor: i64,
        daily_volume_minor: i64,
    ) -> Result<(), ComplianceError>;

    /// Progressive-KYC authorization: decide whether `operation` of `amount_minor`
    /// is allowed for the customer given their KYC level, status, and today's
    /// volume. Returns a structured result (never errors on a blocked operation).
    async fn authorize_operation(
        &self,
        customer_id: CustomerId,
        operation: OperationType,
        amount_minor: i64,
        daily_volume_minor: i64,
    ) -> Result<TransactionAuthorization, ComplianceError>;
}

// ---------------------------------------------------------------------------
// Production implementation
// ---------------------------------------------------------------------------

pub struct PostgresComplianceEngine<R: ComplianceRepository> {
    repo: R,
}

impl<R: ComplianceRepository> PostgresComplianceEngine<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }

    /// Run a consumer identity document through the verification `provider` and
    /// persist the outcome onto the customer's compliance record.
    ///
    /// - `Approved`      → KYC level raised to the granted level, status `Approved`
    /// - `Rejected`      → status `Rejected`, level left unchanged
    /// - `PendingReview` → status `UnderReview`, level left unchanged
    ///
    /// This is the missing link between the verification vendor and the
    /// compliance state machine: callers submit a document, the provider decides,
    /// and the engine records the result so transaction gating reflects it.
    pub async fn verify_customer<P: KycProvider>(
        &self,
        provider: &P,
        req: CustomerVerificationRequest,
    ) -> Result<CustomerCompliance, ComplianceError> {
        let customer_id = req.customer_id;
        let outcome = provider
            .verify_customer(req)
            .await
            .map_err(map_provider_err)?;

        let mut record = self.get_or_create_customer(customer_id).await?;
        record.updated_at = Utc::now();
        match outcome.decision {
            VerificationDecision::Approved => {
                record.kyc_level = outcome.granted_level;
                record.status = ComplianceStatus::Approved;
                record.reviewed_at = Some(Utc::now());
            }
            VerificationDecision::Rejected => {
                record.status = ComplianceStatus::Rejected;
                record.reviewed_at = Some(Utc::now());
            }
            VerificationDecision::PendingReview => {
                record.status = ComplianceStatus::UnderReview;
            }
        }

        tracing::info!(
            provider = provider.provider_name(),
            customer = %customer_id.as_uuid(),
            decision = ?outcome.decision,
            reference = %outcome.provider_reference,
            "customer KYC verification recorded"
        );

        self.repo.upsert_customer(&record).await?;
        Ok(record)
    }

    /// Run a merchant business identity through the verification `provider` and
    /// persist the outcome (KYB + AML) onto the merchant's compliance record.
    ///
    /// - `Approved`      → KYB and AML set to `Approved`
    /// - `Rejected`      → KYB set to `Rejected`
    /// - `PendingReview` → KYB set to `UnderReview`
    pub async fn verify_merchant<P: KycProvider>(
        &self,
        provider: &P,
        req: MerchantVerificationRequest,
    ) -> Result<MerchantCompliance, ComplianceError> {
        let merchant_id = req.merchant_id;
        let outcome = provider
            .verify_merchant(req)
            .await
            .map_err(map_provider_err)?;

        let mut record = self.get_or_create_merchant(merchant_id).await?;
        record.updated_at = Utc::now();
        record.notes = outcome.reason.clone();
        match outcome.decision {
            VerificationDecision::Approved => {
                record.kyb_status = ComplianceStatus::Approved;
                record.aml_status = ComplianceStatus::Approved;
                record.reviewed_at = Some(Utc::now());
            }
            VerificationDecision::Rejected => {
                record.kyb_status = ComplianceStatus::Rejected;
                record.reviewed_at = Some(Utc::now());
            }
            VerificationDecision::PendingReview => {
                record.kyb_status = ComplianceStatus::UnderReview;
            }
        }

        tracing::info!(
            provider = provider.provider_name(),
            merchant = %merchant_id.as_uuid(),
            decision = ?outcome.decision,
            reference = %outcome.provider_reference,
            "merchant KYB verification recorded"
        );

        self.repo.upsert_merchant(&record).await?;
        Ok(record)
    }
}

fn map_provider_err(e: KycProviderError) -> ComplianceError {
    match e {
        KycProviderError::InvalidDocument(s) => ComplianceError::InvalidDocument(s),
        KycProviderError::Provider(s) => ComplianceError::ProviderError(s),
    }
}

impl<R: ComplianceRepository> PostgresComplianceEngine<R> {
    /// Each decision moves only its own columns, on the condition it needs, in
    /// one statement (A5-06). The record used to be read, edited and written
    /// back whole: "approve" silently lifted a suspension or an AML flag, and a
    /// concurrent AML flag and KYB rejection each erased the other.
    async fn decide(
        &self,
        merchant_id: MerchantId,
        decision: MerchantDecision,
    ) -> Result<MerchantCompliance, ComplianceError> {
        self.get_or_create_merchant(merchant_id).await?;
        match self.repo.decide_merchant(merchant_id, &decision).await? {
            Some(record) => Ok(record),
            None => Err(ComplianceError::MerchantBlocked {
                reason: match decision {
                    MerchantDecision::Approve => {
                        "the merchant is suspended — approval does not lift a suspension".into()
                    }
                    _ => "AML is suspended — it cannot be put under review".into(),
                },
            }),
        }
    }
}

impl<R: ComplianceRepository> ComplianceEngine for PostgresComplianceEngine<R> {
    async fn get_or_create_merchant(
        &self,
        merchant_id: MerchantId,
    ) -> Result<MerchantCompliance, ComplianceError> {
        if let Some(record) = self.repo.get_merchant(merchant_id).await? {
            return Ok(record);
        }
        let record = MerchantCompliance {
            merchant_id,
            kyb_status: ComplianceStatus::Pending,
            aml_status: ComplianceStatus::Pending,
            reviewed_at: None,
            notes: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        self.repo.upsert_merchant(&record).await?;
        Ok(record)
    }

    async fn check_merchant_can_transact(
        &self,
        merchant_id: MerchantId,
        amount: &Money,
    ) -> Result<(), ComplianceError> {
        let record = match self.repo.get_merchant(merchant_id).await? {
            Some(r) => r,
            None => {
                return Err(ComplianceError::MerchantBlocked {
                    reason: "no compliance record on file".into(),
                });
            }
        };

        if !record.kyb_status.can_operate() {
            return Err(ComplianceError::MerchantBlocked {
                reason: format!("KYB status is {:?}", record.kyb_status),
            });
        }
        if !record.aml_status.can_operate() {
            return Err(ComplianceError::MerchantBlocked {
                reason: format!("AML status is {:?}", record.aml_status),
            });
        }
        // Amount limits on merchants are enforced by the risk engine (banzami-risk).
        // Here we only gate on operational status.
        let _ = amount;
        Ok(())
    }

    async fn approve_merchant(
        &self,
        merchant_id: MerchantId,
    ) -> Result<MerchantCompliance, ComplianceError> {
        self.decide(merchant_id, MerchantDecision::Approve).await
    }

    async fn reject_merchant(
        &self,
        merchant_id: MerchantId,
        notes: String,
    ) -> Result<MerchantCompliance, ComplianceError> {
        self.decide(merchant_id, MerchantDecision::Reject(notes)).await
    }

    async fn suspend_merchant(
        &self,
        merchant_id: MerchantId,
        notes: String,
    ) -> Result<MerchantCompliance, ComplianceError> {
        self.decide(merchant_id, MerchantDecision::Suspend(notes)).await
    }

    async fn flag_merchant_for_aml_review(
        &self,
        merchant_id: MerchantId,
        notes: String,
    ) -> Result<MerchantCompliance, ComplianceError> {
        self.decide(merchant_id, MerchantDecision::FlagAml(notes)).await
    }

    async fn get_or_create_customer(
        &self,
        customer_id: CustomerId,
    ) -> Result<CustomerCompliance, ComplianceError> {
        if let Some(record) = self.repo.get_customer(customer_id).await? {
            return Ok(record);
        }
        let record = CustomerCompliance {
            customer_id,
            kyc_level: KycLevel::None,
            status: ComplianceStatus::Pending,
            reviewed_at: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        self.repo.upsert_customer(&record).await?;
        Ok(record)
    }

    async fn upgrade_kyc(
        &self,
        customer_id: CustomerId,
        new_level: KycLevel,
    ) -> Result<CustomerCompliance, ComplianceError> {
        let mut record = self.get_or_create_customer(customer_id).await?;
        record.kyc_level = new_level;
        record.status = ComplianceStatus::Approved;
        record.reviewed_at = Some(Utc::now());
        record.updated_at = Utc::now();
        self.repo.upsert_customer(&record).await?;
        Ok(record)
    }

    /// Backward-compatible gate: treats the operation as a `Send` (the most
    /// common outbound spend) and maps the structured decision to a Result.
    async fn check_customer_can_transact(
        &self,
        customer_id: CustomerId,
        amount_minor: i64,
        daily_volume_minor: i64,
    ) -> Result<(), ComplianceError> {
        let auth = self
            .authorize_operation(
                customer_id,
                OperationType::Send,
                amount_minor,
                daily_volume_minor,
            )
            .await?;
        if auth.can_transact {
            Ok(())
        } else {
            Err(ComplianceError::InsufficientKycLevel {
                required: auth.required_level.unwrap_or(KycLevel::Enhanced),
                current: auth.current_level,
            })
        }
    }

    async fn authorize_operation(
        &self,
        customer_id: CustomerId,
        operation: OperationType,
        amount_minor: i64,
        daily_volume_minor: i64,
    ) -> Result<TransactionAuthorization, ComplianceError> {
        // Absent record == a freshly created, unverified account (KYC_LEVEL_0).
        let (level, status) = match self.repo.get_customer(customer_id).await? {
            Some(r) => (r.kyc_level, r.status),
            None => (KycLevel::None, ComplianceStatus::Pending),
        };

        let allow = |reason: &str| TransactionAuthorization {
            can_transact: true,
            reason: reason.to_string(),
            current_level: level,
            required_level: None,
            message: "Operation permitted.".into(),
        };
        let block =
            |reason: &str, required: Option<KycLevel>, message: &str| TransactionAuthorization {
                can_transact: false,
                reason: reason.to_string(),
                current_level: level,
                required_level: required,
                message: message.to_string(),
            };

        // A rejected or suspended account can do nothing financial.
        if matches!(
            status,
            ComplianceStatus::Rejected | ComplianceStatus::Suspended
        ) {
            return Ok(block(
                "KYC_NOT_APPROVED",
                None,
                "Your identity verification was not approved. Contact support.",
            ));
        }

        // The operation needs at least its minimum KYC level.
        let required = operation.min_level();
        if level < required {
            return Ok(block(
                "KYC_REQUIRED",
                Some(required),
                "Identity verification is required to perform this operation.",
            ));
        }

        // Limit policy: inbound at KYC_LEVEL_0 is capped; otherwise the level's limits.
        let (single_limit, daily_limit) = if operation.is_inbound() && level == KycLevel::None {
            (UNVERIFIED_INBOUND_CAP_MINOR, UNVERIFIED_INBOUND_CAP_MINOR)
        } else {
            (
                level.max_single_transaction_minor(),
                level.max_daily_volume_minor(),
            )
        };

        if amount_minor > single_limit || daily_volume_minor + amount_minor > daily_limit {
            let needed = KycLevel::min_level_for_amount(amount_minor, daily_volume_minor);
            let required = if needed.level_number() > level.level_number() {
                Some(needed)
            } else {
                Some(level.next())
            };
            return Ok(block(
                "LIMIT_EXCEEDED",
                required,
                "This amount exceeds your current limit. Verify a higher level to continue.",
            ));
        }

        // V1.0 pilot-limit overlay (internal Sandbox / Phase 0 only). Stricter than
        // the KYC-tier model above; disabled by default and never active on a
        // live/production environment. Applies to consumer outbound payments here;
        // balance/merchant/aggregate caps are enforced at their own data layers.
        let policy = crate::pilot::PilotLimitPolicy::from_env();
        let is_consumer_payment =
            matches!(operation, OperationType::Send | OperationType::PayMerchant);
        if let Some(v) = crate::pilot::overlay_consumer_payment(
            policy,
            is_consumer_payment,
            amount_minor,
            daily_volume_minor,
        ) {
            return Ok(block(v.as_str(), None, v.message()));
        }

        Ok(allow("OK"))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use banzami_types::{Currency, CustomerId, MerchantId, Money};

    use super::*;
    use crate::{
        ComplianceError, ComplianceStatus, CustomerCompliance, KycLevel, MerchantCompliance,
    };

    // -----------------------------------------------------------------------
    // In-memory mock repository
    // -----------------------------------------------------------------------

    struct MockComplianceRepo {
        merchants: Mutex<Vec<MerchantCompliance>>,
        customers: Mutex<Vec<CustomerCompliance>>,
    }

    impl MockComplianceRepo {
        fn new() -> Self {
            Self {
                merchants: Mutex::new(vec![]),
                customers: Mutex::new(vec![]),
            }
        }
    }

    impl ComplianceRepository for MockComplianceRepo {
        async fn get_merchant(
            &self,
            id: MerchantId,
        ) -> Result<Option<MerchantCompliance>, ComplianceError> {
            Ok(self
                .merchants
                .lock()
                .unwrap()
                .iter()
                .find(|m| m.merchant_id == id)
                .cloned())
        }
        async fn upsert_merchant(
            &self,
            record: &MerchantCompliance,
        ) -> Result<(), ComplianceError> {
            let mut lock = self.merchants.lock().unwrap();
            if let Some(existing) = lock
                .iter_mut()
                .find(|m| m.merchant_id == record.merchant_id)
            {
                *existing = record.clone();
            } else {
                lock.push(record.clone());
            }
            Ok(())
        }
        async fn decide_merchant(
            &self,
            id: MerchantId,
            decision: &MerchantDecision,
        ) -> Result<Option<MerchantCompliance>, ComplianceError> {
            let mut lock = self.merchants.lock().unwrap();
            let Some(m) = lock.iter_mut().find(|m| m.merchant_id == id) else {
                return Ok(None);
            };
            match decision {
                MerchantDecision::Approve => {
                    if m.kyb_status == ComplianceStatus::Suspended
                        || m.aml_status == ComplianceStatus::Suspended
                    {
                        return Ok(None);
                    }
                    m.kyb_status = ComplianceStatus::Approved;
                    if m.aml_status == ComplianceStatus::Pending {
                        m.aml_status = ComplianceStatus::Approved;
                    }
                }
                MerchantDecision::Reject(n) => {
                    m.kyb_status = ComplianceStatus::Rejected;
                    m.notes = Some(n.clone());
                }
                MerchantDecision::Suspend(n) => {
                    m.kyb_status = ComplianceStatus::Suspended;
                    m.aml_status = ComplianceStatus::Suspended;
                    m.notes = Some(n.clone());
                }
                MerchantDecision::FlagAml(n) => {
                    if m.aml_status == ComplianceStatus::Suspended {
                        return Ok(None);
                    }
                    m.aml_status = ComplianceStatus::UnderReview;
                    m.notes = Some(n.clone());
                }
            }
            Ok(Some(m.clone()))
        }
        async fn get_customer(
            &self,
            id: CustomerId,
        ) -> Result<Option<CustomerCompliance>, ComplianceError> {
            Ok(self
                .customers
                .lock()
                .unwrap()
                .iter()
                .find(|c| c.customer_id == id)
                .cloned())
        }
        async fn upsert_customer(
            &self,
            record: &CustomerCompliance,
        ) -> Result<(), ComplianceError> {
            let mut lock = self.customers.lock().unwrap();
            if let Some(existing) = lock
                .iter_mut()
                .find(|c| c.customer_id == record.customer_id)
            {
                *existing = record.clone();
            } else {
                lock.push(record.clone());
            }
            Ok(())
        }
    }

    fn engine() -> PostgresComplianceEngine<MockComplianceRepo> {
        PostgresComplianceEngine::new(MockComplianceRepo::new())
    }

    fn kz(minor: i64) -> Money {
        Money::new(minor, Currency::AOA)
    }

    // -----------------------------------------------------------------------
    // Tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn new_merchant_starts_as_pending() {
        let eng = engine();
        let record = eng.get_or_create_merchant(MerchantId::new()).await.unwrap();
        assert_eq!(record.kyb_status, ComplianceStatus::Pending);
        assert_eq!(record.aml_status, ComplianceStatus::Pending);
    }

    #[tokio::test]
    async fn pending_merchant_cannot_transact() {
        let eng = engine();
        let merchant_id = MerchantId::new();
        eng.get_or_create_merchant(merchant_id).await.unwrap();
        let result = eng
            .check_merchant_can_transact(merchant_id, &kz(1_000))
            .await;
        assert!(matches!(
            result,
            Err(ComplianceError::MerchantBlocked { .. })
        ));
    }

    #[tokio::test]
    async fn approved_merchant_can_transact() {
        let eng = engine();
        let merchant_id = MerchantId::new();
        eng.approve_merchant(merchant_id).await.unwrap();
        eng.check_merchant_can_transact(merchant_id, &kz(100_000))
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn suspended_merchant_is_blocked() {
        let eng = engine();
        let merchant_id = MerchantId::new();
        eng.approve_merchant(merchant_id).await.unwrap();
        eng.suspend_merchant(merchant_id, "AML alert".into())
            .await
            .unwrap();
        let result = eng.check_merchant_can_transact(merchant_id, &kz(100)).await;
        assert!(matches!(
            result,
            Err(ComplianceError::MerchantBlocked { .. })
        ));
    }

    #[tokio::test]
    async fn aml_flagged_merchant_is_blocked() {
        let eng = engine();
        let merchant_id = MerchantId::new();
        eng.approve_merchant(merchant_id).await.unwrap();
        eng.flag_merchant_for_aml_review(merchant_id, "suspicious pattern".into())
            .await
            .unwrap();
        let result = eng.check_merchant_can_transact(merchant_id, &kz(100)).await;
        assert!(matches!(
            result,
            Err(ComplianceError::MerchantBlocked { .. })
        ));
    }

    #[tokio::test]
    async fn kyc_none_customer_is_blocked() {
        let eng = engine();
        let customer_id = CustomerId::new();
        eng.get_or_create_customer(customer_id).await.unwrap();
        let result = eng.check_customer_can_transact(customer_id, 1_000, 0).await;
        assert!(matches!(
            result,
            Err(ComplianceError::InsufficientKycLevel { .. })
        ));
    }

    #[tokio::test]
    async fn basic_kyc_allows_small_transactions() {
        let eng = engine();
        let customer_id = CustomerId::new();
        eng.upgrade_kyc(customer_id, KycLevel::Basic).await.unwrap();
        eng.check_customer_can_transact(customer_id, 1_000_000, 0)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn basic_kyc_blocks_large_single_transaction() {
        let eng = engine();
        let customer_id = CustomerId::new();
        eng.upgrade_kyc(customer_id, KycLevel::Basic).await.unwrap();
        // Basic limit: 50,000 AOA per transaction
        let result = eng
            .check_customer_can_transact(customer_id, 5_000_100, 0)
            .await;
        assert!(matches!(
            result,
            Err(ComplianceError::InsufficientKycLevel { .. })
        ));
    }

    #[tokio::test]
    async fn enhanced_kyc_allows_large_transactions() {
        let eng = engine();
        let customer_id = CustomerId::new();
        eng.upgrade_kyc(customer_id, KycLevel::Enhanced)
            .await
            .unwrap();
        eng.check_customer_can_transact(customer_id, 20_000_000, 0)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn daily_volume_limit_is_enforced() {
        let eng = engine();
        let customer_id = CustomerId::new();
        eng.upgrade_kyc(customer_id, KycLevel::Basic).await.unwrap();
        // Basic daily limit: 500,000 AOA. Existing volume: 490,000 AOA + new 20,000 AOA = 510,000 → blocked.
        let result = eng
            .check_customer_can_transact(customer_id, 2_000_000, 49_000_000)
            .await;
        assert!(matches!(
            result,
            Err(ComplianceError::InsufficientKycLevel { .. })
        ));
    }

    // -----------------------------------------------------------------------
    // Progressive KYC — authorize_operation
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn level0_blocks_send_and_requires_basic() {
        let eng = engine();
        // Fresh, unverified customer (no record) == KYC_LEVEL_0.
        let auth = eng
            .authorize_operation(CustomerId::new(), OperationType::Send, 1_000, 0)
            .await
            .unwrap();
        assert!(!auth.can_transact);
        assert_eq!(auth.reason, "KYC_REQUIRED");
        assert_eq!(auth.current_level, KycLevel::None);
        assert_eq!(auth.required_level, Some(KycLevel::Basic));
    }

    #[tokio::test]
    async fn level0_allows_small_receive() {
        let eng = engine();
        let auth = eng
            .authorize_operation(CustomerId::new(), OperationType::Receive, 500_000, 0)
            .await
            .unwrap();
        assert!(auth.can_transact, "small receive allowed before KYC");
        assert_eq!(auth.reason, "OK");
    }

    #[tokio::test]
    async fn level0_blocks_receive_above_cap() {
        let eng = engine();
        // Above the unverified inbound cap (100,000 AOA).
        let auth = eng
            .authorize_operation(
                CustomerId::new(),
                OperationType::TopUp,
                UNVERIFIED_INBOUND_CAP_MINOR + 1,
                0,
            )
            .await
            .unwrap();
        assert!(!auth.can_transact);
        assert_eq!(auth.reason, "LIMIT_EXCEEDED");
    }

    #[tokio::test]
    async fn cashout_requires_enhanced_level() {
        let eng = engine();
        let customer_id = CustomerId::new();
        eng.upgrade_kyc(customer_id, KycLevel::Basic).await.unwrap();
        let auth = eng
            .authorize_operation(customer_id, OperationType::CashOut, 1_000, 0)
            .await
            .unwrap();
        assert!(!auth.can_transact);
        assert_eq!(auth.reason, "KYC_REQUIRED");
        assert_eq!(auth.required_level, Some(KycLevel::Enhanced));
    }

    #[tokio::test]
    async fn basic_allows_send_within_limit() {
        let eng = engine();
        let customer_id = CustomerId::new();
        eng.upgrade_kyc(customer_id, KycLevel::Basic).await.unwrap();
        let auth = eng
            .authorize_operation(customer_id, OperationType::Send, 1_000_000, 0)
            .await
            .unwrap();
        assert!(auth.can_transact);
        assert_eq!(auth.reason, "OK");
    }

    #[tokio::test]
    async fn limit_exceeded_suggests_higher_level() {
        let eng = engine();
        let customer_id = CustomerId::new();
        eng.upgrade_kyc(customer_id, KycLevel::Basic).await.unwrap();
        // 1,000,000 AOA send exceeds the Basic single limit (50,000 AOA).
        let auth = eng
            .authorize_operation(customer_id, OperationType::Send, 100_000_000, 0)
            .await
            .unwrap();
        assert!(!auth.can_transact);
        assert_eq!(auth.reason, "LIMIT_EXCEEDED");
        assert!(auth.required_level.unwrap().level_number() > KycLevel::Basic.level_number());
    }
}
