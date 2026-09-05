//! Transferências — internal transfer between two wallet accounts of the SAME
//! financial owner (Banzami ADR-052).
//!
//! The smallest coherent Developer transfer product: a bound owner moves money
//! between two child accounts it already holds. Nothing crosses an owner
//! boundary, which is what makes it safe to expose to a project credential.
//!
//! Deliberately NOT:
//! * a payout — money leaving to a bank,
//! * an application settlement — money leaving to a beneficiary (ADR-029),
//! * a consumer P2P transfer — a different party entirely,
//! * the generic merchant transfer surface withdrawn for security (RA-053).
//!
//! Authority, in order:
//! 1. the caller's merchant comes from the Project binding (the gateway resolves
//!    it; this route never reads it from a request body),
//! 2. BOTH accounts must belong to a wallet owned by that merchant,
//! 3. the ledger movement is a single balanced posting inside one transaction.
//!
//! Step 2 is the whole security property, and it is enforced here rather than
//! only at the gateway: naming an account id is selection, never authority, so a
//! caller who reaches Core directly still cannot move another owner's money.

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct CreateBody {
    /// Resolved by the caller from trusted authority — never from a public body.
    pub merchant_id: String,
    pub source_wallet_account_id: String,
    pub destination_wallet_account_id: String,
    pub amount_minor: i64,
    pub currency: String,
    pub idempotency_key: String,
    pub description: Option<String>,
}

#[derive(Serialize)]
pub struct TransferView {
    pub id: Uuid,
    pub source_wallet_account_id: Uuid,
    pub destination_wallet_account_id: Uuid,
    pub amount_minor: i64,
    pub currency: String,
    pub status: String,
    pub description: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// An account this merchant may move money between: its ledger account, the
/// wallet it belongs to, and its currency.
struct OwnedAccount {
    ledger_account_id: Uuid,
    wallet_id: Uuid,
    currency: String,
}

/// Resolve an account the merchant owns. Returns `None` for an account that does
/// not exist, is not ACTIVE, or belongs to someone else — the three are
/// deliberately indistinguishable, so an id cannot be used to probe for another
/// owner's accounts.
async fn owned_account(
    pool: &sqlx::PgPool,
    merchant_id: Uuid,
    wallet_account_id: Uuid,
) -> Result<Option<OwnedAccount>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT wa.account_id, wa.wallet_id, wa.currency
           FROM wallet_accounts wa
           JOIN wallets w ON w.id = wa.wallet_id
          WHERE wa.id = $1
            AND wa.status = 'ACTIVE'
            AND w.status = 'ACTIVE'
            AND w.merchant_id = $2",
    )
    .bind(wallet_account_id)
    .bind(merchant_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| OwnedAccount {
        ledger_account_id: r.get("account_id"),
        wallet_id: r.get("wallet_id"),
        currency: r.get("currency"),
    }))
}

/// Balance of a LIABILITY account in minor units: credits minus debits.
async fn account_balance_minor(
    conn: &mut sqlx::PgConnection,
    ledger_account_id: Uuid,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'CREDIT' THEN amount_minor
                                             ELSE -amount_minor END), 0)::BIGINT
           FROM ledger_entries WHERE account_id = $1",
    )
    .bind(ledger_account_id)
    .fetch_one(&mut *conn)
    .await
}

