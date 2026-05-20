use chrono::{DateTime, Utc};
use banzami_types::{AccountId, ConsumerId, ConsumerWalletId, Currency, LedgerPostingId, Money};

/// Full onboarding + operational lifecycle of a consumer wallet.
///
/// Allowed transitions are enforced by [`ConsumerWalletEngine`]. Any other
/// (from, to) pair returns [`ConsumerWalletError::InvalidStatusTransition`].
///
/// ```text
/// PENDING_OTP ──otp verified──▶ PENDING_PIN ──handle + PIN set──▶ ACTIVE
/// PENDING_OTP ──otp expired──▶ (deleted by otp_expiry job)
/// PENDING_PIN ──timeout──▶ (deleted by stale_onboarding job)
/// ACTIVE ──5 pin failures──▶ LOCKED
/// ACTIVE ──admin action──▶ SUSPENDED
/// ACTIVE ──consumer request──▶ CLOSED
/// LOCKED ──sms otp unlock──▶ ACTIVE
/// LOCKED ──admin escalation──▶ SUSPENDED
/// SUSPENDED ──support decision──▶ ACTIVE
/// SUSPENDED ──admin closure──▶ CLOSED
/// ```
///
/// See ADR-017 for full rationale.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConsumerWalletStatus {
    /// Phone submitted; OTP not yet verified. No ledger accounts provisioned.
    PendingOtp,
    /// OTP verified; ledger accounts provisioned. Awaiting handle + PIN.
    PendingPin,
    /// Fully onboarded. Handle reserved. PIN set. Ready to transact.
    Active,
    /// Too many consecutive failed PIN attempts. Outbound blocked; inbound allowed.
    Locked,
    /// Administrative suspension. All operations blocked.
    Suspended,
    /// Permanently closed. Balance must be zero at closure.
    Closed,
}

impl ConsumerWalletStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            ConsumerWalletStatus::PendingOtp  => "PENDING_OTP",
            ConsumerWalletStatus::PendingPin  => "PENDING_PIN",
            ConsumerWalletStatus::Active      => "ACTIVE",
            ConsumerWalletStatus::Locked      => "LOCKED",
            ConsumerWalletStatus::Suspended   => "SUSPENDED",
            ConsumerWalletStatus::Closed      => "CLOSED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "PENDING_OTP" => Some(ConsumerWalletStatus::PendingOtp),
            "PENDING_PIN" => Some(ConsumerWalletStatus::PendingPin),
            "ACTIVE"      => Some(ConsumerWalletStatus::Active),
            "LOCKED"      => Some(ConsumerWalletStatus::Locked),
            "SUSPENDED"   => Some(ConsumerWalletStatus::Suspended),
            "CLOSED"      => Some(ConsumerWalletStatus::Closed),
            _             => None,
        }
    }

    /// Returns true if this wallet can receive inbound funds.
    pub fn can_receive(self) -> bool {
        matches!(self, Self::Active | Self::Locked)
    }

    /// Returns true if this wallet can initiate outbound operations.
    pub fn can_send(self) -> bool {
        matches!(self, Self::Active)
    }

    /// Returns true if this is a transient onboarding state with no ledger footprint.
    pub fn is_onboarding(self) -> bool {
        matches!(self, Self::PendingOtp | Self::PendingPin)
    }

    /// Whether (self → next) is a valid transition.
    pub fn can_transition_to(self, next: ConsumerWalletStatus) -> bool {
        matches!(
            (self, next),
            (Self::PendingOtp, Self::PendingPin)
            | (Self::PendingPin, Self::Active)
            | (Self::Active,    Self::Locked)
            | (Self::Active,    Self::Suspended)
            | (Self::Active,    Self::Closed)
            | (Self::Locked,    Self::Active)
            | (Self::Locked,    Self::Suspended)
            | (Self::Suspended, Self::Active)
            | (Self::Suspended, Self::Closed)
        )
    }
}

