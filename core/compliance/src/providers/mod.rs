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

#[cfg(test)]
mod contract_tests {
    //! Vendor-agnostic contract tests for the `KycProvider` seam. They lock the
    //! behaviour a future real adapter must satisfy, prove the external provider
    //! is unmistakably unconfigured until wired, and confirm the simulated
    //! provider is a development-only default.
    use super::{ExternalKycProvider, KycProviderKind, SimulatedKycProvider};
    use crate::provider::{
        CustomerVerificationRequest, IdDocumentType, KycProvider, KycProviderError,
        MerchantVerificationRequest, VerificationDecision,
    };
    use crate::KycLevel;
    use banzami_types::{CustomerId, MerchantId};

    fn customer_req() -> CustomerVerificationRequest {
        CustomerVerificationRequest {
            customer_id: CustomerId::new(),
            full_name: "Test User".into(),
            document_type: IdDocumentType::BilheteDeIdentidade,
            document_number: "006887496LA042".into(),
            date_of_birth: "1990-01-01".parse().unwrap(),
            requested_level: KycLevel::Basic,
        }
    }

    fn merchant_req() -> MerchantVerificationRequest {
        MerchantVerificationRequest {
            merchant_id: MerchantId::new(),
            legal_name: "Test Comércio, Lda".into(),
            tax_id: "5000000000".into(),
            representative_name: "Representante Legal".into(),
        }
    }

    // The simulated provider satisfies the trait contract for dev/sandbox: it
    // returns a well-formed outcome with a non-empty provider reference.
    #[tokio::test]
    async fn simulated_satisfies_contract_for_dev() {
        let p = SimulatedKycProvider::new();
        assert_eq!(
            p.provider_name(),
            "SIMULATED_KYC",
            "simulated is clearly labelled"
        );
        let out = p
            .verify_customer(customer_req())
            .await
            .expect("simulated decides");
        assert!(matches!(
            out.decision,
            VerificationDecision::Approved
                | VerificationDecision::Rejected
                | VerificationDecision::PendingReview
        ));
        assert!(
            !out.provider_reference.is_empty(),
            "stable shape: provider_reference present"
        );
        assert!(out.granted_level <= KycLevel::Full);
    }

    // The external provider is wired but unconfigured: every call returns a
    // Provider error (never a silent approval).
    #[tokio::test]
    async fn external_returns_not_configured() {
        let p = ExternalKycProvider::new("https://example.test", "test-key");
        assert_eq!(p.provider_name(), "EXTERNAL_KYC");
        assert!(matches!(
            p.verify_customer(customer_req()).await,
            Err(KycProviderError::Provider(_))
        ));
        assert!(matches!(
            p.verify_merchant(merchant_req()).await,
            Err(KycProviderError::Provider(_))
        ));
    }

    // Without KYC_API_BASE / KYC_API_KEY the external provider cannot be built —
    // it can never be accidentally "configured" with no credentials.
    #[test]
    fn external_from_env_is_none_without_keys() {
        if std::env::var("KYC_API_BASE").is_err() && std::env::var("KYC_API_KEY").is_err() {
            assert!(ExternalKycProvider::from_env().is_none());
        }
    }

    // Provider selection defaults to the development-only simulated provider when
    // KYC_PROVIDER is not explicitly EXTERNAL.
    #[test]
    fn selection_defaults_to_simulated() {
        if std::env::var("KYC_PROVIDER").as_deref() != Ok("EXTERNAL") {
            assert!(matches!(
                KycProviderKind::from_env(),
                KycProviderKind::Simulated(_)
            ));
        }
    }
}
