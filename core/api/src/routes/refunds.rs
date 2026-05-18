use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    routes::risk,
    state::AppState,
};

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct RefundResponse {
    pub id:             String,
    pub transaction_id: String,
    pub merchant_id:    String,
    pub consumer_id:    Option<String>,
    pub wallet_id:      String,
    pub amount_minor:   i64,
    pub currency:       String,
    pub reason:         Option<String>,
    pub status:         String,
    pub failure_reason: Option<String>,
    pub processed_at:   Option<DateTime<Utc>>,
    pub created_at:     DateTime<Utc>,
    pub updated_at:     DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// POST /internal/v1/refunds
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateRefundBody {
    pub transaction_id:  String,
    pub merchant_id:     String,
    pub amount_minor:    i64,
    pub reason:          Option<String>,
    pub idempotency_key: String,
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateRefundBody>,
) -> ApiResult<(StatusCode, Json<RefundResponse>)> {
    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
    }
    if body.idempotency_key.is_empty() {
        return Err(ApiError::bad_request("idempotency_key is required"));
    }

    let transaction_id: Uuid = body.transaction_id.parse()
        .map_err(|_| ApiError::bad_request("invalid transaction_id"))?;
    let merchant_id: Uuid = body.merchant_id.parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    // Look up the transaction — must be CAPTURED or SETTLED
    let tx_row = sqlx::query!(
        r#"
        SELECT id, merchant_id, wallet_id, amount_minor, currency, status
        FROM transactions
        WHERE id = $1 AND merchant_id = $2
        "#,
        transaction_id, merchant_id,
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("transaction not found"))?;

    if !["CAPTURED", "SETTLED"].contains(&tx_row.status.as_str()) {
        return Err(ApiError::unprocessable(
            "INVALID_TRANSACTION_STATUS",
            format!("transaction status {} is not refundable", tx_row.status),
        ));
    }

    // Validate that existing refunds don't already exceed the captured amount
    let already_refunded: i64 = sqlx::query_scalar!(
        r#"
        SELECT COALESCE(SUM(amount_minor), 0)::BIGINT
        FROM refunds
        WHERE transaction_id = $1 AND status IN ('PENDING', 'PROCESSING', 'SUCCEEDED')
        "#,
        transaction_id,
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .unwrap_or(0);

    if already_refunded + body.amount_minor > tx_row.amount_minor {
        return Err(ApiError::unprocessable(
            "REFUND_EXCEEDS_CAPTURED",
            format!(
                "cannot refund {} — only {} remaining of original {}",
                body.amount_minor,
                tx_row.amount_minor - already_refunded,
                tx_row.amount_minor,
            ),
        ));
    }

    // Check for account freezes on the merchant
    if risk::is_frozen(&state.pool, "MERCHANT", merchant_id).await {
        return Err(ApiError::unprocessable(
            "ACCOUNT_FROZEN",
            "merchant account is frozen — refunds are blocked",
        ));
    }

    let wallet_id: Uuid = tx_row.wallet_id;
    let currency = tx_row.currency.clone();

    // Idempotent insert — if key already exists, return existing refund
    let refund_id = Uuid::new_v4();
    let insert_result = sqlx::query!(
        r#"
        INSERT INTO refunds
            (id, transaction_id, merchant_id, wallet_id, amount_minor,
             currency, reason, status, idempotency_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
        "#,
        refund_id,
        transaction_id,
        merchant_id,
        wallet_id,
        body.amount_minor,
        currency,
        body.reason,
        body.idempotency_key,
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // If conflict (idempotent replay) — fetch and return existing record
    let actual_id = match insert_result {
        Some(row) => row.id,
        None => {
            sqlx::query_scalar!(
                "SELECT id FROM refunds WHERE idempotency_key = $1",
                body.idempotency_key,
            )
            .fetch_one(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?
        }
    };

    // Process immediately: post ledger entries and mark SUCCEEDED
    // Merchant wallet DR, consumer wallet CR (or transit if no consumer)
    let ledger_idempotency = format!("refund-{actual_id}");

    // Fetch merchant wallet's available ledger account
    let merchant_account_id: Uuid = sqlx::query_scalar!(
        "SELECT available_account_id FROM wallets WHERE id = $1",
        wallet_id,
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::unprocessable("WALLET_NOT_FOUND", "merchant wallet not found"))?;

    // Refund credit goes to transit — transactions have no consumer_id,
    // so we can't look up the consumer wallet at this point.
    let consumer_account_id: Uuid = state.transit_account_id.as_uuid().clone();

    // Double-entry ledger posting — merchant wallet DR, consumer wallet CR
    // ON CONFLICT DO NOTHING ensures idempotency on retries
    let posting_id = Uuid::new_v4();
    let entry_id   = Uuid::new_v4();
    let now        = Utc::now();

    sqlx::query!(
        r#"
        INSERT INTO ledger_postings
            (id, description, idempotency_key, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (idempotency_key) DO NOTHING
        "#,
        posting_id,
        format!("refund:{actual_id}"),
        ledger_idempotency,
        now,
    )
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // Re-fetch the actual posting id (may differ on idempotent replay)
    let actual_posting_id: Uuid = sqlx::query_scalar!(
        "SELECT id FROM ledger_postings WHERE idempotency_key = $1",
        ledger_idempotency,
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // DR merchant account (debit = reduce balance)
    sqlx::query!(
        r#"
        INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
        VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6)
        ON CONFLICT DO NOTHING
        "#,
        entry_id, actual_posting_id, merchant_account_id, body.amount_minor, currency, now,
    )
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // CR transit account (credit = funds held for consumer restitution)
    let entry_id2 = Uuid::new_v4();
    sqlx::query!(
        r#"
        INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
        VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6)
        ON CONFLICT DO NOTHING
        "#,
        entry_id2, actual_posting_id, consumer_account_id, body.amount_minor, currency, now,
    )
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // Mark refund SUCCEEDED
    sqlx::query!(
        r#"
        UPDATE refunds
        SET status = 'SUCCEEDED', processed_at = $1, updated_at = $1
        WHERE id = $2 AND status = 'PENDING'
        "#,
        now, actual_id,
    )
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // Append refund event for audit
    sqlx::query!(
        r#"
        INSERT INTO refund_events (refund_id, event_type, payload)
        VALUES ($1, 'refund.succeeded', $2)
        "#,
        actual_id,
        serde_json::json!({ "amount_minor": body.amount_minor, "currency": currency }),
    )
    .execute(&state.pool)
    .await
    .ok(); // fire-and-forget

    // Write to immutable audit log
    risk::audit(
        &state.pool,
        "MERCHANT",
        "REFUND_PROCESSED",
        &format!("transaction:{transaction_id}"),
        serde_json::json!({ "refund_id": actual_id, "amount_minor": body.amount_minor }),
        None,
    ).await;

    let refund = fetch_refund(&state.pool, actual_id).await?;
    Ok((StatusCode::CREATED, Json(refund)))
}

// ---------------------------------------------------------------------------
// GET /internal/v1/refunds/:id
// ---------------------------------------------------------------------------

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<RefundResponse>> {
    let id: Uuid = id.parse()
        .map_err(|_| ApiError::bad_request("invalid refund id"))?;
    let refund = fetch_refund(&state.pool, id).await?;
    Ok(Json(refund))
}

// ---------------------------------------------------------------------------
// GET /internal/v1/refunds?transaction_id=&merchant_id=
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ListRefundsQuery {
    pub transaction_id: Option<String>,
    pub merchant_id:    Option<String>,
    pub limit:          Option<i64>,
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListRefundsQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let limit = q.limit.unwrap_or(20).clamp(1, 100);

    let rows = sqlx::query!(
        r#"
        SELECT id, transaction_id, merchant_id, consumer_id, wallet_id,
               amount_minor, currency, reason, status, failure_reason,
               processed_at, created_at, updated_at
        FROM refunds
        WHERE ($1::uuid IS NULL OR transaction_id = $1)
          AND ($2::uuid IS NULL OR merchant_id    = $2)
        ORDER BY created_at DESC
        LIMIT $3
        "#,
        q.transaction_id.as_deref().and_then(|s| s.parse::<Uuid>().ok()),
        q.merchant_id.as_deref().and_then(|s| s.parse::<Uuid>().ok()),
        limit,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let data: Vec<serde_json::Value> = rows.iter().map(|r| serde_json::json!({
        "id":             r.id,
        "transaction_id": r.transaction_id,
        "merchant_id":    r.merchant_id,
        "consumer_id":    r.consumer_id,
        "wallet_id":      r.wallet_id,
        "amount_minor":   r.amount_minor,
        "currency":       r.currency,
        "reason":         r.reason,
        "status":         r.status,
        "failure_reason": r.failure_reason,
        "processed_at":   r.processed_at,
        "created_at":     r.created_at,
        "updated_at":     r.updated_at,
    })).collect();

    Ok(Json(serde_json::json!({ "data": data })))
}

// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------

async fn fetch_refund(pool: &sqlx::PgPool, id: Uuid) -> ApiResult<RefundResponse> {
    sqlx::query!(
        r#"
        SELECT id, transaction_id, merchant_id, consumer_id, wallet_id,
               amount_minor, currency, reason, status, failure_reason,
               processed_at, created_at, updated_at
        FROM refunds WHERE id = $1
        "#,
        id,
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .map(|r| RefundResponse {
        id:             r.id.to_string(),
        transaction_id: r.transaction_id.to_string(),
        merchant_id:    r.merchant_id.to_string(),
        consumer_id:    r.consumer_id.map(|u| u.to_string()),
        wallet_id:      r.wallet_id.to_string(),
        amount_minor:   r.amount_minor,
        currency:       r.currency,
        reason:         r.reason,
        status:         r.status,
        failure_reason: r.failure_reason,
        processed_at:   r.processed_at,
        created_at:     r.created_at,
        updated_at:     r.updated_at,
    })
    .ok_or_else(|| ApiError::not_found("refund not found"))
}
