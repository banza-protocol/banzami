use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::{AccountId, ConsumerId, ConsumerWalletId, Currency};

use crate::{ConsumerWallet, ConsumerWalletError, ConsumerWalletStatus, KycStatus};

#[allow(async_fn_in_trait)]
pub trait ConsumerWalletRepository: Send + Sync {
    async fn create(&self, wallet: ConsumerWallet)
        -> Result<ConsumerWallet, ConsumerWalletError>;
    async fn update(&self, wallet: ConsumerWallet)
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
    async fn find_by_handle(
        &self,
        handle: &str,
    ) -> Result<Option<ConsumerWallet>, ConsumerWalletError>;
}

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct WalletRow {
    id:                   Uuid,
    consumer_id:          Uuid,
    phone_number:         String,
    banza_handle:         Option<String>,
    currency:             String,
    status:               String,
    available_account_id: Option<Uuid>,
    reserved_account_id:  Option<Uuid>,
    kyc_status:           String,
    pin_hash:             Option<String>,
    failed_pin_attempts:  i32,
    locked_at:            Option<DateTime<Utc>>,
    created_at:           DateTime<Utc>,
    updated_at:           DateTime<Utc>,
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
    "SELECT id, consumer_id, phone_number, banza_handle, currency, status,
            available_account_id, reserved_account_id,
            kyc_status, pin_hash, failed_pin_attempts, locked_at,
            created_at, updated_at
     FROM consumer_wallets";

impl ConsumerWalletRepository for PostgresConsumerWalletRepository {
    async fn create(
        &self,
        wallet: ConsumerWallet,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        sqlx::query(
            "INSERT INTO consumer_wallets
             (id, consumer_id, phone_number, banza_handle, currency, status,
              available_account_id, reserved_account_id,
              kyc_status, pin_hash, failed_pin_attempts, locked_at,
              created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
        )
        .bind(wallet.id.as_uuid())
        .bind(wallet.consumer_id.as_uuid())
        .bind(&wallet.phone_number)
        .bind(&wallet.banza_handle)
        .bind(wallet.currency.code())
        .bind(wallet.status.as_str())
        .bind(wallet.available_account_id.map(|a| a.as_uuid()))
        .bind(wallet.reserved_account_id.map(|a| a.as_uuid()))
        .bind(wallet.kyc_status.as_str())
        .bind(&wallet.pin_hash)
        .bind(wallet.failed_pin_attempts)
        .bind(wallet.locked_at)
        .bind(wallet.created_at)
        .bind(wallet.updated_at)
        .execute(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?;

        tracing::info!(
            wallet_id    = %wallet.id,
            consumer_id  = %wallet.consumer_id,
            currency     = %wallet.currency.code(),
            status       = wallet.status.as_str(),
            "consumer wallet created"
        );
        Ok(wallet)
    }

    async fn update(
        &self,
        wallet: ConsumerWallet,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        let rows = sqlx::query(
            "UPDATE consumer_wallets
             SET banza_handle         = $2,
                 status               = $3,
                 available_account_id = $4,
                 reserved_account_id  = $5,
                 kyc_status           = $6,
                 pin_hash             = $7,
                 failed_pin_attempts  = $8,
                 locked_at            = $9,
                 updated_at           = $10
             WHERE id = $1",
        )
        .bind(wallet.id.as_uuid())
        .bind(&wallet.banza_handle)
        .bind(wallet.status.as_str())
        .bind(wallet.available_account_id.map(|a| a.as_uuid()))
        .bind(wallet.reserved_account_id.map(|a| a.as_uuid()))
        .bind(wallet.kyc_status.as_str())
        .bind(&wallet.pin_hash)
        .bind(wallet.failed_pin_attempts)
        .bind(wallet.locked_at)
        .bind(wallet.updated_at)
        .execute(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?
        .rows_affected();

        if rows == 0 {
            return Err(ConsumerWalletError::NotFound(wallet.id));
        }
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

    async fn find_by_handle(
        &self,
        handle: &str,
    ) -> Result<Option<ConsumerWallet>, ConsumerWalletError> {
        let row = sqlx::query_as::<_, WalletRow>(&format!(
            "{SELECT} WHERE banza_handle = $1 LIMIT 1"
        ))
        .bind(handle)
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
    let currency = Currency::from_code(&row.currency)
        .ok_or_else(|| ConsumerWalletError::UnknownCurrency(row.currency.clone()))?;
    let status = ConsumerWalletStatus::try_from_str(&row.status)
        .ok_or_else(|| ConsumerWalletError::UnknownStatus(row.status.clone()))?;
    let kyc_status = KycStatus::try_from_str(&row.kyc_status)
        .ok_or_else(|| ConsumerWalletError::UnknownKycStatus(row.kyc_status))?;

    Ok(ConsumerWallet {
        id:                   ConsumerWalletId::from_uuid(row.id),
        consumer_id:          ConsumerId::from_uuid(row.consumer_id),
        phone_number:         row.phone_number,
        banza_handle:         row.banza_handle,
        currency,
        status,
        available_account_id: row.available_account_id.map(AccountId::from_uuid),
        reserved_account_id:  row.reserved_account_id.map(AccountId::from_uuid),
        kyc_status,
        pin_hash:             row.pin_hash,
        failed_pin_attempts:  row.failed_pin_attempts,
        locked_at:            row.locked_at,
        created_at:           row.created_at,
        updated_at:           row.updated_at,
    })
}
