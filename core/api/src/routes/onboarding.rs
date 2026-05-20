use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use banzami_consumer_wallets::{
    CompleteOnboardingRequest, ConsumerWalletEngine, ConsumerWalletError,
    StartOnboardingRequest, VerifyOtpRequest,
};
use banzami_types::Currency;

use crate::{error::{ApiError, ApiResult}, state::AppState};

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct StartOnboardingBody {
    pub phone_number:          String,
    pub currency:              String,
    /// Test-only: if provided, the OTP plaintext is returned in the response.
    pub otp_plaintext_for_test: Option<String>,
}

#[derive(Serialize)]
pub struct StartOnboardingResponse {
    pub session_id:  uuid::Uuid,
    pub phone_number: String,
    pub status:      &'static str,
    /// Present only when `otp_plaintext_for_test` was supplied in the request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub otp_for_test: Option<String>,
}

#[derive(Deserialize)]
pub struct VerifyOtpBody {
    pub session_id: uuid::Uuid,
    pub otp_code:   String,
}

#[derive(Serialize)]
pub struct VerifyOtpResponse {
    pub session_id:                    uuid::Uuid,
    pub status:                        &'static str,
    pub provisional_available_account_id: uuid::Uuid,
    pub provisional_reserved_account_id:  uuid::Uuid,
}

#[derive(Deserialize)]
pub struct CompleteOnboardingBody {
    pub session_id:   uuid::Uuid,
    pub banza_handle: String,
    pub pin:          String,
}

#[derive(Serialize)]
pub struct CompleteOnboardingResponse {
    pub wallet_id:    uuid::Uuid,
    pub consumer_id:  uuid::Uuid,
    pub banza_handle: String,
    pub currency:     String,
    pub status:       String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /internal/v1/consumer/onboarding/start
///
/// Creates a new onboarding session (PENDING_OTP) for the given phone number.
/// One active session per phone number is enforced — a second start for the same
/// phone returns the existing session (idempotent).
pub async fn start(
    State(state): State<AppState>,
    Json(body): Json<StartOnboardingBody>,
) -> ApiResult<(StatusCode, Json<StartOnboardingResponse>)> {
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    let otp_plaintext_for_test = body.otp_plaintext_for_test.clone();

    let session = state
        .consumer_wallet
        .start_onboarding(StartOnboardingRequest {
            phone_number:           body.phone_number.clone(),
            currency,
            otp_plaintext_for_test: otp_plaintext_for_test.clone(),
        })
        .await
        .map_err(map_onboarding_error)?;

    let otp_for_test = otp_plaintext_for_test.map(|_| {
        // The engine echoes the otp_plaintext_for_test back through the session
        // only when it was supplied. We signal its presence to the caller so
        // integration tests can drive the full flow.
        "use_otp_plaintext_for_test_value".to_owned()
    });

    Ok((StatusCode::CREATED, Json(StartOnboardingResponse {
        session_id:  session.id,
        phone_number: session.phone_number,
        status:      "PENDING_OTP",
        otp_for_test,
    })))
}

/// POST /internal/v1/consumer/onboarding/verify-otp
///
/// Verifies the OTP code. On success the session advances to PENDING_PIN and
/// two provisional ledger accounts are provisioned.
pub async fn verify_otp(
    State(state): State<AppState>,
    Json(body): Json<VerifyOtpBody>,
) -> ApiResult<Json<VerifyOtpResponse>> {
    let session = state
        .consumer_wallet
        .verify_otp(VerifyOtpRequest {
            session_id: body.session_id,
            otp_code:   body.otp_code,
        })
        .await
        .map_err(map_onboarding_error)?;

    let avail = session
        .provisional_available_account_id
        .ok_or_else(|| ApiError::internal("ledger accounts not provisioned after OTP verification"))?;
    let resrv = session
        .provisional_reserved_account_id
        .ok_or_else(|| ApiError::internal("ledger accounts not provisioned after OTP verification"))?;

    Ok(Json(VerifyOtpResponse {
        session_id:                       session.id,
        status:                           "PENDING_PIN",
        provisional_available_account_id: avail.as_uuid(),
        provisional_reserved_account_id:  resrv.as_uuid(),
    }))
}

/// POST /internal/v1/consumer/onboarding/complete
///
/// Sets the @banza handle and PIN, then atomically:
///   - inserts a consumer record,
///   - inserts the consumer_wallets record (ACTIVE, both ledger accounts NOT NULL),
///   - deletes the transient onboarding session.
pub async fn complete(
    State(state): State<AppState>,
    Json(body): Json<CompleteOnboardingBody>,
) -> ApiResult<(StatusCode, Json<CompleteOnboardingResponse>)> {
    let wallet = state
        .consumer_wallet
        .complete_onboarding(CompleteOnboardingRequest {
            session_id:   body.session_id,
            banza_handle: body.banza_handle,
            pin:          body.pin,
        })
        .await
        .map_err(map_onboarding_error)?;

    Ok((StatusCode::CREATED, Json(CompleteOnboardingResponse {
        wallet_id:    wallet.id.as_uuid(),
        consumer_id:  wallet.consumer_id.as_uuid(),
        banza_handle: wallet.banza_handle.unwrap_or_default(),
        currency:     wallet.currency.code().to_owned(),
        status:       wallet.status.as_str().to_owned(),
    })))
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

fn map_onboarding_error(e: ConsumerWalletError) -> ApiError {
    match e {
        ConsumerWalletError::OtpInvalid => {
            ApiError::unprocessable("OTP_INVALID", "OTP is invalid or expired")
        }
        ConsumerWalletError::OnboardingExpiredSession(_) => {
            ApiError::unprocessable("OTP_EXPIRED", "onboarding session has expired")
        }
        ConsumerWalletError::OnboardingExpired(_) => {
            ApiError::unprocessable("OTP_EXPIRED", "onboarding session has expired")
        }
        ConsumerWalletError::OnboardingNotFound(_) => {
            ApiError::not_found("onboarding session not found")
        }
        ConsumerWalletError::HandleTaken(h) => {
            ApiError::conflict("HANDLE_TAKEN", format!("handle '{h}' is already taken"))
        }
        ConsumerWalletError::InvalidHandle(reason) => {
            ApiError::unprocessable("INVALID_HANDLE", reason)
        }
        ConsumerWalletError::DuplicateWallet => {
            ApiError::conflict("DUPLICATE_WALLET", "consumer already has an active wallet in this currency")
        }
        ConsumerWalletError::InvalidStatusTransition { from, to } => {
            ApiError::unprocessable(
                "INVALID_LIFECYCLE_STATE",
                format!("invalid transition: {from:?} → {to:?}"),
            )
        }
        ConsumerWalletError::WalletLocked(id) => {
            ApiError::unprocessable("WALLET_LOCKED", format!("wallet {id} is locked"))
        }
        ConsumerWalletError::PinNotSet(_) => {
            ApiError::unprocessable("PIN_NOT_SET", "PIN has not been set on this wallet")
        }
        other => ApiError::internal(other.to_string()),
    }
}
