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
    routes::{restitution, risk},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Error hardening (D0) — the refund route family must NEVER leak sqlx/postgres/
// constraint/table/SQL text to a public response. Raw detail is logged
// server-side only; the caller gets a neutral message or the established
// controlled conflict.
// ---------------------------------------------------------------------------

/// Neutral internal error for the refund flow — no DB/SQL/constraint text. The
/// raw error is logged server-side (a refund DB error carries no secret).
pub(crate) fn refund_internal(context: &'static str, e: impl std::fmt::Display) -> ApiError {
    tracing::error!(context, error = %e, "refund flow database error");
    ApiError::internal("refund could not be processed")
}

/// Maps a refunds-write DB error: a source-scoped idempotency uniqueness
/// collision (SQLSTATE 23505) resolves to the established `409` conflict; any
/// other failure is a neutral internal error. Never leaks the constraint name.
pub(crate) fn refund_write_err(e: sqlx::Error) -> ApiError {
    if e.as_database_error().and_then(|d| d.code()).as_deref() == Some("23505") {
        tracing::warn!(error = %e, "refund idempotency uniqueness collision (source-scoped)");
        return ApiError::conflict(
            "IDEMPOTENCY_KEY_CONFLICT",
            "a refund with this idempotency key already exists for this source",
        );
    }
    refund_internal("refund write", e)
}

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
    /// Validation assertion only (Banzami ADR-034). The authoritative refund
    /// currency is the source's; a differing supplied currency is rejected.
    pub currency: Option<String>,
    pub reason: Option<String>,
    pub idempotency_key: String,
}

/// A refund is a REFUND-origin restitution against a typed source: it routes
/// through the single shared `apply_restitution` primitive (Banzami ADR-034), so
/// the ceiling is shared with dispute restitution and enforced atomically. The
/// refund object itself remains a distinct refund.
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

    let source_type_raw = body
        .source_type
        .clone()
        .unwrap_or_else(|| "TRANSACTION".to_string());
    let source_id_str = body
        .source_id
        .clone()
        .or_else(|| body.transaction_id.clone())
        .ok_or_else(|| ApiError::bad_request("source_id (or transaction_id) is required"))?;
    let source_id: Uuid = source_id_str
        .parse()
        .map_err(|_| ApiError::bad_request("invalid source_id"))?;

    let refund_id = Uuid::new_v4();
    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| refund_internal("begin", e))?;

    let result = restitution::apply_restitution(
        &mut tx,
        restitution::ApplyParams {
            source_type: source_type_raw.clone(),
            source_id,
            merchant_id,
            amount_minor: body.amount_minor,
            supplied_currency: body.currency.clone().unwrap_or_default(),
            origin: restitution::Origin::Refund,
            origin_id: refund_id,
            idempotency_key: body.idempotency_key.clone(),
            over_ceiling: restitution::OverCeiling::Reject,
            posting_key: format!("refund-{refund_id}"),
            posting_description: format!("refund:{refund_id}"),
            transit_account_id: state.transit_account_id.as_uuid(),
        },
    )
    .await
    .map_err(map_restitution_err)?;

    // Idempotent replay — return the ORIGINAL refund; create nothing new.
    if result.replayed {
        tx.rollback().await.ok();
        let refund = fetch_refund(&state.pool, result.origin_id, merchant_id).await?;
        return Ok((StatusCode::CREATED, Json(refund)));
    }

    let stored_source_type = if source_type_raw.eq_ignore_ascii_case("WALLET_PAYMENT") {
        "WALLET_PAYMENT"
    } else {
        "TRANSACTION"
    };
    let now = Utc::now();

    // The refund object (distinct from the internal allocation), linked to the
    // committed posting. Source is never mutated.
    sqlx::query(
        "INSERT INTO refunds
            (id, source_type, source_id, transaction_id, merchant_id, wallet_id, consumer_id,
             amount_minor, currency, reason, status, idempotency_key, processed_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'SUCCEEDED', $11, $12, $12)",
    )
    .bind(refund_id)
    .bind(stored_source_type)
    .bind(source_id)
    .bind(result.transaction_id)
    .bind(merchant_id)
    .bind(result.merchant_wallet_id)
    .bind(result.consumer_id)
    .bind(result.effective_amount)
    .bind(&result.currency)
    .bind(&body.reason)
    .bind(&body.idempotency_key)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(refund_write_err)?;

    tx.commit()
        .await
        .map_err(|e| refund_internal("commit", e))?;

    // ── side effects (best-effort, after commit) ──
    sqlx::query("INSERT INTO refund_events (refund_id, event_type, payload) VALUES ($1, 'refund.succeeded', $2)")
        .bind(refund_id)
        .bind(serde_json::json!({ "amount_minor": result.effective_amount, "currency": result.currency }))
        .execute(&state.pool)
        .await
        .ok();

    risk::audit(
        &state.pool,
        "MERCHANT",
        "REFUND_PROCESSED",
        &format!("{}:{}", stored_source_type.to_lowercase(), source_id),
        serde_json::json!({
            "refund_id": refund_id,
            "amount_minor": result.effective_amount,
            "source_type": stored_source_type,
        }),
        None,
    )
    .await;

    let _ = super::webhooks::emit(
        &state.pool,
        merchant_id,
        "refund.completed",
        &format!("refund.completed:{refund_id}"),
        serde_json::json!({
            "refund_id": refund_id,
            "source_type": stored_source_type,
            "source_id": source_id,
            "merchant_id": merchant_id,
            "amount_minor": result.effective_amount,
            "currency": result.currency,
            "status": "SUCCEEDED",
            "trace_id": body.idempotency_key,
            "created_at": now,
        }),
    )
    .await;

    // Proof correction: mark the acquiring proof REVERSED ONLY when the source is
    // fully reversed (cumulative restitution == captured). A partial refund keeps
    // the proof CONFIRMED — no PARTIALLY_REVERSED state.
    if result.fully_reversed {
        if let Some(tid) = result.transaction_id {
            restitution::mark_proof_fully_reversed(&state.pool, tid, state.environment.as_str()).await;
        }
    }

    let refund = fetch_refund(&state.pool, refund_id, merchant_id).await?;
    Ok((StatusCode::CREATED, Json(refund)))
}

