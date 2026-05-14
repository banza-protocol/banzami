//! Real EMIS Multicaixa Express provider.
//!
//! This module implements the `AcquirerProvider` trait for production use against
//! the EMIS banking network.  EMIS API credentials are supplied via environment
//! variables:
//!
//! | Variable                  | Description                               |
//! |---------------------------|-------------------------------------------|
//! | `EMIS_API_URL`            | EMIS API base URL                         |
//! | `EMIS_API_KEY`            | Merchant API key issued by EMIS           |
//! | `EMIS_ENTITY`             | 5-digit merchant entity number            |
//! | `ACQUIRING_WEBHOOK_SECRET`| Shared secret for callback HMAC-SHA256    |
//!
//! # Status
//!
//! The HMAC validation logic is production-ready.  The `initiate_payment` HTTP
//! call is stubbed with a clear TODO — it will be wired once the EMIS API
//! contract and sandbox credentials are available.

use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::provider::{
    AcquirerError, AcquirerProvider, ExternalPaymentRef, InitiatePaymentRequest,
    PaymentConfirmation,
};

type HmacSha256 = Hmac<Sha256>;

pub struct EMISProvider {
    api_url:        String,
    api_key:        String,
    entity:         String,
    webhook_secret: Vec<u8>,
}

impl EMISProvider {
    pub fn new(
        api_url:        impl Into<String>,
        api_key:        impl Into<String>,
        entity:         impl Into<String>,
        webhook_secret: impl Into<Vec<u8>>,
    ) -> Self {
        Self {
            api_url:        api_url.into(),
            api_key:        api_key.into(),
            entity:         entity.into(),
            webhook_secret: webhook_secret.into(),
        }
    }

    fn sign(&self, body: &[u8]) -> String {
        let mut mac = HmacSha256::new_from_slice(&self.webhook_secret)
            .expect("HMAC accepts any key length");
        mac.update(body);
        format!("sha256={}", hex::encode(mac.finalize().into_bytes()))
    }
}

impl AcquirerProvider for EMISProvider {
    fn provider_name(&self) -> &'static str {
        "EMIS_MULTICAIXA"
    }

    async fn initiate_payment(
        &self,
        _req: InitiatePaymentRequest,
    ) -> Result<ExternalPaymentRef, AcquirerError> {
        // TODO: Implement real EMIS Multicaixa Express API call.
        //
        // Expected request (POST {api_url}/v1/pagamentos/referencias):
        //   Authorization: Bearer {api_key}
        //   Content-Type: application/json
        //   { "entidade": "{entity}", "montante": {amount_minor},
        //     "moeda": "{currency}", "referencia_interna": "{internal_ref}" }
        //
        // Expected response:
        //   { "referencia": "963456789", "validade": "2024-01-15T15:00:00Z" }
        //
        // Requires: EMIS sandbox credentials + confirmed API contract.
        Err(AcquirerError::Provider(
            "EMIS provider not yet configured — set ACQUIRING_PROVIDER=SIMULATED for development"
                .into(),
        ))
    }

    async fn validate_callback(
        &self,
        raw_body:  &[u8],
        signature: &str,
    ) -> Result<PaymentConfirmation, AcquirerError> {
        // HMAC-SHA256 validation — same as SimulatedProvider.
        let expected = self.sign(raw_body);
        if signature != expected {
            tracing::warn!(received = %signature, "EMIS: invalid callback signature");
            return Err(AcquirerError::InvalidSignature);
        }

        let payload: serde_json::Value = serde_json::from_slice(raw_body)
            .map_err(|e| AcquirerError::MalformedPayload(e.to_string()))?;

        // TODO: Map real EMIS callback field names once API contract is confirmed.
        // Current mapping assumes field names matching the simulated provider.
        let external_ref = payload["referencia"]
            .as_str()
            .or_else(|| payload["reference"].as_str())
            .ok_or_else(|| AcquirerError::MalformedPayload("missing referencia".into()))?
            .to_string();

        let idempotency_key = payload["idempotency_key"]
            .as_str()
            .unwrap_or(&uuid::Uuid::new_v4().to_string())
            .to_string();

        let amount_minor = payload["montante"]
            .as_i64()
            .or_else(|| payload["amount_minor"].as_i64())
            .ok_or_else(|| AcquirerError::MalformedPayload("missing montante".into()))?;

        Ok(PaymentConfirmation {
            external_ref,
            idempotency_key,
            amount_minor,
            currency: "AOA".to_string(),
            confirmed_at: Utc::now(),
        })
    }
}

impl EMISProvider {
    pub fn from_env() -> Option<Self> {
        let api_url        = std::env::var("EMIS_API_URL").ok()?;
        let api_key        = std::env::var("EMIS_API_KEY").ok()?;
        let entity         = std::env::var("EMIS_ENTITY").ok()?;
        let webhook_secret = std::env::var("ACQUIRING_WEBHOOK_SECRET")
            .unwrap_or_else(|_| "change-in-production".into())
            .into_bytes();
        Some(Self::new(api_url, api_key, entity, webhook_secret))
    }
}
