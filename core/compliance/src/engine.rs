use chrono::Utc;

use banzami_types::{CustomerId, MerchantId, Money};

use crate::{
    repository::ComplianceRepository,
    ComplianceError, ComplianceStatus, CustomerCompliance, KycLevel, MerchantCompliance,
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
        new_level:   KycLevel,
    ) -> Result<CustomerCompliance, ComplianceError>;

    async fn check_customer_can_transact(
        &self,
        customer_id:          CustomerId,
        amount_minor:         i64,
        daily_volume_minor:   i64,
    ) -> Result<(), ComplianceError>;
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
            kyb_status:  ComplianceStatus::Pending,
            aml_status:  ComplianceStatus::Pending,
            reviewed_at: None,
            notes:       None,
            created_at:  Utc::now(),
            updated_at:  Utc::now(),
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
        let mut record = self.get_or_create_merchant(merchant_id).await?;
        record.kyb_status  = ComplianceStatus::Approved;
        record.aml_status  = ComplianceStatus::Approved;
        record.reviewed_at = Some(Utc::now());
        record.updated_at  = Utc::now();
        self.repo.upsert_merchant(&record).await?;
        Ok(record)
    }

    async fn reject_merchant(
        &self,
        merchant_id: MerchantId,
        notes: String,
    ) -> Result<MerchantCompliance, ComplianceError> {
        let mut record = self.get_or_create_merchant(merchant_id).await?;
        record.kyb_status  = ComplianceStatus::Rejected;
        record.reviewed_at = Some(Utc::now());
        record.notes       = Some(notes);
        record.updated_at  = Utc::now();
        self.repo.upsert_merchant(&record).await?;
        Ok(record)
    }

    async fn suspend_merchant(
        &self,
        merchant_id: MerchantId,
        notes: String,
    ) -> Result<MerchantCompliance, ComplianceError> {
        let mut record = self.get_or_create_merchant(merchant_id).await?;
        record.kyb_status  = ComplianceStatus::Suspended;
        record.aml_status  = ComplianceStatus::Suspended;
        record.reviewed_at = Some(Utc::now());
        record.notes       = Some(notes);
        record.updated_at  = Utc::now();
        self.repo.upsert_merchant(&record).await?;
        Ok(record)
    }

    async fn flag_merchant_for_aml_review(
        &self,
        merchant_id: MerchantId,
        notes: String,
    ) -> Result<MerchantCompliance, ComplianceError> {
        let mut record = self.get_or_create_merchant(merchant_id).await?;
        record.aml_status  = ComplianceStatus::UnderReview;
        record.reviewed_at = Some(Utc::now());
        record.notes       = Some(notes);
        record.updated_at  = Utc::now();
        self.repo.upsert_merchant(&record).await?;
        Ok(record)
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
            kyc_level:  KycLevel::None,
            status:     ComplianceStatus::Pending,
            reviewed_at: None,
            created_at:  Utc::now(),
            updated_at:  Utc::now(),
        };
        self.repo.upsert_customer(&record).await?;
        Ok(record)
    }

    async fn upgrade_kyc(
        &self,
        customer_id: CustomerId,
        new_level:   KycLevel,
    ) -> Result<CustomerCompliance, ComplianceError> {
        let mut record = self.get_or_create_customer(customer_id).await?;
        record.kyc_level   = new_level;
        record.status      = ComplianceStatus::Approved;
        record.reviewed_at = Some(Utc::now());
        record.updated_at  = Utc::now();
        self.repo.upsert_customer(&record).await?;
        Ok(record)
    }

    async fn check_customer_can_transact(
        &self,
        customer_id:        CustomerId,
        amount_minor:       i64,
        daily_volume_minor: i64,
    ) -> Result<(), ComplianceError> {
        let record = match self.repo.get_customer(customer_id).await? {
            Some(r) => r,
            None => {
                return Err(ComplianceError::InsufficientKycLevel {
                    required: KycLevel::Basic,
                    current:  KycLevel::None,
                });
            }
        };

        if record.kyc_level == KycLevel::None {
            return Err(ComplianceError::InsufficientKycLevel {
                required: KycLevel::Basic,
                current:  KycLevel::None,
            });
        }

        if amount_minor > record.kyc_level.max_single_transaction_minor() {
            return Err(ComplianceError::InsufficientKycLevel {
                required: KycLevel::Enhanced,
                current:  record.kyc_level,
            });
        }

        if daily_volume_minor + amount_minor > record.kyc_level.max_daily_volume_minor() {
            return Err(ComplianceError::InsufficientKycLevel {
                required: KycLevel::Enhanced,
                current:  record.kyc_level,
            });
        }

        Ok(())
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
    use crate::{ComplianceError, ComplianceStatus, CustomerCompliance, KycLevel, MerchantCompliance};

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
        async fn get_merchant(&self, id: MerchantId) -> Result<Option<MerchantCompliance>, ComplianceError> {
            Ok(self.merchants.lock().unwrap().iter().find(|m| m.merchant_id == id).cloned())
        }
        async fn upsert_merchant(&self, record: &MerchantCompliance) -> Result<(), ComplianceError> {
            let mut lock = self.merchants.lock().unwrap();
            if let Some(existing) = lock.iter_mut().find(|m| m.merchant_id == record.merchant_id) {
                *existing = record.clone();
            } else {
                lock.push(record.clone());
            }
            Ok(())
        }
        async fn get_customer(&self, id: CustomerId) -> Result<Option<CustomerCompliance>, ComplianceError> {
            Ok(self.customers.lock().unwrap().iter().find(|c| c.customer_id == id).cloned())
        }
        async fn upsert_customer(&self, record: &CustomerCompliance) -> Result<(), ComplianceError> {
            let mut lock = self.customers.lock().unwrap();
            if let Some(existing) = lock.iter_mut().find(|c| c.customer_id == record.customer_id) {
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

    fn kz(minor: i64) -> Money { Money::new(minor, Currency::AOA) }

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
        let result = eng.check_merchant_can_transact(merchant_id, &kz(1_000)).await;
        assert!(matches!(result, Err(ComplianceError::MerchantBlocked { .. })));
    }

    #[tokio::test]
    async fn approved_merchant_can_transact() {
        let eng = engine();
        let merchant_id = MerchantId::new();
        eng.approve_merchant(merchant_id).await.unwrap();
        eng.check_merchant_can_transact(merchant_id, &kz(100_000)).await.unwrap();
    }

    #[tokio::test]
    async fn suspended_merchant_is_blocked() {
        let eng = engine();
        let merchant_id = MerchantId::new();
        eng.approve_merchant(merchant_id).await.unwrap();
        eng.suspend_merchant(merchant_id, "AML alert".into()).await.unwrap();
        let result = eng.check_merchant_can_transact(merchant_id, &kz(100)).await;
        assert!(matches!(result, Err(ComplianceError::MerchantBlocked { .. })));
    }

    #[tokio::test]
    async fn aml_flagged_merchant_is_blocked() {
        let eng = engine();
        let merchant_id = MerchantId::new();
        eng.approve_merchant(merchant_id).await.unwrap();
        eng.flag_merchant_for_aml_review(merchant_id, "suspicious pattern".into()).await.unwrap();
        let result = eng.check_merchant_can_transact(merchant_id, &kz(100)).await;
        assert!(matches!(result, Err(ComplianceError::MerchantBlocked { .. })));
    }

    #[tokio::test]
    async fn kyc_none_customer_is_blocked() {
        let eng = engine();
        let customer_id = CustomerId::new();
        eng.get_or_create_customer(customer_id).await.unwrap();
        let result = eng.check_customer_can_transact(customer_id, 1_000, 0).await;
        assert!(matches!(result, Err(ComplianceError::InsufficientKycLevel { .. })));
    }

    #[tokio::test]
    async fn basic_kyc_allows_small_transactions() {
        let eng = engine();
        let customer_id = CustomerId::new();
        eng.upgrade_kyc(customer_id, KycLevel::Basic).await.unwrap();
        eng.check_customer_can_transact(customer_id, 10_000_00, 0).await.unwrap();
    }

    #[tokio::test]
    async fn basic_kyc_blocks_large_single_transaction() {
        let eng = engine();
        let customer_id = CustomerId::new();
        eng.upgrade_kyc(customer_id, KycLevel::Basic).await.unwrap();
        // Basic limit: 50,000 AOA per transaction
        let result = eng.check_customer_can_transact(customer_id, 50_001_00, 0).await;
        assert!(matches!(result, Err(ComplianceError::InsufficientKycLevel { .. })));
    }

    #[tokio::test]
    async fn enhanced_kyc_allows_large_transactions() {
        let eng = engine();
        let customer_id = CustomerId::new();
        eng.upgrade_kyc(customer_id, KycLevel::Enhanced).await.unwrap();
        eng.check_customer_can_transact(customer_id, 200_000_00, 0).await.unwrap();
    }

    #[tokio::test]
    async fn daily_volume_limit_is_enforced() {
        let eng = engine();
        let customer_id = CustomerId::new();
        eng.upgrade_kyc(customer_id, KycLevel::Basic).await.unwrap();
        // Basic daily limit: 500,000 AOA. Existing volume: 490,000 AOA + new 20,000 AOA = 510,000 → blocked.
        let result = eng.check_customer_can_transact(customer_id, 20_000_00, 490_000_00).await;
        assert!(matches!(result, Err(ComplianceError::InsufficientKycLevel { .. })));
    }
}
