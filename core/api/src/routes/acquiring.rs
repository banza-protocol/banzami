use axum::{
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Timelike, Utc};
use serde::{Deserialize, Serialize};

use banzami_acquiring::{AcquiringEngine, AcquiringError, AcquiringPayment};
use banzami_types::{LedgerEntryId, LedgerPostingId, PaymentLinkId, WalletId};

use crate::{
    error::{ApiError, ApiResult},
    routes::risk,
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
// The raw body and Banza-Signature header are forwarded verbatim.
// ---------------------------------------------------------------------------

pub async fn emis_callback(
    State(state): State<AppState>,
    headers:      HeaderMap,
    body:         Bytes,
) -> ApiResult<Json<AcquiringPaymentResponse>> {
    let signature = headers
        .get("Banza-Signature")
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

    // Wire the confirmed payment → wallet credit.
    // Double-entry: system:transit DR / wallet:available CR
    // Idempotency key is tied to the acquiring payment ID so retried callbacks
    // result in a duplicate-key error on ledger_postings and are safely ignored.
    let idempotency_key = format!("acquiring-settle-{}", payment.id);

    let already_settled: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM ledger_postings WHERE idempotency_key = $1)",
    )
    .bind(&idempotency_key)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(false);

    if !already_settled {
        // Look up wallet_id + merchant_id from the payment link.
        let row: Option<(uuid::Uuid, uuid::Uuid)> = sqlx::query_as(
            "SELECT pl.wallet_id, w.merchant_id
             FROM acquiring_payments ap
             JOIN payment_links pl ON pl.id = ap.payment_link_id
             JOIN wallets w        ON w.id  = pl.wallet_id
             WHERE ap.id = $1",
        )
        .bind(payment.id.as_uuid())
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

        if let Some((wallet_id_raw, merchant_id_raw)) = row {
            let wallet_id: WalletId = wallet_id_raw.to_string().parse()
                .map_err(|_| ApiError::internal("invalid wallet_id from payment link"))?;

            // Refuse to credit a frozen merchant's wallet.
            if risk::is_frozen(&state.pool, "MERCHANT", merchant_id_raw).await {
                risk::flag_suspicious(
                    &state.pool, "MERCHANT", merchant_id_raw,
                    "FROZEN_ACCOUNT_ATTEMPT",
                    "acquiring callback received for a frozen merchant",
                    serde_json::json!({ "payment_id": payment.id.to_string() }),
                ).await;
                tracing::warn!(
                    payment_id   = %payment.id,
                    merchant_id  = %merchant_id_raw,
                    "acquiring: merchant is frozen — skipping settlement credit"
                );
                return Ok(Json(payment.into()));
            }

            let available_account_id: Option<uuid::Uuid> = sqlx::query_scalar(
                "SELECT available_account_id FROM wallets WHERE id = $1 AND status = 'ACTIVE'",
            )
            .bind(wallet_id_raw)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?;

            if let Some(available_account_id) = available_account_id {
                let posting_id = LedgerPostingId::new();
                let now        = Utc::now();
                let currency   = payment.amount.currency.code();

                let _ = sqlx::query(
                    "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (idempotency_key) DO NOTHING",
                )
                .bind(posting_id.as_uuid())
                .bind(format!("Acquiring settlement — {}", payment.id))
                .bind(&idempotency_key)
                .bind(now)
                .execute(&state.pool)
                .await;

                let actual_posting_id: uuid::Uuid = sqlx::query_scalar(
                    "SELECT id FROM ledger_postings WHERE idempotency_key = $1",
                )
                .bind(&idempotency_key)
                .fetch_one(&state.pool)
                .await
                .map_err(|e| ApiError::internal(e.to_string()))?;

                let _ = sqlx::query(
                    "INSERT INTO ledger_entries
                     (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
                     VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6)
                     ON CONFLICT DO NOTHING",
                )
                .bind(LedgerEntryId::new().as_uuid())
                .bind(actual_posting_id)
                .bind(state.transit_account_id.as_uuid())
                .bind(payment.amount.amount_minor())
                .bind(currency)
                .bind(now)
                .execute(&state.pool)
                .await;

                let _ = sqlx::query(
                    "INSERT INTO ledger_entries
                     (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
                     VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6)
                     ON CONFLICT DO NOTHING",
                )
                .bind(LedgerEntryId::new().as_uuid())
                .bind(actual_posting_id)
                .bind(available_account_id)
                .bind(payment.amount.amount_minor())
                .bind(currency)
                .bind(now)
                .execute(&state.pool)
                .await;

                // Velocity counters (fire-and-forget).
                let hour_start = now.date_naive()
                    .and_hms_opt(now.hour(), 0, 0).map(|d| d.and_utc()).unwrap_or(now);
                let day_start  = now.date_naive()
                    .and_hms_opt(0, 0, 0).map(|d| d.and_utc()).unwrap_or(now);
                let amt = payment.amount.amount_minor();
                risk::increment_velocity(&state.pool, "MERCHANT", merchant_id_raw, "HOURLY", hour_start, amt).await;
                risk::increment_velocity(&state.pool, "MERCHANT", merchant_id_raw, "DAILY",  day_start,  amt).await;

                // Audit log (fire-and-forget).
                risk::audit(
                    &state.pool,
                    "SYSTEM",
                    "ACQUIRING_SETTLED",
                    &format!("WALLET:{wallet_id}"),
                    serde_json::json!({
                        "payment_id":   payment.id.to_string(),
                        "merchant_id":  merchant_id_raw.to_string(),
                        "amount_minor": amt,
                        "currency":     currency,
                        "posting_id":   actual_posting_id.to_string(),
                    }),
                    None,
                ).await;

                tracing::info!(
                    payment_id   = %payment.id,
                    wallet_id    = %wallet_id,
                    amount_minor = amt,
                    currency     = currency,
                    "acquiring: wallet credited after callback settlement"
                );
            } else {
                tracing::warn!(
                    payment_id = %payment.id,
                    "acquiring: wallet not active or not found — skipping settlement credit"
                );
            }
        } else {
            tracing::warn!(
                payment_id = %payment.id,
                "acquiring: no wallet_id on payment link — skipping settlement credit"
            );
        }
    }

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
    if state.environment.is_live() {
        tracing::error!("acquiring::test_confirm called in LIVE environment — rejected");
        return Err(ApiError::forbidden(
            "test-confirm is not available in LIVE environment",
        ));
    }

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
