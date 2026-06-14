//! Deterministic KYC/KYB provider for local development and sandbox.
//!
//! Mirrors `banzami-acquiring`'s `SimulatedProvider`: it performs realistic
//! structural validation and returns a deterministic decision so the sandbox can
//! exercise approval, rejection, and manual-review paths without a real vendor.
//!
//! Decision rules (so sandbox callers can force each branch):
//!   - name or document/tax id containing `REJECT` → `Rejected`
//!   - name or document/tax id containing `REVIEW` → `PendingReview`
//!   - an all-zero document/tax id              → `Rejected`
//!   - otherwise                                → `Approved`
//!
//! On approval, a consumer is granted the requested level capped at `Enhanced`:
//! a simulated provider can verify a document but cannot establish the
//! proof-of-address + face match that `Full` requires, so `Full` is routed to
//! manual review.

use sha2::{Digest, Sha256};

use crate::{
    provider::{
        CustomerVerificationRequest, KycProvider, KycProviderError, MerchantVerificationRequest,
        VerificationDecision, VerificationOutcome,
    },
    KycLevel,
};

pub struct SimulatedKycProvider;

impl SimulatedKycProvider {
    pub fn new() -> Self {
        Self
    }

    /// Deterministic, opaque reference derived from the verification subject.
    fn reference(subject: &str, document: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(subject.as_bytes());
        hasher.update(b"|");
        hasher.update(document.as_bytes());
        format!("sim_kyc_{}", hex::encode(&hasher.finalize()[..8]))
    }

    fn classify(fields: &[&str]) -> Option<(VerificationDecision, &'static str)> {
        let upper: String = fields.join(" ").to_uppercase();
        if upper.contains("REJECT") {
            Some((VerificationDecision::Rejected, "document failed verification"))
        } else if upper.contains("REVIEW") {
            Some((
                VerificationDecision::PendingReview,
                "routed to manual review",
            ))
        } else {
            None
        }
    }
}

