//! Collections + PaymentIntent internal API (BANZA ADR-036/037).
//!
//! Operator-side, behind InternalAuth. The Go gateway derives merchant_id +
//! environment from the merchant principal and passes them here; every read/mutate
//! is scoped by (merchant_id, environment) and returns 404 on mismatch.
//!
//! Events are emitted through the existing transactional outbox
//! (`super::webhooks::emit`) with BANZA-canonical names. The live settlement hook
//! (a real payment marking a share PAID with its transfer_id) is a separate,
//! reviewed increment and is intentionally NOT implemented here.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;

use banzami_collections::{
    Collection, CollectionEngine, CollectionError, CollectionRule, CreateCollectionRequest,
    CreateShareRequest, Surface,
};
use banzami_types::{CollectionId, CollectionShareId, MerchantId, WalletId};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

fn map_err(e: CollectionError) -> ApiError {
    use CollectionError::*;
    match e {
        NotFound(_) | ShareNotFound(_) | IntentNotFound(_) | NotOwner => {
            ApiError::not_found(e.to_string())
        }
        Immutable => ApiError::conflict("COLLECTION_IMMUTABLE", e.to_string()),
        Indivisible => ApiError::unprocessable("COLLECTION_INDIVISIBLE", e.to_string()),
        SumMismatch { .. } => ApiError::unprocessable("COLLECTION_SUM_MISMATCH", e.to_string()),
        BelowMinimum { .. } => ApiError::unprocessable("SHARE_BELOW_MINIMUM", e.to_string()),
        ClosedRuleNoDynamicShares => {
            ApiError::unprocessable("CLOSED_RULE_NO_DYNAMIC_SHARES", e.to_string())
        }
        InvalidRule(_) => ApiError::bad_request(e.to_string()),
        InvalidAmount => ApiError::bad_request("amount_minor must be a positive integer"),
        ExpiryInPast => ApiError::bad_request("expires_at must be in the future"),
        InvalidStatus(_) => ApiError::conflict("COLLECTION_INVALID_STATUS", e.to_string()),
        Database(_) => ApiError::internal(e.to_string()),
    }
}

fn parse_merchant(s: &str) -> Result<MerchantId, ApiError> {
    s.parse::<MerchantId>()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))
}

// ---------------------------------------------------------------------------
// Event emission (best-effort; never blocks the persisted state change)
// ---------------------------------------------------------------------------

async fn emit(state: &AppState, merchant: MerchantId, ty: &str, key: String, data: serde_json::Value) {
    let _ = super::webhooks::emit(&state.pool, merchant.as_uuid(), ty, &key, data).await;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateBody {
    pub operator_id: String,
    pub creator: String,
    pub owner: String,
    pub merchant_id: String,
    pub wallet_id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub currency: String,
    pub total_amount_minor: i64,
    pub rule: CollectionRule,
    pub environment: String,
    pub idempotency_key: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    #[serde(default = "default_true")]
    pub open_immediately: bool,
}

fn default_true() -> bool {
    true
}

fn rule_type(rule: &CollectionRule) -> &'static str {
    match rule {
        CollectionRule::EqualSplit { .. } => "EQUAL_SPLIT",
        CollectionRule::FixedAmounts { .. } => "FIXED_AMOUNTS",
        CollectionRule::Percentage { .. } => "PERCENTAGE",
        CollectionRule::OpenContribution { .. } => "OPEN_CONTRIBUTION",
        CollectionRule::MinimumContribution { .. } => "MINIMUM_CONTRIBUTION",
    }
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let merchant_id = parse_merchant(&body.merchant_id)?;
    let wallet_id = body
        .wallet_id
        .parse::<WalletId>()
        .map_err(|_| ApiError::bad_request("invalid wallet_id"))?;
    if body.currency.is_empty() {
        return Err(ApiError::bad_request("currency is required"));
    }

    let open_immediately = body.open_immediately;
    let req = CreateCollectionRequest {
        operator_id: body.operator_id,
        creator: body.creator,
        owner: body.owner,
        merchant_id,
        wallet_id,
        title: body.title,
        description: body.description,
        currency: body.currency,
        total_amount_minor: body.total_amount_minor,
        rule: body.rule,
        environment: body.environment,
        idempotency_key: body.idempotency_key,
        expires_at: body.expires_at,
        open_immediately,
    };

    let (collection, shares) = state.collections.create_collection(req).await.map_err(map_err)?;

    // Events — collection.created, (opened), share.created x N
    emit(
        &state,
        merchant_id,
        "collection.created",
        format!("collection.created:{}", collection.id),
        serde_json::json!({
            "collection_id": collection.id.to_string(),
            "currency": collection.currency,
            "total_amount_minor": collection.total_amount_minor,
            "rule_type": rule_type(&collection.rule),
        }),
    )
    .await;
    if open_immediately {
        emit(
            &state,
            merchant_id,
            "collection.opened",
            format!("collection.opened:{}", collection.id),
            serde_json::json!({ "collection_id": collection.id.to_string() }),
        )
        .await;
    }
    for s in &shares {
        emit(
            &state,
            merchant_id,
            "collection.share.created",
            format!("collection.share.created:{}", s.id),
            serde_json::json!({
                "collection_id": collection.id.to_string(),
                "share_id": s.id.to_string(),
                "amount_minor": s.amount_minor,
                "currency": s.currency,
                "participant": s.participant,
            }),
        )
        .await;
    }

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "collection": collection, "shares": shares })),
    ))
}

