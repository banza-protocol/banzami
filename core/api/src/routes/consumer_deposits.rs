use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Timelike, Utc};
use serde::{Deserialize, Serialize};

use banzami_acquiring::{AcquiringEngine, AcquiringError};
use banzami_consumer_wallets::ConsumerWalletEngine;
use banzami_types::{ConsumerId, Currency, LedgerEntryId, LedgerPostingId};

use crate::{
    error::{ApiError, ApiResult},
    routes::risk,
    state::AppState,
};

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct DepositInstructionsResponse {
    pub method: String,
    pub entity: String,
    pub reference: String,
}

#[derive(Serialize)]
pub struct ConsumerDepositResponse {
    pub id: String,
    pub consumer_id: String,
    pub wallet_id: String,
    pub provider: String,
    pub external_ref: String,
    pub status: String,
    pub amount_minor: i64,
    pub currency: String,
    pub instructions: DepositInstructionsResponse,
    pub confirmed_at: Option<DateTime<Utc>>,
    pub failed_at: Option<DateTime<Utc>>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// POST /internal/v1/consumer-deposits
// Initiate a consumer wallet top-up via the acquiring provider.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct InitiateDepositBody {
    pub consumer_id: String,
    pub amount_minor: i64,
    pub currency: Option<String>,
}

pub async fn initiate(
    State(state): State<AppState>,
    Json(body): Json<InitiateDepositBody>,
) -> ApiResult<(StatusCode, Json<ConsumerDepositResponse>)> {
    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
    }

    let consumer_id: ConsumerId = body
        .consumer_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer_id"))?;

    let currency_code = body.currency.as_deref().unwrap_or("AOA");
    let currency = Currency::from_code(currency_code)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {currency_code}")))?;

    let amount = banzami_types::Money::new(body.amount_minor, currency);

    // KYC enforcement — apply deposit limits based on the consumer's KYC level.
    // customer_compliance.customer_id is the same UUID as consumers.id.
    {
        let kyc_level: String = sqlx::query_scalar(
            "SELECT COALESCE(kyc_level, 'NONE')
             FROM customer_compliance
             WHERE customer_id = $1",
        )
        .bind(consumer_id.as_uuid())
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        .unwrap_or_else(|| "NONE".to_string());

        // Per-transaction limits (minor units). 1 Kz = 100 minor.
        let (max_single, max_daily): (i64, i64) = match kyc_level.as_str() {
            "FULL" => (50_000_000_000, i64::MAX), // 5 000 000 Kz, unlimited daily
            "ENHANCED" => (20_000_000_000, 100_000_000_000), // 2 000 000 / 10 000 000 Kz
            "BASIC" => (3_000_000_000, 10_000_000_000), // 300 000 / 1 000 000 Kz
            _ => (500_000_000, 1_000_000_000),    // 50 000 / 100 000 Kz (NONE)
        };

        if body.amount_minor > max_single {
            return Err(ApiError::unprocessable(
                "KYC_LIMIT_EXCEEDED",
                format!("deposit exceeds single-transaction limit for KYC level {kyc_level}"),
            ));
        }

        // Daily limit: sum velocity counters for today.
        let (_h_count, _h_amt, _d_count, d_amt) =
            risk::get_velocity(&state.pool, "CONSUMER", consumer_id.as_uuid()).await;
        if max_daily != i64::MAX && d_amt.saturating_add(body.amount_minor) > max_daily {
            risk::flag_suspicious(
                &state.pool,
                "CONSUMER",
                consumer_id.as_uuid(),
                "KYC_LIMIT_EXCEEDED",
                &format!("daily deposit limit exceeded for KYC level {kyc_level}"),
                serde_json::json!({
                    "daily_so_far": d_amt,
                    "requested": body.amount_minor,
                    "limit": max_daily,
                    "kyc_level": kyc_level,
                }),
            )
            .await;
            return Err(ApiError::unprocessable(
                "KYC_DAILY_LIMIT_EXCEEDED",
                format!("daily deposit limit reached for KYC level {kyc_level}"),
            ));
        }
    }

    // Refuse if the consumer account is frozen.
    if risk::is_frozen(&state.pool, "CONSUMER", consumer_id.as_uuid())
        .await
        .map_err(|e| ApiError::internal(format!("freeze check failed: {e}")))?
    {
        risk::flag_suspicious(
            &state.pool,
            "CONSUMER",
            consumer_id.as_uuid(),
            "FROZEN_ACCOUNT_ATTEMPT",
            "deposit initiated for a frozen consumer",
            serde_json::json!({ "amount_minor": body.amount_minor }),
        )
        .await;
        return Err(ApiError::unprocessable(
            "ACCOUNT_FROZEN",
            "consumer account is suspended",
        ));
    }

    // Look up (or create) the consumer's wallet.
    let wallet = state
        .consumer_wallet
        .get_or_create(consumer_id, currency)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let deposit_id = uuid::Uuid::new_v4();

    // Call the provider to get a reference and payment instructions.
    let ext = state
        .acquiring
        .initiate_raw(&deposit_id.to_string(), amount)
        .await
        .map_err(|e| match e {
            AcquiringError::Provider(p) => ApiError::unprocessable("PROVIDER_ERROR", p.to_string()),
            other => ApiError::internal(other.to_string()),
        })?;

    let now = Utc::now();
    let instructions_json = serde_json::json!({
        "method":    ext.instructions.method,
        "entity":    ext.instructions.entity,
        "reference": ext.instructions.reference,
    });

    sqlx::query(
        "INSERT INTO consumer_deposits
         (id, consumer_id, wallet_id, provider, external_ref, idempotency_key,
          status, amount_minor, currency, instructions, expires_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8,$9,$10,$11)",
    )
    .bind(deposit_id)
    .bind(consumer_id.as_uuid())
    .bind(wallet.id.as_uuid())
    .bind(state.acquiring.provider_name())
    .bind(&ext.external_ref)
    .bind(format!("deposit-init-{deposit_id}"))
    .bind(body.amount_minor)
    .bind(currency_code)
    .bind(&instructions_json)
    .bind(ext.expires_at)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    tracing::info!(
        deposit_id   = %deposit_id,
        consumer_id  = %consumer_id,
        amount_minor = body.amount_minor,
        external_ref = %ext.external_ref,
        "consumer deposit initiated"
    );

    Ok((
        StatusCode::CREATED,
        Json(ConsumerDepositResponse {
            id: deposit_id.to_string(),
            consumer_id: consumer_id.to_string(),
            wallet_id: wallet.id.to_string(),
            provider: state.acquiring.provider_name().to_string(),
            external_ref: ext.external_ref,
            status: "PENDING".to_string(),
            amount_minor: body.amount_minor,
            currency: currency_code.to_string(),
            instructions: DepositInstructionsResponse {
                method: ext.instructions.method,
                entity: ext.instructions.entity,
                reference: ext.instructions.reference,
            },
            confirmed_at: None,
            failed_at: None,
            expires_at: ext.expires_at,
            created_at: now,
        }),
    ))
}

