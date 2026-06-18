use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    routes::risk,
    state::AppState,
};

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Serialize, Debug)]
pub struct RefundResponse {
    pub id: String,
    /// Typed refund source (BANZA ADR-030): TRANSACTION | WALLET_PAYMENT.
    pub source_type: String,
    pub source_id: String,
    /// Present only for acquiring (TRANSACTION) refunds.
    pub transaction_id: Option<String>,
    pub merchant_id: String,
    pub consumer_id: Option<String>,
    pub wallet_id: String,
    pub amount_minor: i64,
    pub currency: String,
    pub reason: Option<String>,
    pub status: String,
    pub failure_reason: Option<String>,
    pub processed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// POST /internal/v1/refunds
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateRefundBody {
    /// Typed source (BANZA ADR-030). Defaults to TRANSACTION for backward
    /// compatibility with acquiring callers that send `transaction_id`.
    pub source_type: Option<String>,
    /// Id of the typed source object. Falls back to `transaction_id`.
    pub source_id: Option<String>,
    /// Legacy acquiring field — still accepted; treated as a TRANSACTION source.
    pub transaction_id: Option<String>,
    pub merchant_id: String,
    pub amount_minor: i64,
    pub reason: Option<String>,
    pub idempotency_key: String,
}

/// The merchant/credit accounts and original amount resolved from a typed source.
struct ResolvedSource {
    merchant_wallet_id: Uuid,
    merchant_account_id: Uuid,
    /// Where the refund credit lands: transit (acquiring) or the payer's
    /// consumer wallet (wallet-native).
    credit_account_id: Uuid,
    currency: String,
    consumer_id: Option<Uuid>,
    transaction_id: Option<Uuid>,
    original_amount: i64,
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

    let merchant_id: Uuid = body
        .merchant_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    // Idempotency first: a replay of an already-recorded key returns the existing
    // refund verbatim, BEFORE the over-refund ceiling check.
    if let Some(existing_id) =
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM refunds WHERE idempotency_key = $1")
            .bind(&body.idempotency_key)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?
    {
        let refund = fetch_refund(&state.pool, existing_id).await?;
        return Ok((StatusCode::CREATED, Json(refund)));
    }

    // Resolve the typed source (ADR-030): never a generic transfer.
    let source_type = body
        .source_type
        .as_deref()
        .unwrap_or("TRANSACTION")
        .to_uppercase();
    let source_id_str = body
        .source_id
        .clone()
        .or_else(|| body.transaction_id.clone())
        .ok_or_else(|| ApiError::bad_request("source_id (or transaction_id) is required"))?;
    let source_id: Uuid = source_id_str
        .parse()
        .map_err(|_| ApiError::bad_request("invalid source_id"))?;

    // Account freezes block refunds for either source.
    if risk::is_frozen(&state.pool, "MERCHANT", merchant_id).await {
        return Err(ApiError::unprocessable(
            "ACCOUNT_FROZEN",
            "merchant account is frozen — refunds are blocked",
        ));
    }

    let resolved = match source_type.as_str() {
        "TRANSACTION" => resolve_transaction_source(&state, merchant_id, source_id).await?,
        "WALLET_PAYMENT" => resolve_wallet_payment_source(&state, merchant_id, source_id).await?,
        _ => {
            return Err(ApiError::bad_request(
                "source_type must be TRANSACTION or WALLET_PAYMENT",
            ))
        }
    };

