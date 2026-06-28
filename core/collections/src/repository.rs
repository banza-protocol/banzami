//! PostgreSQL persistence for Collections, CollectionShares and PaymentIntents.
//! Runtime sqlx queries (no compile-time macro / offline cache), mirroring the
//! payment-links repository. Every read/mutate is scoped by merchant + environment
//! at the engine layer; the repository exposes scoped finders.

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::{
    CollectionId, CollectionShareId, MerchantId, PaymentIntentId, TransferId, WalletId,
};

use crate::domain::{
    Collection, CollectionShare, CollectionStatus, IntentStatus, PaymentIntent, ShareStatus,
    Surface,
};
use crate::CollectionError;

#[allow(async_fn_in_trait)]
pub trait CollectionRepository: Send + Sync {
    // collections
    async fn insert_collection(&self, c: &Collection) -> Result<(), CollectionError>;
    async fn find_collection(
        &self,
        id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Option<Collection>, CollectionError>;
    async fn list_collections(
        &self,
        merchant_id: MerchantId,
        environment: &str,
        limit: i64,
        cursor: Option<CollectionId>,
    ) -> Result<Vec<Collection>, CollectionError>;
    async fn update_collection_mutable(
        &self,
        id: CollectionId,
        title: Option<String>,
        description: Option<String>,
        expires_at: Option<DateTime<Utc>>,
        metadata: serde_json::Value,
    ) -> Result<Collection, CollectionError>;
    async fn update_collection_status(
        &self,
        id: CollectionId,
        status: CollectionStatus,
        closed_at: Option<DateTime<Utc>>,
    ) -> Result<Collection, CollectionError>;

    // shares
    async fn insert_share(&self, s: &CollectionShare) -> Result<(), CollectionError>;
    async fn find_share(
        &self,
        id: CollectionShareId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Option<CollectionShare>, CollectionError>;
    async fn list_shares(
        &self,
        collection_id: CollectionId,
        limit: i64,
        cursor: Option<CollectionShareId>,
    ) -> Result<Vec<CollectionShare>, CollectionError>;
    async fn set_share_intent(
        &self,
        id: CollectionShareId,
        payment_intent_id: PaymentIntentId,
        status: ShareStatus,
    ) -> Result<CollectionShare, CollectionError>;
    /// Sum of PAID shares for a collection (derived collected_amount_minor).
    async fn collected_amount(&self, collection_id: CollectionId)
        -> Result<i64, CollectionError>;

    // payment intents
    async fn insert_payment_intent(&self, p: &PaymentIntent) -> Result<(), CollectionError>;
    async fn find_payment_intent(
        &self,
        id: PaymentIntentId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Option<PaymentIntent>, CollectionError>;

    // ── settlement (Increment 2) ────────────────────────────────────────────
    /// Resolve the PaymentIntent backing a settled surface, by (surface,
    /// surface_ref). Returns None when the surface is not a collection payment.
    async fn find_intent_by_surface(
        &self,
        surface: Surface,
        surface_ref: &str,
        environment: &str,
    ) -> Result<Option<PaymentIntent>, CollectionError>;
    /// Mark an intent PAID conditionally (WHERE status != PAID). Returns true iff
    /// this call performed the transition — the basis of idempotency.
    async fn mark_intent_paid(
        &self,
        id: PaymentIntentId,
        transfer_id: TransferId,
    ) -> Result<bool, CollectionError>;
    async fn find_share_by_intent(
        &self,
        intent_id: PaymentIntentId,
    ) -> Result<Option<CollectionShare>, CollectionError>;
    /// Mark a share PAID conditionally (WHERE status != PAID). Returns true iff
    /// this call performed the transition (no double payment).
    async fn mark_share_paid(
        &self,
        id: CollectionShareId,
        transfer_id: TransferId,
    ) -> Result<bool, CollectionError>;
    /// (total_shares, paid_shares) for a collection — for the roll-up.
    async fn share_counts(
        &self,
        collection_id: CollectionId,
    ) -> Result<(i64, i64), CollectionError>;
    /// Unscoped collection lookup (settlement resolves scope via the intent).
    async fn find_collection_unscoped(
        &self,
        id: CollectionId,
    ) -> Result<Option<Collection>, CollectionError>;
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct CollectionRow {
    id: Uuid,
    operator_id: String,
    creator: String,
    owner: String,
    merchant_id: Uuid,
    wallet_id: Uuid,
    title: Option<String>,
    description: Option<String>,
    currency: String,
    total_amount_minor: i64,
    status: String,
    rule: serde_json::Value,
    environment: String,
    expires_at: Option<DateTime<Utc>>,
    closed_at: Option<DateTime<Utc>>,
    metadata: serde_json::Value,
    version: i32,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl CollectionRow {
    fn into_domain(self) -> Result<Collection, CollectionError> {
        let rule = serde_json::from_value(self.rule)
            .map_err(|e| CollectionError::InvalidRule(e.to_string()))?;
        Ok(Collection {
            id: CollectionId::from_uuid(self.id),
            operator_id: self.operator_id,
            creator: self.creator,
            owner: self.owner,
            merchant_id: MerchantId::from_uuid(self.merchant_id),
            wallet_id: WalletId::from_uuid(self.wallet_id),
            title: self.title,
            description: self.description,
            currency: self.currency,
            total_amount_minor: self.total_amount_minor,
            status: CollectionStatus::try_from_str(&self.status)
                .unwrap_or(CollectionStatus::Draft),
            rule,
            environment: self.environment,
            expires_at: self.expires_at,
            closed_at: self.closed_at,
            metadata: self.metadata,
            version: self.version,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

#[derive(sqlx::FromRow)]
struct ShareRow {
    id: Uuid,
    collection_id: Uuid,
    merchant_id: Uuid,
    participant: Option<String>,
    amount_minor: i64,
    currency: String,
    status: String,
    payment_intent_id: Option<Uuid>,
    transfer_id: Option<Uuid>,
    environment: String,
    expires_at: Option<DateTime<Utc>>,
    paid_at: Option<DateTime<Utc>>,
    metadata: serde_json::Value,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl ShareRow {
    fn into_domain(self) -> CollectionShare {
        CollectionShare {
            id: CollectionShareId::from_uuid(self.id),
            collection_id: CollectionId::from_uuid(self.collection_id),
            merchant_id: MerchantId::from_uuid(self.merchant_id),
            participant: self.participant,
            amount_minor: self.amount_minor,
            currency: self.currency,
            status: ShareStatus::try_from_str(&self.status).unwrap_or(ShareStatus::Pending),
            payment_intent_id: self.payment_intent_id.map(PaymentIntentId::from_uuid),
            transfer_id: self.transfer_id.map(TransferId::from_uuid),
            environment: self.environment,
            expires_at: self.expires_at,
            paid_at: self.paid_at,
            metadata: self.metadata,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(sqlx::FromRow)]
struct IntentRow {
    id: Uuid,
    operator_id: String,
    merchant_id: Uuid,
    payee_wallet_id: Uuid,
    amount_minor: Option<i64>,
    currency: String,
    surface: String,
    surface_ref: Option<String>,
    status: String,
    transfer_id: Option<Uuid>,
    environment: String,
    expires_at: Option<DateTime<Utc>>,
    metadata: serde_json::Value,
    version: i32,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl IntentRow {
    fn into_domain(self) -> PaymentIntent {
        PaymentIntent {
            id: PaymentIntentId::from_uuid(self.id),
            operator_id: self.operator_id,
            merchant_id: MerchantId::from_uuid(self.merchant_id),
            payee_wallet_id: WalletId::from_uuid(self.payee_wallet_id),
            amount_minor: self.amount_minor,
            currency: self.currency,
            surface: Surface::try_from_str(&self.surface).unwrap_or(Surface::Link),
            surface_ref: self.surface_ref,
            status: IntentStatus::try_from_str(&self.status).unwrap_or(IntentStatus::Created),
            transfer_id: self.transfer_id.map(TransferId::from_uuid),
            environment: self.environment,
            expires_at: self.expires_at,
            metadata: self.metadata,
            version: self.version,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

const C_SELECT: &str = "SELECT id, operator_id, creator, owner, merchant_id, wallet_id, title,
            description, currency, total_amount_minor, status, rule, environment,
            expires_at, closed_at, metadata, version, created_at, updated_at
     FROM collections";

const S_SELECT: &str = "SELECT id, collection_id, merchant_id, participant, amount_minor, currency,
            status, payment_intent_id, transfer_id, environment, expires_at, paid_at,
            metadata, created_at, updated_at
     FROM collection_shares";

const I_SELECT: &str = "SELECT id, operator_id, merchant_id, payee_wallet_id, amount_minor, currency,
            surface, surface_ref, status, transfer_id, environment, expires_at,
            metadata, version, created_at, updated_at
     FROM payment_intents";

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

pub struct PostgresCollectionRepository {
    pool: PgPool,
}

impl PostgresCollectionRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl CollectionRepository for PostgresCollectionRepository {
    async fn insert_collection(&self, c: &Collection) -> Result<(), CollectionError> {
        let rule = serde_json::to_value(&c.rule)
            .map_err(|e| CollectionError::InvalidRule(e.to_string()))?;
        sqlx::query(
            "INSERT INTO collections
             (id, operator_id, creator, owner, merchant_id, wallet_id, title, description,
              currency, total_amount_minor, status, rule, environment, expires_at, metadata,
              version, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)",
        )
        .bind(c.id.as_uuid())
        .bind(&c.operator_id)
        .bind(&c.creator)
        .bind(&c.owner)
        .bind(c.merchant_id.as_uuid())
        .bind(c.wallet_id.as_uuid())
        .bind(&c.title)
        .bind(&c.description)
        .bind(&c.currency)
        .bind(c.total_amount_minor)
        .bind(c.status.as_str())
        .bind(rule)
        .bind(&c.environment)
        .bind(c.expires_at)
        .bind(&c.metadata)
        .bind(c.version)
        .bind(c.created_at)
        .bind(c.updated_at)
        .execute(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        Ok(())
    }

    async fn find_collection(
        &self,
        id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Option<Collection>, CollectionError> {
        let row = sqlx::query_as::<_, CollectionRow>(&format!(
            "{C_SELECT} WHERE id = $1 AND merchant_id = $2 AND environment = $3"
        ))
        .bind(id.as_uuid())
        .bind(merchant_id.as_uuid())
        .bind(environment)
        .fetch_optional(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        row.map(CollectionRow::into_domain).transpose()
    }

    async fn list_collections(
        &self,
        merchant_id: MerchantId,
        environment: &str,
        limit: i64,
        cursor: Option<CollectionId>,
    ) -> Result<Vec<Collection>, CollectionError> {
        let rows = if let Some(c) = cursor {
            sqlx::query_as::<_, CollectionRow>(&format!(
                "{C_SELECT} WHERE merchant_id = $1 AND environment = $2 AND created_at < \
                 (SELECT created_at FROM collections WHERE id = $3) \
                 ORDER BY created_at DESC LIMIT $4"
            ))
            .bind(merchant_id.as_uuid())
            .bind(environment)
            .bind(c.as_uuid())
            .bind(limit)
            .fetch_all(&self.pool)
            .await
        } else {
            sqlx::query_as::<_, CollectionRow>(&format!(
                "{C_SELECT} WHERE merchant_id = $1 AND environment = $2 \
                 ORDER BY created_at DESC LIMIT $3"
            ))
            .bind(merchant_id.as_uuid())
            .bind(environment)
            .bind(limit)
            .fetch_all(&self.pool)
            .await
        }
        .map_err(CollectionError::Database)?;
        rows.into_iter().map(CollectionRow::into_domain).collect()
    }

    async fn update_collection_mutable(
        &self,
        id: CollectionId,
        title: Option<String>,
        description: Option<String>,
        expires_at: Option<DateTime<Utc>>,
        metadata: serde_json::Value,
    ) -> Result<Collection, CollectionError> {
        let row = sqlx::query_as::<_, CollectionRow>(
            "UPDATE collections SET title = $2, description = $3, expires_at = $4, \
             metadata = $5, version = version + 1, updated_at = NOW() WHERE id = $1 \
             RETURNING id, operator_id, creator, owner, merchant_id, wallet_id, title, \
             description, currency, total_amount_minor, status, rule, environment, \
             expires_at, closed_at, metadata, version, created_at, updated_at",
        )
        .bind(id.as_uuid())
        .bind(&title)
        .bind(&description)
        .bind(expires_at)
        .bind(&metadata)
        .fetch_one(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        row.into_domain()
    }

    async fn update_collection_status(
        &self,
        id: CollectionId,
        status: CollectionStatus,
        closed_at: Option<DateTime<Utc>>,
    ) -> Result<Collection, CollectionError> {
        let row = sqlx::query_as::<_, CollectionRow>(
            "UPDATE collections SET status = $2, closed_at = COALESCE($3, closed_at), \
             version = version + 1, updated_at = NOW() WHERE id = $1 \
             RETURNING id, operator_id, creator, owner, merchant_id, wallet_id, title, \
             description, currency, total_amount_minor, status, rule, environment, \
             expires_at, closed_at, metadata, version, created_at, updated_at",
        )
        .bind(id.as_uuid())
        .bind(status.as_str())
        .bind(closed_at)
        .fetch_one(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        row.into_domain()
    }

    async fn insert_share(&self, s: &CollectionShare) -> Result<(), CollectionError> {
        sqlx::query(
            "INSERT INTO collection_shares
             (id, collection_id, merchant_id, participant, amount_minor, currency, status,
              payment_intent_id, transfer_id, environment, expires_at, metadata, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
        )
        .bind(s.id.as_uuid())
        .bind(s.collection_id.as_uuid())
        .bind(s.merchant_id.as_uuid())
        .bind(&s.participant)
        .bind(s.amount_minor)
        .bind(&s.currency)
        .bind(s.status.as_str())
        .bind(s.payment_intent_id.map(|p| p.as_uuid()))
        .bind(s.transfer_id.map(|t| t.as_uuid()))
        .bind(&s.environment)
        .bind(s.expires_at)
        .bind(&s.metadata)
        .bind(s.created_at)
        .bind(s.updated_at)
        .execute(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        Ok(())
    }

    async fn find_share(
        &self,
        id: CollectionShareId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Option<CollectionShare>, CollectionError> {
        let row = sqlx::query_as::<_, ShareRow>(&format!(
            "{S_SELECT} WHERE id = $1 AND merchant_id = $2 AND environment = $3"
        ))
        .bind(id.as_uuid())
        .bind(merchant_id.as_uuid())
        .bind(environment)
        .fetch_optional(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        Ok(row.map(ShareRow::into_domain))
    }

    async fn list_shares(
        &self,
        collection_id: CollectionId,
        limit: i64,
        cursor: Option<CollectionShareId>,
    ) -> Result<Vec<CollectionShare>, CollectionError> {
        let rows = if let Some(c) = cursor {
            sqlx::query_as::<_, ShareRow>(&format!(
                "{S_SELECT} WHERE collection_id = $1 AND created_at > \
                 (SELECT created_at FROM collection_shares WHERE id = $2) \
                 ORDER BY created_at ASC LIMIT $3"
            ))
            .bind(collection_id.as_uuid())
            .bind(c.as_uuid())
            .bind(limit)
            .fetch_all(&self.pool)
            .await
        } else {
            sqlx::query_as::<_, ShareRow>(&format!(
                "{S_SELECT} WHERE collection_id = $1 ORDER BY created_at ASC LIMIT $2"
            ))
            .bind(collection_id.as_uuid())
            .bind(limit)
            .fetch_all(&self.pool)
            .await
        }
        .map_err(CollectionError::Database)?;
        Ok(rows.into_iter().map(ShareRow::into_domain).collect())
    }

    async fn set_share_intent(
        &self,
        id: CollectionShareId,
        payment_intent_id: PaymentIntentId,
        status: ShareStatus,
    ) -> Result<CollectionShare, CollectionError> {
        let row = sqlx::query_as::<_, ShareRow>(
            "UPDATE collection_shares SET payment_intent_id = $2, status = $3, updated_at = NOW() \
             WHERE id = $1 \
             RETURNING id, collection_id, merchant_id, participant, amount_minor, currency, \
             status, payment_intent_id, transfer_id, environment, expires_at, paid_at, \
             metadata, created_at, updated_at",
        )
        .bind(id.as_uuid())
        .bind(payment_intent_id.as_uuid())
        .bind(status.as_str())
        .fetch_one(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        Ok(row.into_domain())
    }

    async fn collected_amount(
        &self,
        collection_id: CollectionId,
    ) -> Result<i64, CollectionError> {
        // SUM(bigint) returns NUMERIC in Postgres — cast back to bigint so it
        // decodes as i64.
        let sum: Option<i64> = sqlx::query_scalar(
            "SELECT COALESCE(SUM(amount_minor), 0)::bigint FROM collection_shares \
             WHERE collection_id = $1 AND status = 'PAID'",
        )
        .bind(collection_id.as_uuid())
        .fetch_one(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        Ok(sum.unwrap_or(0))
    }

    async fn insert_payment_intent(&self, p: &PaymentIntent) -> Result<(), CollectionError> {
        sqlx::query(
            "INSERT INTO payment_intents
             (id, operator_id, merchant_id, payee_wallet_id, amount_minor, currency, surface,
              surface_ref, status, transfer_id, environment, expires_at, metadata, version,
              created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
        )
        .bind(p.id.as_uuid())
        .bind(&p.operator_id)
        .bind(p.merchant_id.as_uuid())
        .bind(p.payee_wallet_id.as_uuid())
        .bind(p.amount_minor)
        .bind(&p.currency)
        .bind(p.surface.as_str())
        .bind(&p.surface_ref)
        .bind(p.status.as_str())
        .bind(p.transfer_id.map(|t| t.as_uuid()))
        .bind(&p.environment)
        .bind(p.expires_at)
        .bind(&p.metadata)
        .bind(p.version)
        .bind(p.created_at)
        .bind(p.updated_at)
        .execute(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        Ok(())
    }

    async fn find_payment_intent(
        &self,
        id: PaymentIntentId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Option<PaymentIntent>, CollectionError> {
        let row = sqlx::query_as::<_, IntentRow>(&format!(
            "{I_SELECT} WHERE id = $1 AND merchant_id = $2 AND environment = $3"
        ))
        .bind(id.as_uuid())
        .bind(merchant_id.as_uuid())
        .bind(environment)
        .fetch_optional(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        Ok(row.map(IntentRow::into_domain))
    }

    async fn find_intent_by_surface(
        &self,
        surface: Surface,
        surface_ref: &str,
        environment: &str,
    ) -> Result<Option<PaymentIntent>, CollectionError> {
        let row = sqlx::query_as::<_, IntentRow>(&format!(
            "{I_SELECT} WHERE surface = $1 AND surface_ref = $2 AND environment = $3 LIMIT 1"
        ))
        .bind(surface.as_str())
        .bind(surface_ref)
        .bind(environment)
        .fetch_optional(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        Ok(row.map(IntentRow::into_domain))
    }

    async fn mark_intent_paid(
        &self,
        id: PaymentIntentId,
        transfer_id: TransferId,
    ) -> Result<bool, CollectionError> {
        let res = sqlx::query(
            "UPDATE payment_intents SET status = 'PAID', transfer_id = $2, \
             version = version + 1, updated_at = NOW() \
             WHERE id = $1 AND status <> 'PAID'",
        )
        .bind(id.as_uuid())
        .bind(transfer_id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        Ok(res.rows_affected() > 0)
    }

    async fn find_share_by_intent(
        &self,
        intent_id: PaymentIntentId,
    ) -> Result<Option<CollectionShare>, CollectionError> {
        let row = sqlx::query_as::<_, ShareRow>(&format!(
            "{S_SELECT} WHERE payment_intent_id = $1 LIMIT 1"
        ))
        .bind(intent_id.as_uuid())
        .fetch_optional(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        Ok(row.map(ShareRow::into_domain))
    }

    async fn mark_share_paid(
        &self,
        id: CollectionShareId,
        transfer_id: TransferId,
    ) -> Result<bool, CollectionError> {
        let res = sqlx::query(
            "UPDATE collection_shares SET status = 'PAID', transfer_id = $2, \
             paid_at = NOW(), updated_at = NOW() \
             WHERE id = $1 AND status <> 'PAID'",
        )
        .bind(id.as_uuid())
        .bind(transfer_id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        Ok(res.rows_affected() > 0)
    }

    async fn share_counts(
        &self,
        collection_id: CollectionId,
    ) -> Result<(i64, i64), CollectionError> {
        let row: (i64, i64) = sqlx::query_as(
            "SELECT COUNT(*)::bigint, COUNT(*) FILTER (WHERE status = 'PAID')::bigint \
             FROM collection_shares WHERE collection_id = $1",
        )
        .bind(collection_id.as_uuid())
        .fetch_one(&self.pool)
        .await
        .map_err(CollectionError::Database)?;
        Ok(row)
    }

    async fn find_collection_unscoped(
        &self,
        id: CollectionId,
    ) -> Result<Option<Collection>, CollectionError> {
        let row = sqlx::query_as::<_, CollectionRow>(&format!("{C_SELECT} WHERE id = $1"))
            .bind(id.as_uuid())
            .fetch_optional(&self.pool)
            .await
            .map_err(CollectionError::Database)?;
        row.map(CollectionRow::into_domain).transpose()
    }
}
