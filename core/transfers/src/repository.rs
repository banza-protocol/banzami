use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::{ConsumerId, Currency, LedgerPostingId, Money, TransferId};

use crate::{Transfer, TransferError, TransferStatus};

#[allow(async_fn_in_trait)]
pub trait TransferRepository: Send + Sync {
    async fn get(&self, id: TransferId) -> Result<Transfer, TransferError>;
    async fn get_by_idempotency_key(
        &self,
        key: &str,
    ) -> Result<Option<Transfer>, TransferError>;
    async fn list_for_consumer(
        &self,
        consumer_id: ConsumerId,
        limit:       i64,
        before_ts:   Option<DateTime<Utc>>,
        before_id:   Option<TransferId>,
    ) -> Result<Vec<Transfer>, TransferError>;
}

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
pub(crate) struct TransferRow {
    pub id:                Uuid,
    pub idempotency_key:   String,
    pub sender_id:         Uuid,
    pub recipient_id:      Uuid,
    pub amount_minor:      i64,
    pub currency:          String,
    pub status:            String,
    pub description:       Option<String>,
    pub failure_reason:    Option<String>,
    pub ledger_posting_id: Option<Uuid>,
    pub recipient_handle:  Option<String>,
    pub created_at:        DateTime<Utc>,
    pub updated_at:        DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

pub struct PostgresTransferRepository {
    pool: PgPool,
}

impl PostgresTransferRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

pub(crate) const SELECT: &str =
    "SELECT id, idempotency_key, sender_id, recipient_id, amount_minor, currency,
            status, description, failure_reason, ledger_posting_id, recipient_handle,
            created_at, updated_at
     FROM transfers";

impl TransferRepository for PostgresTransferRepository {
    async fn get(&self, id: TransferId) -> Result<Transfer, TransferError> {
        let row = sqlx::query_as::<_, TransferRow>(&format!("{SELECT} WHERE id = $1"))
            .bind(id.as_uuid())
            .fetch_optional(&self.pool)
            .await
            .map_err(TransferError::Database)?
            .ok_or(TransferError::NotFound(id))?;

        transfer_from_row(row)
    }

    async fn get_by_idempotency_key(
        &self,
        key: &str,
    ) -> Result<Option<Transfer>, TransferError> {
        let row =
            sqlx::query_as::<_, TransferRow>(&format!("{SELECT} WHERE idempotency_key = $1"))
                .bind(key)
                .fetch_optional(&self.pool)
                .await
                .map_err(TransferError::Database)?;

        row.map(transfer_from_row).transpose()
    }

    async fn list_for_consumer(
        &self,
        consumer_id: ConsumerId,
        limit:       i64,
        before_ts:   Option<DateTime<Utc>>,
        before_id:   Option<TransferId>,
    ) -> Result<Vec<Transfer>, TransferError> {
        let rows = if let (Some(ts), Some(bid)) = (before_ts, before_id) {
            sqlx::query_as::<_, TransferRow>(&format!(
                "{SELECT}
                 WHERE (sender_id = $1 OR recipient_id = $1)
                   AND (created_at < $2 OR (created_at = $2 AND id < $3))
                 ORDER BY created_at DESC, id DESC
                 LIMIT $4"
            ))
            .bind(consumer_id.as_uuid())
            .bind(ts)
            .bind(bid.as_uuid())
            .bind(limit)
            .fetch_all(&self.pool)
            .await
            .map_err(TransferError::Database)?
        } else {
            sqlx::query_as::<_, TransferRow>(&format!(
                "{SELECT}
                 WHERE sender_id = $1 OR recipient_id = $1
                 ORDER BY created_at DESC, id DESC
                 LIMIT $2"
            ))
            .bind(consumer_id.as_uuid())
            .bind(limit)
            .fetch_all(&self.pool)
            .await
            .map_err(TransferError::Database)?
        };

        rows.into_iter().map(transfer_from_row).collect()
    }
}

// ---------------------------------------------------------------------------
// Row → domain
// ---------------------------------------------------------------------------

pub(crate) fn transfer_from_row(row: TransferRow) -> Result<Transfer, TransferError> {
    let currency = Currency::from_code(&row.currency)
        .ok_or_else(|| TransferError::UnknownCurrency(row.currency.clone()))?;
    let status = TransferStatus::try_from_str(&row.status)
        .ok_or_else(|| TransferError::UnknownStatus(row.status.clone()))?;

    Ok(Transfer {
        id:                TransferId::from_uuid(row.id),
        idempotency_key:   row.idempotency_key,
        sender_id:         ConsumerId::from_uuid(row.sender_id),
        recipient_id:      ConsumerId::from_uuid(row.recipient_id),
        amount:            Money::new(row.amount_minor, currency),
        currency,
        status,
        description:       row.description,
        failure_reason:    row.failure_reason,
        ledger_posting_id: row.ledger_posting_id.map(LedgerPostingId::from_uuid),
        recipient_handle:  row.recipient_handle,
        created_at:        row.created_at,
        updated_at:        row.updated_at,
    })
}
