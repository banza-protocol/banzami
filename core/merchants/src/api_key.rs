use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};

use banzami_types::{ApiKeyId, MerchantId};

/// Whether a key grants access to live or sandbox payment data.
/// LIVE keys carry the prefix "bz_live_"; SANDBOX keys carry "bz_test_".
/// These two environments MUST NEVER share financial data.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
pub enum ApiKeyEnvironment {
    #[serde(rename = "LIVE")]
    Live,
    #[serde(rename = "SANDBOX")]
    Sandbox,
}

impl ApiKeyEnvironment {
    pub fn as_str(&self) -> &'static str {
        match self {
            ApiKeyEnvironment::Live    => "LIVE",
            ApiKeyEnvironment::Sandbox => "SANDBOX",
        }
    }

    fn key_secret_prefix(&self) -> &'static str {
        match self {
            ApiKeyEnvironment::Live    => "bz_live_",
            ApiKeyEnvironment::Sandbox => "bz_test_",
        }
    }
}

impl Default for ApiKeyEnvironment {
    fn default() -> Self { ApiKeyEnvironment::Live }
}

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
    /// "LIVE" or "SANDBOX" — determines which payment data universe this key accesses.
    pub environment:  ApiKeyEnvironment,
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
#[derive(serde::Serialize)]
pub struct ApiKeySecret {
    pub key:    ApiKey,
    pub secret: String,
}

// ---------------------------------------------------------------------------
// Key generation and hashing
// ---------------------------------------------------------------------------

/// Generates a raw API key for the given environment.
/// Format: `<prefix><uuid1><uuid2>` — 256 bits of entropy from OS CSPRNG.
/// Both "bz_live_" and "bz_test_" prefixes are 8 chars, so display prefix
/// extraction is uniform regardless of environment.
pub(crate) fn generate_raw_key(env: ApiKeyEnvironment) -> String {
    let a = uuid::Uuid::new_v4().simple().to_string();
    let b = uuid::Uuid::new_v4().simple().to_string();
    format!("{}{}{}", env.key_secret_prefix(), a, b)
}

/// Returns the first 8 hex chars after the environment prefix.
pub(crate) fn key_prefix(raw: &str) -> String {
    // Both "bz_live_" and "bz_test_" are 8 chars; take the next 8.
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
