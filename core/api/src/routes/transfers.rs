use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_consumer_wallets::{ConsumerWalletEngine, ConsumerWalletError, RoutingStatus};
use banzami_transfers::{SendTransferRequest, TransferEngine, TransferError};
use banzami_types::{Currency, TransferId};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Request / query types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct SendTransferBody {
    pub idempotency_key: String,
    pub sender_id: String,
    pub recipient_id: String,
    pub amount_minor: i64,
    pub currency: String,
    pub description: Option<String>,
    /// ADR-030/042: route the merchant credit to a specific segregated account
    /// (e.g. a campaign account behind a Payment Session's link). `None` ⇒ default.
    pub recipient_account_id: Option<String>,
}

#[derive(Deserialize)]
pub struct ListTransfersQuery {
    pub consumer_id: String,
    pub limit: Option<i64>,
    pub before_created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub before_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub async fn send(
    State(state): State<AppState>,
    Json(body): Json<SendTransferBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    let sender_id: banzami_types::ConsumerId = body
        .sender_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid sender_id"))?;

    let recipient_id = body
        .recipient_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid recipient_id"))?;

    // A frozen sender moves nothing.
    super::risk::ensure_not_frozen(&state.pool, "CONSUMER", sender_id.as_uuid()).await?;

    let recipient_account_id = match body.recipient_account_id.as_deref() {
        Some(s) => Some(
            uuid::Uuid::parse_str(s)
                .map_err(|_| ApiError::bad_request("invalid recipient_account_id"))?,
        ),
        None => None,
    };

    let transfer = state
        .transfer
        .send(SendTransferRequest {
            idempotency_key: body.idempotency_key,
            sender_id,
            recipient_id,
            amount_minor: body.amount_minor,
            currency,
            description: body.description,
            recipient_handle: None, // UUID-based internal route — no handle snapshot
            recipient_account_id,
        })
        .await
        .map_err(|e| match e {
            TransferError::SelfTransfer => ApiError::bad_request("cannot transfer to yourself"),
            TransferError::InvalidAmount => ApiError::bad_request("amount_minor must be positive"),
            TransferError::InsufficientFunds {
                available,
                requested,
            } => ApiError::unprocessable(
                "INSUFFICIENT_FUNDS",
                format!("available {available}, requested {requested}"),
            ),
            TransferError::WalletNotFound { .. } => {
                ApiError::unprocessable("WALLET_NOT_FOUND", "sender or recipient has no wallet")
            }
            TransferError::WalletNotActive(_) => {
                ApiError::unprocessable("WALLET_NOT_ACTIVE", "wallet is not active")
            }
            TransferError::AccountFrozen => {
                ApiError::unprocessable("ACCOUNT_FROZEN", "an account in this transfer is frozen")
            }
            // The payer's own input, refused by the domain: a 4xx that says why,
            // never a 500 that reads as an outage.
            TransferError::InvalidDescription(e) => {
                ApiError::unprocessable("INVALID_DESCRIPTION", e.to_string())
            }
            // The key was used for a different transfer (another payer, amount
            // or recipient): refused, never answered with someone else's.
            TransferError::DuplicateIdempotencyKey(_) => ApiError::conflict(
                "IDEMPOTENCY_KEY_REUSED",
                "this idempotency key was already used for a different transfer",
            ),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(&transfer).unwrap()),
    ))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let transfer_id: TransferId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid transfer id"))?;

    let transfer = state.transfer.get(transfer_id).await.map_err(|e| match e {
        TransferError::NotFound(_) => ApiError::not_found("transfer not found"),
        other => ApiError::internal(other.to_string()),
    })?;

    Ok(Json(serde_json::to_value(&transfer).unwrap()))
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListTransfersQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let consumer_id = q
        .consumer_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer_id"))?;

    let limit = q.limit.unwrap_or(20).clamp(1, 100);

    let before_id = q
        .before_id
        .map(|s| s.parse::<TransferId>())
        .transpose()
        .map_err(|_| ApiError::bad_request("invalid before_id"))?;