// ---------------------------------------------------------------------------
// GET /internal/v1/consumer-deposits/:id
// ---------------------------------------------------------------------------

#[allow(clippy::type_complexity)]
pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<ConsumerDepositResponse>> {
    let deposit_id: uuid::Uuid = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid deposit id"))?;

    let row: Option<(
        uuid::Uuid,
        uuid::Uuid,
        uuid::Uuid,
        String,
        String,
        String,
        i64,
        String,
        serde_json::Value,
        Option<DateTime<Utc>>,
        Option<DateTime<Utc>>,
        DateTime<Utc>,
        DateTime<Utc>,
    )> = sqlx::query_as(
        "SELECT id, consumer_id, wallet_id, provider, external_ref, status,
                    amount_minor, currency, instructions,
                    confirmed_at, failed_at, expires_at, created_at
             FROM consumer_deposits WHERE id = $1",
    )
    .bind(deposit_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let (
        id,
        consumer_id,
        wallet_id,
        provider,
        external_ref,
        status,
        amount_minor,
        currency,
        instructions,
        confirmed_at,
        failed_at,
        expires_at,
        created_at,
    ) = row.ok_or_else(|| ApiError::not_found("deposit not found"))?;

    Ok(Json(ConsumerDepositResponse {
        id: id.to_string(),
        consumer_id: consumer_id.to_string(),
        wallet_id: wallet_id.to_string(),
        provider,
        external_ref,
        status,
        amount_minor,
        currency,
        instructions: DepositInstructionsResponse {
            method: instructions["method"].as_str().unwrap_or("").to_string(),
            entity: instructions["entity"].as_str().unwrap_or("").to_string(),
            reference: instructions["reference"].as_str().unwrap_or("").to_string(),
        },
        confirmed_at,
        failed_at,
        expires_at,
        created_at,
    }))
}

// ---------------------------------------------------------------------------
// POST /internal/v1/consumer-deposits/callback
// HMAC-validated callback that credits the consumer wallet.
// ---------------------------------------------------------------------------

pub async fn callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<ConsumerDepositResponse>> {
    let signature = headers
        .get("Banza-Signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let confirmation = state
        .acquiring
        .validate_callback_raw(&body, signature)
        .await
        .map_err(|e| ApiError::unprocessable("INVALID_CALLBACK", e.to_string()))?;

    // Find the deposit by external_ref.
    type DepositRow = (
        uuid::Uuid,
        uuid::Uuid,
        uuid::Uuid,
        String,
        String,
        String,
        i64,
        String,
        serde_json::Value,
        DateTime<Utc>,
        DateTime<Utc>,
    );
    let deposit: Option<DepositRow> = sqlx::query_as(
        "SELECT id, consumer_id, wallet_id, provider, external_ref, status,
                amount_minor, currency, instructions, expires_at, created_at
         FROM consumer_deposits WHERE external_ref = $1",
    )
    .bind(&confirmation.external_ref)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let (
        dep_id,
        dep_consumer_id,
        dep_wallet_id,
        dep_provider,
        dep_external_ref,
        dep_status,
        dep_amount_minor,
        dep_currency,
        dep_instructions,
        dep_expires_at,
        dep_created_at,
    ) = deposit.ok_or_else(|| ApiError::not_found("no pending deposit for this reference"))?;

    if dep_status != "PENDING" {
        return Ok(Json(ConsumerDepositResponse {
            id: dep_id.to_string(),
            consumer_id: dep_consumer_id.to_string(),
            wallet_id: dep_wallet_id.to_string(),
            provider: dep_provider,
            external_ref: dep_external_ref,
            status: dep_status,
            amount_minor: dep_amount_minor,
            currency: dep_currency,
            instructions: DepositInstructionsResponse {
                method: dep_instructions["method"]
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                entity: dep_instructions["entity"]
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                reference: dep_instructions["reference"]
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
            },
            confirmed_at: None,
            failed_at: None,
            expires_at: dep_expires_at,
            created_at: dep_created_at,
        }));
    }

    let idempotency_key = format!("deposit-settle-{dep_id}");
    let already_settled: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM ledger_postings WHERE idempotency_key = $1)",
    )
    .bind(&idempotency_key)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(false);

    let now = Utc::now();

    if !already_settled {
        let available_account_id: Option<uuid::Uuid> = sqlx::query_scalar(
            "SELECT available_account_id FROM consumer_wallets WHERE id = $1 AND status = 'ACTIVE'",
        )
        .bind(dep_wallet_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

        if let Some(available_account_id) = available_account_id {
            // V1.0 pilot-limit overlay (internal Sandbox / Phase 0; disabled by
            // default, never active on live/production): enforce the consumer
            // balance cap and the aggregate funds-in-circulation cap BEFORE the
            // credit posts. A rejection leaves balances and the ledger unchanged.
            {
                let policy = banzami_compliance::pilot::PilotLimitPolicy::from_env();
                if let Some(v) = banzami_compliance::pilot_enforce::check_funding(
                    &state.pool,
                    banzami_compliance::pilot_enforce::Party::Consumer,
                    available_account_id,
                    dep_amount_minor,
                    policy,
                )
                .await
                .map_err(|e| ApiError::internal(e.to_string()))?
                {
                    return Err(ApiError::unprocessable(v.as_str(), v.message()));
                }
            }

            let posting_id = LedgerPostingId::new();

            let _ = sqlx::query(
                "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (idempotency_key) DO NOTHING",
            )
            .bind(posting_id.as_uuid())
            .bind(format!("Consumer deposit — {dep_id}"))
            .bind(&idempotency_key)
            .bind(now)
            .execute(&state.pool)
            .await;

            let actual_posting_id: uuid::Uuid =
                sqlx::query_scalar("SELECT id FROM ledger_postings WHERE idempotency_key = $1")
                    .bind(&idempotency_key)
                    .fetch_one(&state.pool)
                    .await
                    .map_err(|e| ApiError::internal(e.to_string()))?;

            // DR system:transit — acquiring paid us
            let _ = sqlx::query(
                "INSERT INTO ledger_entries
                 (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
                 VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6)
                 ON CONFLICT DO NOTHING",
            )
            .bind(LedgerEntryId::new().as_uuid())
            .bind(actual_posting_id)
            .bind(state.transit_account_id.as_uuid())
            .bind(dep_amount_minor)
            .bind(&dep_currency)
            .bind(now)
            .execute(&state.pool)
            .await;

            // CR consumer wallet:available — consumer can now spend
            let _ = sqlx::query(
                "INSERT INTO ledger_entries
                 (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
                 VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6)
                 ON CONFLICT DO NOTHING",
            )
            .bind(LedgerEntryId::new().as_uuid())
            .bind(actual_posting_id)
            .bind(available_account_id)
            .bind(dep_amount_minor)
            .bind(&dep_currency)
            .bind(now)
            .execute(&state.pool)
            .await;

            // Velocity counters (fire-and-forget).
            let hour_start = now
                .date_naive()
                .and_hms_opt(now.hour(), 0, 0)
                .map(|d| d.and_utc())
                .unwrap_or(now);
            let day_start = now
                .date_naive()
                .and_hms_opt(0, 0, 0)
                .map(|d| d.and_utc())
                .unwrap_or(now);
            risk::increment_velocity(
                &state.pool,
                "CONSUMER",
                dep_consumer_id,
                "HOURLY",
                hour_start,
                dep_amount_minor,
            )
            .await;
            risk::increment_velocity(
                &state.pool,
                "CONSUMER",
                dep_consumer_id,
                "DAILY",
                day_start,
                dep_amount_minor,
            )
            .await;

            // Audit log (fire-and-forget).
            risk::audit(
                &state.pool,
                "SYSTEM",
                "DEPOSIT_SETTLED",
                &format!("CONSUMER:{dep_consumer_id}"),
                serde_json::json!({
                    "deposit_id":   dep_id.to_string(),
                    "wallet_id":    dep_wallet_id.to_string(),
                    "amount_minor": dep_amount_minor,
                    "currency":     dep_currency,
                    "posting_id":   actual_posting_id.to_string(),
                }),
                None,
            )
            .await;

            tracing::info!(
                deposit_id   = %dep_id,
                consumer_id  = %dep_consumer_id,
                amount_minor = dep_amount_minor,
                "consumer deposit settled — wallet credited"
            );
        }
    }

    sqlx::query(
        "UPDATE consumer_deposits SET status='COMPLETED', confirmed_at=$1 WHERE id=$2 AND status='PENDING'",
    )
    .bind(confirmation.confirmed_at)
    .bind(dep_id)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(ConsumerDepositResponse {
        id: dep_id.to_string(),
        consumer_id: dep_consumer_id.to_string(),
        wallet_id: dep_wallet_id.to_string(),
        provider: dep_provider,
        external_ref: dep_external_ref,
        status: "COMPLETED".to_string(),
        amount_minor: dep_amount_minor,
        currency: dep_currency.clone(),
        instructions: DepositInstructionsResponse {
            method: dep_instructions["method"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            entity: dep_instructions["entity"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            reference: dep_instructions["reference"]
                .as_str()
                .unwrap_or("")
                .to_string(),
        },
        confirmed_at: Some(confirmation.confirmed_at),
        failed_at: None,
        expires_at: dep_expires_at,
        created_at: dep_created_at,
    }))
}

// ---------------------------------------------------------------------------
// POST /internal/v1/consumer-deposits/test-confirm?external_ref=...
// Dev helper — simulated provider only.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct TestConfirmQuery {
    pub external_ref: String,
}

pub async fn test_confirm(
    State(state): State<AppState>,
    axum::extract::Query(q): axum::extract::Query<TestConfirmQuery>,
) -> ApiResult<Json<ConsumerDepositResponse>> {
    if state.environment.is_live() {
        tracing::error!("consumer_deposits::test_confirm called in LIVE environment — rejected");
        return Err(ApiError::forbidden(
            "test-confirm is not available in LIVE environment",
        ));
    }

    // Fetch the deposit to get the amount.
    let deposit: Option<(i64, String)> = sqlx::query_as(
        "SELECT amount_minor, currency FROM consumer_deposits WHERE external_ref = $1",
    )
    .bind(&q.external_ref)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let (amount_minor, currency) =
        deposit.ok_or_else(|| ApiError::not_found("no deposit for this external_ref"))?;

    let (raw_body, signature) = state
        .acquiring
        .generate_test_callback(&q.external_ref, amount_minor, &currency)
        .ok_or_else(|| {
            ApiError::not_found("test-confirm is only available with ACQUIRING_PROVIDER=SIMULATED")
        })?;

    // Reuse the callback handler logic by constructing fake HeaderMap + Bytes.
    let mut headers = HeaderMap::new();
    headers.insert(
        "Banza-Signature",
        signature
            .parse()
            .map_err(|_| ApiError::internal("invalid signature header"))?,
    );
    callback(State(state), headers, Bytes::from(raw_body)).await
}
