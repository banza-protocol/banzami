use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_compliance::{ComplianceEngine, OperationType};
use banzami_consumer_wallets::{ConsumerWalletEngine, ConsumerWalletError, RoutingStatus};
use banzami_qr::{
    CreateDynamicQrRequest, CreateStaticQrRequest, QrCodeType, QrEngine, QrError, QrOwnerType,
};
use banzami_transfers::{SendTransferRequest, TransferEngine, TransferError};
use banzami_types::{ConsumerId, Currency, CustomerId};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateStaticQrBody {
    pub owner_id: String,
    pub owner_type: String,
    pub currency: String,
    pub amount_minor: Option<i64>,
}

#[derive(Deserialize)]
pub struct CreateDynamicQrBody {
    pub owner_id: String,
    pub owner_type: String,
    pub currency: String,
    pub amount_minor: i64,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub reference: Option<String>,
    /// ADR-042: optionally bind this QR to a segregated wallet account of the
    /// owner (e.g. a DOA campaign account) so payments route there.
    pub wallet_account_id: Option<String>,
}

#[derive(Deserialize)]
pub struct DecodeQrBody {
    pub payload: String,
}

#[derive(Deserialize)]
pub struct PayQrBody {
    pub idempotency_key: String,
    /// Payer's @banza handle (with or without @).
    pub payer: String,
    /// The scanned QR payload string.
    pub payload: String,
    /// Required for STATIC QR (payer enters the amount). Ignored for DYNAMIC.
    pub amount_minor: Option<i64>,
    pub note: Option<String>,
    /// Opaque client device identifier (RSK-001 device signal). When supplied,
    /// a high-value payment from a device not seen before for this payer is
    /// flagged for operator review. Hashed before storage — never persisted raw.
    pub device_id: Option<String>,
}

/// Amount (minor units) at/above which a new-device payment is flagged for
/// review — mirrors the risk engine's elevated-amount threshold (100 000 Kz).
const DEVICE_REVIEW_THRESHOLD_MINOR: i64 = 10_000_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_owner_type(s: &str) -> Result<QrOwnerType, ApiError> {
    match s.to_uppercase().as_str() {
        "CONSUMER" => Ok(QrOwnerType::Consumer),
        "MERCHANT" => Ok(QrOwnerType::Merchant),
        _ => Err(ApiError::bad_request(
            "owner_type must be CONSUMER or MERCHANT",
        )),
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub async fn create_static(
    State(state): State<AppState>,
    Json(body): Json<CreateStaticQrBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let owner_id: uuid::Uuid = body
        .owner_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid owner_id"))?;
    let owner_type = parse_owner_type(&body.owner_type)?;
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    let qr = state
        .qr
        .create_static(CreateStaticQrRequest {
            owner_id,
            owner_type,
            currency,
            amount_minor: body.amount_minor,
        })
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let payload = state
        .qr
        .encode(&qr)
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "qr_code": qr,
            "payload": payload,
        })),
    ))
}

pub async fn create_dynamic(
    State(state): State<AppState>,
    Json(body): Json<CreateDynamicQrBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let owner_id: uuid::Uuid = body
        .owner_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid owner_id"))?;
    let owner_type = parse_owner_type(&body.owner_type)?;
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
    }

    // ADR-042: a bound segregated account must belong to the owner MERCHANT wallet,
    // be ACTIVE, and match the QR currency. Validated here for early feedback; the
    // transfer engine re-checks at pay time (authoritative).
    let wallet_account_id = match body.wallet_account_id.as_deref() {
        None => None,
        Some(raw) => {
            let wa_id = uuid::Uuid::parse_str(raw)
                .map_err(|_| ApiError::bad_request("invalid wallet_account_id"))?;
            let ok: Option<uuid::Uuid> = sqlx::query_scalar(
                "SELECT id FROM wallet_accounts
                  WHERE id = $1 AND wallet_id = $2 AND currency = $3 AND status = 'ACTIVE'",
            )
            .bind(wa_id)
            .bind(owner_id)
            .bind(currency.code())
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?;
            if ok.is_none() {
                return Err(ApiError::unprocessable(
                    "INVALID_WALLET_ACCOUNT",
                    "wallet_account_id must be an active account of the owner wallet in this currency",
                ));
            }
            Some(wa_id)
        }
    };

    let qr = state
        .qr
        .create_dynamic(CreateDynamicQrRequest {
            owner_id,
            owner_type,
            currency,
            amount_minor: body.amount_minor,
            expires_at: body.expires_at,
            reference: body.reference,
            wallet_account_id,
        })
        .await
        .map_err(|e| match e {
            QrError::AlreadyExpired => ApiError::bad_request("expires_at is in the past"),
            other => ApiError::internal(other.to_string()),
        })?;

    let payload = state
        .qr
        .encode(&qr)
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "qr_code": qr,
            "payload": payload,
        })),
    ))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let qr_id = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid QR code id"))?;

    let qr = state.qr.get(qr_id).await.map_err(|e| match e {
        QrError::NotFound(_) => ApiError::not_found("QR code not found"),
        other => ApiError::internal(other.to_string()),
    })?;

    let payload = state
        .qr
        .encode(&qr)
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "qr_code": qr,
        "payload": payload,
    })))
}

