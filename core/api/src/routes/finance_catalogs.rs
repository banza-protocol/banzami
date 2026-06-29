//! Internal pricing-catalog admin API (Banzami ADR-021): pricing profiles +
//! fee policies. OPERATOR-ONLY. Reference catalogs only — they carry NO
//! percentages (fee values live only in `pricing_rules`).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_pricing::{CatalogFilter, CatalogInput, CatalogKind, PricingError};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

fn map_err(e: PricingError) -> ApiError {
    match e {
        PricingError::Config(m) if m.contains("not found") => ApiError::not_found(m),
        PricingError::Config(m) if m.contains("already exists") => ApiError::conflict("CONFLICT", m),
        PricingError::Config(m) => ApiError::bad_request(m),
        other => ApiError::internal(other.to_string()),
    }
}

fn parse_id(id: &str) -> Result<uuid::Uuid, ApiError> {
    uuid::Uuid::parse_str(id).map_err(|_| ApiError::bad_request("invalid id"))
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub environment: Option<String>,
    pub status: Option<String>,
    pub code: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct CatalogBody {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub environment: String,
    pub metadata: Option<serde_json::Value>,
}

impl CatalogBody {
    fn into_input(self) -> CatalogInput {
        CatalogInput {
            code: self.code,
            name: self.name,
            description: self.description,
            environment: self.environment,
            metadata: self.metadata,
        }
    }
}

async fn list(state: &AppState, kind: CatalogKind, q: ListQuery) -> ApiResult<Json<serde_json::Value>> {
    let enabled = match q.status.as_deref() {
        Some("enabled") => Some(true),
        Some("disabled") => Some(false),
        _ => None,
    };
    let filter = CatalogFilter {
        environment: q.environment,
        enabled,
        code: q.code,
        limit: q.limit.unwrap_or(200),
    };
    let items = state.catalog.list(kind, &filter).await.map_err(map_err)?;
    Ok(Json(serde_json::json!({ "data": items })))
}

async fn get(state: &AppState, kind: CatalogKind, id: &str) -> ApiResult<Json<serde_json::Value>> {
    let r = state.catalog.get(kind, parse_id(id)?).await.map_err(map_err)?;
    Ok(Json(serde_json::to_value(&r).unwrap()))
}

async fn create(state: &AppState, kind: CatalogKind, body: CatalogBody) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let r = state.catalog.create(kind, body.into_input()).await.map_err(map_err)?;
    Ok((StatusCode::CREATED, Json(serde_json::to_value(&r).unwrap())))
}

async fn update(state: &AppState, kind: CatalogKind, id: &str, body: CatalogBody) -> ApiResult<Json<serde_json::Value>> {
    let r = state.catalog.update(kind, parse_id(id)?, body.into_input()).await.map_err(map_err)?;
    Ok(Json(serde_json::to_value(&r).unwrap()))
}

async fn set_enabled(state: &AppState, kind: CatalogKind, id: &str, enabled: bool) -> ApiResult<Json<serde_json::Value>> {
    let r = state.catalog.set_enabled(kind, parse_id(id)?, enabled).await.map_err(map_err)?;
    Ok(Json(serde_json::to_value(&r).unwrap()))
}

// --- Pricing profiles -------------------------------------------------------

pub async fn profiles_list(State(s): State<AppState>, Query(q): Query<ListQuery>) -> ApiResult<Json<serde_json::Value>> {
    list(&s, CatalogKind::PricingProfiles, q).await
}
pub async fn profiles_get(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<serde_json::Value>> {
    get(&s, CatalogKind::PricingProfiles, &id).await
}
pub async fn profiles_create(State(s): State<AppState>, Json(b): Json<CatalogBody>) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    create(&s, CatalogKind::PricingProfiles, b).await
}
pub async fn profiles_update(State(s): State<AppState>, Path(id): Path<String>, Json(b): Json<CatalogBody>) -> ApiResult<Json<serde_json::Value>> {
    update(&s, CatalogKind::PricingProfiles, &id, b).await
}
pub async fn profiles_disable(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<serde_json::Value>> {
    set_enabled(&s, CatalogKind::PricingProfiles, &id, false).await
}
pub async fn profiles_enable(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<serde_json::Value>> {
    set_enabled(&s, CatalogKind::PricingProfiles, &id, true).await
}

// --- Fee policies -----------------------------------------------------------

pub async fn policies_list(State(s): State<AppState>, Query(q): Query<ListQuery>) -> ApiResult<Json<serde_json::Value>> {
    list(&s, CatalogKind::FeePolicies, q).await
}
pub async fn policies_get(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<serde_json::Value>> {
    get(&s, CatalogKind::FeePolicies, &id).await
}
pub async fn policies_create(State(s): State<AppState>, Json(b): Json<CatalogBody>) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    create(&s, CatalogKind::FeePolicies, b).await
}
pub async fn policies_update(State(s): State<AppState>, Path(id): Path<String>, Json(b): Json<CatalogBody>) -> ApiResult<Json<serde_json::Value>> {
    update(&s, CatalogKind::FeePolicies, &id, b).await
}
pub async fn policies_disable(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<serde_json::Value>> {
    set_enabled(&s, CatalogKind::FeePolicies, &id, false).await
}
pub async fn policies_enable(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<serde_json::Value>> {
    set_enabled(&s, CatalogKind::FeePolicies, &id, true).await
}
