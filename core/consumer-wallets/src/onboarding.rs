use chrono::{DateTime, Utc};
use banzami_types::{AccountId, Currency};

/// Pre-activation lifecycle state (maps to `consumer_onboarding` table).
///
/// Distinct from [`crate::ConsumerWalletStatus`] — these states live in a
/// separate table and are deleted on activation. See ADR-017 §1.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OnboardingStatus {
    /// Phone submitted; OTP sent. No ledger accounts provisioned.
    PendingOtp,
    /// OTP verified. Ledger accounts provisioned. Awaiting handle + PIN.
    PendingPin,
}

impl OnboardingStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            OnboardingStatus::PendingOtp => "PENDING_OTP",
            OnboardingStatus::PendingPin => "PENDING_PIN",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "PENDING_OTP" => Some(OnboardingStatus::PendingOtp),
            "PENDING_PIN" => Some(OnboardingStatus::PendingPin),
            _             => None,
        }
    }
}

/// Transient onboarding session — maps to the `consumer_onboarding` table.
///
/// Rows are created at phone submission, updated at OTP verification, and
/// deleted atomically when activation completes. They are also deleted by the
/// `stale_onboarding` background job if `expires_at` passes.
#[derive(Debug, Clone)]
pub struct OnboardingSession {
    pub id:           uuid::Uuid,
    pub phone_number: String,
    /// SHA-256(otp_plaintext). `None` after verification.
    pub otp_code_hash:   Option<String>,
    pub otp_expires_at:  Option<DateTime<Utc>>,
    /// Tentative @banza handle reserved during PENDING_PIN.
    pub desired_handle:  Option<String>,
    pub currency:        Currency,
    pub status:          OnboardingStatus,
    /// `None` while PENDING_OTP; set at OTP verification.
    pub provisional_available_account_id: Option<AccountId>,
    pub provisional_reserved_account_id:  Option<AccountId>,
    pub created_at:  DateTime<Utc>,
    /// Absolute expiry for background cleanup jobs.
    pub expires_at:  DateTime<Utc>,
}

impl OnboardingSession {
    pub fn is_expired(&self) -> bool {
        Utc::now() >= self.expires_at
    }

    pub fn otp_is_expired(&self) -> bool {
        self.otp_expires_at.map_or(true, |exp| Utc::now() >= exp)
    }
}

/// Result of a completed onboarding — used by the engine to populate the
/// `consumers` and `consumer_wallets` rows atomically.
#[derive(Debug)]
pub struct CompletedOnboarding {
    pub session_id:          uuid::Uuid,
    pub phone_number:        String,
    pub banza_handle:        String,
    /// Argon2id PHC hash of the chosen PIN. Never the plaintext.
    pub pin_hash:            String,
    pub currency:            Currency,
    pub available_account_id: AccountId,
    pub reserved_account_id:  AccountId,
}
