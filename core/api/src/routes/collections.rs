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
    Collection, CollectionEngine, CollectionError, CollectionRule, CollectionShare,
    CollectionStatus, CreateCollectionRequest, CreateShareRequest, Surface,
};
use banzami_payment_links::{CreatePaymentLinkRequest, PaymentLinkEngine};
use banzami_qr::{CreateDynamicQrRequest, QrEngine, QrOwnerType};
use banzami_types::{CollectionId, CollectionShareId, Currency, MerchantId, TransferId, WalletId};

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

async fn emit(
    state: &AppState,
    merchant: MerchantId,
    ty: &str,
    key: String,
    data: serde_json::Value,
) {
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

    let (collection, shares) = state
        .collections
        .create_collection(req)
        .await
        .map_err(map_err)?;

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
#[allow(dead_code)] // pre-existing: constructed/consumed only on paths not yet enabled; kept for wire and audit completeness
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
    Ok(Json(
        serde_json::json!({ "data": items, "next_cursor": next_cursor }),
    ))
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
    let collected = state
        .collections
        .collected_amount(cid)
        .await
        .map_err(map_err)?;
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
    Ok(Json(
        serde_json::json!({ "data": items, "next_cursor": next_cursor }),
    ))
}

// ---------------------------------------------------------------------------
// Surface a share (create its PaymentIntent — ADR-037)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[allow(dead_code)] // pre-existing: constructed/consumed only on paths not yet enabled; kept for wire and audit completeness
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

    // SurfaceResolver (Increment 2): create the REAL surface artifact (QR/LINK)
    // for this share using the existing engines; REQUEST is recognised but not yet
    // implemented. The surface tables never learn about the PaymentIntent — the
    // only link is intent.surface_ref -> artifact id (resolved back at settlement).
    let share0 = state
        .collections
        .get_share(sid, merchant_id, &body.environment)
        .await
        .map_err(map_err)?;
    let collection = state
        .collections
        .get_collection(share0.collection_id, merchant_id, &body.environment)
        .await
        .map_err(map_err)?;
    let surface_ref = create_surface(&state, body.surface, &collection, &share0).await?;

    let (intent, share) = state
        .collections
        .surface_share(
            sid,
            merchant_id,
            &body.environment,
            body.surface,
            Some(surface_ref),
        )
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

// ---------------------------------------------------------------------------
// SurfaceResolver — create the concrete payment surface for a share's intent.
// One place decides per-surface; the rest of Collections is surface-agnostic.
// ---------------------------------------------------------------------------

async fn create_surface(
    state: &AppState,
    surface: Surface,
    collection: &Collection,
    share: &CollectionShare,
) -> Result<String, ApiError> {
    match surface {
        Surface::Qr => {
            let currency = Currency::from_code(&share.currency)
                .ok_or_else(|| ApiError::bad_request("unsupported currency"))?;
            let expires_at = share
                .expires_at
                .unwrap_or_else(|| Utc::now() + chrono::Duration::days(7));
            let qr = state
                .qr
                .create_dynamic(CreateDynamicQrRequest {
                    owner_id: collection.merchant_id.as_uuid(),
                    owner_type: QrOwnerType::Merchant,
                    currency,
                    amount_minor: share.amount_minor,
                    expires_at,
                    reference: Some(share.id.to_string()),
                    wallet_account_id: None,
                })
                .await
                .map_err(|e| ApiError::internal(e.to_string()))?;
            Ok(qr.id.to_string())
        }
        Surface::Link => {
            let link = state
                .payment_links
                .create(CreatePaymentLinkRequest {
                    merchant_id: collection.merchant_id,
                    wallet_id: collection.wallet_id,
                    wallet_account_id: None,
                    amount_minor: Some(share.amount_minor),
                    currency: share.currency.clone(),
                    description: collection.title.clone(),
                    expires_at: share.expires_at,
                })
                .await
                .map_err(|e| ApiError::internal(e.to_string()))?;
            Ok(link.id.to_string())
        }
        // Recognised by the model but not wired to a real flow yet.
        Surface::Request => Err(ApiError::unprocessable(
            "UNSUPPORTED_SURFACE",
            "REQUEST surface is recognised but not yet implemented",
        )),
    }
}

// ---------------------------------------------------------------------------
// Settlement — called when a real surface payment settles (transfer COMPLETED).
// Idempotent: a replay changes nothing and emits nothing. Best-effort: a plain
// QR/link payment (no backing intent) is a no-op. NEVER marks PAID without a
// real transfer.
// ---------------------------------------------------------------------------

pub async fn settle_and_emit(
    state: &AppState,
    surface: Surface,
    surface_ref: &str,
    transfer_id: TransferId,
    environment: &str,
) {
    let outcome = match state
        .collections
        .settle_from_surface(surface, surface_ref, transfer_id, environment)
        .await
    {
        Ok(Some(o)) => o,
        Ok(None) => return, // not a collection payment
        Err(e) => {
            tracing::warn!(error = %e, surface_ref, "collection settlement failed");
            return; // never fail the underlying payment
        }
    };
    if !outcome.newly_paid {
        return; // idempotent replay — no second PAID, no second event
    }
    let Some(share) = outcome.share.as_ref() else {
        return;
    };
    let merchant = share.merchant_id;
    emit(
        state,
        merchant,
        "payment_intent.paid",
        format!("payment_intent.paid:{}", outcome.intent_id),
        serde_json::json!({
            "payment_intent_id": outcome.intent_id.to_string(),
            "transfer_id": transfer_id.to_string(),
            "amount_minor": share.amount_minor,
        }),
    )
    .await;
    emit(
        state,
        merchant,
        "collection.share.paid",
        format!("collection.share.paid:{}", share.id),
        serde_json::json!({
            "collection_id": share.collection_id.to_string(),
            "share_id": share.id.to_string(),
            "payment_intent_id": outcome.intent_id.to_string(),
            "transfer_id": transfer_id.to_string(),
            "amount_minor": share.amount_minor,
        }),
    )
    .await;
    match outcome.transition {
        Some(CollectionStatus::Completed) => {
            emit(
                state,
                merchant,
                "collection.completed",
                format!("collection.completed:{}", share.collection_id),
                serde_json::json!({ "collection_id": share.collection_id.to_string() }),
            )
            .await
        }
        Some(CollectionStatus::PartiallyCompleted) => {
            emit(
                state,
                merchant,
                "collection.partially_completed",
                format!("collection.partially_completed:{}", share.collection_id),
                serde_json::json!({ "collection_id": share.collection_id.to_string() }),
            )
            .await
        }
        _ => {}
    }
}

#[derive(Deserialize)]
pub struct SettleSurfaceBody {
    pub surface: Surface,
    pub surface_ref: String,
    pub transfer_id: String,
    pub environment: String,
}

/// Internal settlement entry point — used by surfaces that settle outside the
/// core (e.g. merchant payment-link payment orchestrated by public-api). The QR
/// path calls `settle_and_emit` directly. Idempotent.
pub async fn settle_surface(
    State(state): State<AppState>,
    Json(body): Json<SettleSurfaceBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let tid = body
        .transfer_id
        .parse::<TransferId>()
        .map_err(|_| ApiError::bad_request("invalid transfer_id"))?;
    // The core deployment serves exactly one environment; the intent was created
    // with that same environment. Use it (the body field is informational).
    let _ = body.environment;
    let env = state.environment.as_str().to_string();
    settle_and_emit(&state, body.surface, &body.surface_ref, tid, &env).await;
    Ok(Json(serde_json::json!({ "ok": true })))
}
