use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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
        }
    }
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
            uuid::Uuid::parse_str(s).map_err(|_| ApiError::bad_request("invalid wallet_account_id"))?,
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
    Ok(Json(link.into()))
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

pub async fn mark_used(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<PaymentLinkResponse>> {
    let id = id
        .parse::<PaymentLinkId>()
        .map_err(|_| ApiError::bad_request("invalid id"))?;
    let link = state.payment_links.mark_used(id).await.map_err(map_err)?;
    Ok(Json(link.into()))
}
