use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use super::credit_idempotency;
use serde::{Deserialize, Serialize};

use banzami_types::{Currency, LedgerEntryId, LedgerPostingId, MerchantId, WalletId};
use banzami_wallets::{CreateWalletRequest, WalletEngine, WalletError};

use crate::{
    error::{ApiError, ApiResult},
    routes::risk,
    state::AppState,
};

#[derive(Deserialize)]
pub struct CreateWalletBody {
    pub merchant_id: String,
    pub currency: String,
}

#[derive(Deserialize)]
pub struct WalletForMerchantQuery {
    pub merchant_id: String,
    pub currency: String,
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateWalletBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let merchant_id: MerchantId = body
        .merchant_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    let wallet = state
        .wallet
        .create(CreateWalletRequest {
            merchant_id,
            currency,
        })
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(&wallet).unwrap()),
    ))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let wallet_id: WalletId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;

    let wallet = state.wallet.get(wallet_id).await.map_err(|e| match e {
        WalletError::NotFound(_) => ApiError::not_found("wallet not found"),
        other => ApiError::internal(other.to_string()),
    })?;

    Ok(Json(serde_json::to_value(&wallet).unwrap()))
}

pub async fn balance(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let wallet_id: WalletId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;

    let bal = state.wallet.balance(wallet_id).await.map_err(|e| match e {
        WalletError::NotFound(_) => ApiError::not_found("wallet not found"),
        other => ApiError::internal(other.to_string()),
    })?;

    // `held_minor`: funds sitting in the wallet's segregated non-PRIMARY accounts
    // (CAMPAIGN/PROJECT/EVENT/ESCROW/…) — money received but not part of the
    // merchant's spendable available balance. Surfaced so the dashboard can show
    // "held in campaigns" alongside the available balance. Best-effort → 0.
    let held_minor: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT'
                                  THEN le.amount_minor ELSE -le.amount_minor END), 0)::bigint
           FROM wallet_accounts wa
           JOIN ledger_entries le ON le.account_id = wa.account_id
          WHERE wa.wallet_id = $1
            AND wa.purpose <> 'PRIMARY'
            AND wa.status = 'ACTIVE'",
    )
    .bind(wallet_id.as_uuid())
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let mut val = serde_json::to_value(&bal).unwrap();
    if let Some(obj) = val.as_object_mut() {
        obj.insert("held_minor".to_string(), serde_json::json!(held_minor));
    }
    Ok(Json(val))
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct SandboxCreditBody {
    pub amount_minor: i64,
    pub currency: Option<String>,
    /// One credit per key (see credit_idempotency). Optional for fixtures.
    #[serde(default)]
    pub idempotency_key: Option<String>,
}

#[derive(Serialize)]
pub struct SandboxCreditResponse {
    pub wallet_id: String,
    pub currency: String,
    pub amount_minor: i64,
    pub new_balance: i64,
}

