//! Internal pricing-rules admin API (Banzami ADR-021).
//!
//! OPERATOR-ONLY surface (network-internal `/internal/v1`; never gateway-exposed).
//! The single write path to `pricing_rules` — the only place fee percentages
//! live. Never deletes; a *used* rule is superseded by a new version, never
//! edited in place (see `banzami_pricing::admin`).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_pricing::{PricingError, PricingRuleFilter, PricingRuleInput};
use banzami_types::PricingRuleId;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

fn map_err(e: PricingError) -> ApiError {
    match e {
        // Config covers validation + not-found + conflict from the admin repo.
        PricingError::Config(msg) if msg.contains("not found") => ApiError::not_found(msg),
        PricingError::Config(msg) if msg.contains("already exists") => {
            ApiError::conflict("CONFLICT", msg)
        }
        PricingError::Config(msg) => ApiError::bad_request(msg),
        other => ApiError::internal(other.to_string()),
    }
}

fn parse_id(id: &str) -> Result<PricingRuleId, ApiError> {
    id.parse()
        .map_err(|_| ApiError::bad_request("invalid pricing rule id"))
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ListQuery {
    pub environment: Option<String>,
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub currency: Option<String>,
    pub rule_key: Option<String>,
    /// "enabled" | "disabled" | absent (all)
    pub status: Option<String>,
    pub limit: Option<i64>,
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let enabled = match q.status.as_deref() {
        Some("enabled") => Some(true),
        Some("disabled") => Some(false),
        _ => None,
    };
    let filter = PricingRuleFilter {
        environment: q.environment,
        business_category: q.business_category,
        pricing_profile: q.pricing_profile,
        currency: q.currency,
        enabled,
        rule_key: q.rule_key,
        limit: q.limit.unwrap_or(200),
    };
    let rules = state.pricing_admin.list(&filter).await.map_err(map_err)?;
    Ok(Json(serde_json::json!({ "data": rules })))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let r = state
        .pricing_admin
        .get(parse_id(&id)?)
        .await
        .map_err(map_err)?;
    Ok(Json(serde_json::to_value(&r).unwrap()))
}

/// Version history for the (environment, rule_key) of a given rule id.
pub async fn versions(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let r = state
        .pricing_admin
        .get(parse_id(&id)?)
        .await
        .map_err(map_err)?;
    let history = state
        .pricing_admin
        .versions(&r.environment, &r.rule_key)
        .await
        .map_err(map_err)?;
    Ok(Json(serde_json::json!({ "data": history })))
}

// ---------------------------------------------------------------------------
// Create / Update
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct RuleBody {
    pub rule_key: String,
    pub environment: String,
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub fee_policy_ref: Option<String>,
    pub currency: Option<String>,
    pub country: Option<String>,
    pub transaction_type: Option<String>,
    pub pricing_operation: String,
    pub rate_bps: i32,
    pub flat_minor: i64,
    pub min_fee_minor: Option<i64>,
    pub max_fee_minor: Option<i64>,
    pub rounding: String,
    pub priority: Option<i32>,
    pub effective_from: Option<chrono::DateTime<chrono::Utc>>,
    pub effective_to: Option<chrono::DateTime<chrono::Utc>>,
    pub description: Option<String>,
}

impl RuleBody {
    fn into_input(self) -> PricingRuleInput {
        PricingRuleInput {
            rule_key: self.rule_key,
            environment: self.environment,
            business_category: self.business_category,
            pricing_profile: self.pricing_profile,
            fee_policy_ref: self.fee_policy_ref,
            currency: self.currency,
            country: self.country,
            transaction_type: self.transaction_type,
            pricing_operation: self.pricing_operation,
            rate_bps: self.rate_bps,
            flat_minor: self.flat_minor,
            min_fee_minor: self.min_fee_minor,
            max_fee_minor: self.max_fee_minor,
            rounding: self.rounding,
            priority: self.priority.unwrap_or(0),
            effective_from: self.effective_from,
            effective_to: self.effective_to,
            description: self.description,
        }
    }
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<RuleBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let r = state
        .pricing_admin
        .create(body.into_input())
        .await
        .map_err(map_err)?;
    Ok((StatusCode::CREATED, Json(serde_json::to_value(&r).unwrap())))
}

/// Edit a rule. A *used* rule is superseded by a new version (the response is the
/// new version); an unused rule is edited in place.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<RuleBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let r = state
        .pricing_admin
        .update(parse_id(&id)?, body.into_input())
        .await
        .map_err(map_err)?;
    Ok(Json(serde_json::to_value(&r).unwrap()))
}

// ---------------------------------------------------------------------------
// Disable / Enable / Duplicate
// ---------------------------------------------------------------------------

pub async fn disable(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let r = state
        .pricing_admin
        .set_enabled(parse_id(&id)?, false)
        .await
        .map_err(map_err)?;
    Ok(Json(serde_json::to_value(&r).unwrap()))
}

pub async fn enable(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let r = state
        .pricing_admin
        .set_enabled(parse_id(&id)?, true)
        .await
        .map_err(map_err)?;
    Ok(Json(serde_json::to_value(&r).unwrap()))
}

#[derive(Deserialize)]
pub struct DuplicateBody {
    pub rule_key: String,
}

pub async fn duplicate(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<DuplicateBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let r = state
        .pricing_admin
        .duplicate(parse_id(&id)?, body.rule_key)
        .await
        .map_err(map_err)?;
    Ok((StatusCode::CREATED, Json(serde_json::to_value(&r).unwrap())))
}
