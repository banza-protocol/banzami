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
    "PRIMARY",
    "CAMPAIGN",
    "PROJECT",
    "EVENT",
    "STORE",
    "ESCROW",
    "RESERVE",
    "SETTLEMENT",
    "CUSTOM",
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
        return Err(ApiError::bad_request(
            "PRIMARY account is created with the wallet",
        ));
    }
    let wallet_id =
        Uuid::parse_str(&body.wallet_id).map_err(|_| ApiError::bad_request("invalid wallet_id"))?;

    // Load the parent wallet: owner, currency, status.
    let (wallet_merchant, currency_str, status) = sqlx::query_as::<_, (Uuid, String, String)>(
        "SELECT merchant_id, currency, status FROM wallets WHERE id = $1",
    )
    .bind(wallet_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("wallet not found"))?;

    if status != "ACTIVE" {
        return Err(ApiError::conflict(
            "WALLET_INACTIVE",
            "wallet is not active",
        ));
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
            return Ok((
                StatusCode::OK,
                Json(fetch_json(&state.pool, existing).await?),
            ));
        }
    }

    let currency = Currency::from_code(&currency_str)
        .ok_or_else(|| ApiError::internal("bad wallet currency"))?;
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

    Ok((
        StatusCode::CREATED,
        Json(fetch_json(&state.pool, id).await?),
    ))
}

#[derive(Deserialize)]
pub struct ListQuery {
    /// A closed account is history, not an account anyone can use; lists leave
    /// it out unless asked.
    pub include_closed: Option<bool>,
}

