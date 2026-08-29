//! Internal operator-fees read API (Banzami ADR-021).
//!
//! OPERATOR-ONLY, READ-ONLY audit surface. Operator fees are immutable,
//! append-only records (produced at capture); this never writes. Returns the
//! resolved fee + the immutable pricing snapshot for internal audit — never
//! exposed to a payer or any public API.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;

use banzami_transactions::OperatorFeeFilter;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

#[derive(Deserialize)]
pub struct ListQuery {
    pub environment: Option<String>,
    pub currency: Option<String>,
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub pricing_rule_id: Option<String>,
    pub transaction_id: Option<String>,
    pub status: Option<String>,
    pub from: Option<chrono::DateTime<chrono::Utc>>,
    pub to: Option<chrono::DateTime<chrono::Utc>>,
    pub limit: Option<i64>,
}

fn parse_uuid(s: Option<String>, field: &str) -> Result<Option<uuid::Uuid>, ApiError> {
    match s {
        Some(v) => uuid::Uuid::parse_str(&v)
            .map(Some)
            .map_err(|_| ApiError::bad_request(format!("invalid {field}"))),
        None => Ok(None),
    }
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let filter = OperatorFeeFilter {
        environment: q.environment,
        currency: q.currency,
        business_category: q.business_category,
        pricing_profile: q.pricing_profile,
        pricing_rule_id: parse_uuid(q.pricing_rule_id, "pricing_rule_id")?,
        transaction_id: parse_uuid(q.transaction_id, "transaction_id")?,
        status: q.status,
        from: q.from,
        to: q.to,
        limit: q.limit.unwrap_or(100),
    };
    let items = state
        .operator_fee_read
        .list(&filter)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(Json(serde_json::json!({ "data": items })))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let id =
        uuid::Uuid::parse_str(&id).map_err(|_| ApiError::bad_request("invalid operator fee id"))?;
    let fee = state.operator_fee_read.get(id).await.map_err(|e| {
        if e.to_string().contains("not found") {
            ApiError::not_found("operator fee not found")
        } else {
            ApiError::internal(e.to_string())
        }
    })?;
    Ok(Json(serde_json::to_value(&fee).unwrap()))
}
