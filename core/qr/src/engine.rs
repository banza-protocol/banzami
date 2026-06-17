use base64::Engine as _;
use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::Sha256;

use banzami_types::QrCodeId;

use crate::{
    qr_code::{
        CreateDynamicQrRequest, CreateStaticQrRequest, ParsedQr, QrCode, QrCodeStatus, QrCodeType,
        QrOwnerType, ResolvedQrTarget,
    },
    repository::QrRepository,
    QrError,
};

type HmacSha256 = Hmac<Sha256>;

// ---------------------------------------------------------------------------
// Payload format
// ---------------------------------------------------------------------------
//
// The scannable string is a Base64url-encoded JSON object.
//
// Static QR:
//   {"t":"S","oid":"<uuid>","ot":"C"|"M","c":"AOA"}
//
// Dynamic QR:
//   {"t":"D","id":"<qr_code_id>","sig":"<hex_hmac>"}
//
// For dynamic QR, the HMAC covers:
//   "<qr_id>|<owner_id>|<amount_minor>|<currency>|<expires_at_unix_secs>"

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait QrEngine: Send + Sync {
    /// Create a reusable static QR code.
    async fn create_static(&self, req: CreateStaticQrRequest) -> Result<QrCode, QrError>;

    /// Create a one-time dynamic QR code with a pre-set amount and expiry.
    async fn create_dynamic(&self, req: CreateDynamicQrRequest) -> Result<QrCode, QrError>;

    /// Fetch a QR code record by ID.
    async fn get(&self, id: QrCodeId) -> Result<QrCode, QrError>;

    /// Generate the scannable payload string for a QR code record.
    fn encode(&self, qr: &QrCode) -> Result<String, QrError>;

    /// Decode and verify a scannable payload string.
    ///
    /// For dynamic QR, verifies the HMAC signature but does NOT check expiry
    /// or usage status (call `get()` for that).
    fn decode(&self, payload: &str) -> Result<ParsedQr, QrError>;

    /// Mark a dynamic QR code as used after a successful payment.
    async fn mark_used(&self, id: QrCodeId) -> Result<QrCode, QrError>;

    /// Resolve a scanned payload into an integrity-verified payment target.
    ///
    /// This is the single entry point the payment path must use. For dynamic QR
    /// it fetches the DB record, verifies the HMAC signature against it, and
    /// checks the code is `Active` and not expired — so a forged or tampered
    /// dynamic payload is rejected before any money moves. For static QR it
    /// returns the owner taken from the (signature-less) payload; the amount is
    /// supplied by the payer.
    async fn resolve_for_payment(&self, payload: &str) -> Result<ResolvedQrTarget, QrError>;
}

// ---------------------------------------------------------------------------
// Production implementation
// ---------------------------------------------------------------------------

pub struct PostgresQrEngine<R: QrRepository> {
    repo: R,
    signing_key: Vec<u8>,
}

impl<R: QrRepository> PostgresQrEngine<R> {
    /// `signing_key` should be a secret byte slice (e.g. from `QR_SIGNING_KEY` env var).
    pub fn new(repo: R, signing_key: Vec<u8>) -> Self {
        Self { repo, signing_key }
    }

    fn hmac_sign(&self, message: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(&self.signing_key)
            .expect("HMAC can take keys of any length");
        mac.update(message.as_bytes());
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    }

    fn hmac_verify(&self, message: &str, expected: &str) -> bool {
        let computed = self.hmac_sign(message);
        // Constant-time comparison.
        computed.len() == expected.len()
            && computed
                .bytes()
                .zip(expected.bytes())
                .fold(0u8, |acc, (a, b)| acc | (a ^ b))
                == 0
    }

    fn sign_message(qr: &QrCode) -> String {
        format!(
            "{}|{}|{}|{}|{}",
            qr.id,
            qr.owner_id,
            qr.amount_minor.unwrap_or(0),
            qr.currency.code(),
            qr.expires_at
                .map(|t| t.timestamp().to_string())
                .unwrap_or_default(),
        )
    }
}

impl<R: QrRepository> QrEngine for PostgresQrEngine<R> {
    async fn create_static(&self, req: CreateStaticQrRequest) -> Result<QrCode, QrError> {
        let qr = QrCode {
            id: QrCodeId::new(),
            owner_id: req.owner_id,
            owner_type: req.owner_type,
            qr_type: QrCodeType::Static,
            currency: req.currency,
            amount_minor: req.amount_minor,
            status: QrCodeStatus::Active,
            expires_at: None,
            used_at: None,
            reference: None,
            created_at: Utc::now(),
        };
        self.repo.create(qr).await
    }

