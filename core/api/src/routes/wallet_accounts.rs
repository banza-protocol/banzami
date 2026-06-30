//! Internal Wallet Accounts API (BANZA ADR-042). Segregated accounts within a
//! wallet. OPERATOR-ONLY (reached only via the internal `/internal/v1` boundary).
//!
//! Creating an account provisions a new LIABILITY ledger account and maps it in
//! `wallet_accounts` — it moves NO money. Each account's balance is always read
//! from the ledger (never a stored mutable field). PRIMARY is created with the
//! wallet (0080 backfill) and cannot be created here.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use banzami_ledger::{Account, AccountType, LedgerEngine, PostgresLedgerRepository};
use banzami_types::{AccountId, Currency};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

const PURPOSES: &[&str] = &[
    "PRIMARY", "CAMPAIGN", "PROJECT", "EVENT", "STORE", "ESCROW", "RESERVE", "SETTLEMENT", "CUSTOM",
];

#[derive(Deserialize)]
pub struct CreateBody {
    pub wallet_id: String,
    /// Optional owner assertion — when present must match the wallet's merchant.
    pub merchant_id: Option<String>,
    pub purpose: String,
    pub reference_type: Option<String>,
    pub reference_id: Option<String>,
    pub label: Option<String>,
    #[allow(dead_code)]
    pub idempotency_key: Option<String>,
}

type WaRow = (
    Uuid,
    Uuid,
    Uuid,
    Uuid,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    String,
    chrono::DateTime<chrono::Utc>,
);

const WA_COLS: &str = "id, wallet_id, account_id, merchant_id, currency, purpose, \
    reference_type, reference_id, label, status, created_at";

/// Read the ledger balance of a wallet account (LIABILITY → negate to a
/// merchant-facing positive). Never stored.
async fn account_balance(pool: &PgPool, account_id: Uuid) -> Result<i64, ApiError> {
    let ledger = PostgresLedgerRepository::new(pool.clone());
    Ok(ledger
        .balance(AccountId::from_uuid(account_id))
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        .negate()
        .amount_minor())
}

fn row_to_json(r: &WaRow, balance_minor: i64) -> serde_json::Value {
    serde_json::json!({
        "id": r.0, "wallet_id": r.1, "account_id": r.2, "merchant_id": r.3,
        "currency": r.4, "purpose": r.5, "reference_type": r.6, "reference_id": r.7,
        "label": r.8, "status": r.9, "available_balance_minor": balance_minor, "created_at": r.10,
    })
}

async fn fetch_json(pool: &PgPool, id: Uuid) -> Result<serde_json::Value, ApiError> {
    let r = sqlx::query_as::<_, WaRow>(&format!(
        "SELECT {WA_COLS} FROM wallet_accounts WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("wallet account not found"))?;
    let bal = account_balance(pool, r.2).await?;
    Ok(row_to_json(&r, bal))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let purpose = body.purpose.to_uppercase();
    if !PURPOSES.contains(&purpose.as_str()) {
        return Err(ApiError::bad_request("invalid purpose"));
    }
    // PRIMARY is provisioned with the wallet; it is never created via this path.
    if purpose == "PRIMARY" {
        return Err(ApiError::bad_request("PRIMARY account is created with the wallet"));
    }
    let wallet_id =
        Uuid::parse_str(&body.wallet_id).map_err(|_| ApiError::bad_request("invalid wallet_id"))?;

    // Load the parent wallet: owner, currency, status.
    let (wallet_merchant, currency_str, status) =
        sqlx::query_as::<_, (Uuid, String, String)>(
            "SELECT merchant_id, currency, status FROM wallets WHERE id = $1",
        )
        .bind(wallet_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        .ok_or_else(|| ApiError::not_found("wallet not found"))?;

    if status != "ACTIVE" {
        return Err(ApiError::conflict("WALLET_INACTIVE", "wallet is not active"));
    }
    if let Some(m) = body.merchant_id.as_deref() {
        if Uuid::parse_str(m).ok() != Some(wallet_merchant) {
            return Err(ApiError::forbidden("wallet is not owned by this merchant"));
        }
    }

    // Idempotency: a (wallet, purpose, reference) account already exists → return it.
    if body.reference_id.is_some() {
        if let Some(existing) = sqlx::query_scalar::<_, Uuid>(
            "SELECT id FROM wallet_accounts
              WHERE wallet_id = $1 AND purpose = $2
                AND reference_type IS NOT DISTINCT FROM $3
                AND reference_id   IS NOT DISTINCT FROM $4",
        )
        .bind(wallet_id)
        .bind(&purpose)
        .bind(&body.reference_type)
        .bind(&body.reference_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        {
            return Ok((StatusCode::OK, Json(fetch_json(&state.pool, existing).await?)));
        }
    }

    let currency =
        Currency::from_code(&currency_str).ok_or_else(|| ApiError::internal("bad wallet currency"))?;
    let label = body.label.clone().unwrap_or_else(|| purpose.clone());

    // Provision a fresh LIABILITY ledger account (no money moves).
    let ledger = PostgresLedgerRepository::new(state.pool.clone());
    let account = ledger
        .create_account(Account::new(
            AccountType::Liability,
            format!("WalletAccount {wallet_id} — {purpose} — {label}"),
            currency,
        ))
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO wallet_accounts
            (id, wallet_id, account_id, merchant_id, currency, purpose, reference_type, reference_id, label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    )
    .bind(id)
    .bind(wallet_id)
    .bind(account.id.as_uuid())
    .bind(wallet_merchant)
    .bind(&currency_str)
    .bind(&purpose)
    .bind(&body.reference_type)
    .bind(&body.reference_id)
    .bind(&label)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((StatusCode::CREATED, Json(fetch_json(&state.pool, id).await?)))
}

pub async fn list_for_wallet(
    State(state): State<AppState>,
    Path(wallet_id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let wid =
        Uuid::parse_str(&wallet_id).map_err(|_| ApiError::bad_request("invalid wallet_id"))?;
    let rows = sqlx::query_as::<_, WaRow>(&format!(
        "SELECT {WA_COLS} FROM wallet_accounts WHERE wallet_id = $1 ORDER BY purpose, created_at"
    ))
    .bind(wid)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;
    let mut out = Vec::with_capacity(rows.len());
    for r in &rows {
        let bal = account_balance(&state.pool, r.2).await?;
        out.push(row_to_json(r, bal));
    }
    Ok(Json(serde_json::json!({ "data": out })))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let id = Uuid::parse_str(&id).map_err(|_| ApiError::bad_request("invalid id"))?;
    Ok(Json(fetch_json(&state.pool, id).await?))
}

#[derive(Deserialize)]
pub struct ResolveQuery {
    pub wallet_id: String,
    pub purpose: String,
    pub reference_type: Option<String>,
    pub reference_id: Option<String>,
}

pub async fn resolve(
    State(state): State<AppState>,
    Query(q): Query<ResolveQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let wid = Uuid::parse_str(&q.wallet_id).map_err(|_| ApiError::bad_request("invalid wallet_id"))?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM wallet_accounts
          WHERE wallet_id = $1 AND purpose = $2
            AND reference_type IS NOT DISTINCT FROM $3
            AND reference_id   IS NOT DISTINCT FROM $4",
    )
    .bind(wid)
    .bind(q.purpose.to_uppercase())
    .bind(&q.reference_type)
    .bind(&q.reference_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("wallet account not found"))?;
    Ok(Json(fetch_json(&state.pool, id).await?))
}
