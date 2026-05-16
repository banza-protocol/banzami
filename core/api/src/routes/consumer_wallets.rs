use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use banzami_consumer_wallets::{ConsumerWalletEngine, ConsumerWalletError};
use banzami_types::{Currency, LedgerEntryId, LedgerPostingId};

use crate::{error::{ApiError, ApiResult}, state::AppState};

// ---------------------------------------------------------------------------
// Request / query types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateConsumerWalletBody {
    pub consumer_id: String,
    pub currency:    String,
}

#[derive(Deserialize)]
pub struct GetForConsumerQuery {
    pub consumer_id: String,
    pub currency:    String,
}

#[derive(Deserialize)]
pub struct TestCreditBody {
    pub consumer_id:  String,
    pub amount_minor: i64,
    pub currency:     Option<String>,
}

#[derive(Serialize)]
pub struct TestCreditResponse {
    pub consumer_id:   String,
    pub currency:      String,
    pub amount_minor:  i64,
    pub new_balance:   i64,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateConsumerWalletBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let consumer_id = body
        .consumer_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer_id"))?;
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    let wallet = state
        .consumer_wallet
        .get_or_create(consumer_id, currency)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((StatusCode::CREATED, Json(serde_json::to_value(&wallet).unwrap())))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let wallet_id = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;

    let wallet = state
        .consumer_wallet
        .get(wallet_id)
        .await
        .map_err(|e| match e {
            ConsumerWalletError::NotFound(_) => ApiError::not_found("consumer wallet not found"),
            other                            => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&wallet).unwrap()))
}

pub async fn balance(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let wallet_id = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;

    let bal = state
        .consumer_wallet
        .balance(wallet_id)
        .await
        .map_err(|e| match e {
            ConsumerWalletError::NotFound(_) => ApiError::not_found("consumer wallet not found"),
            other                            => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&bal).unwrap()))
}

pub async fn get_for_consumer(
    State(state): State<AppState>,
    Query(q): Query<GetForConsumerQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let consumer_id = q
        .consumer_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer_id"))?;
    let currency = Currency::from_code(&q.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", q.currency)))?;

    let wallet = state
        .consumer_wallet
        .get_for_consumer(consumer_id, currency)
        .await
        .map_err(|e| match e {
            ConsumerWalletError::NoWalletForConsumer { .. } => {
                ApiError::not_found("no wallet for consumer in that currency")
            }
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&wallet).unwrap()))
}

/// POST /internal/v1/consumer-wallets/test-credit
///
/// Injects funds directly into a consumer's available ledger account.
/// For development and test environments only — not exposed in production.
pub async fn test_credit(
    State(state): State<AppState>,
    Json(body): Json<TestCreditBody>,
) -> ApiResult<Json<TestCreditResponse>> {
    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
    }

    let consumer_id: uuid::Uuid = body
        .consumer_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer_id"))?;

    let currency_code = body.currency.as_deref().unwrap_or("AOA");
    let currency = Currency::from_code(currency_code)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {currency_code}")))?;

    // Resolve the consumer's available ledger account.
    let available_account_id: uuid::Uuid = sqlx::query_scalar(
        "SELECT available_account_id
         FROM consumer_wallets
         WHERE consumer_id = $1 AND currency = $2 AND status = 'ACTIVE'
         ORDER BY created_at ASC
         LIMIT 1",
    )
    .bind(consumer_id)
    .bind(currency.code())
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("no active wallet for consumer in that currency"))?;

    let posting_id = LedgerPostingId::new();
    let now        = chrono::Utc::now();

    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(posting_id.as_uuid())
    .bind("Test credit (admin)")
    .bind(format!("admin-test-credit-{}-{}", consumer_id, uuid::Uuid::new_v4()))
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    sqlx::query(
        "INSERT INTO ledger_entries
         (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
         VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6)",
    )
    .bind(LedgerEntryId::new().as_uuid())
    .bind(posting_id.as_uuid())
    .bind(available_account_id)
    .bind(body.amount_minor)
    .bind(currency.code())
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let new_balance: i64 = sqlx::query_scalar(
        "SELECT COALESCE(
             SUM(CASE entry_type
                 WHEN 'DEBIT'  THEN -amount_minor
                 WHEN 'CREDIT' THEN  amount_minor
                 END),
             0)::BIGINT
         FROM ledger_entries
         WHERE account_id = $1",
    )
    .bind(available_account_id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    tracing::info!(
        consumer_id = %consumer_id,
        amount_minor = body.amount_minor,
        currency     = currency.code(),
        "admin test credit applied"
    );

    Ok(Json(TestCreditResponse {
        consumer_id:  body.consumer_id,
        currency:     currency_code.to_owned(),
        amount_minor: body.amount_minor,
        new_balance,
    }))
}
