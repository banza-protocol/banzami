//! KYC/KYB provider implementations and static dispatch.

pub mod external;
pub mod simulated;

pub use external::ExternalKycProvider;
pub use simulated::SimulatedKycProvider;

use crate::provider::{
    CustomerVerificationRequest, KycProvider, KycProviderError, MerchantVerificationRequest,
    VerificationOutcome,
};

/// Statically-dispatched KYC provider.
///
/// The [`KycProvider`] trait uses `async fn`, so it cannot be a `dyn` trait
/// object. This enum is the single concrete type held by application state and
/// selected at startup — mirroring `banzami-acquiring`'s `AcquirerKind`.
pub enum KycProviderKind {
    Simulated(SimulatedKycProvider),
    External(ExternalKycProvider),
}

impl KycProviderKind {
    /// Build from the `KYC_PROVIDER` environment variable (default: `SIMULATED`).
    /// `KYC_PROVIDER=EXTERNAL` requires `KYC_API_BASE` and `KYC_API_KEY`.
    pub fn from_env() -> Self {
        match std::env::var("KYC_PROVIDER").as_deref() {
            Ok("EXTERNAL") => Self::External(
                ExternalKycProvider::from_env()
                    .expect("KYC_PROVIDER=EXTERNAL but KYC_API_BASE / KYC_API_KEY are missing"),
            ),
            _ => Self::Simulated(SimulatedKycProvider::new()),
        }
    }
}

impl KycProvider for KycProviderKind {
    fn provider_name(&self) -> &'static str {
        match self {
            Self::Simulated(p) => p.provider_name(),
            Self::External(p) => p.provider_name(),
        }
    }

    async fn verify_customer(
        &self,
        req: CustomerVerificationRequest,
    ) -> Result<VerificationOutcome, KycProviderError> {
        match self {
            Self::Simulated(p) => p.verify_customer(req).await,
            Self::External(p) => p.verify_customer(req).await,
        }
    }

    async fn verify_merchant(
        &self,
        req: MerchantVerificationRequest,
    ) -> Result<VerificationOutcome, KycProviderError> {
        match self {
            Self::Simulated(p) => p.verify_merchant(req).await,
            Self::External(p) => p.verify_merchant(req).await,
        }
    }
}