    async fn create_dynamic(&self, req: CreateDynamicQrRequest) -> Result<QrCode, QrError> {
        if req.expires_at <= Utc::now() {
            return Err(QrError::AlreadyExpired);
        }
        let qr = QrCode {
            id: QrCodeId::new(),
            owner_id: req.owner_id,
            owner_type: req.owner_type,
            qr_type: QrCodeType::Dynamic,
            currency: req.currency,
            amount_minor: Some(req.amount_minor),
            status: QrCodeStatus::Active,
            expires_at: Some(req.expires_at),
            used_at: None,
            reference: req.reference,
            created_at: Utc::now(),
        };
        self.repo.create(qr).await
    }

    async fn get(&self, id: QrCodeId) -> Result<QrCode, QrError> {
        self.repo.get(id).await
    }

    fn encode(&self, qr: &QrCode) -> Result<String, QrError> {
        let payload = match qr.qr_type {
            QrCodeType::Static => {
                let ot = match qr.owner_type {
                    QrOwnerType::Consumer => "C",
                    QrOwnerType::Merchant => "M",
                };
                serde_json::json!({
                    "t":   "S",
                    "oid": qr.owner_id.to_string(),
                    "ot":  ot,
                    "c":   qr.currency.code(),
                })
            }
            QrCodeType::Dynamic => {
                let sig = self.hmac_sign(&Self::sign_message(qr));
                serde_json::json!({
                    "t":   "D",
                    "id":  qr.id.as_uuid().to_string(),
                    "sig": sig,
                })
            }
        };

        let json =
            serde_json::to_string(&payload).map_err(|e| QrError::EncodingError(e.to_string()))?;
        Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json.as_bytes()))
    }

    fn decode(&self, payload: &str) -> Result<ParsedQr, QrError> {
        let json_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(payload)
            .map_err(|_| QrError::InvalidPayload("invalid base64".into()))?;

        let v: serde_json::Value = serde_json::from_slice(&json_bytes)
            .map_err(|_| QrError::InvalidPayload("invalid JSON".into()))?;

        let t = v["t"]
            .as_str()
            .ok_or_else(|| QrError::InvalidPayload("missing 't'".into()))?;

        match t {
            "S" => {
                let oid_str = v["oid"]
                    .as_str()
                    .ok_or_else(|| QrError::InvalidPayload("missing 'oid'".into()))?;
                let oid: uuid::Uuid = oid_str
                    .parse()
                    .map_err(|_| QrError::InvalidPayload("invalid owner_id UUID".into()))?;

                let ot = match v["ot"].as_str() {
                    Some("C") => QrOwnerType::Consumer,
                    Some("M") => QrOwnerType::Merchant,
                    _ => return Err(QrError::InvalidPayload("invalid 'ot'".into())),
                };

                let currency_code = v["c"]
                    .as_str()
                    .ok_or_else(|| QrError::InvalidPayload("missing 'c'".into()))?;
                let currency = banzami_types::Currency::from_code(currency_code)
                    .ok_or_else(|| QrError::UnknownCurrency(currency_code.into()))?;

                Ok(ParsedQr {
                    qr_type: QrCodeType::Static,
                    owner_id: Some(oid),
                    owner_type: Some(ot),
                    currency: Some(currency),
                    qr_code_id: None,
                    signature: None,
                })
            }
            "D" => {
                let id_str = v["id"]
                    .as_str()
                    .ok_or_else(|| QrError::InvalidPayload("missing 'id'".into()))?;
                let qr_id: uuid::Uuid = id_str
                    .parse()
                    .map_err(|_| QrError::InvalidPayload("invalid qr_code_id UUID".into()))?;

                // For dynamic QR, full signature verification requires fetching the DB record
                // (to get amount, currency, expiry). We carry the signature through so the
                // payment path (`resolve_for_payment`) can verify it after `get()`.
                let sig = v["sig"]
                    .as_str()
                    .ok_or_else(|| QrError::InvalidPayload("missing 'sig'".into()))?;

                Ok(ParsedQr {
                    qr_type: QrCodeType::Dynamic,
                    owner_id: None,
                    owner_type: None,
                    currency: None,
                    qr_code_id: Some(QrCodeId::from_uuid(qr_id)),
                    signature: Some(sig.to_string()),
                })
            }
            _ => Err(QrError::InvalidPayload(format!("unknown QR type: {t}"))),
        }
    }

    async fn mark_used(&self, id: QrCodeId) -> Result<QrCode, QrError> {
        let qr = self.repo.get(id).await?;

        if qr.qr_type == QrCodeType::Static {
            return Err(QrError::CannotMarkStaticAsUsed);
        }
        if qr.status != QrCodeStatus::Active {
            return Err(QrError::AlreadyUsedOrExpired);
        }
        if let Some(exp) = qr.expires_at {
            if exp <= Utc::now() {
                return Err(QrError::AlreadyExpired);
            }
        }

        self.repo.update_status(id, QrCodeStatus::Used).await
    }

    async fn resolve_for_payment(&self, payload: &str) -> Result<ResolvedQrTarget, QrError> {
        let parsed = self.decode(payload)?;

        match parsed.qr_type {
            QrCodeType::Static => Ok(ResolvedQrTarget {
                qr_type: QrCodeType::Static,
                owner_id: parsed
                    .owner_id
                    .ok_or_else(|| QrError::InvalidPayload("static QR missing owner".into()))?,
                owner_type: parsed.owner_type.ok_or_else(|| {
                    QrError::InvalidPayload("static QR missing owner type".into())
                })?,
                currency: parsed
                    .currency
                    .ok_or_else(|| QrError::InvalidPayload("static QR missing currency".into()))?,
                amount_minor: None,
                qr_code_id: None,
            }),
            QrCodeType::Dynamic => {
                let qr_id = parsed
                    .qr_code_id
                    .ok_or_else(|| QrError::InvalidPayload("dynamic QR missing id".into()))?;
                let signature = parsed.signature.ok_or_else(|| {
                    QrError::InvalidPayload("dynamic QR missing signature".into())
                })?;

                // Fetch the authoritative record and verify the signature binds
                // this id to its owner/amount/currency/expiry. A forged or
                // tampered payload fails here before any money moves.
                let qr = self.repo.get(qr_id).await?;
                if !self.hmac_verify(&Self::sign_message(&qr), &signature) {
                    return Err(QrError::InvalidSignature);
                }
                if qr.status != QrCodeStatus::Active {
                    return Err(QrError::AlreadyUsedOrExpired);
                }
                if let Some(exp) = qr.expires_at {
                    if exp <= Utc::now() {
                        return Err(QrError::AlreadyExpired);
                    }
                }

                Ok(ResolvedQrTarget {
                    qr_type: QrCodeType::Dynamic,
                    owner_id: qr.owner_id,
                    owner_type: qr.owner_type,
                    currency: qr.currency,
                    amount_minor: qr.amount_minor,
                    qr_code_id: Some(qr.id),
                })
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use banzami_types::{Currency, QrCodeId};

    use super::*;
    use crate::{QrCode, QrCodeStatus, QrCodeType, QrError, QrOwnerType};

    struct MockRepo {
        codes: Mutex<Vec<QrCode>>,
    }

    impl MockRepo {
        fn new() -> Self {
            Self {
                codes: Mutex::new(vec![]),
            }
        }
    }

    impl QrRepository for MockRepo {
        async fn create(&self, qr: QrCode) -> Result<QrCode, QrError> {
            self.codes.lock().unwrap().push(qr.clone());
            Ok(qr)
        }

        async fn get(&self, id: QrCodeId) -> Result<QrCode, QrError> {
            self.codes
                .lock()
                .unwrap()
                .iter()
                .find(|q| q.id == id)
                .cloned()
                .ok_or(QrError::NotFound(id))
        }

        async fn update_status(
            &self,
            id: QrCodeId,
            status: QrCodeStatus,
        ) -> Result<QrCode, QrError> {
            let mut store = self.codes.lock().unwrap();
            let qr = store
                .iter_mut()
                .find(|q| q.id == id)
                .ok_or(QrError::NotFound(id))?;
            qr.status = status;
            Ok(qr.clone())
        }
    }

    fn engine() -> PostgresQrEngine<MockRepo> {
        PostgresQrEngine::new(MockRepo::new(), b"test-secret-key".to_vec())
    }

    #[tokio::test]
    async fn static_qr_encode_decode_roundtrip() {
        let eng = engine();
        let qr = eng
            .create_static(CreateStaticQrRequest {
                owner_id: uuid::Uuid::new_v4(),
                owner_type: QrOwnerType::Consumer,
                currency: Currency::AOA,
                amount_minor: None,
            })
            .await
            .unwrap();

        let encoded = eng.encode(&qr).unwrap();
        let decoded = eng.decode(&encoded).unwrap();

        assert_eq!(decoded.qr_type, QrCodeType::Static);
        assert_eq!(decoded.owner_id, Some(qr.owner_id));
    }

    #[tokio::test]
    async fn dynamic_qr_encode_decode_roundtrip() {
        let eng = engine();
        let future = Utc::now() + chrono::Duration::hours(1);
        let qr = eng
            .create_dynamic(CreateDynamicQrRequest {
                owner_id: uuid::Uuid::new_v4(),
                owner_type: QrOwnerType::Merchant,
                currency: Currency::AOA,
                amount_minor: 50_000,
                expires_at: future,
                reference: Some("order-123".into()),
            })
            .await
            .unwrap();

        let encoded = eng.encode(&qr).unwrap();
        let decoded = eng.decode(&encoded).unwrap();

        assert_eq!(decoded.qr_type, QrCodeType::Dynamic);
        assert_eq!(decoded.qr_code_id, Some(qr.id));
    }

    #[tokio::test]
    async fn mark_used_transitions_dynamic_qr() {
        let eng = engine();
        let future = Utc::now() + chrono::Duration::hours(1);
        let qr = eng
            .create_dynamic(CreateDynamicQrRequest {
                owner_id: uuid::Uuid::new_v4(),
                owner_type: QrOwnerType::Consumer,
                currency: Currency::AOA,
                amount_minor: 10_000,
                expires_at: future,
                reference: None,
            })
            .await
            .unwrap();

        let used = eng.mark_used(qr.id).await.unwrap();
        assert_eq!(used.status, QrCodeStatus::Used);
    }

    // --- resolve_for_payment: integrity-verified payment path -------------

    #[tokio::test]
    async fn resolve_static_returns_owner_and_no_amount() {
        let eng = engine();
        let owner = uuid::Uuid::new_v4();
        let qr = eng
            .create_static(CreateStaticQrRequest {
                owner_id: owner,
                owner_type: QrOwnerType::Merchant,
                currency: Currency::AOA,
                amount_minor: None,
            })
            .await
            .unwrap();
        let payload = eng.encode(&qr).unwrap();

        let target = eng.resolve_for_payment(&payload).await.unwrap();
        assert_eq!(target.qr_type, QrCodeType::Static);
        assert_eq!(target.owner_id, owner);
        assert_eq!(target.amount_minor, None); // payer enters the amount
        assert_eq!(target.qr_code_id, None);
    }

    #[tokio::test]
    async fn resolve_dynamic_returns_fixed_amount_and_id() {
        let eng = engine();
        let future = Utc::now() + chrono::Duration::hours(1);
        let qr = eng
            .create_dynamic(CreateDynamicQrRequest {
                owner_id: uuid::Uuid::new_v4(),
                owner_type: QrOwnerType::Merchant,
                currency: Currency::AOA,
                amount_minor: 75_000,
                expires_at: future,
                reference: None,
            })
            .await
            .unwrap();
        let payload = eng.encode(&qr).unwrap();

        let target = eng.resolve_for_payment(&payload).await.unwrap();
        assert_eq!(target.qr_type, QrCodeType::Dynamic);
        assert_eq!(target.amount_minor, Some(75_000)); // amount comes from the record
        assert_eq!(target.qr_code_id, Some(qr.id));
    }

    // INVARIANT: a dynamic payload whose signature does not match the record is
    // rejected — a forged/tampered QR must never resolve to a payment.
    #[tokio::test]
    async fn resolve_dynamic_rejects_tampered_signature() {
        let eng = engine();
        let future = Utc::now() + chrono::Duration::hours(1);
        let qr = eng
            .create_dynamic(CreateDynamicQrRequest {
                owner_id: uuid::Uuid::new_v4(),
                owner_type: QrOwnerType::Merchant,
                currency: Currency::AOA,
                amount_minor: 50_000,
                expires_at: future,
                reference: None,
            })
            .await
            .unwrap();

        // Hand-craft a payload with a bogus signature for the real id.
        let forged = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(
            serde_json::json!({
                "t": "D",
                "id": qr.id.as_uuid().to_string(),
                "sig": "not-a-valid-signature",
            })
            .to_string()
            .as_bytes(),
        );

        let err = eng.resolve_for_payment(&forged).await.unwrap_err();
        assert!(matches!(err, QrError::InvalidSignature), "got {err:?}");
    }

    // INVARIANT: an already-used dynamic QR cannot resolve again (no double-spend).
    #[tokio::test]
    async fn resolve_dynamic_rejects_already_used() {
        let eng = engine();
        let future = Utc::now() + chrono::Duration::hours(1);
        let qr = eng
            .create_dynamic(CreateDynamicQrRequest {
                owner_id: uuid::Uuid::new_v4(),
                owner_type: QrOwnerType::Merchant,
                currency: Currency::AOA,
                amount_minor: 50_000,
                expires_at: future,
                reference: None,
            })
            .await
            .unwrap();
        let payload = eng.encode(&qr).unwrap();

        eng.mark_used(qr.id).await.unwrap();

        let err = eng.resolve_for_payment(&payload).await.unwrap_err();
        assert!(matches!(err, QrError::AlreadyUsedOrExpired), "got {err:?}");
    }

    #[tokio::test]
    async fn cannot_mark_static_qr_as_used() {
        let eng = engine();
        let qr = eng
            .create_static(CreateStaticQrRequest {
                owner_id: uuid::Uuid::new_v4(),
                owner_type: QrOwnerType::Merchant,
                currency: Currency::AOA,
                amount_minor: None,
            })
            .await
            .unwrap();

        let err = eng.mark_used(qr.id).await.unwrap_err();
        assert!(matches!(err, QrError::CannotMarkStaticAsUsed));
    }
}
