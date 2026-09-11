pub mod emis;
pub mod simulated;

pub use emis::EMISProvider;
pub use simulated::SimulatedProvider;

use hmac::{Hmac, Mac};
use sha2::Sha256;

/// `signature` is `sha256=<hex HMAC-SHA256 of body under secret>`. Compared in
/// constant time (Mac::verify_slice): a byte-by-byte `!=` answers how many
/// leading bytes of a forged signature were right.
pub(crate) fn signature_is_valid(secret: &[u8], body: &[u8], signature: &str) -> bool {
    let Some(tag) = signature.strip_prefix("sha256=").and_then(|h| hex::decode(h).ok()) else {
        return false;
    };
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(body);
    mac.verify_slice(&tag).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sign(secret: &[u8], body: &[u8]) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(secret).unwrap();
        mac.update(body);
        format!("sha256={}", hex::encode(mac.finalize().into_bytes()))
    }

    #[test]
    fn only_the_secret_signs_a_callback() {
        let body = br#"{"reference":"123456789","amount_minor":100}"#;
        assert!(signature_is_valid(b"s3cret", body, &sign(b"s3cret", body)));
        // The value that was the source default: it signs nothing.
        assert!(!signature_is_valid(b"s3cret", body, &sign(b"change-in-production", body)));
        // Another body, a truncated tag, no prefix, not hex, empty.
        assert!(!signature_is_valid(b"s3cret", b"{}", &sign(b"s3cret", body)));
        let good = sign(b"s3cret", body);
        assert!(!signature_is_valid(b"s3cret", body, &good[..good.len() - 2]));
        assert!(!signature_is_valid(b"s3cret", body, good.trim_start_matches("sha256=")));
        assert!(!signature_is_valid(b"s3cret", body, "sha256=zz"));
        assert!(!signature_is_valid(b"s3cret", body, ""));
    }
}
