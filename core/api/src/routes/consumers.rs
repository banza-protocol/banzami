use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_identity::{CreateConsumerRequest, IdentityEngine, IdentityError};

use crate::{error::{ApiError, ApiResult}, state::AppState};

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateConsumerBody {
    pub handle:       String,
    pub display_name: Option<String>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

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
) -> ApiResult<Json<serde_json::Value>> {
    let consumer_id = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer id"))?;

    let identity = state
        .identity
        .suspend(consumer_id)
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
