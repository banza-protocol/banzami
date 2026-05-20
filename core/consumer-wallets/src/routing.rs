use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use banzami_types::{ConsumerId, ConsumerWalletId, Currency};

use crate::wallet::ConsumerWalletStatus;

// ---------------------------------------------------------------------------
// Routing status
// ---------------------------------------------------------------------------

/// The financial reachability of a @banza handle at resolution time.
///
/// Only `ROUTABLE` and `LOCKED` wallets may receive inbound transfers.
/// All other states are hard errors — callers must never route money to them.
///
/// | State        | Description                                                        |
/// |-------------|---------------------------------------------------------------------|
/// | ROUTABLE     | Active identity + active wallet — can send and receive              |
/// | LOCKED       | Active identity + locked wallet — can receive, cannot initiate send |
/// | SUSPENDED    | Identity or wallet suspended by compliance/support                  |
/// | CLOSED       | Wallet permanently closed — no inbound transfers allowed            |
/// | PENDING_KYC  | Wallet active but KYC incomplete — inbound may be restricted       |
/// | UNREACHABLE  | Onboarding state — no ledger footprint, cannot receive money        |
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RoutingStatus {
    Routable,
    Locked,
    Suspended,
    Closed,
    PendingKyc,
    Unreachable,
}

impl RoutingStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            RoutingStatus::Routable   => "ROUTABLE",
            RoutingStatus::Locked     => "LOCKED",
            RoutingStatus::Suspended  => "SUSPENDED",
            RoutingStatus::Closed     => "CLOSED",
            RoutingStatus::PendingKyc => "PENDING_KYC",
            RoutingStatus::Unreachable => "UNREACHABLE",
        }
    }

    /// Whether this routing state permits inbound transfers.
    pub fn can_receive(self) -> bool {
        matches!(self, RoutingStatus::Routable | RoutingStatus::Locked)
    }
}

/// Maps a `ConsumerWalletStatus` to a `RoutingStatus` for inbound routing decisions.
///
/// Called after identity status is confirmed ACTIVE. Wallet-level status
/// refines the routing outcome.
pub fn routing_status_from_wallet(wallet_status: ConsumerWalletStatus) -> RoutingStatus {
    match wallet_status {
        ConsumerWalletStatus::Active     => RoutingStatus::Routable,
        ConsumerWalletStatus::Locked     => RoutingStatus::Locked,
        ConsumerWalletStatus::Suspended  => RoutingStatus::Suspended,
        ConsumerWalletStatus::Closed     => RoutingStatus::Closed,
        // Onboarding states have no ledger footprint — unreachable for money movement
        ConsumerWalletStatus::PendingOtp | ConsumerWalletStatus::PendingPin => RoutingStatus::Unreachable,
    }
}

// ---------------------------------------------------------------------------
// Canonical routing destination
// ---------------------------------------------------------------------------

/// The resolved, verified financial destination for a @banza handle.
///
/// A `WalletRoutingDestination` is the canonical output of handle resolution.
/// It is only returned when the handle maps unambiguously to a live, routable wallet.
/// Internal ledger account IDs are never exposed — callers see only wallet_id.
///
/// # Routing guarantee
///
/// When `routing_status == ROUTABLE`, the wallet at `wallet_id` accepts inbound transfers.
/// When `routing_status == LOCKED`, the wallet can receive but the owner cannot initiate sends.
/// All other routing states are returned as errors by `resolve_to_wallet`.
#[derive(Debug, Clone)]
#[derive(Serialize, Deserialize)]
pub struct WalletRoutingDestination {
    pub consumer_id:       ConsumerId,
    pub wallet_id:         ConsumerWalletId,
    pub normalized_handle: String,
    pub display_name:      Option<String>,
    pub currency:          Currency,
    pub wallet_status:     ConsumerWalletStatus,
    pub routing_status:    RoutingStatus,
    /// When the wallet was activated (transitioned to ACTIVE). None during onboarding.
    pub activated_at:      Option<DateTime<Utc>>,
}
