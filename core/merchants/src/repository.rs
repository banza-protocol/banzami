use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::{ApiKeyId, MerchantId};

use crate::{
    api_key::{ApiKey, ApiKeyEnvironment},
    merchant::{Merchant, MerchantStatus},
    MerchantError,
};

// ---------------------------------------------------------------------------
// Traits
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait MerchantRepository: Send + Sync {
    async fn create(&self, merchant: Merchant) -> Result<Merchant, MerchantError>;
    async fn get(&self, id: MerchantId) -> Result<Merchant, MerchantError>;
    async fn get_by_email(&self, email: &str) -> Result<Option<Merchant>, MerchantError>;
    async fn list(&self, search: Option<&str>) -> Result<Vec<Merchant>, MerchantError>;
    async fn update_status(
        &self,
        id: MerchantId,
        status: MerchantStatus,
    ) -> Result<Merchant, MerchantError>;

    async fn set_verified(
        &self,
        id:       MerchantId,
        verified: bool,
    ) -> Result<Merchant, MerchantError>;

    async fn delete(&self, id: MerchantId) -> Result<(), MerchantError>;
}

#[allow(async_fn_in_trait)]
pub trait ApiKeyRepository: Send + Sync {
    async fn create(&self, key: ApiKey) -> Result<ApiKey, MerchantError>;
    async fn list_for_merchant(&self, merchant_id: MerchantId) -> Result<Vec<ApiKey>, MerchantError>;
    async fn get(&self, id: ApiKeyId) -> Result<ApiKey, MerchantError>;
    async fn find_by_hash(&self, key_hash: &str) -> Result<Option<ApiKey>, MerchantError>;
    async fn revoke(&self, id: ApiKeyId) -> Result<ApiKey, MerchantError>;
    async fn record_usage(&self, id: ApiKeyId) -> Result<(), MerchantError>;
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct MerchantRow {
    id:         Uuid,
    name:       String,
    email:      String,
    status:     String,
    verified:   bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct ApiKeyRow {
    id:           Uuid,
    merchant_id:  Uuid,
    name:         String,
    key_prefix:   String,
    key_hash:     String,
    environment:  String,
    created_at:   DateTime<Utc>,
    last_used_at: Option<DateTime<Utc>>,
    revoked_at:   Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// PostgreSQL implementations
// ---------------------------------------------------------------------------

pub struct PostgresMerchantRepository {
    pool: PgPool,
}

impl PostgresMerchantRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

pub struct PostgresApiKeyRepository {
    pool: PgPool,
}

impl PostgresApiKeyRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

const MERCHANT_SELECT: &str =
    "SELECT id, name, email, status, verified, created_at, updated_at FROM merchants";

const API_KEY_SELECT: &str =
    "SELECT id, merchant_id, name, key_prefix, key_hash, environment, created_at, last_used_at, revoked_at
     FROM api_keys";

impl MerchantRepository for PostgresMerchantRepository {
    async fn create(&self, m: Merchant) -> Result<Merchant, MerchantError> {
        let result = sqlx::query(
            "INSERT INTO merchants (id, name, email, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(m.id.as_uuid())
        .bind(&m.name)
        .bind(&m.email)
        .bind(m.status.as_str())
        .bind(m.created_at)
        .bind(m.updated_at)
        .execute(&self.pool)
        .await;

        match result {
            Err(sqlx::Error::Database(ref e))
                if e.constraint() == Some("merchants_email_key") =>
            {
                return Err(MerchantError::DuplicateEmail(m.email.clone()));
            }
            Err(e) => return Err(MerchantError::Database(e)),
            Ok(_) => {}
        }

        tracing::info!(merchant_id = %m.id, email = %m.email, "merchant created");
        Ok(m)
    }

    async fn get(&self, id: MerchantId) -> Result<Merchant, MerchantError> {
        let row = sqlx::query_as::<_, MerchantRow>(&format!("{MERCHANT_SELECT} WHERE id = $1"))
            .bind(id.as_uuid())
            .fetch_optional(&self.pool)
            .await
            .map_err(MerchantError::Database)?
            .ok_or(MerchantError::NotFound(id))?;

        merchant_from_row(row)
    }

    async fn get_by_email(&self, email: &str) -> Result<Option<Merchant>, MerchantError> {
        let row = sqlx::query_as::<_, MerchantRow>(&format!("{MERCHANT_SELECT} WHERE email = $1"))
            .bind(email)
            .fetch_optional(&self.pool)
            .await
            .map_err(MerchantError::Database)?;

        row.map(merchant_from_row).transpose()
    }

    async fn list(&self, search: Option<&str>) -> Result<Vec<Merchant>, MerchantError> {
        let rows = if let Some(q) = search {
            let pattern = format!("%{}%", q.to_lowercase());
            sqlx::query_as::<_, MerchantRow>(&format!(
                "{MERCHANT_SELECT} WHERE lower(name) LIKE $1 OR lower(email) LIKE $1 ORDER BY created_at DESC"
            ))
            .bind(pattern)
            .fetch_all(&self.pool)
            .await
        } else {
            sqlx::query_as::<_, MerchantRow>(&format!("{MERCHANT_SELECT} ORDER BY created_at DESC"))
                .fetch_all(&self.pool)
                .await
        }
        .map_err(MerchantError::Database)?;

        rows.into_iter().map(merchant_from_row).collect()
    }

    async fn update_status(
        &self,
        id: MerchantId,
        status: MerchantStatus,
    ) -> Result<Merchant, MerchantError> {
        let now = chrono::Utc::now();
        sqlx::query(
            "UPDATE merchants SET status = $1, updated_at = $2 WHERE id = $3",
        )
        .bind(status.as_str())
        .bind(now)
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(MerchantError::Database)?;

        self.get(id).await
    }

    async fn set_verified(
        &self,
        id:       MerchantId,
        verified: bool,
    ) -> Result<Merchant, MerchantError> {
        let now = chrono::Utc::now();
        sqlx::query(
            "UPDATE merchants SET verified = $1, updated_at = $2 WHERE id = $3",
        )
        .bind(verified)
        .bind(now)
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(MerchantError::Database)?;

        self.get(id).await
    }

    async fn delete(&self, id: MerchantId) -> Result<(), MerchantError> {
        let mut tx = self.pool.begin().await.map_err(MerchantError::Database)?;

        // Verify the merchant exists before cascading deletes.
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM merchants WHERE id = $1)")
            .bind(id.as_uuid())
            .fetch_one(&mut *tx)
            .await
            .map_err(MerchantError::Database)?;

        if !exists {
            return Err(MerchantError::NotFound(id));
        }

        // Delete child records in dependency order.
        sqlx::query("DELETE FROM api_keys WHERE merchant_id = $1")
            .bind(id.as_uuid())
            .execute(&mut *tx)
            .await
            .map_err(MerchantError::Database)?;

        sqlx::query("DELETE FROM merchant_compliance WHERE merchant_id = $1")
            .bind(id.as_uuid())
            .execute(&mut *tx)
            .await
            .map_err(MerchantError::Database)?;

        sqlx::query("DELETE FROM merchants WHERE id = $1")
            .bind(id.as_uuid())
            .execute(&mut *tx)
            .await
            .map_err(MerchantError::Database)?;

        tx.commit().await.map_err(MerchantError::Database)?;

        tracing::info!(merchant_id = %id, "merchant deleted");
        Ok(())
    }
}

impl ApiKeyRepository for PostgresApiKeyRepository {
    async fn create(&self, k: ApiKey) -> Result<ApiKey, MerchantError> {
        sqlx::query(
            "INSERT INTO api_keys
             (id, merchant_id, name, key_prefix, key_hash, environment, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(k.id.as_uuid())
        .bind(k.merchant_id.as_uuid())
        .bind(&k.name)
        .bind(&k.key_prefix)
        .bind(&k.key_hash)
        .bind(k.environment.as_str())
        .bind(k.created_at)
        .execute(&self.pool)
        .await
        .map_err(MerchantError::Database)?;

        tracing::info!(
            key_id      = %k.id,
            merchant_id = %k.merchant_id,
            prefix      = %k.key_prefix,
            environment = %k.environment.as_str(),
            "API key created"
        );
        Ok(k)
    }

    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
    ) -> Result<Vec<ApiKey>, MerchantError> {
        let rows = sqlx::query_as::<_, ApiKeyRow>(&format!(
            "{API_KEY_SELECT} WHERE merchant_id = $1 ORDER BY created_at DESC"
        ))
        .bind(merchant_id.as_uuid())
        .fetch_all(&self.pool)
        .await
        .map_err(MerchantError::Database)?;

        rows.into_iter().map(api_key_from_row).collect()
    }

    async fn get(&self, id: ApiKeyId) -> Result<ApiKey, MerchantError> {
        let row = sqlx::query_as::<_, ApiKeyRow>(&format!("{API_KEY_SELECT} WHERE id = $1"))
            .bind(id.as_uuid())
            .fetch_optional(&self.pool)
            .await
            .map_err(MerchantError::Database)?
            .ok_or(MerchantError::ApiKeyNotFound(id))?;

        api_key_from_row(row)
    }

    async fn find_by_hash(&self, key_hash: &str) -> Result<Option<ApiKey>, MerchantError> {
        let row = sqlx::query_as::<_, ApiKeyRow>(&format!(
            "{API_KEY_SELECT} WHERE key_hash = $1"
        ))
        .bind(key_hash)
        .fetch_optional(&self.pool)
        .await
        .map_err(MerchantError::Database)?;

        row.map(api_key_from_row).transpose()
    }

    async fn revoke(&self, id: ApiKeyId) -> Result<ApiKey, MerchantError> {
        let now = chrono::Utc::now();
        let affected = sqlx::query(
            "UPDATE api_keys SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL",
        )
        .bind(now)
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(MerchantError::Database)?
        .rows_affected();

        if affected == 0 {
            return Err(MerchantError::ApiKeyNotFound(id));
        }

        self.get(id).await
    }

    async fn record_usage(&self, id: ApiKeyId) -> Result<(), MerchantError> {
        sqlx::query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1")
            .bind(id.as_uuid())
            .execute(&self.pool)
            .await
            .map_err(MerchantError::Database)?;

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Row → domain
// ---------------------------------------------------------------------------

fn merchant_from_row(row: MerchantRow) -> Result<Merchant, MerchantError> {
    let status = MerchantStatus::try_from_str(&row.status)
        .ok_or_else(|| MerchantError::UnknownStatus(row.status.clone()))?;

    Ok(Merchant {
        id:         MerchantId::from_uuid(row.id),
        name:       row.name,
        email:      row.email,
        status,
        verified:   row.verified,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn api_key_from_row(row: ApiKeyRow) -> Result<ApiKey, MerchantError> {
    let environment = match row.environment.as_str() {
        "SANDBOX" => ApiKeyEnvironment::Sandbox,
        _         => ApiKeyEnvironment::Live,
    };
    Ok(ApiKey {
        id:           ApiKeyId::from_uuid(row.id),
        merchant_id:  MerchantId::from_uuid(row.merchant_id),
        name:         row.name,
        key_prefix:   row.key_prefix,
        environment,
        key_hash:     row.key_hash,
        created_at:   row.created_at,
        last_used_at: row.last_used_at,
        revoked_at:   row.revoked_at,
    })
}
