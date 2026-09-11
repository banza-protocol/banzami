use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::{CustomerId, MerchantId};

use crate::{ComplianceError, ComplianceStatus, CustomerCompliance, KycLevel, MerchantCompliance};

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

/// A compliance decision on a merchant (A5-06). Each moves only its own
/// columns: a whole-row read-modify-write let a concurrent AML flag and a KYB
/// rejection each overwrite the other.
#[derive(Clone, Debug)]
pub enum MerchantDecision {
    /// KYB approved; AML approved only if it was still pending. Refused while
    /// KYB or AML is suspended — lifting a suspension is its own decision, and
    /// "approve" used to be it, silently.
    Approve,
    Reject(String),
    Suspend(String),
    /// AML under review, unless AML is already suspended.
    FlagAml(String),
}

impl MerchantDecision {
    /// One statement per decision: the columns it sets and the condition it
    /// needs. `$1` is the merchant, `$2` the notes.
    fn statement(&self) -> &'static str {
        match self {
            Self::Approve => {
                "UPDATE merchant_compliance
                    SET kyb_status = 'APPROVED',
                        aml_status = CASE WHEN aml_status = 'PENDING' THEN 'APPROVED' ELSE aml_status END,
                        reviewed_at = now(), updated_at = now()
                  WHERE merchant_id = $1 AND kyb_status <> 'SUSPENDED' AND aml_status <> 'SUSPENDED'
                    AND $2::text IS NULL
                  RETURNING *"
            }
            Self::Reject(_) => {
                "UPDATE merchant_compliance
                    SET kyb_status = 'REJECTED', notes = $2, reviewed_at = now(), updated_at = now()
                  WHERE merchant_id = $1
                  RETURNING *"
            }
            Self::Suspend(_) => {
                "UPDATE merchant_compliance
                    SET kyb_status = 'SUSPENDED', aml_status = 'SUSPENDED', notes = $2,
                        reviewed_at = now(), updated_at = now()
                  WHERE merchant_id = $1
                  RETURNING *"
            }
            Self::FlagAml(_) => {
                "UPDATE merchant_compliance
                    SET aml_status = 'UNDER_REVIEW', notes = $2, reviewed_at = now(), updated_at = now()
                  WHERE merchant_id = $1 AND aml_status <> 'SUSPENDED'
                  RETURNING *"
            }
        }
    }

    fn notes(&self) -> Option<&str> {
        match self {
            Self::Approve => None,
            Self::Reject(n) | Self::Suspend(n) | Self::FlagAml(n) => Some(n.as_str()),
        }
    }
}

#[allow(async_fn_in_trait)]
pub trait ComplianceRepository: Send + Sync {
    async fn get_merchant(
        &self,
        merchant_id: MerchantId,
    ) -> Result<Option<MerchantCompliance>, ComplianceError>;

    async fn upsert_merchant(&self, record: &MerchantCompliance) -> Result<(), ComplianceError>;

    /// Apply one decision to the columns it concerns, atomically, on the
    /// condition the decision requires. Returns the record after the decision,
    /// or `None` when the condition refused it (the record is unchanged).
    async fn decide_merchant(
        &self,
        merchant_id: MerchantId,
        decision: &MerchantDecision,
    ) -> Result<Option<MerchantCompliance>, ComplianceError>;

    async fn get_customer(
        &self,
        customer_id: CustomerId,
    ) -> Result<Option<CustomerCompliance>, ComplianceError>;

    async fn upsert_customer(&self, record: &CustomerCompliance) -> Result<(), ComplianceError>;
}

// ---------------------------------------------------------------------------
// Row projections
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct MerchantComplianceRow {
    merchant_id: Uuid,
    kyb_status: String,
    aml_status: String,
    reviewed_at: Option<chrono::DateTime<chrono::Utc>>,
    notes: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

fn row_to_merchant(r: MerchantComplianceRow) -> Result<MerchantCompliance, ComplianceError> {
    Ok(MerchantCompliance {
        merchant_id: MerchantId::from_uuid(r.merchant_id),
        kyb_status: ComplianceStatus::try_from_str(&r.kyb_status)
            .ok_or_else(|| ComplianceError::UnknownStatus(r.kyb_status.clone()))?,
        aml_status: ComplianceStatus::try_from_str(&r.aml_status)
            .ok_or_else(|| ComplianceError::UnknownStatus(r.aml_status.clone()))?,
        reviewed_at: r.reviewed_at,
        notes: r.notes,
        created_at: r.created_at,
        updated_at: r.updated_at,
    })
}

#[derive(sqlx::FromRow)]
struct CustomerComplianceRow {
    customer_id: Uuid,
    kyc_level: String,
    status: String,
    reviewed_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

fn row_to_customer(r: CustomerComplianceRow) -> Result<CustomerCompliance, ComplianceError> {
    Ok(CustomerCompliance {
        customer_id: CustomerId::from_uuid(r.customer_id),
        kyc_level: KycLevel::try_from_str(&r.kyc_level)
            .ok_or_else(|| ComplianceError::UnknownStatus(r.kyc_level.clone()))?,
        status: ComplianceStatus::try_from_str(&r.status)
            .ok_or_else(|| ComplianceError::UnknownStatus(r.status.clone()))?,
        reviewed_at: r.reviewed_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
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

    async fn decide_merchant(
        &self,
        merchant_id: MerchantId,
        decision: &MerchantDecision,
    ) -> Result<Option<MerchantCompliance>, ComplianceError> {
        let row = sqlx::query_as::<_, MerchantComplianceRow>(decision.statement())
            .bind(merchant_id.as_uuid())
            .bind(decision.notes())
            .fetch_optional(&self.pool)
            .await?;
        row.map(row_to_merchant).transpose()
    }

    async fn upsert_merchant(&self, record: &MerchantCompliance) -> Result<(), ComplianceError> {
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

    async fn upsert_customer(&self, record: &CustomerCompliance) -> Result<(), ComplianceError> {
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
