//! Provider-agnostic verification-record status and transition rules.
//!
//! This is internal domain logic for the `kyc_verifications` tracking table. It
//! does not call any vendor and does not imply a real integration — it only
//! enforces the legal lifecycle of a verification attempt. `REJECTED` and
//! `EXPIRED` are terminal for their row; a new attempt is a new row.

/// Status of a single verification attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerificationRecordStatus {
    Pending,
    Approved,
    Rejected,
    ManualReview,
    Expired,
}

impl VerificationRecordStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Approved => "APPROVED",
            Self::Rejected => "REJECTED",
            Self::ManualReview => "MANUAL_REVIEW",
            Self::Expired => "EXPIRED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "PENDING" => Some(Self::Pending),
            "APPROVED" => Some(Self::Approved),
            "REJECTED" => Some(Self::Rejected),
            "MANUAL_REVIEW" => Some(Self::ManualReview),
            "EXPIRED" => Some(Self::Expired),
            _ => None,
        }
    }

    /// A terminal status admits no further transition on the same row.
    pub const fn is_terminal(self) -> bool {
        matches!(self, Self::Rejected | Self::Expired)
    }

    /// A transition that moves a verification to a final decision (stamps `decided_at`).
    pub const fn is_decision(self) -> bool {
        matches!(self, Self::Approved | Self::Rejected | Self::Expired)
    }

    /// Whether moving from `self` to `to` is allowed.
    ///
    /// Allowed: PENDING→{APPROVED,REJECTED,MANUAL_REVIEW}, MANUAL_REVIEW→{APPROVED,
    /// REJECTED}, APPROVED→EXPIRED. Everything else (incl. APPROVED→PENDING,
    /// REJECTED→anything, EXPIRED→anything) is rejected.
    pub const fn can_transition_to(self, to: Self) -> bool {
        use VerificationRecordStatus::*;
        matches!(
            (self, to),
            (Pending, Approved)
                | (Pending, Rejected)
                | (Pending, ManualReview)
                | (ManualReview, Approved)
                | (ManualReview, Rejected)
                | (Approved, Expired)
        )
    }
}

#[cfg(test)]
mod tests {
    use super::VerificationRecordStatus as S;

    #[test]
    fn str_roundtrip() {
        for s in [
            S::Pending,
            S::Approved,
            S::Rejected,
            S::ManualReview,
            S::Expired,
        ] {
            assert_eq!(S::try_from_str(s.as_str()), Some(s));
        }
        assert_eq!(S::try_from_str("NOPE"), None);
    }

    #[test]
    fn allowed_transitions() {
        assert!(S::Pending.can_transition_to(S::Approved));
        assert!(S::Pending.can_transition_to(S::Rejected));
        assert!(S::Pending.can_transition_to(S::ManualReview));
        assert!(S::ManualReview.can_transition_to(S::Approved));
        assert!(S::ManualReview.can_transition_to(S::Rejected));
        assert!(S::Approved.can_transition_to(S::Expired));
    }

    #[test]
    fn forbidden_transitions() {
        assert!(!S::Approved.can_transition_to(S::Pending));
        assert!(!S::Rejected.can_transition_to(S::Approved));
        assert!(!S::Rejected.can_transition_to(S::Pending));
        assert!(!S::Expired.can_transition_to(S::Approved));
        assert!(!S::Pending.can_transition_to(S::Pending));
        assert!(!S::Pending.can_transition_to(S::Expired));
    }

    #[test]
    fn terminal_and_decision() {
        assert!(S::Rejected.is_terminal() && S::Expired.is_terminal());
        assert!(!S::Pending.is_terminal() && !S::ManualReview.is_terminal());
        assert!(S::Approved.is_decision() && S::Rejected.is_decision() && S::Expired.is_decision());
        assert!(!S::Pending.is_decision() && !S::ManualReview.is_decision());
    }
}
