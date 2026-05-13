use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::{AccountId, Currency, MerchantId, WalletId};

use crate::{Wallet, WalletError, WalletStatus};

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait WalletRepository: Send + Sync {
    async fn create(&self, wallet: Wallet) -> Result<Wallet, WalletError>;
    async fn get(&self, id: WalletId) -> Result<Wallet, WalletError>;
    async fn get_for_merchant(
        &self,
        merchant_id: MerchantId,
        currency: Currency,
    ) -> Result<Wallet, WalletError>;
}

// ---------------------------------------------------------------------------
// Row type — deserialised from PostgreSQL
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct WalletRow {
    id:                   Uuid,
    merchant_id:          Uuid,
    currency:             String,
    status:               String,
    available_account_id: Uuid,
    reserved_account_id:  Uuid,
    created_at:           DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

pub struct PostgresWalletRepository {
    pool: PgPool,
}

impl PostgresWalletRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl WalletRepository for PostgresWalletRepository {
    async fn create(&self, wallet: Wallet) -> Result<Wallet, WalletError> {
        sqlx::query(
            "INSERT INTO wallets
             (id, merchant_id, currency, status, available_account_id, reserved_account_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(wallet.id.as_uuid())
        .bind(wallet.merchant_id.as_uuid())
        .bind(wallet.currency.code())
        .bind(wallet.status.as_str())
        .bind(wallet.available_account_id.as_uuid())
        .bind(wallet.reserved_account_id.as_uuid())
        .bind(wallet.created_at)
        .execute(&self.pool)
        .await
        .map_err(WalletError::Database)?;

        tracing::info!(wallet_id = %wallet.id, merchant_id = %wallet.merchant_id, "wallet created");
        Ok(wallet)
    }

    async fn get(&self, id: WalletId) -> Result<Wallet, WalletError> {
        let row = sqlx::query_as::<_, WalletRow>(
            "SELECT id, merchant_id, currency, status,
                    available_account_id, reserved_account_id, created_at
             FROM wallets WHERE id = $1",
        )
        .bind(id.as_uuid())
        .fetch_optional(&self.pool)
        .await
        .map_err(WalletError::Database)?
        .ok_or(WalletError::NotFound(id))?;

        wallet_from_row(row)
    }

    async fn get_for_merchant(
        &self,
        merchant_id: MerchantId,
        currency: Currency,
    ) -> Result<Wallet, WalletError> {
        let row = sqlx::query_as::<_, WalletRow>(
            "SELECT id, merchant_id, currency, status,
                    available_account_id, reserved_account_id, created_at
             FROM wallets WHERE merchant_id = $1 AND currency = $2",
        )
        .bind(merchant_id.as_uuid())
        .bind(currency.code())
        .fetch_optional(&self.pool)
        .await
        .map_err(WalletError::Database)?
        .ok_or(WalletError::NoWalletForMerchant { merchant_id, currency })?;

        wallet_from_row(row)
    }
}

// ---------------------------------------------------------------------------
// Row → domain type
// ---------------------------------------------------------------------------

fn wallet_from_row(row: WalletRow) -> Result<Wallet, WalletError> {
    let currency = Currency::from_code(&row.currency)
        .ok_or_else(|| WalletError::UnknownCurrency(row.currency.clone()))?;
    let status = WalletStatus::try_from_str(&row.status)
        .ok_or_else(|| WalletError::UnknownStatus(row.status.clone()))?;

    Ok(Wallet {
        id:                   WalletId::from_uuid(row.id),
        merchant_id:          MerchantId::from_uuid(row.merchant_id),
        currency,
        status,
        available_account_id: AccountId::from_uuid(row.available_account_id),
        reserved_account_id:  AccountId::from_uuid(row.reserved_account_id),
        created_at:           row.created_at,
    })
}
