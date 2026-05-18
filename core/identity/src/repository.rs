use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::ConsumerId;

use crate::{ConsumerIdentity, ConsumerStatus, IdentityError, VerificationBadge};

#[allow(async_fn_in_trait)]
pub trait IdentityRepository: Send + Sync {
    async fn create(&self, identity: ConsumerIdentity) -> Result<ConsumerIdentity, IdentityError>;
    async fn get(&self, id: ConsumerId) -> Result<ConsumerIdentity, IdentityError>;
    async fn get_by_handle(&self, handle: &str) -> Result<ConsumerIdentity, IdentityError>;
    async fn update_status(
        &self,
        id:     ConsumerId,
        status: ConsumerStatus,
    ) -> Result<ConsumerIdentity, IdentityError>;
    async fn suspend_with_notes(
        &self,
        id:    ConsumerId,
        notes: Option<String>,
    ) -> Result<ConsumerIdentity, IdentityError>;
    async fn set_badge(
        &self,
        id:    ConsumerId,
        badge: Option<VerificationBadge>,
    ) -> Result<ConsumerIdentity, IdentityError>;
}

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct IdentityRow {
    id:                 Uuid,
    handle:             String,
    display_name:       Option<String>,
    status:             String,
    verification_badge: Option<String>,
    suspension_notes:   Option<String>,
    created_at:         DateTime<Utc>,
    updated_at:         DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

pub struct PostgresIdentityRepository {
    pool: PgPool,
}

impl PostgresIdentityRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

const SELECT: &str =
    "SELECT id, handle, display_name, status, verification_badge, suspension_notes, created_at, updated_at
     FROM consumers";

impl IdentityRepository for PostgresIdentityRepository {
    async fn create(&self, identity: ConsumerIdentity) -> Result<ConsumerIdentity, IdentityError> {
        let result = sqlx::query(
            "INSERT INTO consumers
             (id, handle, display_name, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(identity.id.as_uuid())
        .bind(&identity.handle)
        .bind(&identity.display_name)
        .bind(identity.status.as_str())
        .bind(identity.created_at)
        .bind(identity.updated_at)
        .execute(&self.pool)
        .await;

        match result {
            Err(sqlx::Error::Database(ref db_err))
                if db_err.constraint() == Some("consumers_handle_key") =>
            {
                return Err(IdentityError::HandleTaken(identity.handle));
            }
            Err(e) => return Err(IdentityError::Database(e)),
            Ok(_) => {}
        }

        tracing::info!(
            consumer_id = %identity.id,
            handle      = %identity.handle,
            "consumer identity created"
        );
        Ok(identity)
    }

    async fn get(&self, id: ConsumerId) -> Result<ConsumerIdentity, IdentityError> {
        let row = sqlx::query_as::<_, IdentityRow>(&format!("{SELECT} WHERE id = $1"))
            .bind(id.as_uuid())
            .fetch_optional(&self.pool)
            .await
            .map_err(IdentityError::Database)?
            .ok_or(IdentityError::NotFound(id))?;

        identity_from_row(row)
    }

    async fn get_by_handle(&self, handle: &str) -> Result<ConsumerIdentity, IdentityError> {
        let row = sqlx::query_as::<_, IdentityRow>(&format!("{SELECT} WHERE handle = $1"))
            .bind(handle)
            .fetch_optional(&self.pool)
            .await
            .map_err(IdentityError::Database)?
            .ok_or_else(|| IdentityError::HandleNotFound(handle.to_string()))?;

        identity_from_row(row)
    }

    async fn update_status(
        &self,
        id:     ConsumerId,
        status: ConsumerStatus,
    ) -> Result<ConsumerIdentity, IdentityError> {
        let now = Utc::now();
        sqlx::query(
            "UPDATE consumers SET status = $1, updated_at = $2 WHERE id = $3",
        )
        .bind(status.as_str())
        .bind(now)
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(IdentityError::Database)?;

        self.get(id).await
    }

    async fn suspend_with_notes(
        &self,
        id:    ConsumerId,
        notes: Option<String>,
    ) -> Result<ConsumerIdentity, IdentityError> {
        let now = Utc::now();
        sqlx::query(
            "UPDATE consumers SET status = 'SUSPENDED', suspension_notes = $1, updated_at = $2 WHERE id = $3",
        )
        .bind(&notes)
        .bind(now)
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(IdentityError::Database)?;

        self.get(id).await
    }

    async fn set_badge(
        &self,
        id:    ConsumerId,
        badge: Option<VerificationBadge>,
    ) -> Result<ConsumerIdentity, IdentityError> {
        let now = Utc::now();
        sqlx::query(
            "UPDATE consumers SET verification_badge = $1, updated_at = $2 WHERE id = $3",
        )
        .bind(badge.map(|b| b.as_str()))
        .bind(now)
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(IdentityError::Database)?;

        self.get(id).await
    }
}

// ---------------------------------------------------------------------------
// Row → domain
// ---------------------------------------------------------------------------

fn identity_from_row(row: IdentityRow) -> Result<ConsumerIdentity, IdentityError> {
    let status = ConsumerStatus::try_from_str(&row.status)
        .ok_or_else(|| IdentityError::UnknownStatus(row.status))?;

    let verification_badge = row.verification_badge
        .as_deref()
        .and_then(VerificationBadge::try_from_str);

    Ok(ConsumerIdentity {
        id:                 ConsumerId::from_uuid(row.id),
        handle:             row.handle,
        display_name:       row.display_name,
        status,
        verification_badge,
        suspension_notes:   row.suspension_notes,
        created_at:         row.created_at,
        updated_at:         row.updated_at,
    })
}