pub async fn decode(
    State(state): State<AppState>,
    Json(body): Json<DecodeQrBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let parsed = state.qr.decode(&body.payload).map_err(|e| match e {
        QrError::InvalidPayload(msg) => ApiError::bad_request(msg),
        other => ApiError::internal(other.to_string()),
    })?;

    Ok(Json(serde_json::to_value(&parsed).unwrap()))
}

pub async fn mark_used(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let qr_id = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid QR code id"))?;

    let qr = state.qr.mark_used(qr_id).await.map_err(|e| match e {
        QrError::NotFound(_) => ApiError::not_found("QR code not found"),
        QrError::AlreadyExpired => ApiError::unprocessable("QR_EXPIRED", "QR code has expired"),
        QrError::AlreadyUsedOrExpired => {
            ApiError::unprocessable("QR_ALREADY_USED", "QR code has already been used")
        }
        QrError::CannotMarkStaticAsUsed => {
            ApiError::bad_request("static QR codes cannot be marked as used")
        }
        other => ApiError::internal(other.to_string()),
    })?;

    Ok(Json(serde_json::to_value(&qr).unwrap()))
}

fn map_qr_pay_error(e: QrError) -> ApiError {
    match e {
        QrError::NotFound(_) => ApiError::not_found("QR code not found"),
        QrError::InvalidPayload(msg) => ApiError::bad_request(msg),
        QrError::InvalidSignature => {
            ApiError::unprocessable("QR_INVALID_SIGNATURE", "QR code signature is invalid")
        }
        QrError::AlreadyExpired => ApiError::unprocessable("QR_EXPIRED", "QR code has expired"),
        QrError::AlreadyUsedOrExpired => {
            ApiError::unprocessable("QR_ALREADY_USED", "QR code has already been used")
        }
        QrError::UnknownCurrency(c) => ApiError::bad_request(format!("unknown currency: {c}")),
        other => ApiError::internal(other.to_string()),
    }
}