    // Over-refund ceiling — scoped by typed source (no cross-path double refund).
    let already_refunded: i64 = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(amount_minor), 0)::BIGINT FROM refunds
         WHERE source_type = $1 AND source_id = $2
           AND status IN ('PENDING', 'PROCESSING', 'SUCCEEDED')",
    )
    .bind(&source_type)
    .bind(source_id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    if already_refunded + body.amount_minor > resolved.original_amount {
        return Err(ApiError::unprocessable(
            "REFUND_EXCEEDS_CAPTURED",
            format!(
                "cannot refund {} — only {} remaining of original {}",
                body.amount_minor,
                resolved.original_amount - already_refunded,
                resolved.original_amount,
            ),
        ));
    }

    // Idempotent insert of the refund row.
    let refund_id = Uuid::new_v4();
    let inserted: Option<Uuid> = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO refunds
            (id, source_type, source_id, transaction_id, merchant_id, wallet_id,
             consumer_id, amount_minor, currency, reason, status, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', $11)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id",
    )
    .bind(refund_id)
    .bind(&source_type)
    .bind(source_id)
    .bind(resolved.transaction_id)
    .bind(merchant_id)
    .bind(resolved.merchant_wallet_id)
    .bind(resolved.consumer_id)
    .bind(body.amount_minor)
    .bind(&resolved.currency)
    .bind(&body.reason)
    .bind(&body.idempotency_key)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let actual_id = match inserted {
        Some(id) => id,
        None => sqlx::query_scalar::<_, Uuid>("SELECT id FROM refunds WHERE idempotency_key = $1")
            .bind(&body.idempotency_key)
            .fetch_one(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?,
    };

    // Balanced double-entry posting: merchant.available DR → credit account CR.
    // The credit account is transit (acquiring) or the payer's wallet
    // (wallet-native). Idempotent on the posting key.
    let ledger_key = format!("refund-{actual_id}");
    let now = Utc::now();

    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4) ON CONFLICT (idempotency_key) DO NOTHING",
    )
    .bind(Uuid::new_v4())
    .bind(format!("refund:{actual_id}"))
    .bind(&ledger_key)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let posting_id: Uuid =
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM ledger_postings WHERE idempotency_key = $1")
            .bind(&ledger_key)
            .fetch_one(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?;

    sqlx::query(
        "INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
         VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6) ON CONFLICT DO NOTHING",
    )
    .bind(Uuid::new_v4())
    .bind(posting_id)
    .bind(resolved.merchant_account_id)
    .bind(body.amount_minor)
    .bind(&resolved.currency)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    sqlx::query(
        "INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
         VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6) ON CONFLICT DO NOTHING",
    )
    .bind(Uuid::new_v4())
    .bind(posting_id)
    .bind(resolved.credit_account_id)
    .bind(body.amount_minor)
    .bind(&resolved.currency)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    sqlx::query(
        "UPDATE refunds SET status = 'SUCCEEDED', processed_at = $1, updated_at = $1
         WHERE id = $2 AND status = 'PENDING'",
    )
    .bind(now)
    .bind(actual_id)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    sqlx::query(
        "INSERT INTO refund_events (refund_id, event_type, payload)
         VALUES ($1, 'refund.succeeded', $2)",
    )
    .bind(actual_id)
    .bind(serde_json::json!({ "amount_minor": body.amount_minor, "currency": resolved.currency }))
    .execute(&state.pool)
    .await
    .ok(); // fire-and-forget

    // Immutable audit log — subject is the typed source.
    risk::audit(
        &state.pool,
        "MERCHANT",
        "REFUND_PROCESSED",
        &format!("{}:{}", source_type.to_lowercase(), source_id),
        serde_json::json!({
            "refund_id": actual_id,
            "amount_minor": body.amount_minor,
            "source_type": source_type,
        }),
        None,
    )
    .await;

    // Emit refund.completed to the outbox (delivered to the source merchant only).
    // Fires only here, after the refund SUCCEEDED; idempotent on the refund id.
    let _ = super::webhooks::emit(
        &state.pool,
        merchant_id,
        "refund.completed",
        &format!("refund.completed:{actual_id}"),
        serde_json::json!({
            "refund_id": actual_id,
            "source_type": source_type,
            "source_id": source_id,
            "merchant_id": merchant_id,
            "amount_minor": body.amount_minor,
            "currency": resolved.currency,
            "status": "SUCCEEDED",
            "trace_id": body.idempotency_key,
            "created_at": now,
        }),
    )
    .await;

    let refund = fetch_refund(&state.pool, actual_id).await?;
    Ok((StatusCode::CREATED, Json(refund)))
}

