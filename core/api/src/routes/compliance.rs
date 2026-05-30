use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

use banzami_compliance::{ComplianceEngine, ComplianceError};
use banzami_merchants::{MerchantEngine, MerchantError};
use banzami_types::MerchantId;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

fn compliance_err(e: ComplianceError) -> ApiError {
    match e {
        ComplianceError::NotFound => ApiError::not_found("compliance record not found"),
        other => ApiError::internal(other.to_string()),
    }
}

fn merchant_err(e: MerchantError) -> ApiError {
    match e {
        MerchantError::NotFound(_) => ApiError::not_found("merchant not found"),
        other => ApiError::internal(other.to_string()),
    }
}

pub async fn get_merchant(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;
    let record = state
        .compliance
        .get_or_create_merchant(merchant_id)
        .await
        .map_err(compliance_err)?;
    Ok(Json(serde_json::to_value(&record).unwrap()))
}

pub async fn approve_merchant(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;
    let record = state
        .compliance
        .approve_merchant(merchant_id)
        .await
        .map_err(compliance_err)?;
    Ok(Json(serde_json::to_value(&record).unwrap()))
}

#[derive(Deserialize)]
pub struct NotesBody {
    pub notes: String,
}

pub async fn reject_merchant(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<NotesBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;
    let record = state
        .compliance
        .reject_merchant(merchant_id, body.notes)
        .await
        .map_err(compliance_err)?;
    Ok(Json(serde_json::to_value(&record).unwrap()))
}

pub async fn suspend_merchant(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<NotesBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;
    let record = state
        .compliance
        .suspend_merchant(merchant_id, body.notes)
        .await
        .map_err(compliance_err)?;
    state
        .merchant
        .suspend(merchant_id)
        .await
        .map_err(merchant_err)?;
    Ok(Json(serde_json::to_value(&record).unwrap()))
}

pub async fn flag_aml(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<NotesBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;
    let record = state
        .compliance
        .flag_merchant_for_aml_review(merchant_id, body.notes)
        .await
        .map_err(compliance_err)?;
    Ok(Json(serde_json::to_value(&record).unwrap()))
}