#[derive(Deserialize)]
pub struct ScopeQuery {
    pub merchant_id: String,
    pub environment: String,
    pub limit: Option<i64>,
    pub cursor: Option<String>,
}

#[derive(Deserialize)]
pub struct ScopePath {
    pub merchant_id: String,
    pub environment: String,
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ScopeQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id = parse_merchant(&q.merchant_id)?;
    let limit = q.limit.unwrap_or(20);
    let cursor = q
        .cursor
        .as_deref()
        .map(|s| s.parse::<CollectionId>())
        .transpose()
        .map_err(|_| ApiError::bad_request("invalid cursor"))?;
    let items = state
        .collections
        .list_collections(merchant_id, &q.environment, limit, cursor)
        .await
        .map_err(map_err)?;
    let next_cursor = if items.len() == limit.clamp(1, 200) as usize {
        items.last().map(|c| c.id.to_string())
    } else {
        None
    };
    Ok(Json(serde_json::json!({ "data": items, "next_cursor": next_cursor })))
}

async fn load_scoped(
    state: &AppState,
    id: &str,
    q: &ScopeQuery,
) -> Result<(CollectionId, MerchantId, Collection), ApiError> {
    let cid = id
        .parse::<CollectionId>()
        .map_err(|_| ApiError::bad_request("invalid id"))?;
    let merchant_id = parse_merchant(&q.merchant_id)?;
    let c = state
        .collections
        .get_collection(cid, merchant_id, &q.environment)
        .await
        .map_err(map_err)?;
    Ok((cid, merchant_id, c))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<ScopeQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let (cid, _m, c) = load_scoped(&state, &id, &q).await?;
    let collected = state.collections.collected_amount(cid).await.map_err(map_err)?;
    let remaining = (c.total_amount_minor - collected).max(0);
    Ok(Json(serde_json::json!({
        "collection": c,
        "collected_amount_minor": collected,
        "remaining_amount_minor": remaining,
    })))
}

#[derive(Deserialize)]
pub struct UpdateBody {
    pub merchant_id: String,
    pub environment: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub metadata: Option<serde_json::Value>,
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateBody>,
) -> ApiResult<Json<Collection>> {
    let cid = id
        .parse::<CollectionId>()
        .map_err(|_| ApiError::bad_request("invalid id"))?;
    let merchant_id = parse_merchant(&body.merchant_id)?;
    let c = state
        .collections
        .update_collection(
            cid,
            merchant_id,
            &body.environment,
            body.title,
            body.description,
            body.expires_at,
            body.metadata,
        )
        .await
        .map_err(map_err)?;
    Ok(Json(c))
}

#[derive(Deserialize)]
pub struct ActionBody {
    pub merchant_id: String,
    pub environment: String,
}

pub async fn close(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ActionBody>,
) -> ApiResult<Json<Collection>> {
    let cid = id
        .parse::<CollectionId>()
        .map_err(|_| ApiError::bad_request("invalid id"))?;
    let merchant_id = parse_merchant(&body.merchant_id)?;
    let c = state
        .collections
        .close_collection(cid, merchant_id, &body.environment)
        .await
        .map_err(map_err)?;
    let ty = if c.status == banzami_collections::CollectionStatus::Completed {
        "collection.completed"
    } else if c.status == banzami_collections::CollectionStatus::PartiallyCompleted {
        "collection.partially_completed"
    } else {
        "collection.cancelled"
    };
    emit(
        &state,
        merchant_id,
        ty,
        format!("{ty}:{}", c.id),
        serde_json::json!({ "collection_id": c.id.to_string() }),
    )
    .await;
    Ok(Json(c))
}

