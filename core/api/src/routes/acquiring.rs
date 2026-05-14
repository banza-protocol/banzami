use axum::{
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use banzami_acquiring::{AcquiringEngine, AcquiringError, AcquiringPayment};
use banzami_types::PaymentLinkId;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct PaymentInstructionsResponse {
    pub method:    String,
    pub entity:    String,
    pub reference: String,
}

#[derive(Serialize)]
pub struct AcquiringPaymentResponse {
    pub id:              String,
    pub payment_link_id: String,
    pub provider:        String,
    pub external_ref:    String,
    pub status:          String,
    pub amount_minor:    i64,
    pub currency:        String,
    pub instructions:    PaymentInstructionsResponse,
    pub confirmed_at:    Option<DateTime<Utc>>,
    pub failed_at:       Option<DateTime<Utc>>,
    pub failure_reason:  Option<String>,
    pub expires_at:      DateTime<Utc>,
    pub created_at:      DateTime<Utc>,
}

impl From<AcquiringPayment> for AcquiringPaymentResponse {
    fn from(p: AcquiringPayment) -> Self {
        Self {
            id:              p.id.to_string(),
            payment_link_id: p.payment_link_id.to_string(),
            provider:        p.provider,
            external_ref:    p.external_ref,
            status:          p.status.as_str().to_string(),
            amount_minor:    p.amount.amount_minor(),
            currency:        p.amount.currency.code().to_string(),
            instructions:    PaymentInstructionsResponse {
                method:    p.instructions.method,
                entity:    p.instructions.entity,
                reference: p.instructions.reference,
            },
            confirmed_at:  p.confirmed_at,
            failed_at:     p.failed_at,
            failure_reason: p.failure_reason,
            expires_at:    p.expires_at,
            created_at:    p.created_at,
        }
    }
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

fn map_err(e: AcquiringError) -> ApiError {
    match e {
        AcquiringError::NotFound(_) | AcquiringError::ExternalRefNotFound(_) =>
            ApiError::not_found(e.to_string()),
        AcquiringError::Provider(p) =>
            ApiError::unprocessable("PROVIDER_ERROR", p.to_string()),
        AcquiringError::Database(db) =>
            ApiError::internal(db.to_string()),
        AcquiringError::UnknownStatus(s) =>
            ApiError::internal(format!("unknown acquiring status: {s}")),
        AcquiringError::Internal(msg) =>
            ApiError::internal(msg),
    }
}

// ---------------------------------------------------------------------------
// POST /internal/v1/acquiring/payments
// Initiates a new Multicaixa Express payment for a payment link.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct InitiateBody {
    pub payment_link_id: String,
    pub amount_minor:    i64,
    pub currency:        String,
}

pub async fn initiate_payment(
    State(state): State<AppState>,
    Json(body):   Json<InitiateBody>,
) -> ApiResult<(StatusCode, Json<AcquiringPaymentResponse>)> {
    let payment_link_id = body.payment_link_id
        .parse::<PaymentLinkId>()
        .map_err(|_| ApiError::bad_request("invalid payment_link_id"))?;

    let currency = banzami_types::Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unknown currency: {}", body.currency)))?;

    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
    }

    let amount = banzami_types::Money::new(body.amount_minor, currency);

    let payment = state.acquiring
        .initiate_payment(payment_link_id, amount)
        .await
        .map_err(map_err)?;

    Ok((StatusCode::CREATED, Json(payment.into())))
}

// ---------------------------------------------------------------------------
// POST /internal/v1/acquiring/callbacks/emis
// Receives and processes a raw EMIS / simulated provider callback.
// The raw body and X-Banzami-Signature header are forwarded verbatim.
// ---------------------------------------------------------------------------

pub async fn emis_callback(
    State(state): State<AppState>,
    headers:      HeaderMap,
    body:         Bytes,
) -> ApiResult<Json<AcquiringPaymentResponse>> {
    let signature = headers
        .get("X-Banzami-Signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let payment = state.acquiring
        .process_callback(&body, signature)
        .await
        .map_err(|e| match e {
            AcquiringError::Provider(ref p) if p.to_string().contains("invalid callback") =>
                ApiError::unprocessable("INVALID_SIGNATURE", p.to_string()),
            other => map_err(other),
        })?;

    Ok(Json(payment.into()))
}

// ---------------------------------------------------------------------------
// POST /internal/v1/acquiring/test/confirm
// Development helper: generates a signed callback for a simulated payment
// and runs it through the full callback processing pipeline.
// Returns 404 in production (provider returns None for generate_test_callback).
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct TestConfirmQuery {
    pub external_ref: String,
    pub currency:     Option<String>,
}

pub async fn test_confirm(
    State(state): State<AppState>,
    Query(q):     Query<TestConfirmQuery>,
) -> ApiResult<Json<AcquiringPaymentResponse>> {
    let currency = q.currency.as_deref().unwrap_or("AOA");

    // Fetch the existing payment to get the correct amount for the callback payload.
    let existing = state.acquiring
        .get_payment_by_external_ref(&q.external_ref)
        .await
        .map_err(map_err)?;

    let amount_minor = existing.amount.amount_minor();

    let (body, signature) = state.acquiring
        .generate_test_callback(&q.external_ref, amount_minor, currency)
        .ok_or_else(|| ApiError::not_found(
            "test confirm is only available with ACQUIRING_PROVIDER=SIMULATED",
        ))?;

    let payment = state.acquiring
        .process_callback(&body, &signature)
        .await
        .map_err(map_err)?;

    Ok(Json(payment.into()))
}
