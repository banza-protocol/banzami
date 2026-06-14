//! Real external KYC/KYB vendor integration — production stub.
//!
//! Mirrors `banzami-acquiring`'s `EMISProvider`: the integration seam exists and
//! is selected with `KYC_PROVIDER=EXTERNAL`, but the live vendor call is not yet
//! wired. Until a verification vendor contract is in place, every call returns a
//! `Provider` error directing development to the simulated provider. This keeps
//! the production path explicit and unmistakably unconfigured rather than
//! silently approving identities.

use crate::provider::{
    CustomerVerificationRequest, KycProvider, KycProviderError, MerchantVerificationRequest,
    VerificationOutcome,
};

pub struct ExternalKycProvider {
    _api_base: String,
    _api_key: String,
}

impl ExternalKycProvider {
    pub fn new(api_base: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            _api_base: api_base.into(),
            _api_key: api_key.into(),
        }
    }

    /// Build from `KYC_API_BASE` / `KYC_API_KEY`. Returns `None` if either is unset.
    pub fn from_env() -> Option<Self> {
        let api_base = std::env::var("KYC_API_BASE").ok()?;
        let api_key = std::env::var("KYC_API_KEY").ok()?;
        Some(Self::new(api_base, api_key))
    }
}

const NOT_CONFIGURED: &str =
    "external KYC provider not yet configured — set KYC_PROVIDER=SIMULATED for development";

impl KycProvider for ExternalKycProvider {
    fn provider_name(&self) -> &'static str {
        "EXTERNAL_KYC"
    }

    async fn verify_customer(
        &self,
        _req: CustomerVerificationRequest,
    ) -> Result<VerificationOutcome, KycProviderError> {
        Err(KycProviderError::Provider(NOT_CONFIGURED.into()))
    }

    async fn verify_merchant(
        &self,
        _req: MerchantVerificationRequest,
    ) -> Result<VerificationOutcome, KycProviderError> {
        Err(KycProviderError::Provider(NOT_CONFIGURED.into()))
    }
}
