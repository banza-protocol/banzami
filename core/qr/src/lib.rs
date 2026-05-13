pub mod engine;
pub mod expiry_worker;
pub mod qr_code;
pub mod repository;

pub use engine::{PostgresQrEngine, QrEngine};
pub use qr_code::{
    CreateDynamicQrRequest, CreateStaticQrRequest, ParsedQr, QrCode, QrCodeStatus, QrCodeType,
    QrOwnerType,
};
pub use expiry_worker::run_expiry_worker;
pub use repository::{PostgresQrRepository, QrRepository};

use thiserror::Error;

use banzami_types::QrCodeId;

#[derive(Debug, Error)]
pub enum QrError {
    #[error("QR code {0} not found")]
    NotFound(QrCodeId),

    #[error("invalid QR payload: {0}")]
    InvalidPayload(String),

    #[error("invalid QR signature")]
    InvalidSignature,

    #[error("QR code has already expired")]
    AlreadyExpired,

    #[error("QR code has already been used or expired")]
    AlreadyUsedOrExpired,

    #[error("static QR codes cannot be marked as used")]
    CannotMarkStaticAsUsed,

    #[error("unknown currency: {0}")]
    UnknownCurrency(String),

    #[error("encoding error: {0}")]
    EncodingError(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
