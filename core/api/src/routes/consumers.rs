use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use banzami_identity::{CreateConsumerRequest, IdentityEngine, IdentityError, VerificationBadge};

use crate::{error::{ApiError, ApiResult}, state::AppState};

// ---------------------------------------------------------------------------
// Request / query types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateConsumerBody {
    pub handle:       String,
    pub display_name: Option<String>,
}

#[derive(Deserialize)]
pub struct SuspendConsumerBody {
    pub notes: Option<String>,
}

#[derive(Deserialize)]
pub struct SetBadgeBody {
    /// `"CONSUMER"`, `"MERCHANT"`, or `null` to remove.
    pub badge: Option<String>,
}

#[derive(Deserialize)]
pub struct ListConsumersQuery {
    pub handle: Option<String>,
    pub limit:  Option<i64>,
}

#[derive(Serialize)]
pub struct ConsumerListItem {
    pub id:           String,
    pub handle:       String,
    pub display_name: Option<String>,
    pub status:       String,
    pub created_at:   String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListConsumersQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let limit = q.limit.unwrap_or(100).min(500);

    let rows: Vec<(uuid::Uuid, String, Option<String>, String, chrono::DateTime<chrono::Utc>)> =
        if let Some(handle) = &q.handle {
            sqlx::query_as(
                "SELECT id, handle, display_name, status, created_at
                 FROM consumers
                 WHERE handle ILIKE $1
                 ORDER BY created_at DESC
                 LIMIT $2",
            )
            .bind(format!("%{handle}%"))
            .bind(limit)
            .fetch_all(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?
        } else {
            sqlx::query_as(
                "SELECT id, handle, display_name, status, created_at
                 FROM consumers
                 ORDER BY created_at DESC
                 LIMIT $1",
            )
            .bind(limit)
            .fetch_all(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?
        };

    let items: Vec<ConsumerListItem> = rows
        .into_iter()
        .map(|(id, handle, display_name, status, created_at)| ConsumerListItem {
            id:           id.to_string(),
            handle,
            display_name,
            status,
            created_at:   created_at.to_rfc3339(),
        })
        .collect();

    Ok(Json(serde_json::json!({ "data": items })))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateConsumerBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let identity = state
        .identity
        .create(CreateConsumerRequest {
            handle:       body.handle,
            display_name: body.display_name,
        })
        .await
        .map_err(|e| match e {
            IdentityError::HandleTaken(_)   => ApiError::conflict("handle already taken"),
            IdentityError::InvalidHandle(r) => ApiError::bad_request(r),
            other                           => ApiError::internal(other.to_string()),
        })?;

    Ok((StatusCode::CREATED, Json(serde_json::to_value(&identity).unwrap())))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let consumer_id = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer id"))?;

    let identity = state
        .identity
        .get(consumer_id)
        .await
        .map_err(|e| match e {
            IdentityError::NotFound(_) => ApiError::not_found("consumer not found"),
            other                      => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&identity).unwrap()))
}

pub async fn get_by_handle(
    State(state): State<AppState>,
    Path(handle): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let identity = state
        .identity
        .get_by_handle(&handle)
        .await
        .map_err(|e| match e {
            IdentityError::HandleNotFound(_) => ApiError::not_found("handle not found"),
            other                            => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&identity).unwrap()))
}

pub async fn suspend(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Option<Json<SuspendConsumerBody>>,
) -> ApiResult<Json<serde_json::Value>> {
    let consumer_id = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer id"))?;

    let notes = body.and_then(|b| b.notes.clone());

    let identity = state
        .identity
        .suspend(consumer_id, notes)
        .await
        .map_err(|e| match e {
            IdentityError::NotFound(_) => ApiError::not_found("consumer not found"),
            IdentityError::InvalidStatusTransition { from, to } => ApiError::unprocessable(
                "INVALID_TRANSITION",
                format!("cannot transition {from:?} → {to:?}"),
            ),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&identity).unwrap()))
}

pub async fn close(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let consumer_id = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer id"))?;

    let identity = state
        .identity
        .close(consumer_id)
        .await
        .map_err(|e| match e {
            IdentityError::NotFound(_) => ApiError::not_found("consumer not found"),
            other                      => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&identity).unwrap()))
}

/// PATCH /internal/v1/consumers/:id/badge
///
/// Assigns or removes the admin verification badge.
/// Body: `{"badge": "CONSUMER" | "MERCHANT" | null}`
pub async fn set_badge(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<SetBadgeBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let consumer_id = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer id"))?;

    let badge = match body.badge.as_deref() {
        None             => None,
        Some("CONSUMER") => Some(VerificationBadge::Consumer),
        Some("MERCHANT") => Some(VerificationBadge::Merchant),
        Some(other) => return Err(ApiError::bad_request(
            &format!("unknown badge type '{other}'; expected CONSUMER, MERCHANT, or null"),
        )),
    };

    let identity = state
        .identity
        .set_badge(consumer_id, badge)
        .await
        .map_err(|e| match e {
            IdentityError::NotFound(_) => ApiError::not_found("consumer not found"),
            other                      => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&identity).unwrap()))
}
