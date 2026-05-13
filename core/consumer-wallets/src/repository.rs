use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::{ConsumerId, ConsumerWalletId, Currency};

use crate::{ConsumerWallet, ConsumerWalletError, ConsumerWalletStatus};

#[allow(async_fn_in_trait)]
pub trait ConsumerWalletRepository: Send + Sync {
    async fn create(&self, wallet: ConsumerWallet)
        -> Result<ConsumerWallet, ConsumerWalletError>;
    async fn get(&self, id: ConsumerWalletId)
        -> Result<ConsumerWallet, ConsumerWalletError>;
    async fn get_for_consumer(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError>;
    async fn find_for_consumer(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<Option<ConsumerWallet>, ConsumerWalletError>;
}

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct WalletRow {
    id:                   Uuid,
    consumer_id:          Uuid,
    currency:             String,
    status:               String,
    available_account_id: Uuid,
    reserved_account_id:  Uuid,
    created_at:           DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

pub struct PostgresConsumerWalletRepository {
    pool: PgPool,
}

impl PostgresConsumerWalletRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

const SELECT: &str =
    "SELECT id, consumer_id, currency, status, available_account_id, reserved_account_id,
            created_at
     FROM consumer_wallets";

impl ConsumerWalletRepository for PostgresConsumerWalletRepository {
    async fn create(
        &self,
        wallet: ConsumerWallet,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        sqlx::query(
            "INSERT INTO consumer_wallets
             (id, consumer_id, currency, status, available_account_id, reserved_account_id,
              created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(wallet.id.as_uuid())
        .bind(wallet.consumer_id.as_uuid())
        .bind(wallet.currency.code())
        .bind(wallet.status.as_str())
        .bind(wallet.available_account_id.as_uuid())
        .bind(wallet.reserved_account_id.as_uuid())
        .bind(wallet.created_at)
        .execute(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?;

        tracing::info!(
            wallet_id   = %wallet.id,
            consumer_id = %wallet.consumer_id,
            currency    = %wallet.currency.code(),
            "consumer wallet created"
        );
        Ok(wallet)
    }

    async fn get(
        &self,
        id: ConsumerWalletId,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        let row = sqlx::query_as::<_, WalletRow>(&format!("{SELECT} WHERE id = $1"))
            .bind(id.as_uuid())
            .fetch_optional(&self.pool)
            .await
            .map_err(ConsumerWalletError::Database)?
            .ok_or(ConsumerWalletError::NotFound(id))?;

        wallet_from_row(row)
    }

    async fn get_for_consumer(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        self.find_for_consumer(consumer_id, currency)
            .await?
            .ok_or(ConsumerWalletError::NoWalletForConsumer { consumer_id, currency })
    }

    async fn find_for_consumer(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<Option<ConsumerWallet>, ConsumerWalletError> {
        let row = sqlx::query_as::<_, WalletRow>(&format!(
            "{SELECT} WHERE consumer_id = $1 AND currency = $2 AND status != 'CLOSED' LIMIT 1"
        ))
        .bind(consumer_id.as_uuid())
        .bind(currency.code())
        .fetch_optional(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?;

        row.map(wallet_from_row).transpose()
    }
}

// ---------------------------------------------------------------------------
// Row → domain
// ---------------------------------------------------------------------------

fn wallet_from_row(row: WalletRow) -> Result<ConsumerWallet, ConsumerWalletError> {
    use banzami_types::{AccountId, ConsumerWalletId};

    let currency = banzami_types::Currency::from_code(&row.currency)
        .ok_or_else(|| ConsumerWalletError::UnknownCurrency(row.currency))?;
    let status = ConsumerWalletStatus::try_from_str(&row.status)
        .ok_or_else(|| ConsumerWalletError::UnknownStatus(row.status))?;

    Ok(ConsumerWallet {
        id:                   ConsumerWalletId::from_uuid(row.id),
        consumer_id:          ConsumerId::from_uuid(row.consumer_id),
        currency,
        status,
        available_account_id: AccountId::from_uuid(row.available_account_id),
        reserved_account_id:  AccountId::from_uuid(row.reserved_account_id),
        created_at:           row.created_at,
    })
}