pub async fn cancel(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ActionBody>,
) -> ApiResult<Json<Collection>> {
    let cid = id
        .parse::<CollectionId>()
        .map_err(|_| ApiError::bad_request("invalid id"))?;
    let merchant_id = parse_merchant(&body.merchant_id)?;
    let c = state
        .collections
        .cancel_collection(cid, merchant_id, &body.environment)
        .await
        .map_err(map_err)?;
    emit(
        &state,
        merchant_id,
        "collection.cancelled",
        format!("collection.cancelled:{}", c.id),
        serde_json::json!({ "collection_id": c.id.to_string() }),
    )
    .await;
    Ok(Json(c))
}

// ---------------------------------------------------------------------------
// Shares
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateShareBody {
    pub merchant_id: String,
    pub environment: String,
    pub amount_minor: i64,
    pub participant: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub idempotency_key: Option<String>,
}

pub async fn create_share(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CreateShareBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let cid = id
        .parse::<CollectionId>()
        .map_err(|_| ApiError::bad_request("invalid id"))?;
    let merchant_id = parse_merchant(&body.merchant_id)?;
    let share = state
        .collections
        .create_share(
            cid,
            merchant_id,
            &body.environment,
            CreateShareRequest {
                amount_minor: body.amount_minor,
                participant: body.participant,
                expires_at: body.expires_at,
                idempotency_key: body.idempotency_key,
            },
        )
        .await
        .map_err(map_err)?;
    emit(
        &state,
        merchant_id,
        "collection.share.created",
        format!("collection.share.created:{}", share.id),
        serde_json::json!({
            "collection_id": cid.to_string(),
            "share_id": share.id.to_string(),
            "amount_minor": share.amount_minor,
            "currency": share.currency,
            "participant": share.participant,
        }),
    )
    .await;
    Ok((StatusCode::CREATED, Json(serde_json::json!(share))))
}

pub async fn list_shares(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<ScopeQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let cid = id
        .parse::<CollectionId>()
        .map_err(|_| ApiError::bad_request("invalid id"))?;
    let merchant_id = parse_merchant(&q.merchant_id)?;
    let limit = q.limit.unwrap_or(50);
    let cursor = q
        .cursor
        .as_deref()
        .map(|s| s.parse::<CollectionShareId>())
        .transpose()
        .map_err(|_| ApiError::bad_request("invalid cursor"))?;
    let items = state
        .collections
        .list_shares(cid, merchant_id, &q.environment, limit, cursor)
        .await
        .map_err(map_err)?;
    let next_cursor = if items.len() == limit.clamp(1, 200) as usize {
        items.last().map(|s| s.id.to_string())
    } else {
        None
    };
    Ok(Json(serde_json::json!({ "data": items, "next_cursor": next_cursor })))
}

// ---------------------------------------------------------------------------
// Surface a share (create its PaymentIntent — ADR-037)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct SurfaceBody {
    pub merchant_id: String,
    pub environment: String,
    pub surface: Surface,
    pub surface_ref: Option<String>,
}

pub async fn surface_share(
    State(state): State<AppState>,
    Path(share_id): Path<String>,
    Json(body): Json<SurfaceBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let sid = share_id
        .parse::<CollectionShareId>()
        .map_err(|_| ApiError::bad_request("invalid share id"))?;
    let merchant_id = parse_merchant(&body.merchant_id)?;
    let (intent, share) = state
        .collections
        .surface_share(sid, merchant_id, &body.environment, body.surface, body.surface_ref)
        .await
        .map_err(map_err)?;

    emit(
        &state,
        merchant_id,
        "payment_intent.created",
        format!("payment_intent.created:{}", intent.id),
        serde_json::json!({
            "payment_intent_id": intent.id.to_string(),
            "payee_wallet_id": intent.payee_wallet_id.to_string(),
            "amount_minor": intent.amount_minor,
            "currency": intent.currency,
            "surface": intent.surface.as_str(),
        }),
    )
    .await;
    emit(
        &state,
        merchant_id,
        "collection.share.payment_requested",
        format!("collection.share.payment_requested:{}", share.id),
        serde_json::json!({
            "collection_id": share.collection_id.to_string(),
            "share_id": share.id.to_string(),
            "payment_intent_id": intent.id.to_string(),
        }),
    )
    .await;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "payment_intent": intent, "share": share })),
    ))
}

// ---------------------------------------------------------------------------
// Events (audit trail for a collection)
// ---------------------------------------------------------------------------

pub async fn events(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<ScopeQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    // Ownership check (404 if not ours).
    let (_cid, _m, _c) = load_scoped(&state, &id, &q).await?;
    let rows: Vec<(serde_json::Value,)> = sqlx::query_as(
        "SELECT payload FROM webhook_events \
         WHERE event_type LIKE 'collection%' AND payload->'data'->>'collection_id' = $1 \
         ORDER BY created_at ASC LIMIT 500",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;
    let data: Vec<serde_json::Value> = rows.into_iter().map(|r| r.0).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}
