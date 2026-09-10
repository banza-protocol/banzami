//! What a payer may write on a receipt.
//!
//! The description is published: it appears on the PDF and, through the public
//! proof, to anyone holding the reference. It is kept in the verifiable payload
//! deliberately — a verifier that omitted it could not contradict a forger who
//! altered only that line — which makes it the one free-text field on a financial
//! document, and therefore worth constraining at the domain boundary rather than
//! at whichever renderer happens to be looking.
//!
//! Two rules, for two different reasons.
//!
//! LENGTH is a product limit: 140 Unicode scalar values. Counted in scalars, not
//! bytes and not UTF-16 code units, because "Ação" must cost what it looks like it
//! costs and an emoji must not silently cost four. Over the limit is rejected, never
//! truncated: silently shortening what someone wrote onto a financial document
//! changes the record without telling them.
//!
//! CONTENT is a safety limit, and narrow on purpose. A receipt is a single line of
//! human text, so characters that can restructure a line — controls, separators,
//! and the invisible bidi overrides that let "10,00 Kz" render as something else —
//! are refused. Ordinary letters in every script are not: rejecting RTL text would
//! be banning languages, not attacks, so the marks that merely hint direction are
//! allowed while the ones that forcibly reorder are not.
//!
//! Markup is not a category here. `<script>alert(1)</script>` is 24 perfectly
//! ordinary characters; it is dangerous only if a renderer interprets it, and the
//! fix for that lives in the renderer. Rejecting angle brackets would break "Pagamento <urgente>" and secure nothing.

/// Maximum description length, in Unicode scalar values.
pub const MAX_DESCRIPTION_SCALARS: usize = 140;

/// Why a description was refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DescriptionError {
    /// Longer than the product limit. Carries the actual count so the caller can
    /// say by how much rather than only that it was too long.
    TooLong { scalars: usize, max: usize },
    /// Contains a character that can restructure the rendered line.
    ForbiddenCharacter { codepoint: u32 },
}

impl std::fmt::Display for DescriptionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DescriptionError::TooLong { scalars, max } => write!(
                f,
                "description is {scalars} characters; the maximum is {max}"
            ),
            DescriptionError::ForbiddenCharacter { codepoint } => write!(
                f,
                "description contains a control or direction-override character (U+{codepoint:04X}) that is not allowed on a receipt"
            ),
        }
    }
}

impl std::error::Error for DescriptionError {}

/// True for characters refused on a receipt line.
fn is_forbidden(c: char) -> bool {
    let u = c as u32;
    matches!(u,
        // C0 controls, including CR, LF and TAB. A receipt description is one line.
        0x0000..=0x001F
        // DEL and the C1 block.
        | 0x007F..=0x009F
        // LINE SEPARATOR / PARAGRAPH SEPARATOR — line breaks by another name.
        | 0x2028 | 0x2029
        // Bidi EMBEDDING / OVERRIDE / POP. These forcibly reorder what follows,
        // which is how a description can be made to display as something other
        // than what is stored.
        | 0x202A..=0x202E
        // Bidi ISOLATE / POP ISOLATE — the modern equivalents of the above.
        | 0x2066..=0x2069
    )
}