fn map_restitution_err(e: restitution::RestitutionError) -> ApiError {
    use restitution::RestitutionError::*;
    match e {
        InvalidSourceType => {
            ApiError::bad_request("source_type must be ACQUIRING_PAYMENT/TRANSACTION or WALLET_PAYMENT")
        }
        SourceNotFound => ApiError::not_found("refund source not found"),
        InvalidTransactionStatus(s) => ApiError::unprocessable(
            "INVALID_TRANSACTION_STATUS",
            format!("transaction status {s} is not refundable"),
        ),
        InvalidPaymentStatus(s) => ApiError::unprocessable(
            "INVALID_PAYMENT_STATUS",
            format!("wallet payment status {s} is not refundable"),
        ),
        AccountFrozen => ApiError::unprocessable(
            "ACCOUNT_FROZEN",
            "merchant account is frozen — refunds are blocked",
        ),
        CurrencyMismatch { supplied, source } => ApiError::unprocessable(
            "CURRENCY_MISMATCH",
            format!("supplied currency {supplied} does not match source currency {source}"),
        ),
        ExceedsCaptured {
            remaining,
            requested,
            captured,
        } => ApiError::unprocessable(
            "REFUND_EXCEEDS_CAPTURED",
            format!("cannot refund {requested} — only {remaining} remaining of original {captured}"),
        ),
        IdempotencyKeyConflict => ApiError::conflict(
            "IDEMPOTENCY_KEY_CONFLICT",
            "idempotency key reused with incompatible parameters",
        ),
        WalletNotFound => ApiError::unprocessable("WALLET_NOT_FOUND", "merchant wallet not found"),
        ConsumerWalletNotFound => {
            ApiError::unprocessable("CONSUMER_WALLET_NOT_FOUND", "payer wallet not found")
        }
        Db(m) => refund_internal("restitution", m),
    }
}

// ---------------------------------------------------------------------------
// GET /internal/v1/refunds/:id
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct GetRefundQuery {
    /// Required tenant scope — supplied by the gateway from the verified JWT
    /// principal, never from the public request.
    pub merchant_id: Option<String>,
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<GetRefundQuery>,
) -> ApiResult<Json<RefundResponse>> {
    // Tenant-scoped read (F1): a missing merchant context, a malformed id, a
    // non-existent refund and a refund owned by another merchant all resolve to
    // the SAME controlled 404 — externally indistinguishable, no enumeration.
    let id: Uuid = match id.parse() {
        Ok(v) => v,
        Err(_) => return Err(ApiError::not_found("refund not found")),
    };
    let merchant_id: Uuid = match q.merchant_id.as_deref().and_then(|s| s.parse().ok()) {
        Some(v) => v,
        None => return Err(ApiError::not_found("refund not found")),
    };
    let refund = fetch_refund(&state.pool, id, merchant_id).await?;
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
    let source_filter = q
        .source_id
        .as_deref()
        .or(q.transaction_id.as_deref())
        .and_then(|s| s.parse::<Uuid>().ok());

    // Fail CLOSED (F3): a valid merchant context is mandatory. There is no
    // nullable "all merchants" fallback — an absent/malformed merchant_id is
    // rejected and can never enumerate another tenant's refunds. The gateway
    // always supplies it from the verified principal, so this only trips a
    // malformed direct Core call.
    let merchant_id: Uuid = q
        .merchant_id
        .as_deref()
        .and_then(|s| s.parse::<Uuid>().ok())
        .ok_or_else(|| ApiError::bad_request("merchant_id is required"))?;

    let rows = sqlx::query(
        "SELECT id, source_type, source_id, transaction_id, merchant_id, consumer_id, wallet_id,
                amount_minor, currency, reason, status, failure_reason,
                processed_at, created_at, updated_at
         FROM refunds
         WHERE merchant_id = $2
           AND ($1::uuid IS NULL OR source_id = $1)
         ORDER BY created_at DESC
         LIMIT $3",
    )
    .bind(source_filter)
    .bind(merchant_id)
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| refund_internal("list", e))?;

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

async fn fetch_refund(
    pool: &sqlx::PgPool,
    id: Uuid,
    merchant_id: Uuid,
) -> ApiResult<RefundResponse> {
    // Tenant-scoped (F1): query by refund id AND merchant id. A refund owned by
    // another merchant returns the identical `not found` as a non-existent one.
    let r = sqlx::query(
        "SELECT id, source_type, source_id, transaction_id, merchant_id, consumer_id, wallet_id,
                amount_minor, currency, reason, status, failure_reason,
                processed_at, created_at, updated_at
         FROM refunds WHERE id = $1 AND merchant_id = $2",
    )
    .bind(id)
    .bind(merchant_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| refund_internal("fetch", e))?
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
