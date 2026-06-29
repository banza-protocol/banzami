//! PostgreSQL persistence for Application Settlements (Banzami ADR-021).
//!
//! Runtime sqlx queries (no compile-time macro / offline cache), mirroring the
//! payouts + collections repositories. A COMPLETED row is never rewritten to
//! change money — terminal states only stamp their timestamp + posting ids.

use chrono::{DateTime, Utc};
use sqlx::{postgres::PgRow, PgPool, Row};
use uuid::Uuid;

use banzami_types::{
    AccountId, ApplicationSettlementId, Currency, LedgerPostingId, Money, PricingRuleId,
};

use crate::domain::{ApplicationSettlement, ApplicationSettlementStatus};
use crate::ApplicationSettlementError;

#[allow(async_fn_in_trait)]
pub trait ApplicationSettlementRepository: Send + Sync {
    async fn insert(
        &self,
        s: ApplicationSettlement,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError>;
    async fn get(
        &self,
        id: ApplicationSettlementId,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError>;
    async fn get_by_idempotency_key(
        &self,
        key: &str,
    ) -> Result<Option<ApplicationSettlement>, ApplicationSettlementError>;
    /// Stamp a non-failure terminal/intermediate status (PENDING/COMPLETED/
    /// CANCELLED) with its timestamp + posting ids. Never alters amounts.
    async fn update_status(
        &self,
        id: ApplicationSettlementId,
        status: ApplicationSettlementStatus,
        completed_at: Option<DateTime<Utc>>,
        cancelled_at: Option<DateTime<Utc>>,
        settlement_posting_id: Option<LedgerPostingId>,
        fee_posting_id: Option<LedgerPostingId>,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError>;
    async fn fail(
        &self,
        id: ApplicationSettlementId,
        failed_at: DateTime<Utc>,
        reason: &str,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError>;
    async fn list_by_owner(
        &self,
        owner_ref: &str,
        environment: &str,
        limit: i64,
    ) -> Result<Vec<ApplicationSettlement>, ApplicationSettlementError>;
}

pub struct PostgresApplicationSettlementRepository {
    pool: PgPool,
}

impl PostgresApplicationSettlementRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

const SELECT: &str = "SELECT id, owner_ref, application_id, source_account_id,
    beneficiary_account_id, application_fee_account_id, gross_amount_minor,
    application_fee_minor, net_amount_minor, currency, business_category,
    pricing_profile, fee_policy_ref, pricing_rule_id, pricing_rule_version,
    engine_version, pricing_snapshot_json, status, settlement_posting_id,
    fee_posting_id, environment, idempotency_key, metadata, created_at,
    completed_at, cancelled_at, failed_at, failure_reason
    FROM app_settlements";

impl ApplicationSettlementRepository for PostgresApplicationSettlementRepository {
    async fn insert(
        &self,
        s: ApplicationSettlement,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError> {
        sqlx::query(
            "INSERT INTO app_settlements
               (id, owner_ref, application_id, source_account_id, beneficiary_account_id,
                application_fee_account_id, gross_amount_minor, application_fee_minor,
                net_amount_minor, currency, business_category, pricing_profile, fee_policy_ref,
                pricing_rule_id, pricing_rule_version, engine_version, pricing_snapshot_json,
                status, environment, idempotency_key, metadata, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)",
        )
        .bind(s.id.as_uuid())
        .bind(&s.owner_ref)
        .bind(&s.application_id)
        .bind(s.source_account_id.as_uuid())
        .bind(s.beneficiary_account_id.as_uuid())
        .bind(s.application_fee_account_id.map(|a| a.as_uuid()))
        .bind(s.gross_amount.amount_minor())
        .bind(s.application_fee.amount_minor())
        .bind(s.net_amount.amount_minor())
        .bind(s.currency.code())
        .bind(&s.business_category)
        .bind(&s.pricing_profile)
        .bind(&s.fee_policy_ref)
        .bind(s.pricing_rule_id.map(|r| r.as_uuid()))
        .bind(s.pricing_rule_version)
        .bind(s.engine_version)
        .bind(&s.pricing_snapshot_json)
        .bind(s.status.as_str())
        .bind(&s.environment)
        .bind(&s.idempotency_key)
        .bind(&s.metadata)
        .bind(s.created_at)
        .execute(&self.pool)
        .await?;
        self.get(s.id).await
    }

    async fn get(
        &self,
        id: ApplicationSettlementId,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError> {
        sqlx::query(&format!("{SELECT} WHERE id = $1"))
            .bind(id.as_uuid())
            .fetch_optional(&self.pool)
            .await?
            .map(row_to_settlement)
            .transpose()?
            .ok_or(ApplicationSettlementError::NotFound(id))
    }

    async fn get_by_idempotency_key(
        &self,
        key: &str,
    ) -> Result<Option<ApplicationSettlement>, ApplicationSettlementError> {
        sqlx::query(&format!("{SELECT} WHERE idempotency_key = $1"))
            .bind(key)
            .fetch_optional(&self.pool)
            .await?
            .map(row_to_settlement)
            .transpose()
    }

    async fn update_status(
        &self,
        id: ApplicationSettlementId,
        status: ApplicationSettlementStatus,
        completed_at: Option<DateTime<Utc>>,
        cancelled_at: Option<DateTime<Utc>>,
        settlement_posting_id: Option<LedgerPostingId>,
        fee_posting_id: Option<LedgerPostingId>,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError> {
        sqlx::query(
            "UPDATE app_settlements
                SET status = $1,
                    completed_at = COALESCE($2, completed_at),
                    cancelled_at = COALESCE($3, cancelled_at),
                    settlement_posting_id = COALESCE($4, settlement_posting_id),
                    fee_posting_id = COALESCE($5, fee_posting_id)
              WHERE id = $6",
        )
        .bind(status.as_str())
        .bind(completed_at)
        .bind(cancelled_at)
        .bind(settlement_posting_id.map(|p| p.as_uuid()))
        .bind(fee_posting_id.map(|p| p.as_uuid()))
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await?;
        self.get(id).await
    }

    async fn fail(
        &self,
        id: ApplicationSettlementId,
        failed_at: DateTime<Utc>,
        reason: &str,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError> {
        sqlx::query(
            "UPDATE app_settlements
                SET status = 'FAILED', failed_at = $1, failure_reason = $2
              WHERE id = $3",
        )
        .bind(failed_at)
        .bind(reason)
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await?;
        self.get(id).await
    }

    async fn list_by_owner(
        &self,
        owner_ref: &str,
        environment: &str,
        limit: i64,
    ) -> Result<Vec<ApplicationSettlement>, ApplicationSettlementError> {
        let rows = sqlx::query(&format!(
            "{SELECT} WHERE owner_ref = $1 AND environment = $2
             ORDER BY created_at DESC, id DESC LIMIT $3"
        ))
        .bind(owner_ref)
        .bind(environment)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(row_to_settlement).collect()
    }
}

fn row_to_settlement(row: PgRow) -> Result<ApplicationSettlement, ApplicationSettlementError> {
    let currency_code: String = row.try_get("currency")?;
    let currency = Currency::from_code(&currency_code)
        .ok_or(ApplicationSettlementError::CurrencyMismatch)?;
    let status_code: String = row.try_get("status")?;
    let status = ApplicationSettlementStatus::try_from_str(&status_code).ok_or(
        ApplicationSettlementError::InvalidStatus {
            from: status_code.clone(),
            to: status_code,
        },
    )?;
    let opt_account = |col: &str| -> Result<Option<AccountId>, ApplicationSettlementError> {
        Ok(row
            .try_get::<Option<Uuid>, _>(col)?
            .map(AccountId::from_uuid))
    };
    let opt_posting = |col: &str| -> Result<Option<LedgerPostingId>, ApplicationSettlementError> {
        Ok(row
            .try_get::<Option<Uuid>, _>(col)?
            .map(LedgerPostingId::from_uuid))
    };

    Ok(ApplicationSettlement {
        id: ApplicationSettlementId::from_uuid(row.try_get("id")?),
        owner_ref: row.try_get("owner_ref")?,
        application_id: row.try_get("application_id")?,
        source_account_id: AccountId::from_uuid(row.try_get("source_account_id")?),
        beneficiary_account_id: AccountId::from_uuid(row.try_get("beneficiary_account_id")?),
        application_fee_account_id: opt_account("application_fee_account_id")?,
        gross_amount: Money::new(row.try_get("gross_amount_minor")?, currency),
        application_fee: Money::new(row.try_get("application_fee_minor")?, currency),
        net_amount: Money::new(row.try_get("net_amount_minor")?, currency),
        currency,
        business_category: row.try_get("business_category")?,
        pricing_profile: row.try_get("pricing_profile")?,
        fee_policy_ref: row.try_get("fee_policy_ref")?,
        pricing_rule_id: row
            .try_get::<Option<Uuid>, _>("pricing_rule_id")?
            .map(PricingRuleId::from_uuid),
        pricing_rule_version: row.try_get("pricing_rule_version")?,
        engine_version: row.try_get("engine_version")?,
        pricing_snapshot_json: row.try_get("pricing_snapshot_json")?,
        status,
        settlement_posting_id: opt_posting("settlement_posting_id")?,
        fee_posting_id: opt_posting("fee_posting_id")?,
        environment: row.try_get("environment")?,
        idempotency_key: row.try_get("idempotency_key")?,
        metadata: row.try_get("metadata")?,
        created_at: row.try_get("created_at")?,
        completed_at: row.try_get("completed_at")?,
        cancelled_at: row.try_get("cancelled_at")?,
        failed_at: row.try_get("failed_at")?,
        failure_reason: row.try_get("failure_reason")?,
    })
}
