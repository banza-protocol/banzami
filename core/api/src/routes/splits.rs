use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_compliance::{ComplianceEngine, OperationType};
use banzami_consumer_wallets::{ConsumerWalletEngine, ConsumerWalletError, RoutingStatus};
use banzami_transfers::{SendTransferRequest, TransferEngine, TransferError};
use banzami_types::{ConsumerId, Currency, CustomerId};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Split payments (P2P-002) — collect a group total from multiple payers.
//
// Each contribution settles as a normal wallet transfer to the owner (reusing
// the audited transfer engine). The session row is locked FOR UPDATE for the
// whole pay operation so concurrent contributions are serialized and the
// collected amount can never exceed the total (no over-collection).
// ---------------------------------------------------------------------------

fn parse_owner_type(s: &str) -> Result<&'static str, ApiError> {
    match s.to_uppercase().as_str() {
        "CONSUMER" => Ok("CONSUMER"),
        "MERCHANT" => Ok("MERCHANT"),
        _ => Err(ApiError::bad_request(
            "owner_type must be CONSUMER or MERCHANT",
        )),
    }
}

// Internal JSON builder for a split session; the fields map 1:1 to the row, so
// the positional arguments are intentional and readable at the call sites.
#[allow(clippy::too_many_arguments)]
fn session_json(
    id: uuid::Uuid,
    owner_id: uuid::Uuid,
    owner_type: &str,
    currency: &str,
    total_minor: i64,
    paid_minor: i64,
    status: &str,
    reference: Option<&str>,
) -> serde_json::Value {
    serde_json::json!({
        "id":             id,
        "owner_id":       owner_id,
        "owner_type":     owner_type,
        "currency":       currency,
        "total_minor":    total_minor,
        "paid_minor":     paid_minor,
        "remaining_minor": total_minor - paid_minor,
        "status":         status,
        "reference":      reference,
        // Scannable token: the in-app router/scanner opens the pay-into-split flow.
        "qr_payload":     format!("banzami://pay/split/{id}"),
    })
}

#[derive(Deserialize)]
pub struct CreateSplitBody {
    pub owner_id: String,
    pub owner_type: String,
    pub currency: String,
    pub total_minor: i64,
    pub reference: Option<String>,
}

/// POST /internal/v1/splits — open a split session for a group total.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateSplitBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let owner_id: uuid::Uuid = body
        .owner_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid owner_id"))?;
    let owner_type = parse_owner_type(&body.owner_type)?;
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;
    if body.total_minor <= 0 {
        return Err(ApiError::bad_request("total_minor must be positive"));
    }

    let id = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO split_sessions (id, owner_id, owner_type, currency, total_minor, reference)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(owner_id)
    .bind(owner_type)
    .bind(currency.code())
    .bind(body.total_minor)
    .bind(&body.reference)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(session_json(
            id,
            owner_id,
            owner_type,
            currency.code(),
            body.total_minor,
            0,
            "OPEN",
            body.reference.as_deref(),
        )),
    ))
}

/// GET /internal/v1/splits/:id — session state + individual contributions.
pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let session_id: uuid::Uuid = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid split id"))?;

    let row = sqlx::query_as::<_, (uuid::Uuid, String, String, i64, i64, String, Option<String>)>(
        "SELECT owner_id, owner_type, currency, total_minor, paid_minor, status, reference
         FROM split_sessions WHERE id = $1",
    )
    .bind(session_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("split session not found"))?;

    let (owner_id, owner_type, currency, total, paid, status, reference) = row;

    let contributions = sqlx::query_as::<
        _,
        (
            uuid::Uuid,
            uuid::Uuid,
            i64,
            Option<uuid::Uuid>,
            chrono::DateTime<chrono::Utc>,
        ),
    >(
        "SELECT id, payer_id, amount_minor, transfer_id, created_at
         FROM split_contributions WHERE session_id = $1 ORDER BY created_at ASC",
    )
    .bind(session_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let mut value = session_json(
        session_id,
        owner_id,
        &owner_type,
        &currency,
        total,
        paid,
        &status,
        reference.as_deref(),
    );
    value["contributions"] = serde_json::Value::Array(
        contributions
            .into_iter()
            .map(|(cid, payer, amount, tid, created)| {
                serde_json::json!({
                    "id":           cid,
                    "payer_id":     payer,
                    "amount_minor": amount,
                    "transfer_id":  tid,
                    "created_at":   created,
                })
            })
            .collect(),
    );
    Ok(Json(value))
}

#[derive(Deserialize)]
pub struct PaySplitBody {
    pub idempotency_key: String,
    /// Payer's @banza handle.
    pub payer: String,
    pub amount_minor: i64,
}