/// Validate a payer-supplied description.
///
/// `None` and empty are accepted: the field is optional, and a payer who writes
/// nothing has not made a mistake.
///
/// U+200E/U+200F (LEFT-TO-RIGHT and RIGHT-TO-LEFT MARK) and U+061C (ARABIC LETTER
/// MARK) are deliberately ALLOWED. They are zero-width direction hints, not
/// overrides: they influence how neighbouring neutral characters resolve but
/// cannot reorder a run. Real Arabic and Hebrew text uses them for correct
/// display, so refusing them would penalise those languages while stopping no
/// attack the 202x/206x ranges do not already stop.
///
/// No normalisation is applied. Rewriting what a payer typed — even to a
/// canonically equivalent form — means the stored record is not what they wrote,
/// and this text is reproduced on a document people rely on.
pub fn validate_description(description: Option<&str>) -> Result<(), DescriptionError> {
    let Some(text) = description else {
        return Ok(());
    };
    if let Some(c) = text.chars().find(|c| is_forbidden(*c)) {
        return Err(DescriptionError::ForbiddenCharacter {
            codepoint: c as u32,
        });
    }
    let scalars = text.chars().count();
    if scalars > MAX_DESCRIPTION_SCALARS {
        return Err(DescriptionError::TooLong {
            scalars,
            max: MAX_DESCRIPTION_SCALARS,
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn optional_and_empty_are_accepted() {
        assert!(validate_description(None).is_ok());
        assert!(validate_description(Some("")).is_ok());
    }

    #[test]
    fn ordinary_text_is_accepted() {
        for s in [
            "Consultoria",
            "Pagamento à Ação, coração — çedilha",   // Portuguese accents
            "Almoço 50% + gorjeta",
            "Pagamento <urgente>",                    // angle brackets are just text
            "<script>alert(1)</script>",              // inert here; rendering is the renderer's job
            "دفع",                                    // ordinary Arabic letters
            "תשלום",                                  // ordinary Hebrew letters
            "Obrigado 🙏 pelo café ☕",                // emoji
        ] {
            assert!(validate_description(Some(s)).is_ok(), "should accept: {s:?}");
        }
    }

    #[test]
    fn length_is_counted_in_scalars_not_bytes() {
        // 140 accented characters are 140 characters, though far more bytes.
        let at_limit: String = "ç".repeat(MAX_DESCRIPTION_SCALARS);
        assert!(at_limit.len() > MAX_DESCRIPTION_SCALARS, "precondition: multi-byte");
        assert!(validate_description(Some(&at_limit)).is_ok());

        // And 140 emoji are 140, not 560.
        let emoji: String = "🙏".repeat(MAX_DESCRIPTION_SCALARS);
        assert!(validate_description(Some(&emoji)).is_ok());
    }

    #[test]
    fn one_over_the_limit_is_refused_not_truncated() {
        let over: String = "a".repeat(MAX_DESCRIPTION_SCALARS + 1);
        match validate_description(Some(&over)) {
            Err(DescriptionError::TooLong { scalars, max }) => {
                assert_eq!(scalars, MAX_DESCRIPTION_SCALARS + 1);
                assert_eq!(max, MAX_DESCRIPTION_SCALARS);
            }
            other => panic!("expected TooLong, got {other:?}"),
        }
    }

    #[test]
    fn line_breaking_and_control_characters_are_refused() {
        for (name, s) in [
            ("newline", "linha\numa"),
            ("carriage return", "linha\rduas"),
            ("tab", "a\tb"),
            ("null", "a\u{0000}b"),
            ("bell", "a\u{0007}b"),
            ("DEL", "a\u{007F}b"),
            ("C1", "a\u{0085}b"),
            ("line separator", "a\u{2028}b"),
            ("paragraph separator", "a\u{2029}b"),
        ] {
            assert!(
                matches!(validate_description(Some(s)), Err(DescriptionError::ForbiddenCharacter { .. })),
                "should refuse {name}"
            );
        }
    }

    #[test]
    fn direction_overrides_are_refused() {
        // These reorder what follows, which is how a stored description can render
        // as something other than itself on a financial document.
        for s in [
            "a\u{202A}b", "a\u{202B}b", "a\u{202C}b", "a\u{202D}b", "a\u{202E}b",
            "a\u{2066}b", "a\u{2067}b", "a\u{2068}b", "a\u{2069}b",
        ] {
            assert!(
                matches!(validate_description(Some(s)), Err(DescriptionError::ForbiddenCharacter { .. })),
                "should refuse override in {s:?}"
            );
        }
    }

    #[test]
    fn direction_marks_are_allowed_because_they_hint_rather_than_override() {
        // Refusing these would penalise Arabic and Hebrew text without stopping any
        // attack the override ranges do not already stop.
        for s in ["a\u{200E}b", "a\u{200F}b", "a\u{061C}b", "\u{200F}دفع 100"] {
            assert!(validate_description(Some(s)).is_ok(), "should accept {s:?}");
        }
    }

    #[test]
    fn nothing_is_normalised_or_rewritten() {
        // Composed vs decomposed "ã" must both survive exactly as written: the
        // stored record has to be what the payer typed.
        let composed = "canção";
        let decomposed = "canc\u{0327}a\u{0303}o";
        assert!(validate_description(Some(composed)).is_ok());
        assert!(validate_description(Some(decomposed)).is_ok());
        assert_ne!(composed, decomposed, "precondition: distinct encodings");
    }
}
