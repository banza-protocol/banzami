//! Read-only access to `operator_fees` for the operator audit surface
//! (Banzami ADR-021). This module NEVER writes — operator fees are immutable,
//! append-only records produced by capture (`finalize_capture`). It exists so
//! BANZADMIN (via admin-api) can list and inspect applied fees without touching
//! the fee engine.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{postgres::PgRow, PgPool, Row};
use uuid::Uuid;

use crate::TransactionError;

/// One applied operator fee, enriched with the transaction gross so the audit
/// view can show gross / fee / net without a second lookup. Read-only.
#[derive(Debug, Clone, Serialize)]
pub struct OperatorFeeView {
    pub id: Uuid,
    pub transaction_id: Uuid,
    pub merchant_id: Uuid,
    pub payment_intent_id: Option<Uuid>,
    pub source_transfer_id: Option<Uuid>,
    pub posting_id: Uuid,
    /// Gross transaction amount (from `transactions.amount_minor`).
    pub gross_minor: i64,
    /// The resolved operator fee (`operator_fees.amount_minor`).
    pub fee_minor: i64,
    /// Net credited to the payee = gross − fee.
    pub net_minor: i64,
    pub currency: String,
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub fee_policy_ref: Option<String>,
    pub pricing_rule_id: Option<Uuid>,
    pub pricing_rule_version: Option<i32>,
    pub engine_version: i32,
    /// Immutable pricing snapshot (rule id+version, components, engine version).
    pub snapshot_json: serde_json::Value,
    pub status: String,
    pub environment: String,
    pub created_at: DateTime<Utc>,
    pub settled_at: Option<DateTime<Utc>>,
}

/// Audit filters. All optional; every value is bound as a parameter (no string
/// interpolation of caller input).
#[derive(Debug, Default, Clone)]
pub struct OperatorFeeFilter {
    pub environment: Option<String>,
    pub currency: Option<String>,
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub pricing_rule_id: Option<Uuid>,
    pub transaction_id: Option<Uuid>,
    pub status: Option<String>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub limit: i64,
}

pub struct PostgresOperatorFeeReadRepository {
    pool: PgPool,
}

const SELECT: &str = "SELECT of.id, of.transaction_id, t.merchant_id, of.payment_intent_id,
    of.source_transfer_id, of.posting_id, t.amount_minor AS gross_minor, of.amount_minor AS fee_minor,
    of.currency, of.business_category, of.pricing_profile, of.fee_policy_ref, of.pricing_rule_id,
    of.pricing_rule_version, of.engine_version, of.snapshot_json, of.status, of.environment,
    of.created_at, of.settled_at
    FROM operator_fees of JOIN transactions t ON t.id = of.transaction_id";

impl PostgresOperatorFeeReadRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get(&self, id: Uuid) -> Result<OperatorFeeView, TransactionError> {
        sqlx::query(&format!("{SELECT} WHERE of.id = $1"))
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(TransactionError::Database)?
            .map(row_to_view)
            .transpose()?
            .ok_or(TransactionError::NotFound(crate::TransactionId::from_uuid(
                id,
            )))
    }

    pub async fn list(
        &self,
        f: &OperatorFeeFilter,
    ) -> Result<Vec<OperatorFeeView>, TransactionError> {
        let mut sql = String::from(SELECT);
        sql.push_str(" WHERE 1=1");
        let mut i = 1;
        macro_rules! clause {
            ($opt:expr, $expr:literal) => {
                if $opt.is_some() {
                    sql.push_str(&format!(" AND {} = ${}", $expr, i));
                    i += 1;
                }
            };
        }
        clause!(f.environment, "of.environment");
        clause!(f.currency, "of.currency");
        clause!(f.business_category, "of.business_category");
        clause!(f.pricing_profile, "of.pricing_profile");
        clause!(f.pricing_rule_id, "of.pricing_rule_id");
        clause!(f.transaction_id, "of.transaction_id");
        clause!(f.status, "of.status");
        if f.from.is_some() {
            sql.push_str(&format!(" AND of.created_at >= ${i}"));
            i += 1;
        }
        if f.to.is_some() {
            sql.push_str(&format!(" AND of.created_at <= ${i}"));
            i += 1;
        }
        let _ = i;
        sql.push_str(" ORDER BY of.created_at DESC");
        sql.push_str(&format!(" LIMIT {}", f.limit.clamp(1, 1000)));

        let mut q = sqlx::query(&sql);
        if let Some(v) = &f.environment {
            q = q.bind(v);
        }
        if let Some(v) = &f.currency {
            q = q.bind(v);
        }
        if let Some(v) = &f.business_category {
            q = q.bind(v);
        }
        if let Some(v) = &f.pricing_profile {
            q = q.bind(v);
        }
        if let Some(v) = f.pricing_rule_id {
            q = q.bind(v);
        }
        if let Some(v) = f.transaction_id {
            q = q.bind(v);
        }
        if let Some(v) = &f.status {
            q = q.bind(v);
        }
        if let Some(v) = f.from {
            q = q.bind(v);
        }
        if let Some(v) = f.to {
            q = q.bind(v);
        }
        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(TransactionError::Database)?;
        rows.into_iter().map(row_to_view).collect()
    }
}

fn row_to_view(row: PgRow) -> Result<OperatorFeeView, TransactionError> {
    let gross_minor: i64 = row.try_get("gross_minor")?;
    let fee_minor: i64 = row.try_get("fee_minor")?;
    Ok(OperatorFeeView {
        id: row.try_get("id")?,
        transaction_id: row.try_get("transaction_id")?,
        merchant_id: row.try_get("merchant_id")?,
        payment_intent_id: row.try_get("payment_intent_id")?,
        source_transfer_id: row.try_get("source_transfer_id")?,
        posting_id: row.try_get("posting_id")?,
        gross_minor,
        fee_minor,
        net_minor: gross_minor - fee_minor,
        currency: row.try_get("currency")?,
        business_category: row.try_get("business_category")?,
        pricing_profile: row.try_get("pricing_profile")?,
        fee_policy_ref: row.try_get("fee_policy_ref")?,
        pricing_rule_id: row.try_get("pricing_rule_id")?,
        pricing_rule_version: row.try_get("pricing_rule_version")?,
        engine_version: row.try_get("engine_version")?,
        snapshot_json: row.try_get("snapshot_json")?,
        status: row.try_get("status")?,
        environment: row.try_get("environment")?,
        created_at: row.try_get("created_at")?,
        settled_at: row.try_get("settled_at")?,
    })
}
