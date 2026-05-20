use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use banzami_consumer_wallets::{
    CommitReservedRequest, ConsumerWalletEngine, ConsumerWalletError, ReleaseRequest,
    ReserveRequest,
};
use banzami_types::{AccountId, Currency, LedgerEntryId, LedgerPostingId, Money};

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

// ---------------------------------------------------------------------------
// Reserve / release / commit — WAL-002 balance engine
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ReserveBody {
    pub amount_minor:    i64,
    pub currency:        Option<String>,
    pub reason:          String,
    pub idempotency_key: String,
}

#[derive(Deserialize)]
pub struct ReleaseBody {
    pub reserve_id: uuid::Uuid,
}

#[derive(Deserialize)]
pub struct CommitBody {
    pub reserve_id:        uuid::Uuid,
    pub target_account_id: String,
}

/// POST /internal/v1/consumer-wallets/:id/reserve
pub async fn reserve(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ReserveBody>,
) -> ApiResult<Json<serde_json::Value>> {
    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
    }
    let wallet_id = id.parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;
    let currency_code = body.currency.as_deref().unwrap_or("AOA");
    let currency = Currency::from_code(currency_code)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {currency_code}")))?;

    let reservation = state
        .consumer_wallet
        .reserve(ReserveRequest {
            wallet_id,
            amount:          Money::new(body.amount_minor, currency),
            reason:          body.reason,
            idempotency_key: body.idempotency_key,
        })
        .await
        .map_err(|e| match e {
            ConsumerWalletError::NotFound(_)         => ApiError::not_found("wallet not found"),
            ConsumerWalletError::NotActive(_)        => ApiError::bad_request("wallet is not active"),
            ConsumerWalletError::InsufficientFunds { .. } => ApiError::bad_request("insufficient available balance"),
            ConsumerWalletError::CurrencyMismatch { .. }  => ApiError::bad_request("currency mismatch"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&reservation).unwrap()))
}

/// POST /internal/v1/consumer-wallets/:id/release
pub async fn release(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ReleaseBody>,
) -> ApiResult<StatusCode> {
    let wallet_id = id.parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;

    state
        .consumer_wallet
        .release(ReleaseRequest { wallet_id, reserve_id: body.reserve_id })
        .await
        .map_err(|e| match e {
            ConsumerWalletError::NotFound(_)           => ApiError::not_found("wallet not found"),
            ConsumerWalletError::ReservationNotFound(_)  => ApiError::not_found("reservation not found"),
            ConsumerWalletError::ReservationNotActive(_) => ApiError::bad_request("reservation is not active"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /internal/v1/consumer-wallets/:id/commit-reserved
pub async fn commit_reserved(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CommitBody>,
) -> ApiResult<StatusCode> {
    let wallet_id = id.parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;
    let target_account_id: AccountId = body.target_account_id.parse()
        .map_err(|_| ApiError::bad_request("invalid target_account_id"))?;

    state
        .consumer_wallet
        .commit_reserved(CommitReservedRequest {
            wallet_id,
            reserve_id:        body.reserve_id,
            target_account_id,
        })
        .await
        .map_err(|e| match e {
            ConsumerWalletError::NotFound(_)           => ApiError::not_found("wallet not found"),
            ConsumerWalletError::ReservationNotFound(_)  => ApiError::not_found("reservation not found"),
            ConsumerWalletError::ReservationNotActive(_) => ApiError::bad_request("reservation is not active"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(StatusCode::NO_CONTENT)
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
