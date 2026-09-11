//! Payment Sessions (BANZA ADR-043 · Banzami ADR-030). A session binds a
//! destination wallet_account and provisions interfaces — a payment link and, for
//! fixed-amount sessions, a dynamic QR — that ALL credit the same account. The
//! session stores no balance; payment resolves against the destination. OPERATOR-ONLY
//! (internal boundary). The gateway adds auth + ownership + the safe DTO.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{Duration, Utc};
use serde::Deserialize;
use uuid::Uuid;

use banzami_payment_links::{CreatePaymentLinkRequest, PaymentLinkEngine};
use banzami_qr::{CreateDynamicQrRequest, QrEngine, QrOwnerType};
use banzami_types::{Currency, MerchantId, WalletId};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

const PURPOSES: &[&str] = &[
    "GENERIC", "DONATION", "ORDER", "TICKET", "STORE", "EVENT", "CAMPAIGN", "CUSTOM",
];

#[derive(Deserialize)]
pub struct CreateBody {
    pub merchant_id: String,
    pub wallet_account_id: String,
    pub purpose: Option<String>,
    pub reference_type: Option<String>,
    pub reference_id: Option<String>,
    pub amount_minor: Option<i64>,
    pub currency: Option<String>,
    pub description: Option<String>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(sqlx::FromRow)]
struct SessionRow {
    id: Uuid,
    merchant_id: Uuid,
    wallet_id: Uuid,
    wallet_account_id: Uuid,
    currency: String,
    amount_minor: Option<i64>,
    purpose: String,
    reference_type: Option<String>,
    reference_id: Option<String>,
    status: String,
    payment_link_id: Option<Uuid>,
    qr_code_id: Option<Uuid>,
    deep_link: Option<String>,
    public_url: Option<String>,
    expires_at: Option<chrono::DateTime<chrono::Utc>>,
    metadata: serde_json::Value,
    created_at: chrono::DateTime<chrono::Utc>,
}