/// KYC verification state for a consumer wallet.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum KycStatus {
    None,
    Pending,
    Verified,
}

impl KycStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            KycStatus::None     => "NONE",
            KycStatus::Pending  => "PENDING",
            KycStatus::Verified => "VERIFIED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "NONE"     => Some(KycStatus::None),
            "PENDING"  => Some(KycStatus::Pending),
            "VERIFIED" => Some(KycStatus::Verified),
            _          => None,
        }
    }
}

/// A consumer's money container, backed by two LIABILITY ledger accounts.
///
/// # Balance model
///
/// Balances are never stored on this struct — they are always derived from
/// ledger entries (CLAUDE.md §2.1, ADR-017 §4). The two accounts give us:
///
/// | Account             | Purpose                                   |
/// |---------------------|-------------------------------------------|
/// | `available_account` | Funds available to send or withdraw       |
/// | `reserved_account`  | Funds reserved pending outbound transfers |
///
/// Both accounts are `LIABILITY` type — Banzami owes these funds to the consumer.
///
/// # Onboarding states
///
/// During `PENDING_OTP`, both account IDs are `None` — no ledger footprint.
/// Accounts are provisioned atomically on `PENDING_OTP → PENDING_PIN`.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ConsumerWallet {
    pub id:                   ConsumerWalletId,
    pub consumer_id:          ConsumerId,
    /// E.164 format: +244XXXXXXXXX
    pub phone_number:         String,
    /// Null until PENDING_PIN → ACTIVE. Immutable after activation.
    pub banza_handle:         Option<String>,
    pub status:               ConsumerWalletStatus,
    pub currency:             Currency,
    /// Ledger account for immediately spendable funds. Type: LIABILITY.
    /// None during PENDING_OTP only.
    pub available_account_id: Option<AccountId>,
    /// Ledger account for funds held pending outbound completion. Type: LIABILITY.
    /// None during PENDING_OTP only.
    pub reserved_account_id:  Option<AccountId>,
    pub kyc_status:           KycStatus,
    /// Argon2id PHC hash. None until wallet is ACTIVE.
    pub pin_hash:             Option<String>,
    pub failed_pin_attempts:  i32,
    pub locked_at:            Option<DateTime<Utc>>,
    /// Set when status transitions to ACTIVE. Null during PENDING_*.
    pub activated_at:         Option<DateTime<Utc>>,
    /// Set when status transitions to CLOSED.
    pub closed_at:            Option<DateTime<Utc>>,
    pub created_at:           DateTime<Utc>,
    pub updated_at:           DateTime<Utc>,
}

/// Point-in-time balance derived from ledger entries — never persisted.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ConsumerWalletBalance {
    pub wallet_id:   ConsumerWalletId,
    pub consumer_id: ConsumerId,
    pub currency:    Currency,
    /// Spendable funds.
    pub available:   Money,
    /// Funds reserved for in-flight outbound operations.
    pub reserved:    Money,
    /// `available + reserved`.
    pub total:       Money,
    pub computed_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

/// Step 1 — Submit phone number. Creates a PENDING_OTP session.
pub struct StartOnboardingRequest {
    pub phone_number: String,
    pub currency:     Currency,
    /// Test helper: provides the OTP plaintext so the caller can drive the
    /// full flow in tests without a real SMS service. `None` in production
    /// (OTP hash is injected by the SMS dispatch layer).
    pub otp_plaintext_for_test: Option<String>,
}

/// Step 2 — Verify OTP. Advances to PENDING_PIN, provisions ledger accounts.
pub struct VerifyOtpRequest {
    pub session_id: uuid::Uuid,
    /// Plaintext OTP from consumer. Verified against stored hash; never stored.
    pub otp_code:   String,
}

/// Step 3 — Choose @banza handle and set PIN. Activates the wallet.
pub struct CompleteOnboardingRequest {
    pub session_id:   uuid::Uuid,
    /// Desired @banza handle. Validated and uniqueness-checked by the engine.
    pub banza_handle: String,
    /// Plaintext PIN (4–6 digits). Hashed with Argon2id before storage.
    pub pin:          String,
}