/// Acquiring source: refund credit goes to transit (no consumer wallet exists).
async fn resolve_transaction_source(
    state: &AppState,
    merchant_id: Uuid,
    transaction_id: Uuid,
) -> ApiResult<ResolvedSource> {
    let row = sqlx::query(
        "SELECT wallet_id, amount_minor, currency, status
         FROM transactions WHERE id = $1 AND merchant_id = $2",
    )
    .bind(transaction_id)
    .bind(merchant_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("transaction not found"))?;

    let status: String = row.get("status");
    if !["CAPTURED", "SETTLED"].contains(&status.as_str()) {
        return Err(ApiError::unprocessable(
            "INVALID_TRANSACTION_STATUS",
            format!("transaction status {status} is not refundable"),
        ));
    }
    let wallet_id: Uuid = row.get("wallet_id");
    let merchant_account_id: Uuid =
        sqlx::query_scalar::<_, Uuid>("SELECT available_account_id FROM wallets WHERE id = $1")
            .bind(wallet_id)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?
            .ok_or_else(|| {
                ApiError::unprocessable("WALLET_NOT_FOUND", "merchant wallet not found")
            })?;

    Ok(ResolvedSource {
        merchant_wallet_id: wallet_id,
        merchant_account_id,
        credit_account_id: state.transit_account_id.as_uuid(),
        currency: row.get("currency"),
        consumer_id: None,
        transaction_id: Some(transaction_id),
        original_amount: row.get("amount_minor"),
    })
}

/// Wallet-native source: refund credit goes to the original payer's wallet.
async fn resolve_wallet_payment_source(
    state: &AppState,
    merchant_id: Uuid,
    wallet_payment_id: Uuid,
) -> ApiResult<ResolvedSource> {
    let row = sqlx::query(
        "SELECT merchant_id, consumer_id, amount_minor, currency, status
         FROM wallet_payments WHERE id = $1",
    )
    .bind(wallet_payment_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("wallet payment not found"))?;

    // Authorization: only the owning merchant may refund its wallet payment.
    let wp_merchant: Uuid = row.get("merchant_id");
    if wp_merchant != merchant_id {
        return Err(ApiError::unprocessable(
            "REFUND_NOT_AUTHORIZED",
            "this wallet payment belongs to a different merchant",
        ));
    }

    let status: String = row.get("status");
    if status != "COMPLETED" {
        return Err(ApiError::unprocessable(
            "INVALID_PAYMENT_STATUS",
            format!("wallet payment status {status} is not refundable"),
        ));
    }

    let consumer_id: Uuid = row.get("consumer_id");
    let currency: String = row.get("currency");

    // Merchant wallet to debit.
    let merchant_wallet = sqlx::query(
        "SELECT id, available_account_id FROM wallets
         WHERE merchant_id = $1 AND currency = $2 AND status = 'ACTIVE' LIMIT 1",
    )
    .bind(merchant_id)
    .bind(&currency)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::unprocessable("WALLET_NOT_FOUND", "merchant wallet not found"))?;

    // Payer's consumer wallet to credit.
    let consumer_account_id: Uuid = sqlx::query_scalar::<_, Uuid>(
        "SELECT available_account_id FROM consumer_wallets
         WHERE consumer_id = $1 AND currency = $2 AND status = 'ACTIVE'",
    )
    .bind(consumer_id)
    .bind(&currency)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| {
        ApiError::unprocessable("CONSUMER_WALLET_NOT_FOUND", "payer wallet not found")
    })?;

    Ok(ResolvedSource {
        merchant_wallet_id: merchant_wallet.get("id"),
        merchant_account_id: merchant_wallet.get("available_account_id"),
        credit_account_id: consumer_account_id,
        currency,
        consumer_id: Some(consumer_id),
        transaction_id: None,
        original_amount: row.get("amount_minor"),
    })
}

