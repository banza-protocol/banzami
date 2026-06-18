use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_risk::{RiskContext, RiskDecision, RiskEngine, RiskRequest};
use banzami_transactions::{
    AuthorizeRequest, CaptureRequest, CreateTransactionRequest, FailRequest, ReverseRequest,
    TransactionEngine, TransactionError, TransactionType,
};
use banzami_types::{Currency, MerchantId, Money, TransactionId, WalletId};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateTransactionBody {
    pub idempotency_key: String,
    pub transaction_type: String,
    pub amount_minor: i64,
    pub currency: String,
    pub merchant_id: String,
    pub wallet_id: String,
    pub description: Option<String>,
}

#[derive(Deserialize)]
pub struct FailBody {
    pub reason: String,
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub merchant_id: String,
    pub limit: Option<i64>,
    /// Keyset cursor: RFC3339 timestamp of the last returned transaction.
    pub before_created_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Keyset cursor: UUID of the last returned transaction (tiebreaker).
    pub before_id: Option<String>,
    /// Inclusive lower bound — returns only transactions created at or after this timestamp.
    pub since_created_at: Option<chrono::DateTime<chrono::Utc>>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateTransactionBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    let tx_type = TransactionType::try_from_str(&body.transaction_type).ok_or_else(|| {
        ApiError::bad_request(format!(
            "unknown transaction_type: {}",
            body.transaction_type
        ))
    })?;

    let merchant_id: MerchantId = body
        .merchant_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    let wallet_id: WalletId = body
        .wallet_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid wallet_id"))?;

    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
    }

    let tx = state
        .tx_engine
        .create(CreateTransactionRequest {
            idempotency_key: body.idempotency_key,
            transaction_type: tx_type,
            amount: Money::new(body.amount_minor, currency),
            merchant_id,
            wallet_id,
            description: body.description,
        })
        .await
        .map_err(|e| match e {
            TransactionError::DuplicateIdempotencyKey(_) => {
                ApiError::conflict("CONFLICT", "duplicate idempotency key")
            }
            other => ApiError::internal(other.to_string()),
        })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(&tx).unwrap()),
    ))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let tx_id: TransactionId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid transaction id"))?;

    let tx = state.tx_engine.get(tx_id).await.map_err(|e| match e {
        TransactionError::NotFound(_) => ApiError::not_found("transaction not found"),
        other => ApiError::internal(other.to_string()),
    })?;

    Ok(Json(serde_json::to_value(&tx).unwrap()))
}

