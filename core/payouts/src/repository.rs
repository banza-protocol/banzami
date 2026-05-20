use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::{LedgerPostingId, MerchantId, Money, PayoutId, WalletId};

use crate::{BankDestination, Payout, PayoutError, PayoutStatus};

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait PayoutRepository: Send + Sync {
    async fn create(&self, payout: &Payout) -> Result<(), PayoutError>;
    async fn get(&self, id: PayoutId) -> Result<Payout, PayoutError>;
    async fn get_by_idempotency_key(&self, key: &str) -> Result<Option<Payout>, PayoutError>;
    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
        limit: i64,
    ) -> Result<Vec<Payout>, PayoutError>;
    async fn list_all(
        &self,
        limit: i64,
        status: Option<&str>,
    ) -> Result<Vec<Payout>, PayoutError>;
    async fn update_status(
        &self,
        id: PayoutId,
        status: PayoutStatus,
        ledger_posting_id: Option<LedgerPostingId>,
        failure_reason: Option<String>,
    ) -> Result<Payout, PayoutError>;
}

// ---------------------------------------------------------------------------
// Row projection
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct PayoutRow {
    id:                  Uuid,
    merchant_id:         Uuid,
    wallet_id:           Uuid,
    idempotency_key:     String,
    status:              String,
    environment:         String,
    amount_minor:        i64,
    currency:            String,
    bank_account_number: String,
    bank_code:           String,
    account_holder_name: String,
    ledger_posting_id:   Option<Uuid>,
    failure_reason:      Option<String>,
    created_at:          chrono::DateTime<Utc>,
    sent_at:             Option<chrono::DateTime<Utc>>,
    confirmed_at:        Option<chrono::DateTime<Utc>>,
    returned_at:         Option<chrono::DateTime<Utc>>,
    failed_at:           Option<chrono::DateTime<Utc>>,
}

fn row_to_payout(row: PayoutRow) -> Result<Payout, PayoutError> {
    let currency = banzami_types::Currency::from_code(&row.currency)
        .ok_or_else(|| PayoutError::UnknownStatus(row.currency.clone()))?;
    let status = PayoutStatus::try_from_str(&row.status)
        .ok_or_else(|| PayoutError::UnknownStatus(row.status.clone()))?;
    Ok(Payout {
        id:              PayoutId::from_uuid(row.id),
        merchant_id:     MerchantId::from_uuid(row.merchant_id),
        wallet_id:       WalletId::from_uuid(row.wallet_id),
        idempotency_key: row.idempotency_key,
        status,
        amount:          Money::new(row.amount_minor, currency),
        destination: BankDestination {
            account_number:      row.bank_account_number,
            bank_code:           row.bank_code,
            account_holder_name: row.account_holder_name,
        },
        ledger_posting_id: row.ledger_posting_id.map(LedgerPostingId::from_uuid),
        failure_reason:    row.failure_reason,
        created_at:        row.created_at,
        sent_at:           row.sent_at,
        confirmed_at:      row.confirmed_at,
        returned_at:       row.returned_at,
        failed_at:         row.failed_at,
    })
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

pub struct PostgresPayoutRepository {
    pool: PgPool,
}

impl PostgresPayoutRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl PayoutRepository for PostgresPayoutRepository {
    async fn create(&self, p: &Payout) -> Result<(), PayoutError> {
        sqlx::query!(
            r#"
            INSERT INTO payouts (
                id, merchant_id, wallet_id, idempotency_key, status,
                amount_minor, currency,
                bank_account_number, bank_code, account_holder_name,
                ledger_posting_id, failure_reason, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            "#,
            p.id.as_uuid(),
            p.merchant_id.as_uuid(),
            p.wallet_id.as_uuid(),
            p.idempotency_key,
            p.status.as_str(),
            p.amount.amount_minor(),
            p.amount.currency.code(),
            p.destination.account_number,
            p.destination.bank_code,
            p.destination.account_holder_name,
            p.ledger_posting_id.map(|id| id.as_uuid()),
            p.failure_reason.as_deref(),
            p.created_at,
        )
        .execute(&self.pool)
        .await
        .map_err(|e| {
            if let Some(db) = e.as_database_error() {
                if db.constraint() == Some("payouts_idempotency_key_key") {
                    return PayoutError::DuplicateIdempotencyKey(p.idempotency_key.clone());
                }
            }
            PayoutError::Database(e)
        })?;
        Ok(())
    }

    async fn get(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        let row = sqlx::query_as!(
            PayoutRow,
            "SELECT * FROM payouts WHERE id = $1",
            id.as_uuid()
        )
        .fetch_optional(&self.pool)
        .await?
        .ok_or(PayoutError::NotFound(id))?;
        row_to_payout(row)
    }

    async fn get_by_idempotency_key(&self, key: &str) -> Result<Option<Payout>, PayoutError> {
        let row = sqlx::query_as!(
            PayoutRow,
            "SELECT * FROM payouts WHERE idempotency_key = $1",
            key
        )
        .fetch_optional(&self.pool)
        .await?;
        row.map(row_to_payout).transpose()
    }

    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
        limit: i64,
    ) -> Result<Vec<Payout>, PayoutError> {
        let rows = sqlx::query_as!(
            PayoutRow,
            "SELECT * FROM payouts WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2",
            merchant_id.as_uuid(),
            limit
        )
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(row_to_payout).collect()
    }

    async fn list_all(
        &self,
        limit: i64,
        status: Option<&str>,
    ) -> Result<Vec<Payout>, PayoutError> {
        let rows = if let Some(s) = status {
            sqlx::query_as!(
                PayoutRow,
                "SELECT * FROM payouts WHERE status = $1 ORDER BY created_at DESC LIMIT $2",
                s,
                limit
            )
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as!(
                PayoutRow,
                "SELECT * FROM payouts ORDER BY created_at DESC LIMIT $1",
                limit
            )
            .fetch_all(&self.pool)
            .await?
        };
        rows.into_iter().map(row_to_payout).collect()
    }

    async fn update_status(
        &self,
        id: PayoutId,
        status: PayoutStatus,
        ledger_posting_id: Option<LedgerPostingId>,
        failure_reason: Option<String>,
    ) -> Result<Payout, PayoutError> {
        let now = Utc::now();
        let row = sqlx::query_as!(
            PayoutRow,
            r#"
            UPDATE payouts SET
                status              = $2,
                ledger_posting_id   = COALESCE($3, ledger_posting_id),
                failure_reason      = COALESCE($4, failure_reason),
                sent_at             = CASE WHEN $2 = 'SENT'      THEN $5 ELSE sent_at      END,
                confirmed_at        = CASE WHEN $2 = 'CONFIRMED' THEN $5 ELSE confirmed_at  END,
                returned_at         = CASE WHEN $2 = 'RETURNED'  THEN $5 ELSE returned_at   END,
                failed_at           = CASE WHEN $2 = 'FAILED'    THEN $5 ELSE failed_at     END
            WHERE id = $1
            RETURNING *
            "#,
            id.as_uuid(),
            status.as_str(),
            ledger_posting_id.map(|id| id.as_uuid()),
            failure_reason,
            now,
        )
        .fetch_optional(&self.pool)
        .await?
        .ok_or(PayoutError::NotFound(id))?;
        row_to_payout(row)
    }
}