/// POST /internal/v1/consumer/qr/pay
///
/// The single scan-to-pay entry point. Resolves and integrity-verifies the
/// scanned QR, claims a dynamic code atomically (one-time), settles the wallet
/// transfer payer → owner, and rolls the claim back if settlement fails.
pub async fn pay(
    State(state): State<AppState>,
    Json(body): Json<PayQrBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    // 1. Resolve + verify the QR (dynamic: signature/status/expiry checked).
    let target = state
        .qr
        .resolve_for_payment(&body.payload)
        .await
        .map_err(map_qr_pay_error)?;

    // 2. Determine the amount: fixed for dynamic, payer-entered for static.
    let amount_minor = match target.qr_type {
        QrCodeType::Dynamic => target
            .amount_minor
            .ok_or_else(|| ApiError::internal("dynamic QR resolved without an amount"))?,
        QrCodeType::Static => {
            let a = body
                .amount_minor
                .ok_or_else(|| ApiError::bad_request("amount_minor is required for a static QR"))?;
            if a <= 0 {
                return Err(ApiError::bad_request("amount_minor must be positive"));
            }
            a
        }
    };
    let currency = target.currency;

    // 3. Resolve the payer handle → wallet; must be fully routable to send.
    let payer = state
        .consumer_wallet
        .resolve_to_wallet(&body.payer, currency)
        .await
        .map_err(|e| match e {
            ConsumerWalletError::HandleNotFound(_) | ConsumerWalletError::InvalidHandle(_) => {
                ApiError::bad_request("invalid or unknown payer handle")
            }
            ConsumerWalletError::SuspendedIdentity(_)
            | ConsumerWalletError::ClosedIdentity(_)
            | ConsumerWalletError::WalletCannotReceive(_) => {
                ApiError::unprocessable("PAYER_WALLET_NOT_ACTIVE", "payer wallet is not active")
            }
            other => ApiError::internal(other.to_string()),
        })?;
    if payer.routing_status != RoutingStatus::Routable {
        return Err(ApiError::unprocessable(
            "PAYER_WALLET_NOT_ACTIVE",
            "payer wallet is not active",
        ));
    }
    // A frozen payer moves nothing.
    super::risk::ensure_not_frozen(&state.pool, "CONSUMER", payer.consumer_id.as_uuid()).await?;

    // 4. Recipient is the QR owner (consumer_id, or merchant wallet UUID).
    let recipient_id = ConsumerId::from_uuid(target.owner_id);
    if payer.consumer_id == recipient_id {
        return Err(ApiError::bad_request("cannot pay your own QR code"));
    }

    // 4b. Progressive-KYC gate (fail-closed: this runs in-process, so a
    //     compliance error aborts the payment). PAY_MERCHANT requires at least
    //     basic identity and the payer to be within their daily/transaction
    //     limits. Today's outbound volume is aggregated from the ledger.
    let daily_volume_minor: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(le.amount_minor), 0)::BIGINT
           FROM ledger_entries le
           JOIN consumer_wallets w ON w.available_account_id = le.account_id
          WHERE w.consumer_id = $1
            AND le.entry_type = 'DEBIT'
            AND le.created_at >= date_trunc('day', now())",
    )
    .bind(payer.consumer_id.as_uuid())
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let auth = state
        .compliance
        .authorize_operation(
            CustomerId::from_uuid(payer.consumer_id.as_uuid()),
            OperationType::PayMerchant,
            amount_minor,
            daily_volume_minor,
        )
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    if !auth.can_transact {
        // Pass through the deterministic V1.0 pilot codes (consumer per-payment /
        // daily are the only ones authorize_operation emits), otherwise map the
        // KYC-tier reasons.
        let code: &'static str = match auth.reason.as_str() {
            "LIMIT_EXCEEDED" => "LIMIT_EXCEEDED",
            "KYC_NOT_APPROVED" => "KYC_NOT_APPROVED",
            "PILOT_LIMIT_PER_PAYMENT_EXCEEDED" => "PILOT_LIMIT_PER_PAYMENT_EXCEEDED",
            "PILOT_LIMIT_CONSUMER_DAILY_EXCEEDED" => "PILOT_LIMIT_CONSUMER_DAILY_EXCEEDED",
            _ => "KYC_REQUIRED",
        };
        return Err(ApiError::unprocessable(code, auth.message));
    }

    // 4c. Device signal (RSK-001): recognise the payer's device. A high-value
    //     payment from a device not seen before is flagged for operator review
    //     (the payment still proceeds — a soft signal, not a hard block). The
    //     raw device id is hashed (SHA-256) in SQL and never persisted in clear.
    if let Some(device_id) = body.device_id.as_deref() {
        let is_new_device: bool = sqlx::query_scalar(
            "INSERT INTO consumer_devices (consumer_id, device_hash)
             VALUES ($1, encode(sha256(convert_to($2, 'UTF8')), 'hex'))
             ON CONFLICT (consumer_id, device_hash)
                 DO UPDATE SET last_seen_at = now()
             RETURNING (xmax = 0)",
        )
        .bind(payer.consumer_id.as_uuid())
        .bind(device_id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(false);

        if is_new_device && amount_minor >= DEVICE_REVIEW_THRESHOLD_MINOR {
            super::risk::flag_risk(
                &state.pool,
                "CONSUMER",
                payer.consumer_id.as_uuid(),
                "SUSPICIOUS_FUNDING",
                "MEDIUM",
                "high-value payment from a device not seen before",
            )
            .await;
        }
    }

    // 4d. V1.0 pilot-limit overlay (internal Sandbox / Phase 0; disabled by
    //     default, never active on live/production). Enforce the merchant-receipt
    //     caps (per-received / daily / balance-after) and the aggregate volume cap
    //     BEFORE any irreversible claim or settle. Consumer per-payment/daily are
    //     already enforced above via authorize_operation.
    {
        let policy = banzami_compliance::pilot::PilotLimitPolicy::from_env();
        if policy.is_enabled() {
            if target.owner_type == QrOwnerType::Merchant {
                let avail: Option<uuid::Uuid> = sqlx::query_scalar(
                    "SELECT available_account_id FROM wallets WHERE id = $1 AND status = 'ACTIVE'",
                )
                .bind(target.owner_id)
                .fetch_optional(&state.pool)
                .await
                .map_err(|e| ApiError::internal(e.to_string()))?;
                if let Some(account) = avail {
                    if let Some(v) = banzami_compliance::pilot_enforce::check_merchant_receipt(
                        &state.pool,
                        account,
                        amount_minor,
                        policy,
                    )
                    .await
                    .map_err(|e| ApiError::internal(e.to_string()))?
                    {
                        return Err(ApiError::unprocessable(v.as_str(), v.message()));
                    }
                }
            }
            if let Some(v) =
                banzami_compliance::pilot_enforce::check_volume(&state.pool, amount_minor, policy)
                    .await
                    .map_err(|e| ApiError::internal(e.to_string()))?
            {
                return Err(ApiError::unprocessable(v.as_str(), v.message()));
            }
        }
    }

    // 5. One-time claim for dynamic QR BEFORE settling (atomic; prevents
    //    double-spend even if two devices scan the same code at once).
    if let Some(qr_id) = target.qr_code_id {
        state.qr.mark_used(qr_id).await.map_err(map_qr_pay_error)?;
    }

    // 6. Settle the wallet transfer payer → owner.
    let settled = state
        .transfer
        .send(SendTransferRequest {
            idempotency_key: body.idempotency_key.clone(),
            sender_id: payer.consumer_id,
            recipient_id,
            amount_minor,
            currency,
            description: body.note,
            recipient_handle: None,
            // ADR-042: a campaign-bound QR routes the credit to its segregated
            // account; a plain QR (None) credits the wallet's default account.
            recipient_account_id: target.wallet_account_id,
        })
        .await;

    let transfer = match settled {
        Ok(t) => t,
        Err(e) => {
            // 7. Settlement failed — release the dynamic claim so the payer can
            //    retry the same code. Best-effort (we already own the claim).
            if let Some(qr_id) = target.qr_code_id {
                let _ = state.qr.release_claim(qr_id).await;
            }
            return Err(match e {
                TransferError::SelfTransfer => ApiError::bad_request("cannot pay yourself"),
                TransferError::InvalidAmount => {
                    ApiError::bad_request("amount_minor must be positive")
                }
                TransferError::InsufficientFunds {
                    available,
                    requested,
                } => ApiError::unprocessable(
                    "INSUFFICIENT_FUNDS",
                    format!("available {available}, requested {requested}"),
                ),
                TransferError::WalletNotFound { .. } | TransferError::WalletNotActive(_) => {
                    ApiError::unprocessable("PAYER_WALLET_NOT_ACTIVE", "payer wallet is not active")
                }
                TransferError::AccountFrozen => ApiError::unprocessable(
                    "ACCOUNT_FROZEN",
                    "an account in this transfer is frozen",
                ),
                other => ApiError::internal(other.to_string()),
            });
        }
    };

    // BANZA ADR-030: a wallet-native MERCHANT payment is a first-class, refundable
    // payment object — distinct from a P2P transfer. Record it after the transfer
    // settles. Best-effort + idempotent on the transfer id: a P2P (consumer-owned)
    // QR records nothing, and a retry re-records the same row at most once. The
    // payment has already settled, so a recording hiccup never fails the payment.
    let _ = super::wallet_payments::record_merchant_qr_payment(
        &state.pool,
        target.owner_type,
        target.owner_id,
        transfer.id.as_uuid(),
        payer.consumer_id.as_uuid(),
        target.qr_code_id.map(|q| q.as_uuid()),
        amount_minor,
        currency.code(),
        &body.idempotency_key,
        state.environment.as_str(),
    )
    .await;

    // Collections (BANZA ADR-036): if this QR backs a CollectionShare's
    // PaymentIntent, settle it now that the transfer is COMPLETED. Eventual +
    // idempotent: a plain QR (no backing intent) is a no-op, and a replay marks
    // nothing twice. Best-effort — a settlement hiccup never fails the payment.
    if let Some(qr_id) = target.qr_code_id {
        super::collections::settle_and_emit(
            &state,
            banzami_collections::Surface::Qr,
            &qr_id.to_string(),
            transfer.id,
            state.environment.as_str(),
        )
        .await;

        // Payment Session (BANZA ADR-043): if this QR is an interface of a session,
        // mark the session PAID and emit payment_session.paid. Best-effort + idempotent
        // (a plain QR with no session is a no-op; a replay transitions nothing).
        let interface = match target.qr_type {
            QrCodeType::Dynamic => "DYNAMIC_QR",
            QrCodeType::Static => "STATIC_QR",
        };
        super::payment_sessions::settle_for_interface(
            &state,
            "qr",
            qr_id.as_uuid(),
            transfer.id.as_uuid(),
            amount_minor,
            interface,
        )
        .await;
    }

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id":              transfer.id,
            "qr_type":         target.qr_type.as_str(),
            "payer":           format!("@{}", payer.normalized_handle),
            "recipient_id":    target.owner_id,
            "owner_type":      target.owner_type.as_str(),
            "amount_minor":    transfer.amount.amount_minor(),
            "currency":        transfer.currency.code(),
            "status":          transfer.status.as_str(),
            "idempotency_key": transfer.idempotency_key,
            "created_at":      transfer.created_at,
        })),
    ))
}
