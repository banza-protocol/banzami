use banzami_types::ConsumerId;
use chrono::{DateTime, Utc};

// Single namespace authority: there is deliberately NO hand-maintained reserved
// list here. `validate_handle` checks SYNTAX only; whether a name is
// reserved/protected/allocated/retired is decided by `handle_registry` (seeded
// from tools/gen-reserved-handles.mjs). A reserved/protected name is refused when
// the create transaction tries to insert it and hits the registry's PRIMARY KEY.
// tools/check-reserved-handles.mjs fails CI if a RESERVED_HANDLES list reappears.

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
    /// Verified recovery email. Written at creation when the signup verified an
    /// email; never serialized out of the identity (a contact attribute read
    /// directly by the recovery service, not exposed on identity responses).
    #[serde(skip, default)]
    pub email: Option<String>,
    #[serde(skip, default)]
    pub email_verified_at: Option<DateTime<Utc>>,
}

pub struct CreateConsumerRequest {
    pub handle: String,
    pub display_name: Option<String>,
    /// An already-verified recovery email (lower-cased by the caller). When set,
    /// the consumer is created with email_verified_at = now. None keeps the
    /// legacy no-email account shape.
    pub email: Option<String>,
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

/// Trim whitespace, strip ONE leading `@`, and lowercase ASCII only.
///
/// One rule, the gateway's: it strips one `@` and so must this (it stripped all,
/// so "@@doa" resolved here and nowhere else). Case folding is ASCII: a
/// Unicode-aware lowercase maps characters such as the Kelvin sign onto ASCII
/// letters, and a handle is an ASCII name with one spelling (A3-07). A non-ASCII
/// character is left as it is, and validation refuses it.
pub fn normalize_handle(raw: &str) -> String {
    let t = raw.trim();
    t.strip_prefix('@').unwrap_or(t).to_ascii_lowercase()
}

/// Validate a normalized handle (no leading `@`, already lowercased) — SYNTAX ONLY.
///
/// This is THE one canonical @banza grammar, identical for Consumer and Business
/// (and mirrored in every creation path + tools/check-handle-grammar.mjs):
/// - 3–30 characters
/// - Must start with a lowercase letter (`a-z`)
/// - Only lowercase letters (`a-z`), digits (`0-9`), and underscores (`_`)
/// - Cannot end with `_`
/// - No consecutive underscores (`__`)
///
/// It deliberately does NOT decide reserved/protected: that is the registry's job
/// (see the note at the top of this file). A syntactically valid but reserved
/// name is refused later, when the create transaction inserts it into
/// `handle_registry` and hits the PRIMARY KEY.
pub fn validate_handle(handle: &str) -> Result<(), &'static str> {
    let len = handle.len();
    if len < 3 {
        return Err("handle must be at least 3 characters");
    }
    if len > 30 {
        return Err("handle must be at most 30 characters");
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

    Ok(())
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
        assert!(validate_handle(&"a".repeat(31)).is_err());
    }

    #[test]
    fn exactly_30_chars_is_valid() {
        assert!(validate_handle(&"a".repeat(30)).is_ok());
    }

    #[test]
    fn starts_with_digit_blocked() {
        assert!(validate_handle("1abc").is_err());
    }

    #[test]
    fn starts_with_underscore_blocked() {
        assert!(validate_handle("_foo").is_err());
    }

    // Single authority: validate_handle is SYNTAX ONLY. Names that are
    // reserved/protected in the registry (banzami, bna, bai, emis, admin) are
    // syntactically valid here — they are refused later by the registry PRIMARY
    // KEY, not by this function. This pins the authority split so a hand-kept
    // reserved list cannot creep back in.
    #[test]
    fn validate_handle_is_syntax_only_not_a_reserved_list() {
        for h in &[
            "banzami",
            "banza",
            "bna",
            "bai",
            "emis",
            "multicaixa",
            "admin",
        ] {
            assert!(
                validate_handle(h).is_ok(),
                "{h} failed SYNTAX validation — reserved/protected is the registry's job, not validate_handle's"
            );
        }
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

    // A3-07: one spelling per handle. One `@` is stripped (as the gateway does),
    // and case folding is ASCII — the Kelvin sign and a dotted capital I do not
    // become ASCII letters and so are refused, not aliased.
    #[test]
    fn one_at_and_ascii_case_only() {
        assert_eq!(normalize_handle("  @Ana_M "), "ana_m");
        assert_eq!(normalize_handle("@@doa"), "@doa");
        assert!(validate_handle(&normalize_handle("@@doa")).is_err());
        for alias in ["\u{212A}ilo", "\u{130}vo"] {
            let n = normalize_handle(alias);
            assert!(
                validate_handle(&n).is_err(),
                "{alias:?} normalised to a valid handle {n:?}"
            );
        }
    }
}
