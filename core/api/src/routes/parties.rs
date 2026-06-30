//! Internal resolver: a @banza handle → its settlement party (owner + the
//! available ledger account to credit). Uses the unified `handle_registry`
//! (CONSUMER | MERCHANT | SYSTEM) so beneficiary/fee-destination handles in an
//! Application Settlement (ADR-029) resolve to real accounts. OPERATOR-ONLY.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

#[derive(Deserialize)]
pub struct ResolveQuery {
    pub currency: String,
}

/// GET /internal/v1/parties/resolve/:handle?currency=AOA
pub async fn resolve(
    State(state): State<AppState>,
    Path(handle): Path<String>,
    Query(q): Query<ResolveQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let normalized = handle.trim().trim_start_matches('@').to_lowercase();
    if normalized.is_empty() {
        return Err(ApiError::bad_request("handle is required"));
    }

    let (owner_type, owner_id): (String, Option<Uuid>) = sqlx::query_as(
        "SELECT owner_type, owner_id FROM handle_registry WHERE handle = $1",
    )
    .bind(&normalized)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("handle not found"))?;

    let owner_id = owner_id
        .ok_or_else(|| ApiError::unprocessable("HANDLE_NOT_ROUTABLE", "handle is reserved/system"))?;

    // Resolve the owner's ACTIVE available account for the requested currency.
    let account_id: Option<Uuid> = match owner_type.as_str() {
        "CONSUMER" => sqlx::query_scalar(
            "SELECT available_account_id FROM consumer_wallets
              WHERE consumer_id = $1 AND currency = $2 AND status = 'ACTIVE'
              ORDER BY created_at ASC LIMIT 1",
        )
        .bind(owner_id)
        .bind(&q.currency)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?,
        "MERCHANT" => sqlx::query_scalar(
            "SELECT available_account_id FROM wallets
              WHERE merchant_id = $1 AND currency = $2 AND status = 'ACTIVE' LIMIT 1",
        )
        .bind(owner_id)
        .bind(&q.currency)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?,
        _ => None,
    };

    let account_id = account_id.ok_or_else(|| {
        ApiError::unprocessable("PARTY_NO_WALLET", "no active wallet for handle in this currency")
    })?;

    Ok(Json(serde_json::json!({
        "handle": normalized,
        "owner_type": owner_type,
        "owner_id": owner_id,
        "available_account_id": account_id,
        "currency": q.currency,
    })))
}
