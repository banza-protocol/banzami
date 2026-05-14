/// Generates a strongly-typed UUID wrapper to prevent ID confusion across domains.
///
/// Usage:  `typed_id!(WalletId);`
///
/// The generated type:
/// - wraps `uuid::Uuid` in a newtype,
/// - derives Serialize/Deserialize as the raw UUID,
/// - implements `Display`, `FromStr`, `Default` (generates a new v4 UUID),
/// - implements `Debug`, `Clone`, `Copy`, `PartialEq`, `Eq`, `Hash`.
#[macro_export]
macro_rules! typed_id {
    ($name:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
        #[derive(serde::Serialize, serde::Deserialize)]
        #[serde(transparent)]
        pub struct $name(uuid::Uuid);

        impl $name {
            pub fn new() -> Self {
                Self(uuid::Uuid::new_v4())
            }

            pub fn from_uuid(id: uuid::Uuid) -> Self {
                Self(id)
            }

            pub fn as_uuid(self) -> uuid::Uuid {
                self.0
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "{}", self.0)
            }
        }

        impl std::str::FromStr for $name {
            type Err = uuid::Error;
            fn from_str(s: &str) -> Result<Self, Self::Err> {
                uuid::Uuid::parse_str(s).map(Self)
            }
        }
    };
}

// ---------------------------------------------------------------------------
// Domain ID types — all strongly typed; mixing them is a compile error.
// ---------------------------------------------------------------------------

typed_id!(AccountId);         // Ledger account
typed_id!(LedgerEntryId);     // Individual debit/credit line
typed_id!(LedgerPostingId);   // A balanced set of entries (journal entry)
typed_id!(WalletId);
typed_id!(TransactionId);
typed_id!(SettlementId);
typed_id!(PayoutId);
typed_id!(MerchantId);
typed_id!(CustomerId);
typed_id!(IdempotencyKeyId);
typed_id!(ApiKeyId);
typed_id!(ReconciliationRunId);

// ---------------------------------------------------------------------------
// Consumer / P2P domains
// ---------------------------------------------------------------------------

typed_id!(ConsumerId);         // Consumer identity (end-user)
typed_id!(ConsumerWalletId);   // Consumer wallet (distinct from merchant WalletId)
typed_id!(TransferId);         // Instant P2P wallet transfer
typed_id!(QrCodeId);             // Static or dynamic QR code
typed_id!(PaymentLinkId);        // Shareable payment link
typed_id!(AcquiringPaymentId);   // External payment via acquirer (EMIS, bank, etc.)