impl Default for SimulatedKycProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl KycProvider for SimulatedKycProvider {
    fn provider_name(&self) -> &'static str {
        "SIMULATED_KYC"
    }

    async fn verify_customer(
        &self,
        req: CustomerVerificationRequest,
    ) -> Result<VerificationOutcome, KycProviderError> {
        let name = req.full_name.trim();
        let doc = req.document_number.trim();

        if name.is_empty() {
            return Err(KycProviderError::InvalidDocument("empty full name".into()));
        }
        if doc.len() < 6 {
            return Err(KycProviderError::InvalidDocument(
                "document number too short".into(),
            ));
        }

        let reference = Self::reference(&req.customer_id.as_uuid().to_string(), doc);

        // Forced branches for sandbox testing.
        if doc.chars().all(|c| c == '0') {
            return Ok(VerificationOutcome {
                decision: VerificationDecision::Rejected,
                granted_level: KycLevel::None,
                provider_reference: reference,
                reason: Some("invalid document number".into()),
            });
        }
        if let Some((decision, reason)) = Self::classify(&[name, doc]) {
            return Ok(VerificationOutcome {
                decision,
                granted_level: KycLevel::None,
                provider_reference: reference,
                reason: Some(reason.into()),
            });
        }

        // Approve, but a simulated check cannot establish a FULL-level identity.
        if req.requested_level == KycLevel::Full {
            return Ok(VerificationOutcome {
                decision: VerificationDecision::PendingReview,
                granted_level: KycLevel::Enhanced,
                provider_reference: reference,
                reason: Some("FULL level requires manual proof-of-address + face match".into()),
            });
        }

        let granted = match req.requested_level {
            KycLevel::None => KycLevel::Basic,
            other => other,
        };

        tracing::info!(
            provider = "SIMULATED_KYC",
            customer = %req.customer_id.as_uuid(),
            level = granted.as_str(),
            "simulated: customer KYC approved"
        );

        Ok(VerificationOutcome {
            decision: VerificationDecision::Approved,
            granted_level: granted,
            provider_reference: reference,
            reason: None,
        })
    }

    async fn verify_merchant(
        &self,
        req: MerchantVerificationRequest,
    ) -> Result<VerificationOutcome, KycProviderError> {
        let name = req.legal_name.trim();
        let nif = req.tax_id.trim();

        if name.is_empty() {
            return Err(KycProviderError::InvalidDocument(
                "empty legal name".into(),
            ));
        }
        if nif.len() < 6 {
            return Err(KycProviderError::InvalidDocument("NIF too short".into()));
        }

        let reference = Self::reference(&req.merchant_id.as_uuid().to_string(), nif);

        if nif.chars().all(|c| c == '0') {
            return Ok(VerificationOutcome {
                decision: VerificationDecision::Rejected,
                granted_level: KycLevel::None,
                provider_reference: reference,
                reason: Some("invalid NIF".into()),
            });
        }
        if let Some((decision, reason)) = Self::classify(&[name, nif, &req.representative_name]) {
            return Ok(VerificationOutcome {
                decision,
                granted_level: KycLevel::None,
                provider_reference: reference,
                reason: Some(reason.into()),
            });
        }

        tracing::info!(
            provider = "SIMULATED_KYC",
            merchant = %req.merchant_id.as_uuid(),
            "simulated: merchant KYB approved"
        );

        Ok(VerificationOutcome {
            decision: VerificationDecision::Approved,
            granted_level: KycLevel::None,
            provider_reference: reference,
            reason: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use banzami_types::{CustomerId, MerchantId};

    use super::*;
    use crate::provider::{
        CustomerVerificationRequest, IdDocumentType, MerchantVerificationRequest,
    };

    fn customer_req(name: &str, doc: &str, level: KycLevel) -> CustomerVerificationRequest {
        CustomerVerificationRequest {
            customer_id: CustomerId::new(),
            full_name: name.into(),
            document_type: IdDocumentType::BilheteDeIdentidade,
            document_number: doc.into(),
            date_of_birth: NaiveDate::from_ymd_opt(1990, 1, 1).unwrap(),
            requested_level: level,
        }
    }

    fn merchant_req(name: &str, nif: &str) -> MerchantVerificationRequest {
        MerchantVerificationRequest {
            merchant_id: MerchantId::new(),
            legal_name: name.into(),
            tax_id: nif.into(),
            representative_name: "Ana Silva".into(),
        }
    }

    #[tokio::test]
    async fn approves_valid_customer_at_requested_level() {
        let p = SimulatedKycProvider::new();
        let out = p
            .verify_customer(customer_req("João Manuel", "006887496LA042", KycLevel::Enhanced))
            .await
            .unwrap();
        assert_eq!(out.decision, VerificationDecision::Approved);
        assert_eq!(out.granted_level, KycLevel::Enhanced);
        assert!(out.provider_reference.starts_with("sim_kyc_"));
    }

    #[tokio::test]
    async fn none_request_is_granted_basic() {
        let p = SimulatedKycProvider::new();
        let out = p
            .verify_customer(customer_req("Maria", "006887496LA042", KycLevel::None))
            .await
            .unwrap();
        assert_eq!(out.decision, VerificationDecision::Approved);
        assert_eq!(out.granted_level, KycLevel::Basic);
    }

    #[tokio::test]
    async fn full_level_routes_to_manual_review() {
        let p = SimulatedKycProvider::new();
        let out = p
            .verify_customer(customer_req("João", "006887496LA042", KycLevel::Full))
            .await
            .unwrap();
        assert_eq!(out.decision, VerificationDecision::PendingReview);
    }

    #[tokio::test]
    async fn reject_keyword_rejects() {
        let p = SimulatedKycProvider::new();
        let out = p
            .verify_customer(customer_req("REJECT ME", "006887496LA042", KycLevel::Basic))
            .await
            .unwrap();
        assert_eq!(out.decision, VerificationDecision::Rejected);
    }

    #[tokio::test]
    async fn review_keyword_routes_to_review() {
        let p = SimulatedKycProvider::new();
        let out = p
            .verify_customer(customer_req("REVIEW ME", "006887496LA042", KycLevel::Basic))
            .await
            .unwrap();
        assert_eq!(out.decision, VerificationDecision::PendingReview);
    }

    #[tokio::test]
    async fn all_zero_document_rejected() {
        let p = SimulatedKycProvider::new();
        let out = p
            .verify_customer(customer_req("João", "000000000", KycLevel::Basic))
            .await
            .unwrap();
        assert_eq!(out.decision, VerificationDecision::Rejected);
    }

    #[tokio::test]
    async fn short_document_is_invalid() {
        let p = SimulatedKycProvider::new();
        let err = p
            .verify_customer(customer_req("João", "123", KycLevel::Basic))
            .await
            .unwrap_err();
        assert!(matches!(err, KycProviderError::InvalidDocument(_)));
    }

    #[tokio::test]
    async fn reference_is_deterministic() {
        let p = SimulatedKycProvider::new();
        let req = customer_req("João", "006887496LA042", KycLevel::Basic);
        let a = p.verify_customer(req.clone()).await.unwrap();
        let b = p.verify_customer(req).await.unwrap();
        assert_eq!(a.provider_reference, b.provider_reference);
    }

    #[tokio::test]
    async fn approves_valid_merchant() {
        let p = SimulatedKycProvider::new();
        let out = p
            .verify_merchant(merchant_req("Cantina Boa Vista, Lda", "5417000000"))
            .await
            .unwrap();
        assert_eq!(out.decision, VerificationDecision::Approved);
    }

    #[tokio::test]
    async fn rejects_merchant_with_reject_keyword() {
        let p = SimulatedKycProvider::new();
        let out = p
            .verify_merchant(merchant_req("REJECT Lda", "5417000000"))
            .await
            .unwrap();
        assert_eq!(out.decision, VerificationDecision::Rejected);
    }
}
