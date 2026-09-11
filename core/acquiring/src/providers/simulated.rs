//! Simulated Multicaixa Express provider for local development and testing.
//!
//! Generates realistic entity + reference numbers and uses HMAC-SHA256 with the
//! configured webhook secret to sign callbacks — the exact same validation path
//! as the real EMIS provider.  To trigger a simulated payment confirmation, call
//! `POST /internal/v1/acquiring/test/confirm?ref={external_ref}` on the core-api.

use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::provider::{
    AcquirerError, AcquirerProvider, ExternalPaymentRef, InitiatePaymentRequest,
    PaymentConfirmation, PaymentInstructions,
};

type HmacSha256 = Hmac<Sha256>;

/// Fake merchant entity registered with the simulated EMIS network.
const SIMULATED_ENTITY: &str = "11333";

pub struct SimulatedProvider {
    webhook_secret: Vec<u8>,
}

impl SimulatedProvider {
    pub fn new(webhook_secret: impl Into<Vec<u8>>) -> Self {
        Self {
            webhook_secret: webhook_secret.into(),
        }
    }

    fn sign(&self, body: &[u8]) -> String {
        let mut mac =
            HmacSha256::new_from_slice(&self.webhook_secret).expect("HMAC accepts any key length");
        mac.update(body);
        format!("sha256={}", hex::encode(mac.finalize().into_bytes()))
    }
}

impl AcquirerProvider for SimulatedProvider {
    fn provider_name(&self) -> &'static str {
        "EMIS_MULTICAIXA_SIMULATED"
    }

    async fn initiate_payment(
        &self,
        req: InitiatePaymentRequest,
    ) -> Result<ExternalPaymentRef, AcquirerError> {
        // Generate a 9-digit Multicaixa reference from the internal_ref UUID.
        // Using the UUID ensures determinism within a session while being unique.
        let reference = format!("{:09}", uuid::Uuid::new_v4().as_u128() % 1_000_000_000u128);

        tracing::info!(
            internal_ref = %req.internal_ref,
            entity        = SIMULATED_ENTITY,
            reference     = %reference,
            amount_minor  = req.amount.amount_minor(),
            "simulated: initiated payment"
        );

        Ok(ExternalPaymentRef {
            external_ref: reference.clone(),
            instructions: PaymentInstructions {
                method: "MULTICAIXA_EXPRESS".into(),
                entity: SIMULATED_ENTITY.into(),
                reference,
            },
            expires_at: Utc::now() + chrono::Duration::minutes(15),
        })
    }

    async fn validate_callback(
        &self,
        raw_body: &[u8],
        signature: &str,
    ) -> Result<PaymentConfirmation, AcquirerError> {
        // Never log the expected signature: it is a valid signature for this
        // body, handed to whoever reads the logs.
        if !super::signature_is_valid(&self.webhook_secret, raw_body, signature) {
            tracing::warn!("simulated: invalid callback signature");
            return Err(AcquirerError::InvalidSignature);
        }

        let payload: serde_json::Value = serde_json::from_slice(raw_body)
            .map_err(|e| AcquirerError::MalformedPayload(e.to_string()))?;

        let external_ref = payload["reference"]
            .as_str()
            .ok_or_else(|| AcquirerError::MalformedPayload("missing reference".into()))?
            .to_string();

        let idempotency_key = payload["idempotency_key"]
            .as_str()
            .ok_or_else(|| AcquirerError::MalformedPayload("missing idempotency_key".into()))?
            .to_string();

        let amount_minor = payload["amount_minor"]
            .as_i64()
            .ok_or_else(|| AcquirerError::MalformedPayload("missing amount_minor".into()))?;

        let currency = payload["currency"].as_str().unwrap_or("AOA").to_string();

        let confirmed_at = payload["confirmed_at"]
            .as_str()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        tracing::info!(external_ref = %external_ref, "simulated: validated callback");

        Ok(PaymentConfirmation {
            external_ref,
            idempotency_key,
            amount_minor,
            currency,
            confirmed_at,
        })
    }

    fn generate_test_callback(
        &self,
        external_ref: &str,
        amount_minor: i64,
        currency: &str,
    ) -> Option<(Vec<u8>, String)> {
        let payload = serde_json::json!({
            "event_type":      "PAYMENT_CONFIRMED",
            "provider":        "EMIS_MULTICAIXA_SIMULATED",
            "idempotency_key": uuid::Uuid::new_v4().to_string(),
            "entity":          SIMULATED_ENTITY,
            "reference":       external_ref,
            "amount_minor":    amount_minor,
            "currency":        currency,
            "transaction_id":  format!("SIM-TXN-{}", uuid::Uuid::new_v4()),
            "confirmed_at":    Utc::now().to_rfc3339(),
        });

        let body = serde_json::to_vec(&payload).expect("JSON serialisation cannot fail");
        let signature = self.sign(&body);
        Some((body, signature))
    }
}
