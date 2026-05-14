use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::Money;

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

pub struct InitiatePaymentRequest {
    /// Our internal reference for this payment attempt (acquiring_payment.id as string).
    pub internal_ref: String,
    pub amount:       Money,
    pub description:  Option<String>,
}

/// What the provider returns when a payment is successfully initiated.
pub struct ExternalPaymentRef {
    /// Provider-assigned reference stored in acquiring_payments.external_ref.
    pub external_ref:  String,
    pub instructions:  PaymentInstructions,
    pub expires_at:    DateTime<Utc>,
}

/// Step-by-step instructions shown to the customer so they can complete payment.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PaymentInstructions {
    /// Payment method identifier. E.g. "MULTICAIXA_EXPRESS".
    pub method:    String,
    /// Merchant entity number registered with the provider. E.g. "11333".
    pub entity:    String,
    /// The reference the customer enters in their app / at the ATM.
    pub reference: String,
}

/// Decoded content of a valid inbound provider callback.
pub struct PaymentConfirmation {
    pub external_ref:     String,
    pub idempotency_key:  String,
    pub amount_minor:     i64,
    pub currency:         String,
    pub confirmed_at:     DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum AcquirerError {
    #[error("invalid callback signature")]
    InvalidSignature,

    #[error("malformed callback payload: {0}")]
    MalformedPayload(String),

    #[error("provider error: {0}")]
    Provider(String),
}

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait AcquirerProvider: Send + Sync {
    fn provider_name(&self) -> &'static str;

    /// Initiate an outbound payment request with the external provider.
    /// Returns the external reference + customer instructions.
    async fn initiate_payment(
        &self,
        req: InitiatePaymentRequest,
    ) -> Result<ExternalPaymentRef, AcquirerError>;

    /// Validate an inbound provider callback and extract the payment confirmation.
    /// Performs signature verification — returns `InvalidSignature` if tampered.
    async fn validate_callback(
        &self,
        raw_body:  &[u8],
        signature: &str,
    ) -> Result<PaymentConfirmation, AcquirerError>;

    /// Generate a signed test callback payload (development / simulation only).
    /// Real providers return `None` — only `SimulatedProvider` implements this.
    fn generate_test_callback(
        &self,
        external_ref:  &str,
        amount_minor:  i64,
        currency:      &str,
    ) -> Option<(Vec<u8>, String)> {
        let _ = (external_ref, amount_minor, currency);
        None
    }
}