/// POST /internal/v1/wallets/:id/sandbox-credit
///
/// Injects synthetic funds directly into a merchant wallet's available ledger
/// account. SANDBOX / test environments only — hard-rejected in LIVE.
pub async fn sandbox_credit(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<SandboxCreditBody>,
) -> ApiResult<Json<SandboxCreditResponse>> {
    if state.environment.is_live() {
        tracing::error!("sandbox_credit called in LIVE environment — rejected");
        return Err(ApiError::forbidden(
            "sandbox credit is not available in LIVE environment",
        ));
    }

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

    let key = credit_idempotency::ledger_key("sandbox-credit", &wallet_id.to_string(), body.idempotency_key.as_deref())?;
    if body.idempotency_key.is_some() {
        if let Some(prev) = credit_idempotency::posted(&state.pool, &key).await? {
            credit_idempotency::same_credit(&prev, available_account_id, body.amount_minor, currency_code)?;
            let new_balance = credit_idempotency::liability_balance(&state.pool, available_account_id).await?;
            return Ok(Json(SandboxCreditResponse {
                wallet_id: wallet_id.to_string(),
                currency: currency_code.to_owned(),
                amount_minor: body.amount_minor,
                new_balance,
            }));
        }
    }

    let posting_id = LedgerPostingId::new();
    let now = chrono::Utc::now();

    // Balanced double-entry, in ONE transaction:
    //   DR transit account          (ASSET     — funds leave the system float)
    //   CR merchant available       (LIABILITY — we now owe the merchant)
    //
    // This used to write the CREDIT leg alone, and outside a transaction. Every
    // posting it produced was single-legged: a credit with no counter-entry is
    // money created from nothing, and the reconciliation balance checker logged
    // LEDGER INVARIANT VIOLATION for each one. The consumer top-up beside it was
    // written correctly from the start; only this path was wrong.
    //
    // It also inflated funds-in-circulation, which is how the sandbox exhausted
    // its aggregate pilot cap and stopped being able to fund new test consumers.
    // Being sandbox-only kept it away from real money; it did not keep it away
    // from the invariant the whole ledger rests on.
    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    match sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(posting_id.as_uuid())
    .bind("[SANDBOX] Merchant wallet top-up — DR transit / CR merchant available")
    .bind(&key)
    .bind(now)
    .execute(&mut *tx)
    .await
    {
        Ok(_) => {}
        // A concurrent request with the same key posted first.
        Err(e) if credit_idempotency::is_duplicate_key(&e) => {
            drop(tx);
            let prev = credit_idempotency::posted(&state.pool, &key)
                .await?
                .ok_or_else(|| ApiError::internal("duplicate credit key without its posting"))?;
            credit_idempotency::same_credit(&prev, available_account_id, body.amount_minor, currency_code)?;
            let new_balance = credit_idempotency::liability_balance(&state.pool, available_account_id).await?;
            return Ok(Json(SandboxCreditResponse {
                wallet_id: wallet_id.to_string(),
                currency: currency_code.to_owned(),
                amount_minor: body.amount_minor,
                new_balance,
            }));
        }
        Err(e) => return Err(ApiError::internal(e.to_string())),
    }

    // DEBIT: transit account (ASSET — the float pays out)
    sqlx::query(
        "INSERT INTO ledger_entries
         (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
         VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6)",
    )
    .bind(LedgerEntryId::new().as_uuid())
    .bind(posting_id.as_uuid())
    .bind(state.transit_account_id.as_uuid())
    .bind(body.amount_minor)
    .bind(currency_code)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // CREDIT: merchant available account (LIABILITY — we owe the merchant)
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
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    tx.commit()
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
        wallet_id: wallet_id.to_string(),
        currency: currency_code.to_owned(),
        amount_minor: body.amount_minor,
        new_balance,
    }))
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct AdminCreditBody {
    pub amount_minor: i64,
    pub currency: Option<String>,
    pub reason: String,
    /// One credit per key (see credit_idempotency). admin-api always sends one.
    #[serde(default)]
    pub idempotency_key: Option<String>,
}

#[derive(Serialize)]
pub struct AdminCreditResponse {
    pub wallet_id: String,
    pub currency: String,
    pub amount_minor: i64,
    pub new_balance: i64,
}