    let mut transfers = state
        .transfer
        .list(consumer_id, limit + 1, q.before_created_at, before_id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let has_more = transfers.len() as i64 > limit;
    transfers.truncate(limit as usize);

    Ok(Json(serde_json::json!({
        "data":     transfers,
        "has_more": has_more,
    })))
}

// ---------------------------------------------------------------------------
// P2P-001 — @banza handle-to-handle consumer transfer
// ---------------------------------------------------------------------------

/// Consumer-facing P2P request: sender and recipient are @banza handles.
#[derive(Deserialize)]
pub struct SendP2pBody {
    pub idempotency_key: String,
    /// Sender's @banza handle (with or without @). Resolved to a consumer_id.
    pub sender: String,
    /// Recipient's @banza handle (with or without @). Resolved via HDL-002.
    pub recipient: String,
    pub amount_minor: i64,
    pub currency: String,
    /// Consumer-visible memo (stored as description on the transfer).
    pub note: Option<String>,
}

/// POST /internal/v1/consumer/transfers
///
/// Resolves sender + recipient @banza handles, verifies routing status,
/// then atomically posts the double-entry ledger transfer.
pub async fn send_p2p(
    State(state): State<AppState>,
    Json(body): Json<SendP2pBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    // Resolve sender handle → routing destination (gives us consumer_id + routing status).
    let sender_dest = state
        .consumer_wallet
        .resolve_to_wallet(&body.sender, currency)
        .await
        .map_err(|e| match e {
            ConsumerWalletError::HandleNotFound(_) | ConsumerWalletError::InvalidHandle(_) => {
                ApiError::bad_request("invalid or unknown sender handle")
            }
            ConsumerWalletError::SuspendedIdentity(_)
            | ConsumerWalletError::ClosedIdentity(_)
            | ConsumerWalletError::WalletCannotReceive(_) => {
                ApiError::unprocessable("SENDER_WALLET_NOT_ACTIVE", "sender wallet is not active")
            }
            other => ApiError::internal(other.to_string()),
        })?;

    // Sender must be fully ACTIVE — LOCKED wallets may receive but not send.
    if sender_dest.routing_status != RoutingStatus::Routable {
        return Err(ApiError::unprocessable(
            "SENDER_WALLET_NOT_ACTIVE",
            "sender wallet is not active",
        ));
    }
    // A frozen sender moves nothing.
    super::risk::ensure_not_frozen(&state.pool, "CONSUMER", sender_dest.consumer_id.as_uuid())
        .await?;

    // Resolve recipient handle → routing destination (HDL-002 full pipeline).
    let recipient_dest = state
        .consumer_wallet
        .resolve_to_wallet(&body.recipient, currency)
        .await
        .map_err(|e| match e {
            ConsumerWalletError::HandleNotFound(h) => {
                ApiError::not_found(format!("recipient @{h} not found"))
            }
            ConsumerWalletError::InvalidHandle(m) => ApiError::bad_request(m),
            ConsumerWalletError::SuspendedIdentity(h) | ConsumerWalletError::ClosedIdentity(h) => {
                ApiError::unprocessable(
                    "RECIPIENT_NOT_ROUTABLE",
                    format!("recipient @{h} cannot receive funds"),
                )
            }
            ConsumerWalletError::WalletCannotReceive(_) => ApiError::unprocessable(
                "RECIPIENT_NOT_ROUTABLE",
                "recipient wallet cannot receive funds",
            ),
            other => ApiError::internal(other.to_string()),
        })?;

    // Self-transfer guard at the identity level (before the DB transaction).
    if sender_dest.consumer_id == recipient_dest.consumer_id {
        return Err(ApiError::bad_request("cannot transfer to yourself"));
    }

    let transfer = state
        .transfer
        .send(SendTransferRequest {
            idempotency_key: body.idempotency_key,
            sender_id: sender_dest.consumer_id,
            recipient_id: recipient_dest.consumer_id,
            amount_minor: body.amount_minor,
            currency,
            description: body.note,
            recipient_handle: Some(recipient_dest.normalized_handle.clone()),
            recipient_account_id: None,
        })
        .await
        .map_err(|e| match e {
            TransferError::SelfTransfer => ApiError::bad_request("cannot transfer to yourself"),
            TransferError::InvalidAmount => ApiError::bad_request("amount_minor must be positive"),
            TransferError::InsufficientFunds {
                available,
                requested,
            } => ApiError::unprocessable(
                "INSUFFICIENT_FUNDS",
                format!("available {available}, requested {requested}"),
            ),
            TransferError::WalletNotFound { .. } | TransferError::WalletNotActive(_) => {
                ApiError::unprocessable("SENDER_WALLET_NOT_ACTIVE", "sender wallet is not active")
            }
            TransferError::AccountFrozen => {
                ApiError::unprocessable("ACCOUNT_FROZEN", "an account in this transfer is frozen")
            }
            TransferError::InvalidDescription(e) => {
                ApiError::unprocessable("INVALID_DESCRIPTION", e.to_string())
            }
            // The key was used for a different transfer (another payer, amount
            // or recipient): refused, never answered with someone else's.
            TransferError::DuplicateIdempotencyKey(_) => ApiError::conflict(
                "IDEMPOTENCY_KEY_REUSED",
                "this idempotency key was already used for a different transfer",
            ),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id":              transfer.id,
            "sender":          format!("@{}", sender_dest.normalized_handle),
            "recipient":       format!("@{}", recipient_dest.normalized_handle),
            "amount_minor":    transfer.amount.amount_minor(),
            "currency":        transfer.currency.code(),
            "status":          transfer.status.as_str(),
            "note":            transfer.description,
            "idempotency_key": transfer.idempotency_key,
            "created_at":      transfer.created_at,
        })),
    ))
}
