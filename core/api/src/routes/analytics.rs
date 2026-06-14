//! Merchant analytics — aggregates incoming payment volume from the ledger.
//!
//! The ledger is the single source of financial truth (CLAUDE.md §9.1), so
//! merchant revenue analytics are computed directly from `ledger_entries`:
//! every CREDIT to the merchant's available account is an incoming payment.
//! This guarantees the numbers reconcile with the balance by construction.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

#[derive(Deserialize)]
pub struct AnalyticsQuery {
    /// Inclusive start (RFC3339). Defaults to 30 days ago.
    pub from: Option<DateTime<Utc>>,
    /// Exclusive end (RFC3339). Defaults to now.
    pub to: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct DailyPoint {
    pub day: NaiveDate,
    pub count: i64,
    pub volume_minor: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct HourPoint {
    pub hour: i32,
    pub count: i64,
    pub volume_minor: i64,
}

#[derive(Serialize)]
pub struct AnalyticsResponse {
    pub wallet_id: String,
    pub currency: String,
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub total_volume_minor: i64,
    pub total_count: i64,
    pub active_days: i64,
    /// Per-day incoming volume, ascending by day.
    pub daily: Vec<DailyPoint>,
    /// Incoming volume by hour-of-day (0–23) across the whole window — peak hours.
    pub by_hour: Vec<HourPoint>,
}

/// `GET /internal/v1/wallets/:id/analytics?from=&to=`
pub async fn merchant_analytics(
    State(state): State<AppState>,
    Path(wallet_id): Path<String>,
    Query(q): Query<AnalyticsQuery>,
) -> ApiResult<Json<AnalyticsResponse>> {
    let wallet_uuid = uuid::Uuid::parse_str(&wallet_id)
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;

    let to = q.to.unwrap_or_else(Utc::now);
    let from = q.from.unwrap_or_else(|| to - Duration::days(30));
    if from >= to {
        return Err(ApiError::bad_request("'from' must be before 'to'"));
    }

    // Resolve the wallet's available (settled funds) ledger account.
    let row: Option<(uuid::Uuid, String)> =
        sqlx::query_as("SELECT available_account_id, currency FROM wallets WHERE id = $1")
            .bind(wallet_uuid)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?;
    let (available_account_id, currency) =
        row.ok_or_else(|| ApiError::not_found("wallet not found"))?;

    // Per-day incoming volume (CREDIT entries to the available account).
    let daily: Vec<DailyPoint> = sqlx::query_as::<_, DailyPoint>(
        "SELECT date_trunc('day', created_at)::date AS day,
                COUNT(*)                            AS count,
                COALESCE(SUM(amount_minor), 0)::BIGINT AS volume_minor
         FROM ledger_entries
         WHERE account_id = $1 AND entry_type = 'CREDIT'
           AND created_at >= $2 AND created_at < $3
         GROUP BY day
         ORDER BY day ASC",
    )
    .bind(available_account_id)
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // Incoming volume by hour-of-day across the window (peak-hours histogram).
    let by_hour: Vec<HourPoint> = sqlx::query_as::<_, HourPoint>(
        "SELECT EXTRACT(HOUR FROM created_at)::int AS hour,
                COUNT(*)                           AS count,
                COALESCE(SUM(amount_minor), 0)::BIGINT AS volume_minor
         FROM ledger_entries
         WHERE account_id = $1 AND entry_type = 'CREDIT'
           AND created_at >= $2 AND created_at < $3
         GROUP BY hour
         ORDER BY hour ASC",
    )
    .bind(available_account_id)
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let total_volume_minor: i64 = daily.iter().map(|d| d.volume_minor).sum();
    let total_count: i64 = daily.iter().map(|d| d.count).sum();
    let active_days: i64 = daily.len() as i64;

    Ok(Json(AnalyticsResponse {
        wallet_id,
        currency,
        from,
        to,
        total_volume_minor,
        total_count,
        active_days,
        daily,
        by_hour,
    }))
}
