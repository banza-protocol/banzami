use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::{LedgerPostingId, MerchantId, Money, SettlementId, WalletId};

use crate::{Settlement, SettlementError, SettlementStatus};

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait SettlementRepository: Send + Sync {
    async fn create(&self, s: Settlement) -> Result<Settlement, SettlementError>;
    async fn get(&self, id: SettlementId) -> Result<Settlement, SettlementError>;
    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
    ) -> Result<Vec<Settlement>, SettlementError>;
    async fn list_all(
        &self,
        limit: i64,
        status: Option<&str>,
    ) -> Result<Vec<Settlement>, SettlementError>;
    async fn update_status(
        &self,
        id: SettlementId,
        status: SettlementStatus,
        posting_id: Option<LedgerPostingId>,
        failure_reason: Option<&str>,
    ) -> Result<Settlement, SettlementError>;
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct SettlementRow {
    id:                 Uuid,
    merchant_id:        Uuid,
    wallet_id:          Uuid,
    currency:           String,
    status:             String,
    gross_amount_minor: i64,
    fee_amount_minor:   i64,
    net_amount_minor:   i64,
    transaction_count:  i32,
    period_start:       DateTime<Utc>,
    period_end:         DateTime<Utc>,
    ledger_posting_id:  Option<Uuid>,
    failure_reason:     Option<String>,
    submitted_at:       Option<DateTime<Utc>>,
    settled_at:         Option<DateTime<Utc>>,
    created_at:         DateTime<Utc>,
    updated_at:         DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

pub struct PostgresSettlementRepository {
    pool: PgPool,
}

impl PostgresSettlementRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

const SELECT: &str = "SELECT id, merchant_id, wallet_id, currency, status,
    gross_amount_minor, fee_amount_minor, net_amount_minor, transaction_count,
    period_start, period_end, ledger_posting_id, failure_reason,
    submitted_at, settled_at, created_at, updated_at
    FROM settlements";

impl SettlementRepository for PostgresSettlementRepository {
    async fn create(&self, s: Settlement) -> Result<Settlement, SettlementError> {
        sqlx::query(
            "INSERT INTO settlements
             (id, merchant_id, wallet_id, currency, status,
              gross_amount_minor, fee_amount_minor, net_amount_minor, transaction_count,
              period_start, period_end, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        )
        .bind(s.id.as_uuid())
        .bind(s.merchant_id.as_uuid())
        .bind(s.wallet_id.as_uuid())
        .bind(s.currency.code())
        .bind(s.status.as_str())
        .bind(s.gross_amount.amount_minor())
        .bind(s.fee_amount.amount_minor())
        .bind(s.net_amount.amount_minor())
        .bind(s.transaction_count as i32)
        .bind(s.period_start)
        .bind(s.period_end)
        .bind(s.created_at)
        .bind(s.updated_at)
        .execute(&self.pool)
        .await
        .map_err(SettlementError::Database)?;

        tracing::info!(
            settlement_id = %s.id,
            merchant_id   = %s.merchant_id,
            net_amount    = %s.net_amount,
            "settlement batch created"
        );
        Ok(s)
    }

    async fn get(&self, id: SettlementId) -> Result<Settlement, SettlementError> {
        let row = sqlx::query_as::<_, SettlementRow>(&format!("{SELECT} WHERE id = $1"))
            .bind(id.as_uuid())
            .fetch_optional(&self.pool)
            .await
            .map_err(SettlementError::Database)?
            .ok_or(SettlementError::NotFound(id))?;

        settlement_from_row(row)
    }

    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
    ) -> Result<Vec<Settlement>, SettlementError> {
        let rows = sqlx::query_as::<_, SettlementRow>(&format!(
            "{SELECT} WHERE merchant_id = $1 ORDER BY created_at DESC"
        ))
        .bind(merchant_id.as_uuid())
        .fetch_all(&self.pool)
        .await
        .map_err(SettlementError::Database)?;

        rows.into_iter().map(settlement_from_row).collect()
    }

    async fn list_all(
        &self,
        limit: i64,
        status: Option<&str>,
    ) -> Result<Vec<Settlement>, SettlementError> {
        let rows = if let Some(s) = status {
            sqlx::query_as::<_, SettlementRow>(&format!(
                "{SELECT} WHERE status = $1 ORDER BY created_at DESC LIMIT $2"
            ))
            .bind(s)
            .bind(limit)
            .fetch_all(&self.pool)
            .await
        } else {
            sqlx::query_as::<_, SettlementRow>(&format!(
                "{SELECT} ORDER BY created_at DESC LIMIT $1"
            ))
            .bind(limit)
            .fetch_all(&self.pool)
            .await
        }
        .map_err(SettlementError::Database)?;

        rows.into_iter().map(settlement_from_row).collect()
    }

    async fn update_status(
        &self,
        id: SettlementId,
        status: SettlementStatus,
        posting_id: Option<LedgerPostingId>,
        failure_reason: Option<&str>,
    ) -> Result<Settlement, SettlementError> {
        let now = Utc::now();
        let submitted_at = if status == SettlementStatus::Submitted {
            Some(now)
        } else {
            None
        };
        let settled_at = if status == SettlementStatus::Settled {
            Some(now)
        } else {
            None
        };

        sqlx::query(
            "UPDATE settlements
             SET status = $1, ledger_posting_id = $2, failure_reason = $3,
                 submitted_at = COALESCE(submitted_at, $4),
                 settled_at   = COALESCE(settled_at, $5),
                 updated_at   = $6
             WHERE id = $7",
        )
        .bind(status.as_str())
        .bind(posting_id.map(|p| p.as_uuid()))
        .bind(failure_reason)
        .bind(submitted_at)
        .bind(settled_at)
        .bind(now)
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(SettlementError::Database)?;

        self.get(id).await
    }
}

// ---------------------------------------------------------------------------
// Row → domain
// ---------------------------------------------------------------------------

fn settlement_from_row(row: SettlementRow) -> Result<Settlement, SettlementError> {
    let currency = banzami_types::Currency::from_code(&row.currency)
        .ok_or_else(|| SettlementError::Database(sqlx::Error::RowNotFound))?;

    let status = SettlementStatus::try_from_str(&row.status)
        .ok_or_else(|| SettlementError::Database(sqlx::Error::RowNotFound))?;

    Ok(Settlement {
        id:                SettlementId::from_uuid(row.id),
        merchant_id:       MerchantId::from_uuid(row.merchant_id),
        wallet_id:         WalletId::from_uuid(row.wallet_id),
        currency,
        status,
        gross_amount:      Money::new(row.gross_amount_minor, currency),
        fee_amount:        Money::new(row.fee_amount_minor, currency),
        net_amount:        Money::new(row.net_amount_minor, currency),
        transaction_count: row.transaction_count as u32,
        period_start:      row.period_start,
        period_end:        row.period_end,
        ledger_posting_id: row.ledger_posting_id.map(LedgerPostingId::from_uuid),
        failure_reason:    row.failure_reason,
        submitted_at:      row.submitted_at,
        settled_at:        row.settled_at,
        created_at:        row.created_at,
        updated_at:        row.updated_at,
    })
}