/// POST /internal/v1/wallet-account-transfers
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateBody>,
) -> ApiResult<Json<TransferView>> {
    let merchant_id = Uuid::parse_str(&body.merchant_id)
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;
    let src_id = Uuid::parse_str(&body.source_wallet_account_id)
        .map_err(|_| ApiError::bad_request("invalid source_wallet_account_id"))?;
    let dst_id = Uuid::parse_str(&body.destination_wallet_account_id)
        .map_err(|_| ApiError::bad_request("invalid destination_wallet_account_id"))?;

    if body.idempotency_key.trim().is_empty() {
        return Err(ApiError::bad_request("idempotency_key is required"));
    }
    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request(
            "amount_minor must be a positive integer",
        ));
    }
    if src_id == dst_id {
        return Err(ApiError::bad_request(
            "source and destination must be different accounts",
        ));
    }

    // Idempotent replay: the same key from the same merchant returns the original
    // transfer without moving money a second time.
    if let Some(existing) = fetch_by_idempotency(&state.pool, merchant_id, &body.idempotency_key)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
    {
        return Ok(Json(existing));
    }

    // Both endpoints must belong to this merchant. A foreign or unknown account
    // is the same answer either way.
    let src = owned_account(&state.pool, merchant_id, src_id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        .ok_or_else(|| ApiError::not_found("source wallet account not found"))?;
    let dst = owned_account(&state.pool, merchant_id, dst_id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        .ok_or_else(|| ApiError::not_found("destination wallet account not found"))?;

    // Same-owner is already guaranteed by the merchant scoping above; requiring
    // the same wallet keeps the movement inside one balance and one currency.
    if src.wallet_id != dst.wallet_id {
        return Err(ApiError::unprocessable(
            "ACCOUNTS_NOT_SAME_WALLET",
            "both accounts must belong to the same wallet",
        ));
    }
    if src.currency != dst.currency || src.currency != body.currency {
        return Err(ApiError::unprocessable(
            "CURRENCY_MISMATCH",
            "accounts and request must share one currency",
        ));
    }

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    // Funds check inside the transaction, so a concurrent debit cannot slip
    // between the check and the posting.
    let available = account_balance_minor(&mut tx, src.ledger_account_id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    if available < body.amount_minor {
        return Err(ApiError::unprocessable(
            "INSUFFICIENT_FUNDS",
            "source account has insufficient available balance",
        ));
    }

    let posting_id = Uuid::new_v4();
    let now = chrono::Utc::now();

    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(posting_id)
    .bind(format!("Wallet account transfer {src_id} → {dst_id}"))
    .bind(format!("wat-{merchant_id}-{}", body.idempotency_key))
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // Balanced double-entry: what leaves one account arrives in the other. Both
    // are LIABILITY accounts of the same owner, so the owner's total is
    // unchanged — this moves money between pockets, it does not create or
    // destroy any.
    for (account_id, entry_type) in [
        (src.ledger_account_id, "DEBIT"),
        (dst.ledger_account_id, "CREDIT"),
    ] {
        sqlx::query(
            "INSERT INTO ledger_entries
                (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(Uuid::new_v4())
        .bind(posting_id)
        .bind(account_id)
        .bind(entry_type)
        .bind(body.amount_minor)
        .bind(&body.currency)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    }

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO wallet_account_transfers
            (merchant_id, wallet_id, source_account_id, dest_account_id, amount_minor,
             currency, description, ledger_posting_id, idempotency_key, environment, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id",
    )
    .bind(merchant_id)
    .bind(src.wallet_id)
    .bind(src_id)
    .bind(dst_id)
    .bind(body.amount_minor)
    .bind(&body.currency)
    .bind(&body.description)
    .bind(posting_id)
    .bind(&body.idempotency_key)
    .bind(state.environment.as_str())
    .bind(now)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    tx.commit()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(TransferView {
        id,
        source_wallet_account_id: src_id,
        destination_wallet_account_id: dst_id,
        amount_minor: body.amount_minor,
        currency: body.currency,
        status: "COMPLETED".to_string(),
        description: body.description,
        created_at: now,
    }))
}

async fn fetch_by_idempotency(
    pool: &sqlx::PgPool,
    merchant_id: Uuid,
    key: &str,
) -> Result<Option<TransferView>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT id, source_account_id, dest_account_id, amount_minor, currency,
                status, description, created_at
           FROM wallet_account_transfers
          WHERE merchant_id = $1 AND idempotency_key = $2",
    )
    .bind(merchant_id)
    .bind(key)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| TransferView {
        id: r.get("id"),
        source_wallet_account_id: r.get("source_account_id"),
        destination_wallet_account_id: r.get("dest_account_id"),
        amount_minor: r.get("amount_minor"),
        currency: r.get("currency"),
        status: r.get("status"),
        description: r.get("description"),
        created_at: r.get("created_at"),
    }))
}
