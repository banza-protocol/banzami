//! Masking for personal data that reaches ordinary logs.
//!
//! Core logged a consumer's phone number when an onboarding session was created
//! — a route anyone can reach without signing in — and a Business's email when
//! it was created (A6-14). A log line still has to be useful for support, so
//! these keep the least that identifies a record to someone who already knows
//! it, and hide the rest.

/// A phone number as its country prefix and last two digits: `+244…89`.
/// Anything too short to mask is reported as `***`.
pub fn phone(raw: &str) -> String {
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() < 6 {
        return "***".into();
    }
    let head = &digits[..digits.len().min(3)];
    let tail = &digits[digits.len() - 2..];
    format!("+{head}…{tail}")
}

/// An email as one leading character and its domain: `f***@example.ao`.
/// A value that is not an address is reported as `***`.
pub fn email(raw: &str) -> String {
    let trimmed = raw.trim();
    let Some((local, domain)) = trimmed.split_once('@') else {
        return "***".into();
    };
    if local.is_empty() || domain.is_empty() {
        return "***".into();
    }
    let first = local.chars().next().unwrap_or('*');
    format!("{first}***@{domain}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_phone_keeps_only_its_prefix_and_last_two_digits() {
        assert_eq!(phone("+244923456789"), "+244…89");
        assert_eq!(phone("+244 923 456 789"), "+244…89");
        assert_eq!(phone("12345"), "***");
        assert_eq!(phone(""), "***");
        // Nothing in the middle of the number survives.
        assert!(!phone("+244923456789").contains("3456"));
    }

    #[test]
    fn an_email_keeps_only_its_first_letter_and_domain() {
        assert_eq!(email("fidel.monteiro@example.ao"), "f***@example.ao");
        assert_eq!(email("  a@b.co "), "a***@b.co");
        assert_eq!(email("not-an-address"), "***");
        assert_eq!(email("@example.ao"), "***");
        assert!(!email("fidel.monteiro@example.ao").contains("monteiro"));
    }
}