async fn fetch_session(pool: &sqlx::PgPool, id: Uuid) -> Result<serde_json::Value, ApiError> {
    let r = sqlx::query_as::<_, SessionRow>(
        "SELECT id, merchant_id, wallet_id, wallet_account_id, currency, amount_minor, purpose,
                reference_type, reference_id, status, payment_link_id, qr_code_id, deep_link,
                public_url, expires_at, metadata, created_at
         FROM payment_sessions WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("payment session not found"))?;

    // Resolve the link slug (the presentable link interface).
    let link_slug: Option<String> = match r.payment_link_id {
        Some(lid) => sqlx::query_scalar("SELECT slug FROM payment_links WHERE id = $1")
            .bind(lid)
            .fetch_optional(pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?,
        None => None,
    };

    // Merchant-safe refundable-source discovery (operator extension). Present
    // only once a wallet payment has COMPLETED for this session's interface and
    // this merchant; absent before paid / for a non-owning merchant. This id is
    // exactly the typed `source_id` the public Refunds endpoint already accepts.
    let refund_source = super::refund_source::resolve_by_interface(
        pool,
        r.merchant_id,
        r.payment_link_id,
        r.qr_code_id,
    )
    .await;

    Ok(serde_json::json!({
        "session_id": r.id,
        "merchant_id": r.merchant_id,
        "wallet_id": r.wallet_id,
        "wallet_account_id": r.wallet_account_id,
        "currency": r.currency,
        "amount_minor": r.amount_minor,
        "purpose": r.purpose,
        "reference_type": r.reference_type,
        "reference_id": r.reference_id,
        "status": r.status,
        "payment_link_id": r.payment_link_id,
        "payment_link_slug": link_slug,
        "qr_code_id": r.qr_code_id,
        "deep_link": r.deep_link,
        "public_url": r.public_url,
        "expires_at": r.expires_at,
        "metadata": r.metadata,
        "created_at": r.created_at,
        "refund_source": refund_source,
    }))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let merchant_id = Uuid::parse_str(&body.merchant_id)
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;
    let wa_id = Uuid::parse_str(&body.wallet_account_id)
        .map_err(|_| ApiError::bad_request("invalid wallet_account_id"))?;
    let purpose = body
        .purpose
        .clone()
        .unwrap_or_else(|| "GENERIC".into())
        .to_uppercase();
    if !PURPOSES.contains(&purpose.as_str()) {
        return Err(ApiError::bad_request("invalid purpose"));
    }

    // Validate the destination: a wallet_account the merchant owns, ACTIVE, with a
    // matching currency. Also yields the parent wallet + currency.
    let (wallet_id, wa_currency, wa_status, wa_merchant): (Uuid, String, String, Uuid) =
        sqlx::query_as(
            "SELECT wallet_id, currency, status, merchant_id FROM wallet_accounts WHERE id = $1",
        )
        .bind(wa_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        .ok_or_else(|| ApiError::not_found("wallet account not found"))?;
    if wa_merchant != merchant_id {
        return Err(ApiError::forbidden(
            "wallet account is not owned by this merchant",
        ));
    }
    if wa_status != "ACTIVE" {
        return Err(ApiError::conflict(
            "WALLET_ACCOUNT_INACTIVE",
            "wallet account is not active",
        ));
    }
    let currency_code = body.currency.clone().unwrap_or_else(|| wa_currency.clone());
    if currency_code != wa_currency {
        return Err(ApiError::bad_request(
            "currency does not match the wallet account",
        ));
    }
    let currency = Currency::from_code(&currency_code)
        .ok_or_else(|| ApiError::bad_request("unsupported currency"))?;

    // A fixed amount must be positive. Without this the value went straight into
    // the INSERT, the database CHECK refused it, and the resulting error surfaced
    // as a 500 — so a caller sending amount_minor = 0 was told the server had
    // failed rather than that their amount was invalid. The constraint held and
    // nothing invalid was ever stored; it was the wrong answer to a correct
    // refusal, the same shape as RA-043 one layer deeper. An OMITTED amount stays
    // valid: that is an open-amount session, which the interface logic below
    // already treats as a distinct case.
    if let Some(amount) = body.amount_minor {
        if amount <= 0 {
            return Err(ApiError::bad_request(
                "amount_minor must be a positive integer when provided",
            ));
        }
    }

    // Idempotency: one session per (merchant, purpose, reference).
    if body.reference_id.is_some() {
        if let Some(existing) = sqlx::query_scalar::<_, Uuid>(
            "SELECT id FROM payment_sessions
              WHERE merchant_id = $1 AND purpose = $2
                AND reference_type IS NOT DISTINCT FROM $3
                AND reference_id   IS NOT DISTINCT FROM $4",
        )
        .bind(merchant_id)
        .bind(&purpose)
        .bind(&body.reference_type)
        .bind(&body.reference_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        {
            return Ok((
                StatusCode::OK,
                Json(fetch_session(&state.pool, existing).await?),
            ));
        }
    }

    // Interface 1 — a payment link bound to the wallet_account (credits it on pay).
    let link = state
        .payment_links
        .create(CreatePaymentLinkRequest {
            merchant_id: MerchantId::from_uuid(merchant_id),
            wallet_id: WalletId::from_uuid(wallet_id),
            wallet_account_id: Some(wa_id),
            amount_minor: body.amount_minor,
            currency: currency_code.clone(),
            description: body.description.clone(),
            expires_at: body.expires_at,
        })
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    // Interface 2 — a dynamic QR bound to the same wallet_account, when the amount
    // is fixed (a dynamic QR requires a positive amount + expiry). Open-amount
    // sessions present the link (a QR image of the public URL is rendered by the
    // gateway). Both interfaces credit the same wallet_account.
    let (qr_code_id, qr_payload): (Option<Uuid>, Option<String>) = match body.amount_minor {
        Some(amt) if amt > 0 => {
            let qr_expiry = body
                .expires_at
                .unwrap_or_else(|| Utc::now() + Duration::days(90));
            let qr = state
                .qr
                .create_dynamic(CreateDynamicQrRequest {
                    owner_id: wallet_id,
                    owner_type: QrOwnerType::Merchant,
                    currency,
                    amount_minor: amt,
                    expires_at: qr_expiry,
                    reference: body.reference_id.clone(),
                    wallet_account_id: Some(wa_id),
                })
                .await
                .map_err(|e| ApiError::internal(e.to_string()))?;
            let payload = state
                .qr
                .encode(&qr)
                .map_err(|e| ApiError::internal(e.to_string()))?;
            (Some(qr.id.as_uuid()), Some(payload))
        }
        _ => (None, None),
    };

    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO payment_sessions
            (id, merchant_id, wallet_id, wallet_account_id, currency, amount_minor, purpose,
             reference_type, reference_id, status, payment_link_id, qr_code_id, public_url, expires_at, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE',$10,$11,$12,$13,$14)",
    )
    .bind(id)
    .bind(merchant_id)
    .bind(wallet_id)
    .bind(wa_id)
    .bind(&currency_code)
    .bind(body.amount_minor)
    .bind(&purpose)
    .bind(&body.reference_type)
    .bind(&body.reference_id)
    .bind(link.id.as_uuid())
    .bind(qr_code_id)
    .bind(Option::<String>::None) // public_url filled by the gateway from pay base
    .bind(body.expires_at)
    .bind(body.metadata.clone().unwrap_or_else(|| serde_json::json!({})))
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // ADR-043 lifecycle: announce the session. The interfaces[] lists the kinds
    // presenting it; every interface credits the same destination_account_ref.
    let mut interfaces = vec!["PAYMENT_LINK"];
    if qr_code_id.is_some() {
        interfaces.push("DYNAMIC_QR");
    }
    let _ = super::webhooks::emit(
        &state.pool,
        merchant_id,
        "payment_session.created",
        &format!("payment_session.created:{id}"),
        serde_json::json!({
            "payment_session_id": id,
            "payee_wallet_id": wallet_id,
            "destination_account_ref": wa_id,
            "amount_minor": body.amount_minor,
            "currency": currency_code,
            "purpose": purpose,
            "reference_type": body.reference_type,
            "reference_id": body.reference_id,
            "interfaces": interfaces,
        }),
    )
    .await;

    let mut out = fetch_session(&state.pool, id).await?;
    // Inline the QR payload on create so the gateway can render it immediately.
    if let Some(p) = qr_payload {
        out["qr_payload"] = serde_json::Value::String(p);
    }
    Ok((StatusCode::CREATED, Json(out)))
}

/// Settle the Payment Session that owns a paid interface (ADR-043 lifecycle).
///
/// Called best-effort + idempotent from the link/QR pay paths once the settling
/// Transfer is COMPLETED. Resolves the session by its link/QR id, transitions it
/// CREATED|ACTIVE → PAID atomically (a replay updates nothing), and emits
/// `payment_session.paid` carrying the session id, transfer, the interface used,
/// the destination account and the app reference. A plain link/QR with no backing
/// session is a no-op. The payment has already settled, so this never fails it.
pub async fn settle_for_interface(
    state: &AppState,
    kind: &str,
    ref_id: Uuid,
    transfer_id: Uuid,
    amount_minor: i64,
    interface: &str,
) {
    let Some((session_id, merchant_id, wallet_account_id, reference_type, reference_id)) =
        mark_paid(state, kind, ref_id).await
    else {
        return; // not found, already terminal, or a transient error — no-op
    };

    // Record the refundable financial object BEFORE resolving it.
    //
    // This used to resolve straight to `None`. The only writer of
    // `wallet_payments` was the QR-pay route, withdrawn for security (RA-053), so
    // nothing recorded a payment settled through a link or a session — the money
    // moved, the session flipped to PAID, and the object a refund names never
    // existed. Every payment on the canonical rail was silently unrefundable.
    //
    // Best-effort and idempotent: the payment has already settled, so a failure
    // here must never fail it. A missing row degrades to the previous behaviour
    // (no refund source) rather than losing money.
    let interface_link_id = if kind == "link" { Some(ref_id) } else { None };
    let interface_qr_id = if kind == "qr" { Some(ref_id) } else { None };
    let _ = super::wallet_payments::record_merchant_interface_payment(
        &state.pool,
        merchant_id,
        transfer_id,
        interface_link_id,
        interface_qr_id,
        // The session knows which child account it credited; recording it is
        // what lets a later refund reverse THAT account rather than the wallet
        // default (RA-061).
        Some(wallet_account_id),
        amount_minor,
        "AOA",
        &session_id.to_string(),
        state.environment.as_str(),
    )
    .await;

    // Additive merchant-safe refund source, resolved from the settling transfer
    // (the most precise anchor). Delivered only to this merchant's own signed
    // webhook subscription.
    let refund_source =
        super::refund_source::resolve_by_transfer(&state.pool, merchant_id, transfer_id).await;

    let _ = super::webhooks::emit(
        &state.pool,
        merchant_id,
        "payment_session.paid",
        &format!("payment_session.paid:{session_id}"),
        serde_json::json!({
            "payment_session_id": session_id,
            "transfer_id": transfer_id,
            "amount_minor": amount_minor,
            "interface": interface,
            "destination_account_ref": wallet_account_id,
            "reference_type": reference_type,
            "reference_id": reference_id,
            "refund_source": refund_source,
        }),
    )
    .await;
}

/// The session a paid interface belongs to, moved CREATED|ACTIVE → PAID in one
/// statement that also retires its other interface. Returns the session only to
/// the call that performed the transition, so whatever follows (the record, the
/// event) happens once however many callers race.
type PaidSession = (Uuid, Uuid, Uuid, Option<String>, Option<String>);

async fn mark_paid(state: &AppState, kind: &str, ref_id: Uuid) -> Option<PaidSession> {
    let column = match kind {
        "link" => "payment_link_id",
        "qr" => "qr_code_id",
        _ => return None,
    };
    // Atomic transition: only CREATED/ACTIVE flips to PAID; RETURNING tells us
    // whether THIS call performed it (so the event fires exactly once).
    //
    // A session is paid once, through whichever interface paid it; the OTHER
    // interface stops being payable in the same statement — the dynamic QR
    // expires when the link paid, the link is cancelled when the QR paid. It
    // used to stay ACTIVE for its whole 89-day life beside a PAID session, so the
    // session could have been paid a second time the day a QR payment route
    // exists (the interface that paid is never touched here).
    let sibling = match kind {
        "link" => {
            "UPDATE qr_codes SET status = 'EXPIRED'
              WHERE id IN (SELECT qr_code_id FROM s) AND status = 'ACTIVE'"
        }
        _ => {
            "UPDATE payment_links SET status = 'CANCELLED', updated_at = now()
              WHERE id IN (SELECT payment_link_id FROM s) AND status = 'ACTIVE'"
        }
    };
    sqlx::query_as::<_, PaidSession>(&format!(
        "WITH s AS (
            UPDATE payment_sessions
               SET status = 'PAID', updated_at = now()
             WHERE {column} = $1 AND status IN ('CREATED','ACTIVE')
         RETURNING id, merchant_id, wallet_account_id, reference_type, reference_id,
                   qr_code_id, payment_link_id
         ), retired AS ({sibling})
         SELECT id, merchant_id, wallet_account_id, reference_type, reference_id FROM s",
    ))
    .bind(ref_id)
    .fetch_optional(&state.pool)
    .await
    .ok()
    .flatten()
}

/// Settle the Payment Session whose link was paid on the hosted acquiring rail
/// (pay.banzami.com: the provider callback, or the Sandbox's simulated one).
///
/// That rail credited the session's account and marked the link USED, and never
/// told the session: 52 sessions on the Sandbox stayed ACTIVE after their link
/// was paid — each with a dynamic QR still payable for 89 days, and no
/// `payment_session.paid` for the integrator that created it. Same transition as
/// the wallet rail; the event names the acquiring payment instead of a transfer.
/// No wallet payment is recorded — nothing was paid from a wallet — and the event
/// says so rather than naming a refund source this rail does not produce.
pub async fn settle_for_acquired_link(
    state: &AppState,
    link_id: Uuid,
    acquiring_payment_id: Uuid,
    amount_minor: i64,
) {
    let Some((session_id, merchant_id, wallet_account_id, reference_type, reference_id)) =
        mark_paid(state, "link", link_id).await
    else {
        return;
    };
    let _ = super::webhooks::emit(
        &state.pool,
        merchant_id,
        "payment_session.paid",
        &format!("payment_session.paid:{session_id}"),
        serde_json::json!({
            "payment_session_id": session_id,
            "acquiring_payment_id": acquiring_payment_id,
            "amount_minor": amount_minor,
            "interface": "PAYMENT_LINK",
            "destination_account_ref": wallet_account_id,
            "reference_type": reference_type,
            "reference_id": reference_id,
            "refund_source": serde_json::Value::Null,
        }),
    )
    .await;
}

#[derive(Deserialize)]
pub struct SettleByInterfaceBody {
    pub transfer_id: String,
    pub amount_minor: i64,
    pub interface: Option<String>,
}

/// POST /internal/v1/payment-sessions/settle-by-interface/:kind/:ref_id
/// Settle the session owning a link/QR after its payment completed (link path
/// calls this from the public API; the QR path settles in-process).
pub async fn settle_by_interface(
    State(state): State<AppState>,
    Path((kind, ref_id)): Path<(String, String)>,
    Json(body): Json<SettleByInterfaceBody>,
) -> ApiResult<StatusCode> {
    let rid = Uuid::parse_str(&ref_id).map_err(|_| ApiError::bad_request("invalid id"))?;
    let tid = Uuid::parse_str(&body.transfer_id)
        .map_err(|_| ApiError::bad_request("invalid transfer_id"))?;
    let interface = body.interface.as_deref().unwrap_or(match kind.as_str() {
        "link" => "PAYMENT_LINK",
        _ => "DYNAMIC_QR",
    });
    settle_for_interface(&state, &kind, rid, tid, body.amount_minor, interface).await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let id = Uuid::parse_str(&id).map_err(|_| ApiError::bad_request("invalid id"))?;
    Ok(Json(fetch_session(&state.pool, id).await?))
}

#[derive(Deserialize)]
pub struct CancelBody {
    /// The owner the caller acts for. A session of another owner is not found.
    pub merchant_id: String,
}

/// POST /internal/v1/payment-sessions/:id/cancel — end an unpaid session.
///
/// CANCELLED was always a session state and nothing could reach it: an unpaid
/// session stayed open for good, its link and QR payable, and the account it
/// pays into could never be closed (a close refuses an open session). The
/// session, its link and its QR end in one statement. A session that has been
/// paid, even in part, is refused — money arrived against it. Cancelling a
/// cancelled session answers with the session as it is.
pub async fn cancel(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CancelBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let id = Uuid::parse_str(&id).map_err(|_| ApiError::bad_request("invalid id"))?;
    let merchant = Uuid::parse_str(&body.merchant_id)
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;
    let db = |e: sqlx::Error| ApiError::internal(e.to_string());
    let status: Option<String> = sqlx::query_scalar(
        "SELECT status FROM payment_sessions WHERE id = $1 AND merchant_id = $2",
    )
    .bind(id)
    .bind(merchant)
    .fetch_optional(&state.pool)
    .await
    .map_err(db)?;
    match status.as_deref() {
        None => return Err(ApiError::not_found("payment session not found")),
        Some("PAID") | Some("PARTIALLY_PAID") => {
            return Err(ApiError::conflict(
                "SESSION_PAID",
                "money arrived against this session — it cannot be cancelled",
            ))
        }
        _ => {}
    }
    sqlx::query(
        "WITH s AS (
            UPDATE payment_sessions SET status = 'CANCELLED', updated_at = now()
             WHERE id = $1 AND merchant_id = $2 AND status IN ('CREATED','ACTIVE')
         RETURNING payment_link_id, qr_code_id
         ), link AS (
            UPDATE payment_links SET status = 'CANCELLED', updated_at = now()
             WHERE id IN (SELECT payment_link_id FROM s) AND status = 'ACTIVE'
         )
         UPDATE qr_codes SET status = 'EXPIRED'
          WHERE id IN (SELECT qr_code_id FROM s) AND status = 'ACTIVE'",
    )
    .bind(id)
    .bind(merchant)
    .execute(&state.pool)
    .await
    .map_err(db)?;
    Ok(Json(fetch_session(&state.pool, id).await?))
}

/// Resolve the session that owns a payment link or QR (for webhook enrichment).
/// `kind` is "link" or "qr". Returns the session JSON or 404.
pub async fn get_by_interface(
    State(state): State<AppState>,
    Path((kind, ref_id)): Path<(String, String)>,
) -> ApiResult<Json<serde_json::Value>> {
    let rid = Uuid::parse_str(&ref_id).map_err(|_| ApiError::bad_request("invalid id"))?;
    let column = match kind.as_str() {
        "link" => "payment_link_id",
        "qr" => "qr_code_id",
        _ => return Err(ApiError::bad_request("kind must be 'link' or 'qr'")),
    };
    let id = sqlx::query_scalar::<_, Uuid>(&format!(
        "SELECT id FROM payment_sessions WHERE {column} = $1"
    ))
    .bind(rid)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("no payment session for this interface"))?;
    Ok(Json(fetch_session(&state.pool, id).await?))
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub merchant_id: String,
    pub status: Option<String>,
    pub limit: Option<i64>,
}

/// GET /internal/v1/payment-sessions?merchant_id=&status=&limit=
/// Lists a merchant's sessions, newest first. The gateway enforces ownership.
pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id = Uuid::parse_str(&q.merchant_id)
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let ids: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id FROM payment_sessions
          WHERE merchant_id = $1
            AND ($2::text IS NULL OR status = $2)
          ORDER BY created_at DESC
          LIMIT $3",
    )
    .bind(merchant_id)
    .bind(&q.status)
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        out.push(fetch_session(&state.pool, id).await?);
    }
    Ok(Json(serde_json::json!({ "data": out })))
}
