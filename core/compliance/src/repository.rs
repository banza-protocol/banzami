use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::{CustomerId, MerchantId};

use crate::{
    ComplianceError, ComplianceStatus, CustomerCompliance, KycLevel, MerchantCompliance,
};

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait ComplianceRepository: Send + Sync {
    async fn get_merchant(
        &self,
        merchant_id: MerchantId,
    ) -> Result<Option<MerchantCompliance>, ComplianceError>;

    async fn upsert_merchant(
        &self,
        record: &MerchantCompliance,
    ) -> Result<(), ComplianceError>;

    async fn get_customer(
        &self,
        customer_id: CustomerId,
    ) -> Result<Option<CustomerCompliance>, ComplianceError>;

    async fn upsert_customer(
        &self,
        record: &CustomerCompliance,
    ) -> Result<(), ComplianceError>;
}

// ---------------------------------------------------------------------------
// Row projections
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct MerchantComplianceRow {
    merchant_id:  Uuid,
    kyb_status:   String,
    aml_status:   String,
    reviewed_at:  Option<chrono::DateTime<chrono::Utc>>,
    notes:        Option<String>,
    created_at:   chrono::DateTime<chrono::Utc>,
    updated_at:   chrono::DateTime<chrono::Utc>,
}

fn row_to_merchant(r: MerchantComplianceRow) -> Result<MerchantCompliance, ComplianceError> {
    Ok(MerchantCompliance {
        merchant_id: MerchantId::from_uuid(r.merchant_id),
        kyb_status:  ComplianceStatus::try_from_str(&r.kyb_status)
            .ok_or_else(|| ComplianceError::UnknownStatus(r.kyb_status.clone()))?,
        aml_status:  ComplianceStatus::try_from_str(&r.aml_status)
            .ok_or_else(|| ComplianceError::UnknownStatus(r.aml_status.clone()))?,
        reviewed_at: r.reviewed_at,
        notes:       r.notes,
        created_at:  r.created_at,
        updated_at:  r.updated_at,
    })
}

#[derive(sqlx::FromRow)]
struct CustomerComplianceRow {
    customer_id:  Uuid,
    kyc_level:    String,
    status:       String,
    reviewed_at:  Option<chrono::DateTime<chrono::Utc>>,
    created_at:   chrono::DateTime<chrono::Utc>,
    updated_at:   chrono::DateTime<chrono::Utc>,
}

fn row_to_customer(r: CustomerComplianceRow) -> Result<CustomerCompliance, ComplianceError> {
    Ok(CustomerCompliance {
        customer_id: CustomerId::from_uuid(r.customer_id),
        kyc_level:   KycLevel::try_from_str(&r.kyc_level)
            .ok_or_else(|| ComplianceError::UnknownStatus(r.kyc_level.clone()))?,
        status:      ComplianceStatus::try_from_str(&r.status)
            .ok_or_else(|| ComplianceError::UnknownStatus(r.status.clone()))?,
        reviewed_at: r.reviewed_at,
        created_at:  r.created_at,
        updated_at:  r.updated_at,
    })
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

pub struct PostgresComplianceRepository {
    pool: PgPool,
}

impl PostgresComplianceRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl ComplianceRepository for PostgresComplianceRepository {
    async fn get_merchant(
        &self,
        merchant_id: MerchantId,
    ) -> Result<Option<MerchantCompliance>, ComplianceError> {
        let row = sqlx::query_as!(
            MerchantComplianceRow,
            "SELECT * FROM merchant_compliance WHERE merchant_id = $1",
            merchant_id.as_uuid()
        )
        .fetch_optional(&self.pool)
        .await?;
        row.map(row_to_merchant).transpose()
    }

    async fn upsert_merchant(
        &self,
        record: &MerchantCompliance,
    ) -> Result<(), ComplianceError> {
        sqlx::query!(
            r#"
            INSERT INTO merchant_compliance (
                merchant_id, kyb_status, aml_status, reviewed_at, notes, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (merchant_id) DO UPDATE SET
                kyb_status  = EXCLUDED.kyb_status,
                aml_status  = EXCLUDED.aml_status,
                reviewed_at = EXCLUDED.reviewed_at,
                notes       = EXCLUDED.notes,
                updated_at  = EXCLUDED.updated_at
            "#,
            record.merchant_id.as_uuid(),
            record.kyb_status.as_str(),
            record.aml_status.as_str(),
            record.reviewed_at,
            record.notes.as_deref(),
            record.created_at,
            record.updated_at,
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get_customer(
        &self,
        customer_id: CustomerId,
    ) -> Result<Option<CustomerCompliance>, ComplianceError> {
        let row = sqlx::query_as!(
            CustomerComplianceRow,
            "SELECT * FROM customer_compliance WHERE customer_id = $1",
            customer_id.as_uuid()
        )
        .fetch_optional(&self.pool)
        .await?;
        row.map(row_to_customer).transpose()
    }

    async fn upsert_customer(
        &self,
        record: &CustomerCompliance,
    ) -> Result<(), ComplianceError> {
        sqlx::query!(
            r#"
            INSERT INTO customer_compliance (
                customer_id, kyc_level, status, reviewed_at, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (customer_id) DO UPDATE SET
                kyc_level   = EXCLUDED.kyc_level,
                status      = EXCLUDED.status,
                reviewed_at = EXCLUDED.reviewed_at,
                updated_at  = EXCLUDED.updated_at
            "#,
            record.customer_id.as_uuid(),
            record.kyc_level.as_str(),
            record.status.as_str(),
            record.reviewed_at,
            record.created_at,
            record.updated_at,
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
