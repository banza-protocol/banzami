use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::{AccountId, Currency, LedgerEntryId, LedgerPostingId, Money};

use crate::{
    account::Account,
    engine::LedgerEngine,
    entry::{EntryType, LedgerEntry},
    posting::LedgerPosting,
    LedgerError,
};

// ---------------------------------------------------------------------------
// Row types — internal only, used to deserialize from PostgreSQL
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct EntryRow {
    id:           Uuid,
    posting_id:   Uuid,
    account_id:   Uuid,
    entry_type:   String,
    amount_minor: i64,
    currency:     String,
    created_at:   DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct BalanceRow {
    net_minor: i64,
    currency:  String,
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

pub struct PostgresLedgerRepository {
    pool: PgPool,
}

impl PostgresLedgerRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }
}

impl LedgerEngine for PostgresLedgerRepository {
    async fn create_account(&self, account: Account) -> Result<Account, LedgerError> {
        sqlx::query(
            "INSERT INTO ledger_accounts (id, account_type, name, currency, created_at)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(account.id.as_uuid())
        .bind(account.account_type.as_str())
        .bind(&account.name)
        .bind(account.currency.code())
        .bind(account.created_at)
        .execute(&self.pool)
        .await?;

        tracing::info!(account_id = %account.id, account_type = account.account_type.as_str(), "ledger account created");
        Ok(account)
    }

    async fn post(&self, posting: LedgerPosting) -> Result<LedgerPosting, LedgerError> {
        // Re-validate balance invariant — PostingBuilder already checked this,
        // but we verify again before any DB write to prevent bypass.
        posting.assert_balanced()?;

        let mut tx = self.pool.begin().await?;

        let insert_result = sqlx::query(
            "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(posting.id.as_uuid())
        .bind(&posting.description)
        .bind(&posting.idempotency_key)
        .bind(posting.created_at)
        .execute(&mut *tx)
        .await;

        match insert_result {
            Err(sqlx::Error::Database(ref db_err))
                if db_err.constraint() == Some("ledger_postings_idempotency_key_unique") =>
            {
                // Idempotent re-post: return the existing posting unchanged.
                tx.rollback().await?;
                tracing::info!(idempotency_key = %posting.idempotency_key, "duplicate post — returning existing posting");
                return Ok(posting);
            }
            Err(e) => {
                tx.rollback().await.ok();
                return Err(LedgerError::Database(e));
            }
            Ok(_) => {}
        }

        for entry in &posting.entries {
            sqlx::query(
                "INSERT INTO ledger_entries
                 (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)",
            )
            .bind(entry.id.as_uuid())
            .bind(entry.posting_id.as_uuid())
            .bind(entry.account_id.as_uuid())
            .bind(entry.entry_type.as_str())
            .bind(entry.amount.amount_minor())
            .bind(entry.amount.currency.code())
            .bind(entry.created_at)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;

        tracing::info!(
            posting_id = %posting.id,
            entry_count = posting.entries.len(),
            idempotency_key = %posting.idempotency_key,
            "ledger posting committed"
        );

        Ok(posting)
    }

    async fn balance(&self, account_id: AccountId) -> Result<Money, LedgerError> {
        // Balance is derived from ledger entries — never stored directly.
        // The COALESCE handles accounts with zero entries (LEFT JOIN → all nulls).
        // SUM(BIGINT) returns NUMERIC in PostgreSQL; the ::BIGINT cast keeps it as i64.
        let row = sqlx::query_as::<_, BalanceRow>(
            "SELECT
                 a.currency,
                 COALESCE(
                     SUM(
                         CASE WHEN e.entry_type = 'DEBIT'
                             THEN  e.amount_minor
                             ELSE -e.amount_minor
                         END
                     )::BIGINT,
                     0::BIGINT
                 ) AS net_minor
             FROM ledger_accounts a
             LEFT JOIN ledger_entries e ON e.account_id = a.id
             WHERE a.id = $1
             GROUP BY a.id, a.currency",
        )
        .bind(account_id.as_uuid())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(LedgerError::AccountNotFound(account_id))?;

        let currency = Currency::from_code(&row.currency)
            .ok_or_else(|| LedgerError::UnknownCurrency(row.currency.clone()))?;

        Ok(Money::new(row.net_minor, currency))
    }

    async fn entries_for_account(
        &self,
        account_id: AccountId,
    ) -> Result<Vec<LedgerEntry>, LedgerError> {
        let rows = sqlx::query_as::<_, EntryRow>(
            "SELECT id, posting_id, account_id, entry_type, amount_minor, currency, created_at
             FROM ledger_entries
             WHERE account_id = $1
             ORDER BY created_at ASC",
        )
        .bind(account_id.as_uuid())
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(entry_from_row).collect()
    }
}

// ---------------------------------------------------------------------------
// Row → domain type converters
// ---------------------------------------------------------------------------

fn entry_from_row(row: EntryRow) -> Result<LedgerEntry, LedgerError> {
    let entry_type = EntryType::try_from_str(&row.entry_type)
        .ok_or_else(|| LedgerError::UnknownEntryType(row.entry_type.clone()))?;
    let currency = Currency::from_code(&row.currency)
        .ok_or_else(|| LedgerError::UnknownCurrency(row.currency.clone()))?;

    Ok(LedgerEntry {
        id: LedgerEntryId::from_uuid(row.id),
        posting_id: LedgerPostingId::from_uuid(row.posting_id),
        account_id: AccountId::from_uuid(row.account_id),
        entry_type,
        amount: Money::new(row.amount_minor, currency),
        created_at: row.created_at,
    })
}