pub async fn list_for_wallet(
    State(state): State<AppState>,
    Path(wallet_id): Path<String>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let wid =
        Uuid::parse_str(&wallet_id).map_err(|_| ApiError::bad_request("invalid wallet_id"))?;
    let rows = sqlx::query_as::<_, WaRow>(&format!(
        "SELECT {WA_COLS} FROM wallet_accounts
          WHERE wallet_id = $1 AND ($2 OR status <> 'CLOSED')
          ORDER BY purpose, created_at"
    ))
    .bind(wid)
    .bind(q.include_closed.unwrap_or(false))
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
    let wid =
        Uuid::parse_str(&q.wallet_id).map_err(|_| ApiError::bad_request("invalid wallet_id"))?;
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

// ── Payee validation (ADR-047 / RT04B §3) ────────────────────────────────────
//
// The Developer API calls this over the internal boundary BEFORE recording a
// Project→Merchant Sandbox binding. Core is independently authoritative for the
// merchant→wallet→wallet_account relationship — the Developer API must NOT trust
// arbitrary submitted Core identifiers. This endpoint proves:
//   * the wallet_account exists and is ACTIVE;
//   * it is owned by the asserted wallet AND merchant (no cross-owner payee);
//   * the wallet exists, is ACTIVE, owned by the merchant, same currency;
//   * the merchant exists and is ACTIVE;
//   * this Core is SANDBOX (a binding may never resolve to a Live payee).
// It returns only the MINIMUM validated relationship info (valid + currency), or
// a stable machine reason when invalid. It moves no money and mutates nothing.

#[derive(Deserialize)]
pub struct ValidatePayeeBody {
    pub merchant_id: String,
    pub wallet_id: String,
    pub wallet_account_id: String,
}

pub async fn validate_payee(
    State(state): State<AppState>,
    Json(body): Json<ValidatePayeeBody>,
) -> ApiResult<Json<serde_json::Value>> {
    // A Sandbox binding must never resolve to a Live payee. This endpoint exists
    // only to validate Sandbox payees; refuse outright on a LIVE core.
    if state.environment.is_live() {
        tracing::error!("validate_payee called on a LIVE core — rejected");
        return Err(ApiError::forbidden(
            "payee validation is a sandbox-only operation",
        ));
    }

    let merchant_id = Uuid::parse_str(&body.merchant_id)
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;
    let wallet_id =
        Uuid::parse_str(&body.wallet_id).map_err(|_| ApiError::bad_request("invalid wallet_id"))?;
    let wa_id = Uuid::parse_str(&body.wallet_account_id)
        .map_err(|_| ApiError::bad_request("invalid wallet_account_id"))?;

    let invalid = |reason: &str| -> ApiResult<Json<serde_json::Value>> {
        Ok(Json(
            serde_json::json!({ "valid": false, "reason": reason }),
        ))
    };

    // 1) wallet_account: existence + ownership chain + ACTIVE.
    let wa: Option<(Uuid, Uuid, String, String)> = sqlx::query_as(
        "SELECT wallet_id, merchant_id, currency, status FROM wallet_accounts WHERE id = $1",
    )
    .bind(wa_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;
    let Some((wa_wallet, wa_merchant, wa_currency, wa_status)) = wa else {
        return invalid("WALLET_ACCOUNT_NOT_FOUND");
    };
    if wa_merchant != merchant_id {
        return invalid("MERCHANT_MISMATCH");
    }
    if wa_wallet != wallet_id {
        return invalid("WALLET_MISMATCH");
    }
    if wa_status != "ACTIVE" {
        return invalid("WALLET_ACCOUNT_INACTIVE");
    }

    // 2) wallet: existence + owner + ACTIVE + currency parity.
    let w: Option<(Uuid, String, String)> =
        sqlx::query_as("SELECT merchant_id, status, currency FROM wallets WHERE id = $1")
            .bind(wallet_id)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?;
    let Some((w_merchant, w_status, w_currency)) = w else {
        return invalid("WALLET_NOT_FOUND");
    };
    if w_merchant != merchant_id {
        return invalid("WALLET_OWNER_MISMATCH");
    }
    if w_status != "ACTIVE" {
        return invalid("WALLET_INACTIVE");
    }
    if w_currency != wa_currency {
        return invalid("CURRENCY_MISMATCH");
    }

    // 3) merchant: existence + ACTIVE.
    let m: Option<(String,)> = sqlx::query_as("SELECT status FROM merchants WHERE id = $1")
        .bind(merchant_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    let Some((m_status,)) = m else {
        return invalid("MERCHANT_NOT_FOUND");
    };
    if m_status != "ACTIVE" {
        return invalid("MERCHANT_INACTIVE");
    }

    // Minimum validated relationship info: enough for the binding, nothing more.
    Ok(Json(serde_json::json!({
        "valid": true,
        "currency": wa_currency,
        "environment": state.environment.as_str(),
    })))
}

// ── Close (the lifecycle end of a segregated account) ────────────────────────
//
// A wallet account is never deleted: its ledger account keeps its history and
// the row keeps its identity. Closing is the product meaning of "delete": the
// account can no longer receive or send, cannot be named as a payee, and leaves
// every active list. It is refused while it holds money or anything could still
// move money through it.

#[derive(Deserialize)]
pub struct CloseBody {
    /// Why — recorded in the audit log.
    pub reason: String,
    /// Who — an operator id, or the tool acting for one.
    pub closed_by: String,
    /// Optional owner assertion: a caller scoped to one Business names it, and an
    /// account of another Business answers 404.
    pub merchant_id: Option<String>,
}

/// POST /internal/v1/wallet-accounts/:id/close
pub async fn close(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CloseBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let id = Uuid::parse_str(&id).map_err(|_| ApiError::bad_request("invalid id"))?;
    let reason = body.reason.trim();
    let closed_by = body.closed_by.trim();
    if reason.is_empty() || reason.len() > 500 {
        return Err(ApiError::bad_request(
            "reason is required (at most 500 characters)",
        ));
    }
    if closed_by.is_empty() || closed_by.len() > 200 {
        return Err(ApiError::bad_request("closed_by is required"));
    }
    let scope: Option<Uuid> = match body.merchant_id.as_deref() {
        Some(m) => {
            Some(Uuid::parse_str(m).map_err(|_| ApiError::bad_request("invalid merchant_id"))?)
        }
        None => None,
    };
    let db = |e: sqlx::Error| ApiError::internal(e.to_string());

    let mut tx = state.pool.begin().await.map_err(db)?;
    let row = sqlx::query_as::<_, (Uuid, Uuid, String, String, Option<String>)>(
        "SELECT account_id, merchant_id, purpose, status, label
           FROM wallet_accounts WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db)?;
    let Some((account_id, merchant_id, purpose, status, label)) = row else {
        return Err(ApiError::not_found("wallet account not found"));
    };
    if scope.is_some_and(|m| m != merchant_id) {
        return Err(ApiError::not_found("wallet account not found"));
    }
    if status == "CLOSED" {
        tx.commit().await.map_err(db)?;
        return Ok(Json(fetch_json(&state.pool, id).await?));
    }
    if purpose == "PRIMARY" {
        return Err(ApiError::conflict(
            "PRIMARY_ACCOUNT",
            "the primary account is the wallet's own and is never closed",
        ));
    }
    let balance: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'CREDIT' THEN amount_minor ELSE -amount_minor END), 0)::BIGINT
           FROM ledger_entries WHERE account_id = $1",
    )
    .bind(account_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(db)?;
    if balance != 0 {
        return Err(ApiError::conflict(
            "BALANCE_NOT_ZERO",
            "the account holds money — settle or move it before closing",
        ));
    }
    let blocking: Vec<(&'static str, &'static str, &str)> = vec![
        ("OPEN_PAYMENT_LINKS", "an active payment link still pays into this account",
         "SELECT count(*) FROM payment_links WHERE wallet_account_id = $1 AND status = 'ACTIVE'"),
        ("OPEN_PAYMENT_SESSIONS", "an open payment session still pays into this account",
         "SELECT count(*) FROM payment_sessions WHERE wallet_account_id = $1 AND status IN ('CREATED','ACTIVE','PARTIALLY_PAID')"),
        ("ACTIVE_QR_CODES", "an active QR code still pays into this account",
         "SELECT count(*) FROM qr_codes WHERE wallet_account_id = $1 AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())"),
    ];
    for (code, message, sql) in blocking {
        let n: i64 = sqlx::query_scalar(sql)
            .bind(id)
            .fetch_one(&mut *tx)
            .await
            .map_err(db)?;
        if n > 0 {
            return Err(ApiError::conflict(code, message));
        }
    }
    let pending_settlements: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM app_settlements
          WHERE (source_account_id = $1 OR beneficiary_account_id = $1 OR application_fee_account_id = $1)
            AND status IN ('CREATED','PENDING')",
    )
    .bind(account_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(db)?;
    if pending_settlements > 0 {
        return Err(ApiError::conflict(
            "PENDING_SETTLEMENT",
            "a settlement from or into this account has not finished",
        ));
    }

    sqlx::query("UPDATE wallet_accounts SET status = 'CLOSED', updated_at = now() WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(db)?;
    sqlx::query(
        "INSERT INTO audit_log (actor, action, subject, metadata) VALUES ($1, 'WALLET_ACCOUNT_CLOSED', $2, $3)",
    )
    .bind(format!("OPERATOR:{closed_by}"))
    .bind(format!("wallet_account:{id}"))
    .bind(serde_json::json!({
        "merchant_id": merchant_id,
        "purpose": purpose,
        "label": label,
        "previous_status": status,
        "reason": reason,
    }))
    .execute(&mut *tx)
    .await
    .map_err(db)?;
    tx.commit().await.map_err(db)?;
    Ok(Json(fetch_json(&state.pool, id).await?))
}
