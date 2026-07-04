//! Merchant-safe refundable-source discovery (Banzami operator extension).
//!
//! After a wallet-native payment settles, a merchant that took the money via a
//! Payment Session or Payment Link needs to know WHICH typed source to refund.
//! The session/link id is an *initiation handle*, not a refund source — the
//! refundable financial object is the `wallet_payments` row created when the
//! settling Transfer completed (BANZA ADR-030). This module resolves that row
//! and returns the PUBLIC typed-source pair the Refunds Gateway already accepts:
//!
//! ```json
//! { "source_type": "WALLET_PAYMENT", "source_id": "<wallet_payments.id>" }
//! ```
//!
//! Safety (exposure model — Option A, evidence-based):
//! * `wallet_payments.id` is a random `gen_random_uuid()` — non-enumerable;
//! * every resolver is MERCHANT-SCOPED — a source belonging to another merchant
//!   resolves to `None` (never leaks existence, mirrors the refund endpoint's
//!   indistinguishable-not-found);
//! * `source_id` is exactly the value the public typed-source Refunds endpoint
//!   already requires the merchant to POST — this is a round-trip of an
//!   already-public-by-contract value, not disclosure of a new internal id;
//! * only COMPLETED payments resolve, so the field is naturally absent before
//!   the payment reaches a paid/terminal state.
//!
//! This is a Banzami OPERATOR extension, not a BANZA-normative field (see the
//! uncommitted ADR-045 draft). The public vocabulary is `WALLET_PAYMENT` /
//! `ACQUIRING_PAYMENT`; the internal `TRANSACTION` token is never exposed.
//!
//! Current coverage (exact truth — do not overstate):
//! * Payment Session and Payment Link settlement flows currently produce ONLY
//!   `WALLET_PAYMENT` (they settle as a wallet transfer → `wallet_payments`).
//! * `refund_source` discovery is fully implemented and tested for every
//!   currently supported session/link settlement path (all `WALLET_PAYMENT`).
//! * `ACQUIRING_PAYMENT` is a supported typed source of the Refunds API itself,
//!   but `ACQUIRING_PAYMENT` *discovery through a Session/Link* is NOT applicable
//!   until an actual Session/Link acquiring settlement path exists. If one is
//!   ever added, discovery MUST be extended to emit an `ACQUIRING_PAYMENT`
//!   source for it — the structural guard in `refund_source_tests` fails the
//!   moment such a linkage appears, so it cannot silently bypass discovery.

use sqlx::PgPool;
use uuid::Uuid;

/// The public typed-source vocabulary. `TRANSACTION` is never produced here.
const WALLET_PAYMENT: &str = "WALLET_PAYMENT";

fn to_json(source_type: &str, source_id: Uuid) -> serde_json::Value {
    serde_json::json!({ "source_type": source_type, "source_id": source_id })
}

/// Resolve the refund source for a paid Payment Session / Payment Link by the
/// interface ids it settled through. Merchant-scoped and COMPLETED-only, so a
/// cross-tenant or unpaid interface yields `None`.
pub async fn resolve_by_interface(
    pool: &PgPool,
    merchant_id: Uuid,
    payment_link_id: Option<Uuid>,
    qr_code_id: Option<Uuid>,
) -> Option<serde_json::Value> {
    if payment_link_id.is_none() && qr_code_id.is_none() {
        return None;
    }
    // COALESCE-style match: the wallet_payment carries whichever interface id
    // settled it. Merchant scoping is the tenant-isolation guarantee.
    let id: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM wallet_payments
          WHERE merchant_id = $1
            AND status = 'COMPLETED'
            AND ( ($2::uuid IS NOT NULL AND payment_link_id = $2)
               OR ($3::uuid IS NOT NULL AND qr_code_id = $3) )
          ORDER BY created_at DESC
          LIMIT 1",
    )
    .bind(merchant_id)
    .bind(payment_link_id)
    .bind(qr_code_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    id.map(|src| to_json(WALLET_PAYMENT, src))
}

/// Resolve the refund source from the settling Transfer id — the most precise
/// anchor, used on the paid-webhook path where the transfer is known.
/// `wallet_payments.transfer_id` is UNIQUE, so this is exact. Merchant-scoped.
pub async fn resolve_by_transfer(
    pool: &PgPool,
    merchant_id: Uuid,
    transfer_id: Uuid,
) -> Option<serde_json::Value> {
    let id: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM wallet_payments
          WHERE transfer_id = $1 AND merchant_id = $2 AND status = 'COMPLETED'",
    )
    .bind(transfer_id)
    .bind(merchant_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    id.map(|src| to_json(WALLET_PAYMENT, src))
}
