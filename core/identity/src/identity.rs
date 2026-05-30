use banzami_types::ConsumerId;
use chrono::{DateTime, Utc};

const RESERVED_HANDLES: &[&str] = &[
    "admin",
    "banzami",
    "banza",
    "banzai",
    "banzamii",
    "support",
    "help",
    "api",
    "system",
    "root",
    "superuser",
    "service",
    "ops",
    "security",
    "compliance",
    "audit",
    "finance",
    "legal",
    "payments",
    "transactions",
    "wallets",
    "emis",
    "multicaixa",
    "angola",
    "banco",
    "bna",
    "angolar",
    "standard",
    "atlantico",
    "bai",
    "bfa",
    "bic",
    "millennium",
    "bde",
];

/// Lifecycle state of a consumer identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConsumerStatus {
    Active,
    Suspended,
    Closed,
}

impl ConsumerStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            ConsumerStatus::Active => "ACTIVE",
            ConsumerStatus::Suspended => "SUSPENDED",
            ConsumerStatus::Closed => "CLOSED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "ACTIVE" => Some(ConsumerStatus::Active),
            "SUSPENDED" => Some(ConsumerStatus::Suspended),
            "CLOSED" => Some(ConsumerStatus::Closed),
            _ => None,
        }
    }
}

/// Admin-assigned trust badge displayed on the consumer's profile.
///
/// `CONSUMER` renders as a gold "Verificado" pill.
/// `MERCHANT` renders as a blue "Comerciante" pill.
/// Absence (NULL in DB) means no badge is shown.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum VerificationBadge {
    Consumer,
    Merchant,
}

impl VerificationBadge {
    pub const fn as_str(self) -> &'static str {
        match self {
            VerificationBadge::Consumer => "CONSUMER",
            VerificationBadge::Merchant => "MERCHANT",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "CONSUMER" => Some(VerificationBadge::Consumer),
            "MERCHANT" => Some(VerificationBadge::Merchant),
            _ => None,
        }
    }
}

/// A registered consumer with a unique human-readable handle.
///
/// Handles are the public-facing identities — consumers never see raw UUIDs.
/// A handle uniquely identifies the owner for QR payments and P2P transfers.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConsumerIdentity {
    pub id: ConsumerId,
    pub handle: String,
    pub display_name: Option<String>,
    pub status: ConsumerStatus,
    pub verification_badge: Option<VerificationBadge>,
    pub suspension_notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct CreateConsumerRequest {
    pub handle: String,
    pub display_name: Option<String>,
}

/// Result returned by `IdentityEngine::resolve_handle`.
///
/// Resolving a handle confirms the recipient is active and reachable.
/// Wallet lookups happen at a higher service layer — identity crate only
/// owns consumer identity, not wallet associations.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HandleResolution {
    pub consumer_id: banzami_types::ConsumerId,
    pub handle: String,
    pub display_name: Option<String>,
    pub status: ConsumerStatus,
}

/// Strip leading `@`, lowercase, and trim whitespace.
pub fn normalize_handle(raw: &str) -> String {
    raw.trim().trim_start_matches('@').to_lowercase()
}

/// Validate a normalized handle (no leading `@`, already lowercased).
///
/// Rules (enforced here; also mirrored in the DB CHECK constraint):
/// - 3–20 characters
/// - Must start with a lowercase letter (`a-z`)
/// - Only lowercase letters (`a-z`), digits (`0-9`), and underscores (`_`)
/// - Cannot end with `_`
/// - No consecutive underscores (`__`)
/// - Not a reserved keyword
pub fn validate_handle(handle: &str) -> Result<(), &'static str> {
    let len = handle.len();
    if len < 3 {
        return Err("handle must be at least 3 characters");
    }
    if len > 20 {
        return Err("handle must be at most 20 characters");
    }

    let bytes = handle.as_bytes();
    if !bytes[0].is_ascii_lowercase() {
        return Err("handle must start with a lowercase letter");
    }
    if bytes[len - 1] == b'_' {
        return Err("handle cannot end with an underscore");
    }

    for (i, &b) in bytes.iter().enumerate() {
        if !matches!(b, b'a'..=b'z' | b'0'..=b'9' | b'_') {
            return Err("handle may only contain lowercase letters, digits, and underscores");
        }
        if b == b'_' && bytes.get(i + 1) == Some(&b'_') {
            return Err("handle cannot contain consecutive underscores");
        }
    }

    if RESERVED_HANDLES.contains(&handle) {
        return Err("handle is reserved");
    }

    Ok(())
}

/// Returns `true` if the handle (already normalized) matches a reserved keyword.
pub fn is_reserved_handle(handle: &str) -> bool {
    RESERVED_HANDLES.contains(&handle)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_handles() {
        for h in &["ana", "carlos", "mercearia_kilamba", "user123", "abc"] {
            assert!(validate_handle(h).is_ok(), "expected valid: {h}");
        }
    }

    #[test]
    fn too_short() {
        assert!(validate_handle("ab").is_err());
    }

    #[test]
    fn too_long() {
        assert!(validate_handle(&"a".repeat(21)).is_err());
    }

    #[test]
    fn exactly_20_chars_is_valid() {
        assert!(validate_handle(&"a".repeat(20)).is_ok());
    }

    #[test]
    fn starts_with_digit_blocked() {
        assert!(validate_handle("1abc").is_err());
    }

    #[test]
    fn starts_with_underscore_blocked() {
        assert!(validate_handle("_foo").is_err());
    }

    #[test]
    fn reserved_handles_extended() {
        for h in &["banza", "emis", "multicaixa", "bna", "bai"] {
            assert!(validate_handle(h).is_err(), "expected reserved: {h}");
        }
    }

    #[test]
    fn is_reserved_handle_works() {
        assert!(is_reserved_handle("banza"));
        assert!(is_reserved_handle("emis"));
        assert!(!is_reserved_handle("ana"));
    }

    #[test]
    fn reserved_word_blocked() {
        assert!(validate_handle("admin").is_err());
        assert!(validate_handle("banzami").is_err());
    }

    #[test]
    fn consecutive_underscores_blocked() {
        assert!(validate_handle("foo__bar").is_err());
    }

    #[test]
    fn leading_underscore_blocked() {
        assert!(validate_handle("_foo").is_err());
    }

    #[test]
    fn trailing_underscore_blocked() {
        assert!(validate_handle("foo_").is_err());
    }

    #[test]
    fn normalize_strips_at_and_lowercases() {
        assert_eq!(normalize_handle("@Carlos"), "carlos");
        assert_eq!(normalize_handle("  @ANA  "), "ana");
    }
}
