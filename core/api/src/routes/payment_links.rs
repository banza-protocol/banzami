use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use banzami_payment_links::{CreatePaymentLinkRequest, PaymentLinkEngine, PaymentLinkError};
use banzami_types::{MerchantId, PaymentLinkId, WalletId};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateBody {
    pub merchant_id: String,
    pub wallet_id: String,
    /// ADR-030: optional segregated account to credit (Payment Session).
    pub wallet_account_id: Option<String>,
    pub amount_minor: Option<i64>,
    pub currency: String,
    pub description: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
pub struct PaymentLinkResponse {
    pub id: String,
    pub slug: String,
    pub merchant_id: String,
    pub wallet_id: String,
    pub wallet_account_id: Option<String>,
    pub amount_minor: Option<i64>,
    pub currency: String,
    pub description: Option<String>,
    pub status: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub paid_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    // Merchant-safe refundable-source discovery (operator extension). Present
    // only after a wallet payment has settled for this link; carries the PUBLIC
    // typed source. Omitted (not null) before paid / when absent.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refund_source: Option<serde_json::Value>,
}

impl From<banzami_payment_links::PaymentLink> for PaymentLinkResponse {
    fn from(l: banzami_payment_links::PaymentLink) -> Self {
        Self {
            id: l.id.to_string(),
            slug: l.slug,
            merchant_id: l.merchant_id.to_string(),
            wallet_id: l.wallet_id.to_string(),
            wallet_account_id: l.wallet_account_id.map(|u| u.to_string()),
            amount_minor: l.amount_minor,
            currency: l.currency,
            description: l.description,
            status: l.status.as_str().to_string(),
            expires_at: l.expires_at,
            paid_at: l.paid_at,
            created_at: l.created_at,
            updated_at: l.updated_at,
            refund_source: None,
        }
    }
}

/// Build a link response with merchant-safe refund_source resolved (owner-scoped
/// by the link's own merchant). Used by the authenticated GET + mark-used paths.
async fn link_response_with_refund_source(
    pool: &sqlx::PgPool,
    link: banzami_payment_links::PaymentLink,
) -> PaymentLinkResponse {
    // The domain ids are newtypes; go through their string form to the raw Uuid
    // the resolver expects.
    let merchant_id = Uuid::parse_str(&link.merchant_id.to_string()).ok();
    let link_id = Uuid::parse_str(&link.id.to_string()).ok();
    let mut resp: PaymentLinkResponse = link.into();
    if let (Some(m), Some(l)) = (merchant_id, link_id) {
        resp.refund_source =
            super::refund_source::resolve_by_interface(pool, m, Some(l), None).await;
    }
    resp
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub merchant_id: String,
    pub limit: Option<i64>,
    pub cursor: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn map_err(e: PaymentLinkError) -> ApiError {
    match e {
        PaymentLinkError::NotFound(_) | PaymentLinkError::SlugNotFound(_) => {
            ApiError::not_found(e.to_string())
        }
        PaymentLinkError::NotActive(_) | PaymentLinkError::Expired(_) => {
            ApiError::unprocessable("LINK_NOT_ACTIVE", e.to_string())
        }
        PaymentLinkError::InvalidAmount => {
            ApiError::bad_request("amount_minor must be a positive integer")
        }
        PaymentLinkError::ExpiryInPast => ApiError::bad_request("expires_at must be in the future"),
        PaymentLinkError::Database(_) => ApiError::internal(e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateBody>,
) -> ApiResult<(StatusCode, Json<PaymentLinkResponse>)> {
    let merchant_id = body
        .merchant_id
        .parse::<MerchantId>()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;
    let wallet_id = body
        .wallet_id
        .parse::<WalletId>()
        .map_err(|_| ApiError::bad_request("invalid wallet_id"))?;

    if body.currency.is_empty() {
        return Err(ApiError::bad_request("currency is required"));
    }

    let wallet_account_id = match body.wallet_account_id.as_deref() {
        Some(s) => Some(
            uuid::Uuid::parse_str(s)
                .map_err(|_| ApiError::bad_request("invalid wallet_account_id"))?,
        ),
        None => None,
    };
    let req = CreatePaymentLinkRequest {
        merchant_id,
        wallet_id,
        wallet_account_id,
        amount_minor: body.amount_minor,
        currency: body.currency,
        description: body.description,
        expires_at: body.expires_at,
    };

    let link = state.payment_links.create(req).await.map_err(map_err)?;
    Ok((StatusCode::CREATED, Json(link.into())))
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id = q
        .merchant_id
        .parse::<MerchantId>()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;
    let limit = q.limit.unwrap_or(20);
    let cursor = q
        .cursor
        .as_deref()
        .map(|s| s.parse::<PaymentLinkId>())
        .transpose()
        .map_err(|_| ApiError::bad_request("invalid cursor"))?;

    let links = state
        .payment_links
        .list_for_merchant(merchant_id, limit, cursor)
        .await
        .map_err(map_err)?;

    let next_cursor = if links.len() == limit as usize {
        links.last().map(|l| l.id.to_string())
    } else {
        None
    };

    let data: Vec<PaymentLinkResponse> = links.into_iter().map(Into::into).collect();
    Ok(Json(serde_json::json!({
        "data": data,
        "next_cursor": next_cursor,
    })))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<PaymentLinkResponse>> {
    let id = id
        .parse::<PaymentLinkId>()
        .map_err(|_| ApiError::bad_request("invalid id"))?;
    let link = state.payment_links.get(id).await.map_err(map_err)?;
    Ok(Json(
        link_response_with_refund_source(&state.pool, link).await,
    ))
}

pub async fn get_by_slug(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> ApiResult<Json<PaymentLinkResponse>> {
    let link = state
        .payment_links
        .get_by_slug(&slug)
        .await
        .map_err(map_err)?;
    Ok(Json(link.into()))
}

pub async fn cancel(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<PaymentLinkResponse>> {
    let id = id
        .parse::<PaymentLinkId>()
        .map_err(|_| ApiError::bad_request("invalid id"))?;
    let link = state.payment_links.cancel(id).await.map_err(map_err)?;
    Ok(Json(link.into()))
}

/// Optional settlement context. A link paid through a Payment Session is already
/// recorded by the session path; a link paid on its own has no other writer, so
/// the caller passes the transfer that settled it.
#[derive(Deserialize, Default)]
pub struct MarkUsedBody {
    pub transfer_id: Option<String>,
}

pub async fn mark_used(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Option<Json<MarkUsedBody>>,
) -> ApiResult<Json<PaymentLinkResponse>> {
    let id = id
        .parse::<PaymentLinkId>()
        .map_err(|_| ApiError::bad_request("invalid id"))?;
    let transfer_id = body
        .and_then(|Json(b)| b.transfer_id)
        .map(|t| Uuid::parse_str(&t).map_err(|_| ApiError::bad_request("invalid transfer_id")))
        .transpose()?;

    // Without the settling transfer this is only the status move (a Business
    // closing its own link), and the engine says precisely why it cannot happen.
    let Some(transfer_id) = transfer_id else {
        let link = state.payment_links.mark_used(id).await.map_err(map_err)?;
        return Ok(Json(link_response_with_refund_source(&state.pool, link).await));
    };

    // With it, the link's payment completes in ONE transaction: the link is
    // claimed (ACTIVE and unexpired, in the UPDATE itself), the refundable wallet
    // payment is recorded, and the Payment Session the link belongs to — if any —
    // is paid with its event in the outbox.
    //
    // These were separate best-effort calls. The record was `let _ =` (and an
    // open-amount link recorded amount 0, which the table refuses — A7-38); the
    // session settle turned a database error into "no session" and answered 204.
    // Any of them failing left the payer debited and the link USED, with no
    // refundable object, a session still ACTIVE and no payment_session.paid —
    // and nothing would ever retry (A2-06). Now a failure rolls all of it back and
    // answers 5xx; the payer's retry replays the same transfer (its idempotency
    // key names the link) and completes it here.
    let db = |e: sqlx::Error| ApiError::internal(e.to_string());
    let mut tx = state.pool.begin().await.map_err(db)?;
    let claimed: Option<(Uuid, Uuid, Option<Uuid>)> = sqlx::query_as(
        "UPDATE payment_links
            SET status = 'USED', paid_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())
         RETURNING id, merchant_id, wallet_account_id",
    )
    .bind(id.as_uuid())
    .fetch_optional(&mut *tx)
    .await
    .map_err(db)?;
    let Some((link_id, merchant_id, credited)) = claimed else {
        let _ = tx.rollback().await;
        // Not claimable: the engine reads the link and names the reason
        // (already used, cancelled, expired, or not found).
        let link = state.payment_links.mark_used(id).await.map_err(map_err)?;
        return Ok(Json(link_response_with_refund_source(&state.pool, link).await));
    };
    super::wallet_payments::record_merchant_interface_payment(
        &mut tx,
        merchant_id,
        transfer_id,
        Some(link_id),
        None,
        credited,
        &link_id.to_string(),
        state.environment.as_str(),
    )
    .await
    .map_err(db)?;
    super::payment_sessions::settle_for_interface_in(
        &mut tx,
        state.environment.as_str(),
        "link",
        link_id,
        transfer_id,
        "PAYMENT_LINK",
    )
    .await
    .map_err(db)?;
    tx.commit().await.map_err(db)?;

    let link = state.payment_links.get(id).await.map_err(map_err)?;

    // Carry refund_source so the gateway's payment_link.paid webhook includes it.
    Ok(Json(
        link_response_with_refund_source(&state.pool, link).await,
    ))
}
