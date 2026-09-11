//! Retiring synthetic Sandbox value (Sandbox only).
//!
//! Every Sandbox balance was issued by a balanced posting from the transit
//! account (DR transit / CR owner). Fixtures accumulate it and never give it
//! back, so the pilot's aggregate funds cap fills with value nobody will use and
//! the Sandbox stops being able to fund a real tester. Retiring is the exact
//! reverse posting — DR owner available / CR transit — so the value leaves
//! circulation with its history intact: nothing is deleted, no balance is
//! edited.
//!
//! Which owners are synthetic is the operator's decision, made by positive
//! evidence in the tool that calls this (tools/ops); this route only refuses
//! outside the Sandbox, posts once per key, and audits.

use axum::{extract::State, Json};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

#[derive(Deserialize)]
pub struct RetireBody {
    /// "CONSUMER" or "MERCHANT".
    pub owner_type: String,
    pub owner_id: String,
    pub reason: String,
    pub retired_by: String,
    pub idempotency_key: String,
}

/// POST /internal/v1/sandbox/retire-funds
pub async fn retire(
    State(state): State<AppState>,
    Json(body): Json<RetireBody>,
) -> ApiResult<Json<serde_json::Value>> {
    if state.environment.is_live() {
        return Err(ApiError::forbidden(
            "synthetic funds exist only in the Sandbox",
        ));
    }
    let owner_id =
        Uuid::parse_str(&body.owner_id).map_err(|_| ApiError::bad_request("invalid owner_id"))?;
    let reason = body.reason.trim();
    let retired_by = body.retired_by.trim();
    let key = body.idempotency_key.trim();
    if reason.is_empty() || retired_by.is_empty() || key.is_empty() || key.len() > 200 {
        return Err(ApiError::bad_request(
            "reason, retired_by and idempotency_key are required",
        ));
    }
    let lookup = match body.owner_type.as_str() {
        "MERCHANT" => {
            "SELECT id, available_account_id FROM wallets WHERE merchant_id = $1 AND currency = 'AOA' FOR UPDATE"
        }
        "CONSUMER" => {
            "SELECT id, available_account_id FROM consumer_wallets WHERE consumer_id = $1 AND currency = 'AOA' FOR UPDATE"
        }
        _ => return Err(ApiError::bad_request("owner_type must be CONSUMER or MERCHANT")),
    };
    let db = |e: sqlx::Error| ApiError::internal(e.to_string());
    let ledger_key = format!("sandbox-retire:{key}");

    let mut tx = state.pool.begin().await.map_err(db)?;
    // A replay returns what the first call retired.
    if let Some(prev) = sqlx::query_scalar::<_, i64>(
        "SELECT e.amount_minor FROM ledger_postings p JOIN ledger_entries e ON e.posting_id = p.id
          WHERE p.idempotency_key = $1 AND e.entry_type = 'DEBIT'",
    )
    .bind(&ledger_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db)?
    {
        return Ok(Json(
            serde_json::json!({ "retired_minor": prev, "replayed": true }),
        ));
    }
    let Some((wallet_id, available)) = sqlx::query_as::<_, (Uuid, Uuid)>(lookup)
        .bind(owner_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db)?
    else {
        return Err(ApiError::not_found("no AOA wallet for this owner"));
    };
    let balance: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'CREDIT' THEN amount_minor ELSE -amount_minor END), 0)::BIGINT
           FROM ledger_entries WHERE account_id = $1",
    )
    .bind(available)
    .fetch_one(&mut *tx)
    .await
    .map_err(db)?;
    if balance <= 0 {
        return Ok(Json(
            serde_json::json!({ "retired_minor": 0, "replayed": false }),
        ));
    }

    let posting = Uuid::new_v4();
    sqlx::query("INSERT INTO ledger_postings (id, description, idempotency_key, created_at) VALUES ($1, $2, $3, now())")
        .bind(posting)
        .bind("[SANDBOX] Synthetic funds retired — DR owner available / CR transit")
        .bind(&ledger_key)
        .execute(&mut *tx)
        .await
        .map_err(db)?;
    for (account, side) in [
        (available, "DEBIT"),
        (state.transit_account_id.as_uuid(), "CREDIT"),
    ] {
        sqlx::query(
            "INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
             VALUES ($1, $2, $3, $4, $5, 'AOA', now())",
        )
        .bind(Uuid::new_v4())
        .bind(posting)
        .bind(account)
        .bind(side)
        .bind(balance)
        .execute(&mut *tx)
        .await
        .map_err(db)?;
    }
    sqlx::query(
        "INSERT INTO audit_log (actor, action, subject, metadata) VALUES ($1, 'SANDBOX_FUNDS_RETIRED', $2, $3)",
    )
    .bind(format!("OPERATOR:{retired_by}"))
    .bind(format!("{}:{owner_id}", body.owner_type))
    .bind(serde_json::json!({
        "wallet_id": wallet_id,
        "amount_minor": balance,
        "posting_id": posting,
        "reason": reason,
    }))
    .execute(&mut *tx)
    .await
    .map_err(db)?;
    tx.commit().await.map_err(db)?;
    Ok(Json(
        serde_json::json!({ "retired_minor": balance, "replayed": false }),
    ))
}
