use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};

use banzami_types::{ApiKeyId, MerchantId};

/// An API key record. `key_hash` is never returned to API consumers.
/// The raw secret is available only in [`ApiKeySecret`] at creation time.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ApiKey {
    pub id:           ApiKeyId,
    pub merchant_id:  MerchantId,
    pub name:         String,
    /// First 8 hex chars of the key body — safe to display for identification.
    pub key_prefix:   String,
    /// SHA-256 of the full raw key, hex-encoded.
    #[serde(skip_serializing)]
    pub key_hash:     String,
    pub created_at:   DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub revoked_at:   Option<DateTime<Utc>>,
}

impl ApiKey {
    pub fn is_active(&self) -> bool {
        self.revoked_at.is_none()
    }
}

/// Returned only at key creation — the raw secret is never stored and cannot
/// be recovered after this point.
pub struct ApiKeySecret {
    pub key:    ApiKey,
    pub secret: String,
}

// ---------------------------------------------------------------------------
// Key generation and hashing
// ---------------------------------------------------------------------------

/// Generates a new raw API key in the form `bz_live_<64 hex chars>`.
/// Uses two UUIDs v4 (OS CSPRNG) concatenated — 256 bits of entropy.
pub(crate) fn generate_raw_key() -> String {
    let a = uuid::Uuid::new_v4().simple().to_string();
    let b = uuid::Uuid::new_v4().simple().to_string();
    format!("bz_live_{a}{b}")
}

/// Returns the first 8 hex chars after the `bz_live_` prefix.
pub(crate) fn key_prefix(raw: &str) -> String {
    // "bz_live_" is 8 chars; take the next 8 for the display prefix.
    raw.get(8..16).unwrap_or("").to_owned()
}

/// SHA-256 of the raw key, hex-encoded.
pub(crate) fn hash_key(raw: &str) -> String {
    let bytes = Sha256::digest(raw.as_bytes());
    bytes.iter().fold(String::with_capacity(64), |mut s, b| {
        use std::fmt::Write;
        write!(s, "{b:02x}").unwrap();
        s
    })
}