/// Verify a consumer's PIN. Returns Ok(()) or Err(PinInvalid / WalletLocked).
pub struct VerifyPinRequest {
    pub wallet_id: ConsumerWalletId,
    /// Plaintext PIN from consumer. Never stored.
    pub pin:       String,
}

/// Change PIN. Requires current PIN verification first.
pub struct ChangePinRequest {
    pub wallet_id:   ConsumerWalletId,
    /// Plaintext current PIN for verification. Never stored.
    pub current_pin: String,
    /// Plaintext new PIN. Hashed with Argon2id before storage.
    pub new_pin:     String,
}

pub struct CreateConsumerWalletRequest {
    pub consumer_id: ConsumerId,
    pub currency:    Currency,
}

// ---------------------------------------------------------------------------
// Reservation types — WAL-002 balance engine
// ---------------------------------------------------------------------------

/// Lifecycle of a wallet fund reservation.
///
/// Transitions: ACTIVE → RELEASED (funds returned to available)
///              ACTIVE → COMMITTED (funds consumed by a completed payment)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReservationStatus {
    /// Funds are locked in the reserved account. Not yet released or committed.
    Active,
    /// Reservation cancelled — funds returned to available.
    Released,
    /// Reservation consumed by a completed payment. Funds left the wallet.
    Committed,
}

impl ReservationStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            ReservationStatus::Active    => "ACTIVE",
            ReservationStatus::Released  => "RELEASED",
            ReservationStatus::Committed => "COMMITTED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "ACTIVE"    => Some(ReservationStatus::Active),
            "RELEASED"  => Some(ReservationStatus::Released),
            "COMMITTED" => Some(ReservationStatus::Committed),
            _           => None,
        }
    }
}

/// An individual fund reservation against a consumer wallet.
///
/// Created by `reserve()`. Tracks which ledger posting created it and its
/// current lifecycle state. The ledger remains the financial source of truth;
/// this struct is an operational projection.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct WalletReservation {
    pub id:                 uuid::Uuid,
    pub wallet_id:          ConsumerWalletId,
    /// Reserved amount. Always positive.
    pub amount:             Money,
    pub reason:             String,
    pub status:             ReservationStatus,
    /// The DR available / CR reserved posting that created this reservation.
    pub reserve_posting_id: LedgerPostingId,
    /// Caller-supplied idempotency key.
    pub idempotency_key:    String,
    pub created_at:         DateTime<Utc>,
    pub released_at:        Option<DateTime<Utc>>,
    pub committed_at:       Option<DateTime<Utc>>,
}

/// Reserve funds in a consumer wallet (available → reserved).
pub struct ReserveRequest {
    pub wallet_id:       ConsumerWalletId,
    /// Amount to reserve. Must be positive, must match wallet currency.
    pub amount:          Money,
    /// Human-readable reason (e.g. "QR payment qr_xxx"). Stored on the reservation.
    pub reason:          String,
    /// Caller-supplied idempotency key. Re-submitting returns the existing reservation.
    pub idempotency_key: String,
}

/// Release an active reservation (reserved → available). Reverses the reservation.
pub struct ReleaseRequest {
    pub wallet_id:  ConsumerWalletId,
    /// ID of the reservation to release (from `WalletReservation.id`).
    pub reserve_id: uuid::Uuid,
}

/// Commit a reservation to a target account (reserved → target). Consumes the reservation.
pub struct CommitReservedRequest {
    pub wallet_id:         ConsumerWalletId,
    /// ID of the reservation to commit (from `WalletReservation.id`).
    pub reserve_id:        uuid::Uuid,
    /// Ledger account to credit. Caller's responsibility (merchant wallet, transit, etc.).
    pub target_account_id: AccountId,
}
