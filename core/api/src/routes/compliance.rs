use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

use banzami_compliance::{
    ComplianceEngine, ComplianceError, CustomerVerificationRequest, IdDocumentType, KycLevel,
    MerchantVerificationRequest,
};
use banzami_merchants::{MerchantEngine, MerchantError};
use banzami_types::{CustomerId, MerchantId};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

fn compliance_err(e: ComplianceError) -> ApiError {
    match e {
        ComplianceError::NotFound => ApiError::not_found("compliance record not found"),
        ComplianceError::InvalidDocument(m) => ApiError::bad_request(m),
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

// ---------------------------------------------------------------------------
// Identity verification (KYC / KYB) — runs the submitted document through the
// configured provider and persists the decision onto the compliance record.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct VerifyCustomerBody {
    pub full_name: String,
    /// "BILHETE_DE_IDENTIDADE" (default) or "PASSPORT".
    #[serde(default)]
    pub document_type: Option<String>,
    pub document_number: String,
    /// ISO date `YYYY-MM-DD`.
    pub date_of_birth: chrono::NaiveDate,
    /// Requested KYC level: "BASIC" (default), "ENHANCED", or "FULL".
    #[serde(default)]
    pub requested_level: Option<String>,
}

pub async fn verify_customer(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<VerifyCustomerBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let customer_id: CustomerId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid customer id"))?;

    let document_type = match body.document_type.as_deref() {
        Some("PASSPORT") => IdDocumentType::Passport,
        None | Some("BILHETE_DE_IDENTIDADE") => IdDocumentType::BilheteDeIdentidade,
        Some(other) => {
            return Err(ApiError::bad_request(format!(
                "unknown document_type: {other}"
            )))
        }
    };
    let requested_level = match body.requested_level.as_deref() {
        None => KycLevel::Basic,
        Some(s) => KycLevel::try_from_str(s)
            .ok_or_else(|| ApiError::bad_request(format!("unknown requested_level: {s}")))?,
    };

    let record = state
        .compliance
        .verify_customer(
            state.kyc_provider.as_ref(),
            CustomerVerificationRequest {
                customer_id,
                full_name: body.full_name,
                document_type,
                document_number: body.document_number,
                date_of_birth: body.date_of_birth,
                requested_level,
            },
        )
        .await
        .map_err(compliance_err)?;

    Ok(Json(serde_json::to_value(&record).unwrap()))
}

#[derive(Deserialize)]
pub struct VerifyMerchantBody {
    pub legal_name: String,
    pub tax_id: String,
    pub representative_name: String,
}

pub async fn verify_merchant(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<VerifyMerchantBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;

    let record = state
        .compliance
        .verify_merchant(
            state.kyc_provider.as_ref(),
            MerchantVerificationRequest {
                merchant_id,
                legal_name: body.legal_name,
                tax_id: body.tax_id,
                representative_name: body.representative_name,
            },
        )
        .await
        .map_err(compliance_err)?;

    Ok(Json(serde_json::to_value(&record).unwrap()))
}
