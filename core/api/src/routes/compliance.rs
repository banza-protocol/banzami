use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

use banzami_compliance::{
    ComplianceEngine, ComplianceError, CustomerVerificationRequest, IdDocumentType, KycLevel,
    MerchantVerificationRequest, OperationType,
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

/// GET /internal/v1/compliance/customers/:id — Progressive-KYC status: current
/// level, status, the limits it grants, and whether financial ops are unlocked.
pub async fn get_customer_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let customer_id: CustomerId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid customer id"))?;
    let record = state
        .compliance
        .get_or_create_customer(customer_id)
        .await
        .map_err(compliance_err)?;
    let lvl = record.kyc_level;
    Ok(Json(serde_json::json!({
        "customer_id":  id,
        "kyc_level":    lvl.as_str(),
        "api_level":    lvl.as_api_level(),
        "level_number": lvl.level_number(),
        "kyc_status":   record.status.as_str(),
        "limits": {
            "single_transaction_minor": lvl.max_single_transaction_minor(),
            "daily_volume_minor":       lvl.max_daily_volume_minor(),
        },
        // KYC_LEVEL_0 (None) cannot perform outbound financial operations.
        "can_transact": lvl != KycLevel::None,
    })))
}

#[derive(Deserialize)]
pub struct AuthorizeBody {
    /// SEND | RECEIVE | PAY_MERCHANT | CASH_OUT | WITHDRAWAL | PAYOUT | TOP_UP
    pub operation: String,
    pub amount_minor: i64,
    #[serde(default)]
    pub daily_volume_minor: i64,
}

/// POST /internal/v1/compliance/customers/:id/authorize — Progressive-KYC gate
/// for a specific operation. Returns the structured authorization decision.
pub async fn authorize_customer(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<AuthorizeBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let customer_id: CustomerId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid customer id"))?;
    let operation = OperationType::try_from_str(&body.operation)
        .ok_or_else(|| ApiError::bad_request(format!("unknown operation: {}", body.operation)))?;

    let auth = state
        .compliance
        .authorize_operation(
            customer_id,
            operation,
            body.amount_minor,
            body.daily_volume_minor,
        )
        .await
        .map_err(compliance_err)?;

    Ok(Json(serde_json::json!({
        "can_transact":   auth.can_transact,
        "reason":         auth.reason,
        "current_level":  auth.current_level.as_api_level(),
        "required_level": auth.required_level.map(|l| l.as_api_level()),
        "message":        auth.message,
    })))
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
