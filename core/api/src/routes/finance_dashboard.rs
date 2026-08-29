//! Internal finance dashboard aggregations (Banzami ADR-021).
//!
//! OPERATOR-ONLY, READ-ONLY. Pure aggregate queries over the immutable
//! `operator_fees` and `app_settlements` tables — no invented data, no writes,
//! no engine involvement. Operator revenue == the operator fees applied. Every
//! filter is a bound parameter; the column dimensions are fixed literals.

use axum::{
    extract::{Query, State},
    Json,
};
use chrono::{DateTime, Datelike, Duration, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

#[derive(Deserialize)]
pub struct DashQuery {
    pub environment: Option<String>,
    pub currency: Option<String>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
}

/// One `{ key, count, total_minor }` bucket.
#[allow(clippy::too_many_arguments)] // pre-existing: table/column/key are query shape, from/to/env/cur are the filter
async fn grouped(
    pool: &sqlx::PgPool,
    table: &str,
    sum_col: &str,
    key_expr: &str,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    env: &Option<String>,
    cur: &Option<String>,
) -> Result<serde_json::Value, ApiError> {
    // table/sum_col/key_expr are fixed literals chosen by this module — never
    // caller input. Window + env + currency are bound parameters.
    let sql = format!(
        "SELECT {key_expr} AS key, COUNT(*)::BIGINT AS cnt,
                COALESCE(SUM({sum_col}),0)::BIGINT AS total
           FROM {table}
          WHERE created_at >= $1 AND created_at <= $2
            AND ($3::text IS NULL OR environment = $3)
            AND ($4::text IS NULL OR currency = $4)
          GROUP BY 1 ORDER BY total DESC NULLS LAST LIMIT 100"
    );
    let rows = sqlx::query(&sql)
        .bind(from)
        .bind(to)
        .bind(env)
        .bind(cur)
        .fetch_all(pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    let out: Vec<_> = rows
        .into_iter()
        .map(|r| {
            json!({
                "key": r.try_get::<Option<String>, _>("key").unwrap_or(None),
                "count": r.try_get::<i64, _>("cnt").unwrap_or(0),
                "total_minor": r.try_get::<i64, _>("total").unwrap_or(0),
            })
        })
        .collect();
    Ok(json!(out))
}

async fn count(pool: &sqlx::PgPool, sql: &str, env: &Option<String>) -> Result<i64, ApiError> {
    sqlx::query_scalar::<_, i64>(sql)
        .bind(env)
        .fetch_one(pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))
}

pub async fn get(
    State(state): State<AppState>,
    Query(q): Query<DashQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let pool = &state.pool;
    let env = q.environment.filter(|s| !s.is_empty() && s != "ALL");
    let cur = q.currency.filter(|s| !s.is_empty());
    let to = q.to.unwrap_or_else(Utc::now);
    let from = q.from.unwrap_or_else(|| to - Duration::days(30));

    // --- KPI cards (absolute, relative to now; scoped by env + currency) ----
    let now = Utc::now();
    let day_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap().and_utc();
    let month_start = chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc();
    let fees_today = grouped(
        pool,
        "operator_fees",
        "amount_minor",
        "currency",
        day_start,
        now,
        &env,
        &cur,
    )
    .await?;
    let fees_month = grouped(
        pool,
        "operator_fees",
        "amount_minor",
        "currency",
        month_start,
        now,
        &env,
        &cur,
    )
    .await?;

    let settlements_today = count(
        pool,
        "SELECT COUNT(*)::BIGINT FROM app_settlements
          WHERE created_at >= date_trunc('day', now())
            AND ($1::text IS NULL OR environment = $1)",
        &env,
    )
    .await?;
    let settlements_pending = count(
        pool,
        "SELECT COUNT(*)::BIGINT FROM app_settlements
          WHERE status IN ('CREATED','PENDING')
            AND ($1::text IS NULL OR environment = $1)",
        &env,
    )
    .await?;
    let settlements_failed = count(
        pool,
        "SELECT COUNT(*)::BIGINT FROM app_settlements
          WHERE status = 'FAILED'
            AND ($1::text IS NULL OR environment = $1)",
        &env,
    )
    .await?;

    // --- Breakdowns + charts (within the [from, to] window) -----------------
    let by_currency = grouped(
        pool,
        "operator_fees",
        "amount_minor",
        "currency",
        from,
        to,
        &env,
        &cur,
    )
    .await?;
    let by_category = grouped(
        pool,
        "operator_fees",
        "amount_minor",
        "business_category",
        from,
        to,
        &env,
        &cur,
    )
    .await?;
    let by_profile = grouped(
        pool,
        "operator_fees",
        "amount_minor",
        "pricing_profile",
        from,
        to,
        &env,
        &cur,
    )
    .await?;
    let by_day = grouped(
        pool,
        "operator_fees",
        "amount_minor",
        "to_char(date_trunc('day', created_at), 'YYYY-MM-DD')",
        from,
        to,
        &env,
        &cur,
    )
    .await?;
    let settlements_by_status = grouped(
        pool,
        "app_settlements",
        "net_amount_minor",
        "status",
        from,
        to,
        &env,
        &cur,
    )
    .await?;

    Ok(Json(json!({
        "window": { "from": from, "to": to },
        "environment": env,
        "currency": cur,
        "operator_fees": {
            "today": fees_today,
            "month": fees_month,
            "by_currency": by_currency,
            "by_business_category": by_category,
            "by_pricing_profile": by_profile,
            "by_day": by_day,
        },
        "application_settlements": {
            "today_count": settlements_today,
            "pending_count": settlements_pending,
            "failed_count": settlements_failed,
            "by_status": settlements_by_status,
        },
    })))
}
