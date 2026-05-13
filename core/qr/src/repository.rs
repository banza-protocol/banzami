use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::QrCodeId;

use crate::{QrCode, QrCodeStatus, QrCodeType, QrError, QrOwnerType};

#[allow(async_fn_in_trait)]
pub trait QrRepository: Send + Sync {
    async fn create(&self, qr: QrCode) -> Result<QrCode, QrError>;
    async fn get(&self, id: QrCodeId) -> Result<QrCode, QrError>;
    async fn update_status(
        &self,
        id:     QrCodeId,
        status: QrCodeStatus,
    ) -> Result<QrCode, QrError>;
}

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct QrRow {
    id:           Uuid,
    owner_id:     Uuid,
    owner_type:   String,
    qr_type:      String,
    currency:     String,
    amount_minor: Option<i64>,
    status:       String,
    expires_at:   Option<DateTime<Utc>>,
    used_at:      Option<DateTime<Utc>>,
    reference:    Option<String>,
    created_at:   DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

pub struct PostgresQrRepository {
    pool: PgPool,
}

impl PostgresQrRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

const SELECT: &str =
    "SELECT id, owner_id, owner_type, qr_type, currency, amount_minor, status,
            expires_at, used_at, reference, created_at
     FROM qr_codes";

impl QrRepository for PostgresQrRepository {
    async fn create(&self, qr: QrCode) -> Result<QrCode, QrError> {
        sqlx::query(
            "INSERT INTO qr_codes
             (id, owner_id, owner_type, qr_type, currency, amount_minor, status,
              expires_at, used_at, reference, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        )
        .bind(qr.id.as_uuid())
        .bind(qr.owner_id)
        .bind(qr.owner_type.as_str())
        .bind(qr.qr_type.as_str())
        .bind(qr.currency.code())
        .bind(qr.amount_minor)
        .bind(qr.status.as_str())
        .bind(qr.expires_at)
        .bind(qr.used_at)
        .bind(&qr.reference)
        .bind(qr.created_at)
        .execute(&self.pool)
        .await
        .map_err(QrError::Database)?;

        Ok(qr)
    }

    async fn get(&self, id: QrCodeId) -> Result<QrCode, QrError> {
        let row = sqlx::query_as::<_, QrRow>(&format!("{SELECT} WHERE id = $1"))
            .bind(id.as_uuid())
            .fetch_optional(&self.pool)
            .await
            .map_err(QrError::Database)?
            .ok_or(QrError::NotFound(id))?;

        qr_from_row(row)
    }

    async fn update_status(
        &self,
        id:     QrCodeId,
        status: QrCodeStatus,
    ) -> Result<QrCode, QrError> {
        let used_at = if status == QrCodeStatus::Used {
            Some(Utc::now())
        } else {
            None
        };

        sqlx::query(
            "UPDATE qr_codes SET status = $1, used_at = COALESCE($2, used_at) WHERE id = $3",
        )
        .bind(status.as_str())
        .bind(used_at)
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(QrError::Database)?;

        self.get(id).await
    }
}

// ---------------------------------------------------------------------------
// Row → domain
// ---------------------------------------------------------------------------

fn qr_from_row(row: QrRow) -> Result<QrCode, QrError> {
    let currency = banzami_types::Currency::from_code(&row.currency)
        .ok_or_else(|| QrError::UnknownCurrency(row.currency.clone()))?;
    let owner_type = QrOwnerType::try_from_str(&row.owner_type)
        .ok_or_else(|| QrError::InvalidPayload(format!("unknown owner_type: {}", row.owner_type)))?;
    let qr_type = QrCodeType::try_from_str(&row.qr_type)
        .ok_or_else(|| QrError::InvalidPayload(format!("unknown qr_type: {}", row.qr_type)))?;
    let status = QrCodeStatus::try_from_str(&row.status)
        .ok_or_else(|| QrError::InvalidPayload(format!("unknown status: {}", row.status)))?;

    Ok(QrCode {
        id:           QrCodeId::from_uuid(row.id),
        owner_id:     row.owner_id,
        owner_type,
        qr_type,
        currency,
        amount_minor: row.amount_minor,
        status,
        expires_at:   row.expires_at,
        used_at:      row.used_at,
        reference:    row.reference,
        created_at:   row.created_at,
    })
}
