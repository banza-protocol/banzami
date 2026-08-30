use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::{
    Currency, LedgerPostingId, MerchantId, Money, OperatorFeeId, PricingRuleId, TransactionId,
    WalletId,
};

use crate::{Transaction, TransactionError, TransactionStatus, TransactionType};

/// Everything needed to persist one immutable `operator_fees` row at capture
/// (Banzami ADR-021). Carries the resolved fee + the references + the immutable
/// pricing snapshot — never a rule or a percentage.
pub struct OperatorFeeInsert {
    pub id: OperatorFeeId,
    pub transaction_id: TransactionId,
    pub posting_id: LedgerPostingId,
    pub amount_minor: i64,
    pub currency: Currency,
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub fee_policy_ref: Option<String>,
    pub pricing_rule_id: Option<PricingRuleId>,
    pub pricing_rule_version: Option<i32>,
    pub engine_version: i32,
    pub snapshot_json: serde_json::Value,
    pub environment: String,
    pub idempotency_key: String,
}

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait TransactionRepository: Send + Sync {
    async fn create(&self, tx: Transaction) -> Result<Transaction, TransactionError>;
    async fn get(&self, id: TransactionId) -> Result<Transaction, TransactionError>;
    async fn get_by_idempotency_key(
        &self,
        key: &str,
    ) -> Result<Option<Transaction>, TransactionError>;
    async fn update_status(
        &self,
        id: TransactionId,
        status: TransactionStatus,
        failure_reason: Option<&str>,
    ) -> Result<Transaction, TransactionError>;
    /// Atomically record the operator fee (one per transaction, idempotent) and
    /// mark the transaction CAPTURED with its retained fee. The settle ledger
    /// posting has already committed; this persists the derived records.
    async fn finalize_capture(
        &self,
        id: TransactionId,
        fee: Money,
        fee_record: OperatorFeeInsert,
    ) -> Result<Transaction, TransactionError>;
    /// Keyset-paginated list for a merchant, newest first.
    /// Pass `before_ts` + `before_id` (from the last returned row) to get the next page.
    /// Pass `since_ts` to restrict results to transactions created at or after that timestamp.
    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
        limit: i64,
        before_ts: Option<DateTime<Utc>>,
        before_id: Option<TransactionId>,
        since_ts: Option<DateTime<Utc>>,
    ) -> Result<Vec<Transaction>, TransactionError>;
}

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct TransactionRow {
    id: Uuid,
    idempotency_key: String,
    transaction_type: String,
    status: String,
    amount_minor: i64,
    fee_minor: i64,
    currency: String,
    merchant_id: Uuid,
    wallet_id: Uuid,
    description: Option<String>,
    failure_reason: Option<String>,
    business_category: Option<String>,
    pricing_profile: Option<String>,
    fee_policy_ref: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

pub struct PostgresTransactionRepository {
    pool: PgPool,
}

impl PostgresTransactionRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

const SELECT: &str =
    "SELECT id, idempotency_key, transaction_type, status, amount_minor, fee_minor,
            currency, merchant_id, wallet_id, description, failure_reason,
            business_category, pricing_profile, fee_policy_ref,
            created_at, updated_at
     FROM transactions";

impl TransactionRepository for PostgresTransactionRepository {
    async fn create(&self, tx: Transaction) -> Result<Transaction, TransactionError> {
        let result = sqlx::query(
            "INSERT INTO transactions
             (id, idempotency_key, transaction_type, status, amount_minor, fee_minor,
              currency, merchant_id, wallet_id, description, failure_reason,
              business_category, pricing_profile, fee_policy_ref, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
        )
        .bind(tx.id.as_uuid())
        .bind(&tx.idempotency_key)
        .bind(tx.transaction_type.as_str())
        .bind(tx.status.as_str())
        .bind(tx.amount.amount_minor())
        .bind(tx.fee.amount_minor())
        .bind(tx.currency.code())
        .bind(tx.merchant_id.as_uuid())
        .bind(tx.wallet_id.as_uuid())
        .bind(&tx.description)
        .bind(&tx.failure_reason)
        .bind(&tx.business_category)
        .bind(&tx.pricing_profile)
        .bind(&tx.fee_policy_ref)
        .bind(tx.created_at)
        .bind(tx.updated_at)
        .execute(&self.pool)
        .await;

        match result {
            Err(sqlx::Error::Database(ref db_err))
                if db_err.constraint() == Some("transactions_idempotency_key_key") =>
            {
                return Err(TransactionError::DuplicateIdempotencyKey(
                    tx.idempotency_key.clone(),
                ));
            }
            Err(e) => return Err(TransactionError::Database(e)),
            Ok(_) => {}
        }

        tracing::info!(tx_id = %tx.id, merchant_id = %tx.merchant_id, status = "PENDING", "transaction created");
        Ok(tx)
    }

    async fn get(&self, id: TransactionId) -> Result<Transaction, TransactionError> {
        let row = sqlx::query_as::<_, TransactionRow>(&format!("{SELECT} WHERE id = $1"))
            .bind(id.as_uuid())
            .fetch_optional(&self.pool)
            .await
            .map_err(TransactionError::Database)?
            .ok_or(TransactionError::NotFound(id))?;

        tx_from_row(row)
    }

    async fn get_by_idempotency_key(
        &self,
        key: &str,
    ) -> Result<Option<Transaction>, TransactionError> {
        let row =
            sqlx::query_as::<_, TransactionRow>(&format!("{SELECT} WHERE idempotency_key = $1"))
                .bind(key)
                .fetch_optional(&self.pool)
                .await
                .map_err(TransactionError::Database)?;

        row.map(tx_from_row).transpose()
    }

    async fn update_status(
        &self,
        id: TransactionId,
        status: TransactionStatus,
        failure_reason: Option<&str>,
    ) -> Result<Transaction, TransactionError> {
        let now = Utc::now();
        sqlx::query(
            "UPDATE transactions
             SET status = $1, failure_reason = $2, updated_at = $3
             WHERE id = $4",
        )
        .bind(status.as_str())
        .bind(failure_reason)
        .bind(now)
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(TransactionError::Database)?;

        self.get(id).await
    }

    async fn finalize_capture(
        &self,
        id: TransactionId,
        fee: Money,
        r: OperatorFeeInsert,
    ) -> Result<Transaction, TransactionError> {
        let now = Utc::now();
        let mut db = self
            .pool
            .begin()
            .await
            .map_err(TransactionError::Database)?;

        // One operator fee per transaction; a replay is a no-op (idempotent).
        sqlx::query(
            "INSERT INTO operator_fees
               (id, transaction_id, posting_id, amount_minor, currency,
                business_category, pricing_profile, fee_policy_ref,
                pricing_rule_id, pricing_rule_version, engine_version,
                snapshot_json, status, environment, idempotency_key, settled_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'APPLIED',$13,$14,$15)
             ON CONFLICT (transaction_id) DO NOTHING",
        )
        .bind(r.id.as_uuid())
        .bind(r.transaction_id.as_uuid())
        .bind(r.posting_id.as_uuid())
        .bind(r.amount_minor)
        .bind(r.currency.code())
        .bind(&r.business_category)
        .bind(&r.pricing_profile)
        .bind(&r.fee_policy_ref)
        .bind(r.pricing_rule_id.map(|x| x.as_uuid()))
        .bind(r.pricing_rule_version)
        .bind(r.engine_version)
        .bind(&r.snapshot_json)
        .bind(&r.environment)
        .bind(&r.idempotency_key)
        .bind(now)
        .execute(&mut *db)
        .await
        .map_err(TransactionError::Database)?;

        sqlx::query(
            "UPDATE transactions
                SET status = $1, fee_minor = $2, updated_at = $3
              WHERE id = $4",
        )
        .bind(TransactionStatus::Captured.as_str())
        .bind(fee.amount_minor())
        .bind(now)
        .bind(id.as_uuid())
        .execute(&mut *db)
        .await
        .map_err(TransactionError::Database)?;

        db.commit().await.map_err(TransactionError::Database)?;
        self.get(id).await
    }

    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
        limit: i64,
        before_ts: Option<DateTime<Utc>>,
        before_id: Option<TransactionId>,
        since_ts: Option<DateTime<Utc>>,
    ) -> Result<Vec<Transaction>, TransactionError> {
        let since_clause = if since_ts.is_some() {
            " AND created_at >= $5"
        } else {
            ""
        };

        let rows = if let (Some(ts), Some(bid)) = (before_ts, before_id) {
            let q = format!(
                "{SELECT}
                 WHERE merchant_id = $1
                   AND (created_at < $2 OR (created_at = $2 AND id < $3))
                   {since_clause}
                 ORDER BY created_at DESC, id DESC
                 LIMIT $4"
            );
            let mut qb = sqlx::query_as::<_, TransactionRow>(&q)
                .bind(merchant_id.as_uuid())
                .bind(ts)
                .bind(bid.as_uuid())
                .bind(limit);
            if let Some(since) = since_ts {
                qb = qb.bind(since);
            }
            qb.fetch_all(&self.pool)
                .await
                .map_err(TransactionError::Database)?
        } else {
            let since_clause_no_cursor = if since_ts.is_some() {
                " AND created_at >= $3"
            } else {
                ""
            };
            let q = format!(
                "{SELECT}
                 WHERE merchant_id = $1
                   {since_clause_no_cursor}
                 ORDER BY created_at DESC, id DESC
                 LIMIT $2"
            );
            let mut qb = sqlx::query_as::<_, TransactionRow>(&q)
                .bind(merchant_id.as_uuid())
                .bind(limit);
            if let Some(since) = since_ts {
                qb = qb.bind(since);
            }
            qb.fetch_all(&self.pool)
                .await
                .map_err(TransactionError::Database)?
        };

        rows.into_iter().map(tx_from_row).collect()
    }
}

// ---------------------------------------------------------------------------
// Row → domain
// ---------------------------------------------------------------------------

fn tx_from_row(row: TransactionRow) -> Result<Transaction, TransactionError> {
    let currency = Currency::from_code(&row.currency)
        .ok_or_else(|| TransactionError::UnknownCurrency(row.currency.clone()))?;
    let tx_type = TransactionType::try_from_str(&row.transaction_type)
        .ok_or_else(|| TransactionError::UnknownTransactionType(row.transaction_type.clone()))?;
    let status = TransactionStatus::try_from_str(&row.status)
        .ok_or_else(|| TransactionError::UnknownStatus(row.status.clone()))?;

    Ok(Transaction {
        id: TransactionId::from_uuid(row.id),
        idempotency_key: row.idempotency_key,
        transaction_type: tx_type,
        status,
        amount: Money::new(row.amount_minor, currency),
        fee: Money::new(row.fee_minor, currency),
        currency,
        merchant_id: MerchantId::from_uuid(row.merchant_id),
        wallet_id: WalletId::from_uuid(row.wallet_id),
        description: row.description,
        failure_reason: row.failure_reason,
        business_category: row.business_category,
        pricing_profile: row.pricing_profile,
        fee_policy_ref: row.fee_policy_ref,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}