// ---------------------------------------------------------------------------
// GET /internal/v1/refunds/:id
// ---------------------------------------------------------------------------

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<RefundResponse>> {
    let id: Uuid = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid refund id"))?;
    let refund = fetch_refund(&state.pool, id).await?;
    Ok(Json(refund))
}

// ---------------------------------------------------------------------------
// GET /internal/v1/refunds?source_id=&merchant_id=
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ListRefundsQuery {
    pub source_id: Option<String>,
    pub transaction_id: Option<String>,
    pub merchant_id: Option<String>,
    pub limit: Option<i64>,
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListRefundsQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let limit = q.limit.unwrap_or(20).clamp(1, 100);
    // A caller may filter by source_id or the legacy transaction_id (same value
    // for acquiring refunds).
    let source_filter = q
        .source_id
        .as_deref()
        .or(q.transaction_id.as_deref())
        .and_then(|s| s.parse::<Uuid>().ok());

    let rows = sqlx::query(
        "SELECT id, source_type, source_id, transaction_id, merchant_id, consumer_id, wallet_id,
                amount_minor, currency, reason, status, failure_reason,
                processed_at, created_at, updated_at
         FROM refunds
         WHERE ($1::uuid IS NULL OR source_id = $1)
           AND ($2::uuid IS NULL OR merchant_id = $2)
         ORDER BY created_at DESC
         LIMIT $3",
    )
    .bind(source_filter)
    .bind(
        q.merchant_id
            .as_deref()
            .and_then(|s| s.parse::<Uuid>().ok()),
    )
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let data: Vec<serde_json::Value> = rows.iter().map(row_to_json).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

fn row_to_json(r: &sqlx::postgres::PgRow) -> serde_json::Value {
    let transaction_id: Option<Uuid> = r.get("transaction_id");
    let consumer_id: Option<Uuid> = r.get("consumer_id");
    serde_json::json!({
        "id":             r.get::<Uuid, _>("id"),
        "source_type":    r.get::<String, _>("source_type"),
        "source_id":      r.get::<Uuid, _>("source_id"),
        "transaction_id": transaction_id,
        "merchant_id":    r.get::<Uuid, _>("merchant_id"),
        "consumer_id":    consumer_id,
        "wallet_id":      r.get::<Uuid, _>("wallet_id"),
        "amount_minor":   r.get::<i64, _>("amount_minor"),
        "currency":       r.get::<String, _>("currency"),
        "reason":         r.get::<Option<String>, _>("reason"),
        "status":         r.get::<String, _>("status"),
        "failure_reason": r.get::<Option<String>, _>("failure_reason"),
        "processed_at":   r.get::<Option<DateTime<Utc>>, _>("processed_at"),
        "created_at":     r.get::<DateTime<Utc>, _>("created_at"),
        "updated_at":     r.get::<DateTime<Utc>, _>("updated_at"),
    })
}

// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------

async fn fetch_refund(pool: &sqlx::PgPool, id: Uuid) -> ApiResult<RefundResponse> {
    let r = sqlx::query(
        "SELECT id, source_type, source_id, transaction_id, merchant_id, consumer_id, wallet_id,
                amount_minor, currency, reason, status, failure_reason,
                processed_at, created_at, updated_at
         FROM refunds WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("refund not found"))?;

    let transaction_id: Option<Uuid> = r.get("transaction_id");
    let consumer_id: Option<Uuid> = r.get("consumer_id");
    Ok(RefundResponse {
        id: r.get::<Uuid, _>("id").to_string(),
        source_type: r.get("source_type"),
        source_id: r.get::<Uuid, _>("source_id").to_string(),
        transaction_id: transaction_id.map(|t| t.to_string()),
        merchant_id: r.get::<Uuid, _>("merchant_id").to_string(),
        consumer_id: consumer_id.map(|c| c.to_string()),
        wallet_id: r.get::<Uuid, _>("wallet_id").to_string(),
        amount_minor: r.get("amount_minor"),
        currency: r.get("currency"),
        reason: r.get("reason"),
        status: r.get("status"),
        failure_reason: r.get("failure_reason"),
        processed_at: r.get("processed_at"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    })
}