/// POST /internal/v1/wallets/:id/admin-credit
///
/// Injects funds into a merchant wallet's available ledger account for admin
/// purposes (beta funding, pilot merchants, TestFlight). SANDBOX only — admin
/// credit of synthetic funds is not permitted in LIVE.
pub async fn admin_credit(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<AdminCreditBody>,
) -> ApiResult<Json<AdminCreditResponse>> {
    if state.environment.is_live() {
        tracing::error!("admin_credit called in LIVE environment — rejected");
        return Err(ApiError::forbidden(
            "admin credit is not available in LIVE environment",
        ));
    }

    if body.reason.trim().is_empty() {
        return Err(ApiError::bad_request("reason is required"));
    }
    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
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

    let key = credit_idempotency::ledger_key("admin-credit", &wallet_id.to_string(), body.idempotency_key.as_deref())?;
    if body.idempotency_key.is_some() {
        if let Some(prev) = credit_idempotency::posted(&state.pool, &key).await? {
            credit_idempotency::same_credit(&prev, available_account_id, body.amount_minor, currency_code)?;
            let new_balance = credit_idempotency::liability_balance(&state.pool, available_account_id).await?;
            return Ok(Json(AdminCreditResponse {
                wallet_id: wallet_id.to_string(),
                currency: currency_code.to_owned(),
                amount_minor: body.amount_minor,
                new_balance,
            }));
        }
    }

    let posting_id = LedgerPostingId::new();
    let now = chrono::Utc::now();
    let description = format!("[ADMIN] Manual wallet credit — {}", body.reason.trim());

    // Double entry, in one transaction.
    //
    // This wrote a single CREDIT and no counter-DEBIT, outside any transaction.
    // Every call left an unbalanced, single-leg posting, and money appeared in a
    // merchant wallet from nowhere — the ledger could not say what funded it. On
    // a freshly reset Sandbox the economic smoke counted 51 such postings and a
    // book that summed to 5 100 000 instead of zero.
    //
    // The counter-leg is the acquiring transit ASSET account, the same shape the
    // consumer top-up path already used correctly: funds notionally arrive
    // (DEBIT the asset) and the operator now owes them to the merchant (CREDIT
    // the liability).
    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    match sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(posting_id.as_uuid())
    .bind(&description)
    .bind(&key)
    .bind(now)
    .execute(&mut *tx)
    .await
    {
        Ok(_) => {}
        // A concurrent request with the same key posted first.
        Err(e) if credit_idempotency::is_duplicate_key(&e) => {
            drop(tx);
            let prev = credit_idempotency::posted(&state.pool, &key)
                .await?
                .ok_or_else(|| ApiError::internal("duplicate credit key without its posting"))?;
            credit_idempotency::same_credit(&prev, available_account_id, body.amount_minor, currency_code)?;
            let new_balance = credit_idempotency::liability_balance(&state.pool, available_account_id).await?;
            return Ok(Json(AdminCreditResponse {
                wallet_id: wallet_id.to_string(),
                currency: currency_code.to_owned(),
                amount_minor: body.amount_minor,
                new_balance,
            }));
        }
        Err(e) => return Err(ApiError::internal(e.to_string())),
    }

    sqlx::query(
        "INSERT INTO ledger_entries
         (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
         VALUES ($1, $2, $3, 'DEBIT',  $4, $5, $6),
                ($7, $2, $8, 'CREDIT', $4, $5, $6)",
    )
    .bind(LedgerEntryId::new().as_uuid())
    .bind(posting_id.as_uuid())
    .bind(state.transit_account_id.as_uuid())
    .bind(body.amount_minor)
    .bind(currency_code)
    .bind(now)
    .bind(LedgerEntryId::new().as_uuid())
    .bind(available_account_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    tx.commit()
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

    // Audit log (fire-and-forget).
    risk::audit(
        &state.pool,
        "ADMIN",
        "ADMIN_CREDIT",
        &format!("WALLET:{wallet_id}"),
        serde_json::json!({
            "amount_minor": body.amount_minor,
            "currency":     currency_code,
            "reason":       body.reason.trim(),
            "posting_id":   posting_id.as_uuid().to_string(),
        }),
        None,
    )
    .await;

    tracing::info!(
        wallet_id    = %wallet_id,
        amount_minor = body.amount_minor,
        currency     = currency_code,
        reason       = %body.reason.trim(),
        "admin credit applied to merchant wallet"
    );

    Ok(Json(AdminCreditResponse {
        wallet_id: wallet_id.to_string(),
        currency: currency_code.to_owned(),
        amount_minor: body.amount_minor,
        new_balance,
    }))
}

/// GET /internal/v1/wallets?merchant_id=&currency=
pub async fn get_for_merchant(
    State(state): State<AppState>,
    Query(q): Query<WalletForMerchantQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = q
        .merchant_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    let currency = Currency::from_code(&q.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", q.currency)))?;

    let wallet = state
        .wallet
        .get_for_merchant(merchant_id, currency)
        .await
        .map_err(|e| match e {
            WalletError::NoWalletForMerchant { .. } => {
                ApiError::not_found("no wallet for this merchant and currency")
            }
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&wallet).unwrap()))
}
