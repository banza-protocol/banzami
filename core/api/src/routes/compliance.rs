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
    super::risk::audit(
        &state.pool,
        "ADMIN",
        "KYC_STATUS_CHANGED",
        &format!("merchant:{merchant_id}"),
        serde_json::json!({ "kind": "KYB", "decision": "APPROVED" }),
        None,
    )
    .await;
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
    super::risk::audit(
        &state.pool,
        "ADMIN",
        "KYC_STATUS_CHANGED",
        &format!("merchant:{merchant_id}"),
        serde_json::json!({ "kind": "KYB", "decision": "REJECTED" }),
        None,
    )
    .await;
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
    super::risk::audit(
        &state.pool,
        "ADMIN",
        "MERCHANT_SUSPENDED",
        &format!("merchant:{merchant_id}"),
        serde_json::json!({ "kind": "COMPLIANCE_SUSPEND" }),
        None,
    )
    .await;
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
    super::risk::audit(
        &state.pool,
        "ADMIN",
        "KYC_STATUS_CHANGED",
        &format!("merchant:{merchant_id}"),
        serde_json::json!({ "kind": "AML", "status": "UNDER_REVIEW" }),
        None,
    )
    .await;
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
        None => IdDocumentType::BilheteDeIdentidade,
        Some(s) => IdDocumentType::try_from_str(s)
            .ok_or_else(|| ApiError::bad_request(format!("unknown document_type: {s}")))?,
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

    super::risk::audit(
        &state.pool,
        "CONSUMER",
        "KYC_STATUS_CHANGED",
        &format!("consumer:{customer_id}"),
        serde_json::json!({
            "kind": "KYC",
            "document_type": document_type.as_str(),
            "status": record.status.as_str(),
        }),
        None,
    )
    .await;

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

    // Daily-volume aggregation: for outbound operations, if the caller did not
    // supply today's volume, derive it from the ledger (sum of today's debits
    // across the consumer's available accounts) so the daily-limit gate is real.
    let daily_volume_minor = if body.daily_volume_minor > 0 || operation.is_inbound() {
        body.daily_volume_minor
    } else {
        sqlx::query_scalar::<_, i64>(
            "SELECT COALESCE(SUM(le.amount_minor), 0)::BIGINT
             FROM ledger_entries le
             JOIN consumer_wallets w ON w.available_account_id = le.account_id
             WHERE w.consumer_id = $1
               AND le.entry_type = 'DEBIT'
               AND le.created_at >= date_trunc('day', now())",
        )
        .bind(customer_id.as_uuid())
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0)
    };

    let auth = state
        .compliance
        .authorize_operation(
            customer_id,
            operation,
            body.amount_minor,
            daily_volume_minor,
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