/// POST /internal/v1/splits/:id/pay — contribute a portion to the split.
pub async fn pay(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<PaySplitBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let session_id: uuid::Uuid = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid split id"))?;
    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
    }

    // Lock the session for the whole operation — serializes concurrent payers.
    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let row = sqlx::query_as::<_, (uuid::Uuid, String, String, i64, i64, String)>(
        "SELECT owner_id, owner_type, currency, total_minor, paid_minor, status
         FROM split_sessions WHERE id = $1 FOR UPDATE",
    )
    .bind(session_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("split session not found"))?;

    let (owner_id, _owner_type, currency_code, total, paid, status) = row;
    if status != "OPEN" {
        return Err(ApiError::unprocessable(
            "SPLIT_NOT_OPEN",
            "this split is no longer open",
        ));
    }
    let remaining = total - paid;
    if body.amount_minor > remaining {
        return Err(ApiError::unprocessable(
            "AMOUNT_EXCEEDS_REMAINING",
            format!("amount exceeds the remaining {remaining} minor units"),
        ));
    }
    let currency = Currency::from_code(&currency_code)
        .ok_or_else(|| ApiError::internal("split has an unknown currency"))?;

    // Resolve the payer; must be routable to send.
    let payer = state
        .consumer_wallet
        .resolve_to_wallet(&body.payer, currency)
        .await
        .map_err(|e| match e {
            ConsumerWalletError::HandleNotFound(_) | ConsumerWalletError::InvalidHandle(_) => {
                ApiError::bad_request("invalid or unknown payer handle")
            }
            other => ApiError::internal(other.to_string()),
        })?;
    if payer.routing_status != RoutingStatus::Routable {
        return Err(ApiError::unprocessable(
            "PAYER_WALLET_NOT_ACTIVE",
            "payer wallet is not active",
        ));
    }
    let recipient_id = ConsumerId::from_uuid(owner_id);
    if payer.consumer_id == recipient_id {
        return Err(ApiError::bad_request("cannot pay into your own split"));
    }

    // Progressive-KYC gate (fail-closed in-process).
    let daily_volume_minor: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(le.amount_minor), 0)::BIGINT
           FROM ledger_entries le
           JOIN consumer_wallets w ON w.available_account_id = le.account_id
          WHERE w.consumer_id = $1 AND le.entry_type = 'DEBIT'
            AND le.created_at >= date_trunc('day', now())",
    )
    .bind(payer.consumer_id.as_uuid())
    .fetch_one(&mut *tx)
    .await
    .unwrap_or(0);
    let auth = state
        .compliance
        .authorize_operation(
            CustomerId::from_uuid(payer.consumer_id.as_uuid()),
            OperationType::PayMerchant,
            body.amount_minor,
            daily_volume_minor,
        )
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    if !auth.can_transact {
        let code = match auth.reason.as_str() {
            "LIMIT_EXCEEDED" => "LIMIT_EXCEEDED",
            "KYC_NOT_APPROVED" => "KYC_NOT_APPROVED",
            _ => "KYC_REQUIRED",
        };
        return Err(ApiError::unprocessable(code, auth.message));
    }

    // Settle the contribution as a wallet transfer payer → owner.
    let transfer = state
        .transfer
        .send(SendTransferRequest {
            idempotency_key: body.idempotency_key.clone(),
            sender_id: payer.consumer_id,
            recipient_id,
            amount_minor: body.amount_minor,
            currency,
            description: Some(format!("Split {session_id}")),
            recipient_handle: None,
        })
        .await
        .map_err(|e| match e {
            TransferError::InsufficientFunds { .. } => {
                ApiError::unprocessable("INSUFFICIENT_FUNDS", "insufficient funds")
            }
            TransferError::WalletNotFound { .. } | TransferError::WalletNotActive(_) => {
                ApiError::unprocessable("PAYER_WALLET_NOT_ACTIVE", "payer wallet is not active")
            }
            other => ApiError::internal(other.to_string()),
        })?;

    // Record the contribution and advance the session total under the same lock.
    sqlx::query(
        "INSERT INTO split_contributions (id, session_id, payer_id, amount_minor, transfer_id)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(uuid::Uuid::new_v4())
    .bind(session_id)
    .bind(payer.consumer_id.as_uuid())
    .bind(body.amount_minor)
    .bind(transfer.id.as_uuid())
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let new_paid = paid + body.amount_minor;
    let new_status = if new_paid >= total {
        "COMPLETE"
    } else {
        "OPEN"
    };
    sqlx::query(
        "UPDATE split_sessions
            SET paid_minor = $1,
                status = $2,
                completed_at = CASE WHEN $2 = 'COMPLETE' THEN now() ELSE completed_at END
          WHERE id = $3",
    )
    .bind(new_paid)
    .bind(new_status)
    .bind(session_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    tx.commit()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "split_id":      session_id,
            "transfer_id":   transfer.id,
            "amount_minor":  body.amount_minor,
            "paid_minor":    new_paid,
            "remaining_minor": total - new_paid,
            "status":        new_status,
            "completed":     new_status == "COMPLETE",
        })),
    ))
}