pub async fn authorize(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let tx_id: TransactionId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid transaction id"))?;

    // Real-time risk evaluation (RSK-001) before authorizing. We fetch the
    // pending transaction, build the merchant's velocity context from the
    // ledger of recent transactions, and run the risk engine. On a breach we
    // record a suspicious-activity event (RSK-002) and decline the authorization.
    let pending = state.tx_engine.get(tx_id).await.map_err(|e| match e {
        TransactionError::NotFound(_) => ApiError::not_found("transaction not found"),
        other => ApiError::internal(other.to_string()),
    })?;
    let merchant_id = pending.merchant_id;

    let (hourly_count, daily_amount_minor): (i64, i64) = sqlx::query_as(
        "SELECT
            COUNT(*) FILTER (
                WHERE created_at >= now() - interval '1 hour'
                  AND status IN ('AUTHORIZED', 'CAPTURED'))::BIGINT,
            COALESCE(SUM(amount_minor) FILTER (
                WHERE created_at >= date_trunc('day', now())
                  AND status IN ('AUTHORIZED', 'CAPTURED')), 0)::BIGINT
         FROM transactions
         WHERE merchant_id = $1",
    )
    .bind(merchant_id.as_uuid())
    .fetch_one(&state.pool)
    .await
    .unwrap_or((0, 0));

    // Account signal: age of the merchant account in days.
    let account_age_days: i64 = sqlx::query_scalar(
        "SELECT GREATEST(0, EXTRACT(DAY FROM (now() - created_at)))::BIGINT
         FROM merchants WHERE id = $1",
    )
    .bind(merchant_id.as_uuid())
    .fetch_optional(&state.pool)
    .await
    .ok()
    .flatten()
    .unwrap_or(365);

    let assessment = state
        .risk
        .evaluate(RiskRequest {
            transaction_id: tx_id,
            merchant_id,
            amount: pending.amount,
            context: RiskContext {
                hourly_count: hourly_count.max(0) as u32,
                daily_amount_minor,
                account_age_days: account_age_days.max(0) as u32,
                // Server-to-server merchant transaction — no device context.
                device_recognized: None,
            },
        })
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let reason = assessment
        .decline_reason
        .clone()
        .unwrap_or_else(|| "risk threshold breached".to_owned());
    match assessment.decision {
        RiskDecision::Decline => {
            // RSK-002: open a HIGH risk flag in the review queue + suspicious log.
            super::risk::flag_risk(
                &state.pool,
                "MERCHANT",
                merchant_id.as_uuid(),
                "VELOCITY_BREACH",
                "HIGH",
                &reason,
            )
            .await;
            super::risk::flag_suspicious(
                &state.pool,
                "MERCHANT",
                merchant_id.as_uuid(),
                "VELOCITY_BREACH",
                &reason,
                serde_json::json!({
                    "transaction_id": tx_id.to_string(),
                    "amount_minor":   pending.amount.amount_minor(),
                    "hourly_count":   hourly_count,
                    "daily_amount_minor": daily_amount_minor,
                }),
            )
            .await;
            return Err(ApiError::unprocessable("RISK_DECLINED", reason));
        }
        RiskDecision::Review => {
            // Soft account/device signal — authorize but flag for review (MEDIUM).
            super::risk::flag_risk(
                &state.pool,
                "MERCHANT",
                merchant_id.as_uuid(),
                "LARGE_AMOUNT",
                "MEDIUM",
                &reason,
            )
            .await;
        }
        RiskDecision::Allow => {}
    }

    let tx = state
        .tx_engine
        .authorize(AuthorizeRequest { tx_id })
        .await
        .map_err(|e| match e {
            TransactionError::NotFound(_) => ApiError::not_found("transaction not found"),
            TransactionError::InvalidStatusTransition { from, to } => ApiError::unprocessable(
                "INVALID_TRANSITION",
                format!("cannot transition {from:?} → {to:?}"),
            ),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&tx).unwrap()))
}

pub async fn capture(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let tx_id: TransactionId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid transaction id"))?;

    let tx = state
        .tx_engine
        .capture(CaptureRequest { tx_id })
        .await
        .map_err(|e| match e {
            TransactionError::NotFound(_) => ApiError::not_found("transaction not found"),
            TransactionError::InvalidStatusTransition { from, to } => ApiError::unprocessable(
                "INVALID_TRANSITION",
                format!("cannot transition {from:?} → {to:?}"),
            ),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&tx).unwrap()))
}

pub async fn reverse(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let tx_id: TransactionId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid transaction id"))?;

    let tx = state
        .tx_engine
        .reverse(ReverseRequest { tx_id })
        .await
        .map_err(|e| match e {
            TransactionError::NotFound(_) => ApiError::not_found("transaction not found"),
            TransactionError::InvalidStatusTransition { from, to } => ApiError::unprocessable(
                "INVALID_TRANSITION",
                format!("cannot transition {from:?} → {to:?}"),
            ),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&tx).unwrap()))
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = q
        .merchant_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    let limit = q.limit.unwrap_or(20).clamp(1, 100);

    let before_id = q
        .before_id
        .map(|s| s.parse::<TransactionId>())
        .transpose()
        .map_err(|_| ApiError::bad_request("invalid before_id"))?;

    // Fetch one extra to determine whether a next page exists.
    let mut txs = state
        .tx_engine
        .list(
            merchant_id,
            limit + 1,
            q.before_created_at,
            before_id,
            q.since_created_at,
        )
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let has_more = txs.len() as i64 > limit;
    txs.truncate(limit as usize);

    Ok(Json(serde_json::json!({
        "data":     txs,
        "has_more": has_more,
    })))
}

pub async fn fail(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<FailBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let tx_id: TransactionId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid transaction id"))?;

    let tx = state
        .tx_engine
        .fail(FailRequest {
            tx_id,
            reason: body.reason,
        })
        .await
        .map_err(|e| match e {
            TransactionError::NotFound(_) => ApiError::not_found("transaction not found"),
            TransactionError::InvalidStatusTransition { from, to } => ApiError::unprocessable(
                "INVALID_TRANSITION",
                format!("cannot transition {from:?} → {to:?}"),
            ),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&tx).unwrap()))
}
