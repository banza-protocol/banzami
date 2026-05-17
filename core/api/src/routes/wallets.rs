use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use banzami_types::{Currency, LedgerEntryId, LedgerPostingId, MerchantId, WalletId};
use banzami_wallets::{CreateWalletRequest, WalletEngine, WalletError};

use crate::{error::{ApiError, ApiResult}, state::AppState};

#[derive(Deserialize)]
pub struct CreateWalletBody {
    pub merchant_id: String,
    pub currency:    String,
}

#[derive(Deserialize)]
pub struct WalletForMerchantQuery {
    pub merchant_id: String,
    pub currency:    String,
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateWalletBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let merchant_id: MerchantId = body.merchant_id.parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    let wallet = state.wallet
        .create(CreateWalletRequest { merchant_id, currency })
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((StatusCode::CREATED, Json(serde_json::to_value(&wallet).unwrap())))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let wallet_id: WalletId = id.parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;

    let wallet = state.wallet
        .get(wallet_id)
        .await
        .map_err(|e| match e {
            WalletError::NotFound(_) => ApiError::not_found("wallet not found"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&wallet).unwrap()))
}

pub async fn balance(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let wallet_id: WalletId = id.parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;

    let bal = state.wallet
        .balance(wallet_id)
        .await
        .map_err(|e| match e {
            WalletError::NotFound(_) => ApiError::not_found("wallet not found"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&bal).unwrap()))
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct SandboxCreditBody {
    pub amount_minor: i64,
    pub currency:     Option<String>,
}

#[derive(Serialize)]
pub struct SandboxCreditResponse {
    pub wallet_id:    String,
    pub currency:     String,
    pub amount_minor: i64,
    pub new_balance:  i64,
}

/// POST /internal/v1/wallets/:id/sandbox-credit
///
/// Injects synthetic funds directly into a merchant wallet's available ledger
/// account. For sandbox/test environments only — called exclusively by the
/// api-gateway sandbox handler which enforces SANDBOX principal check.
pub async fn sandbox_credit(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<SandboxCreditBody>,
) -> ApiResult<Json<SandboxCreditResponse>> {
    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
    }
    const MAX_MINOR: i64 = 10_000_000_000; // 100,000,000 AOA
    if body.amount_minor > MAX_MINOR {
        return Err(ApiError::bad_request(
            "sandbox top-up capped at 100,000,000 AOA per request",
        ));
    }

    let wallet_id: WalletId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;

    let currency_code = body.currency.as_deref().unwrap_or("AOA");

    let available_account_id: uuid::Uuid = sqlx::query_scalar(
        "SELECT available_account_id
         FROM wallets
         WHERE id = $1 AND status = 'ACTIVE'",
    )
    .bind(wallet_id.as_uuid())
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("wallet not found or not active"))?;

    let posting_id = LedgerPostingId::new();
    let now        = chrono::Utc::now();

    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(posting_id.as_uuid())
    .bind("[SANDBOX] Merchant wallet top-up")
    .bind(format!("sandbox-credit-{}-{}", wallet_id, uuid::Uuid::new_v4()))
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
    .bind(currency_code)
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
        wallet_id    = %wallet_id,
        amount_minor = body.amount_minor,
        currency     = currency_code,
        "sandbox credit applied to merchant wallet"
    );

    Ok(Json(SandboxCreditResponse {
        wallet_id:    wallet_id.to_string(),
        currency:     currency_code.to_owned(),
        amount_minor: body.amount_minor,
        new_balance,
    }))
}

/// GET /internal/v1/wallets?merchant_id=&currency=
pub async fn get_for_merchant(
    State(state): State<AppState>,
    Query(q): Query<WalletForMerchantQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = q.merchant_id.parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    let currency = Currency::from_code(&q.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", q.currency)))?;

    let wallet = state.wallet
        .get_for_merchant(merchant_id, currency)
        .await
        .map_err(|e| match e {
            WalletError::NoWalletForMerchant { .. } => ApiError::not_found("no wallet for this merchant and currency"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&wallet).unwrap()))
}
