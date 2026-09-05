//! Wallet-native merchant payment object (BANZA ADR-030).
//!
//! A wallet-native merchant payment settles as a wallet transfer (consumer →
//! merchant wallet), but a generic transfer cannot be distinguished from a P2P
//! transfer. This module records each *merchant* QR payment as a first-class,
//! typed object so it can later be referenced as a refund source
//! (`source_type = WALLET_PAYMENT`). P2P transfers are never recorded here.
//!
//! This is the Step-2A foundation: the object + its recording at merchant-payment
//! time. Refund wiring and webhooks are out of scope.
//!
//! The repository read functions (`find_*`, `list_*`, `update_status`) and the
//! `WalletPayment` struct are the typed-source API the upcoming refund step
//! (REF-001 / REF-002) will consume; they are intentionally not yet called from
//! production code, so dead-code is allowed at the module level until then.
#![allow(dead_code)]

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_qr::QrOwnerType;

/// A persisted wallet-native merchant payment.
#[derive(Debug, Clone)]
pub struct WalletPayment {
    pub id: Uuid,
    pub transfer_id: Uuid,
    pub merchant_id: Uuid,
    pub consumer_id: Uuid,
    pub qr_code_id: Option<Uuid>,
    pub payment_link_id: Option<Uuid>,
    pub amount_minor: i64,
    pub currency: String,
    pub status: String,
    pub trace_id: String,
    pub environment: String,
    pub created_at: DateTime<Utc>,
}

/// Records the wallet-native merchant payment behind a settled Payment Link or
/// Payment Session interface.
///
/// WHY THIS EXISTS
///
/// `record_merchant_qr_payment` was the only writer of `wallet_payments`, and it
/// is reached from exactly one place: the QR-pay route. That route was withdrawn
/// for security (RA-053 — it took the payer as free text on a merchant
/// credential), and the refundable object went with it.
///
/// Everything since has settled through the payer-authorised payment-link route,
/// which records nothing. So the money moved, the session flipped to PAID, the
/// link went USED — and `refund_source` resolved to `None`, because the object a
/// refund names never existed. Every payment taken on the canonical rail was
/// unrefundable, silently, including every DOA donation.
///
/// The payer is derived from the settling transfer rather than passed in: the
/// transfer is the financial fact, and taking the payer from anywhere else would
/// let the two disagree.
///
/// Idempotent on `transfer_id`, exactly like its QR sibling: a replayed
/// settlement returns the existing row.
#[allow(clippy::too_many_arguments)]
pub async fn record_merchant_interface_payment(
    pool: &PgPool,
    merchant_id: Uuid,
    transfer_id: Uuid,
    payment_link_id: Option<Uuid>,
    qr_code_id: Option<Uuid>,
    amount_minor: i64,
    currency: &str,
    trace_id: &str,
    environment: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    // The payer is whoever the transfer debited. A transfer whose sender is not a
    // consumer wallet is not a wallet-native merchant payment, so nothing is
    // recorded — the same rule the QR path applies to P2P.
    let payer: Option<Uuid> = sqlx::query_scalar(
        "SELECT cw.consumer_id
           FROM transfers t
           JOIN consumer_wallets cw ON cw.consumer_id = t.sender_id
          WHERE t.id = $1
          LIMIT 1",
    )
    .bind(transfer_id)
    .fetch_optional(pool)
    .await?;
    let Some(payer_consumer_id) = payer else {
        return Ok(None);
    };

    let inserted: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO wallet_payments
            (transfer_id, merchant_id, consumer_id, payment_link_id, qr_code_id,
             amount_minor, currency, status, trace_id, environment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED', $8, $9)
         ON CONFLICT (transfer_id) DO NOTHING
         RETURNING id",
    )
    .bind(transfer_id)
    .bind(merchant_id)
    .bind(payer_consumer_id)
    .bind(payment_link_id)
    .bind(qr_code_id)
    .bind(amount_minor)
    .bind(currency)
    .bind(trace_id)
    .bind(environment)
    .fetch_optional(pool)
    .await?;

    match inserted {
        Some(id) => Ok(Some(id)),
        None => Ok(
            sqlx::query_scalar("SELECT id FROM wallet_payments WHERE transfer_id = $1")
                .bind(transfer_id)
                .fetch_optional(pool)
                .await?,
        ),
    }
}

/// Records a wallet-native **merchant** payment after its settling transfer.
///
/// Returns:
/// - `Ok(None)` when the QR owner is a consumer (a P2P transfer — never recorded)
///   or when `owner_id` does not resolve to a merchant wallet (nothing to link);
/// - `Ok(Some(id))` for the (idempotently) recorded wallet payment.
///
/// Idempotent on `transfer_id`: a replay of the same settlement returns the
/// existing row instead of creating a duplicate.
#[allow(clippy::too_many_arguments)]
pub async fn record_merchant_qr_payment(
    pool: &PgPool,
    owner_type: QrOwnerType,
    owner_id: Uuid,
    transfer_id: Uuid,
    payer_consumer_id: Uuid,
    qr_code_id: Option<Uuid>,
    amount_minor: i64,
    currency: &str,
    trace_id: &str,
    environment: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    // P2P transfers (consumer-owned QR) are not merchant payments.
    if owner_type != QrOwnerType::Merchant {
        return Ok(None);
    }

    // Resolve the merchant from the QR owner id. The owner id may be the merchant
    // id (product/dashboard convention) or the merchant wallet id (engine tests),
    // so accept either and resolve to the canonical merchant id.
    let merchant_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT merchant_id FROM wallets WHERE id = $1 OR merchant_id = $1 LIMIT 1",
    )
    .bind(owner_id)
    .fetch_optional(pool)
    .await?;

    let Some(merchant_id) = merchant_id else {
        return Ok(None);
    };

    // Idempotent insert keyed on the settling transfer.
    let inserted: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO wallet_payments
            (transfer_id, merchant_id, consumer_id, qr_code_id,
             amount_minor, currency, status, trace_id, environment)
         VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7, $8)
         ON CONFLICT (transfer_id) DO NOTHING
         RETURNING id",
    )
    .bind(transfer_id)
    .bind(merchant_id)
    .bind(payer_consumer_id)
    .bind(qr_code_id)
    .bind(amount_minor)
    .bind(currency)
    .bind(trace_id)
    .bind(environment)
    .fetch_optional(pool)
    .await?;

    match inserted {
        Some(id) => Ok(Some(id)),
        // Conflict (idempotent replay) — return the existing row's id.
        None => Ok(
            sqlx::query_scalar("SELECT id FROM wallet_payments WHERE transfer_id = $1")
                .bind(transfer_id)
                .fetch_optional(pool)
                .await?,
        ),
    }
}

fn map_row(r: sqlx::postgres::PgRow) -> WalletPayment {
    use sqlx::Row;
    WalletPayment {
        id: r.get("id"),
        transfer_id: r.get("transfer_id"),
        merchant_id: r.get("merchant_id"),
        consumer_id: r.get("consumer_id"),
        qr_code_id: r.get("qr_code_id"),
        payment_link_id: r.get("payment_link_id"),
        amount_minor: r.get("amount_minor"),
        currency: r.get("currency"),
        status: r.get("status"),
        trace_id: r.get("trace_id"),
        environment: r.get("environment"),
        created_at: r.get("created_at"),
    }
}

const SELECT_COLS: &str = "id, transfer_id, merchant_id, consumer_id, qr_code_id, \
     payment_link_id, amount_minor, currency, status, trace_id, environment, created_at";

pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<WalletPayment>, sqlx::Error> {
    let row = sqlx::query(&format!(
        "SELECT {SELECT_COLS} FROM wallet_payments WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(map_row))
}

pub async fn find_by_transfer_id(
    pool: &PgPool,
    transfer_id: Uuid,
) -> Result<Option<WalletPayment>, sqlx::Error> {
    let row = sqlx::query(&format!(
        "SELECT {SELECT_COLS} FROM wallet_payments WHERE transfer_id = $1"
    ))
    .bind(transfer_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(map_row))
}

pub async fn list_by_merchant(
    pool: &PgPool,
    merchant_id: Uuid,
    limit: i64,
) -> Result<Vec<WalletPayment>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "SELECT {SELECT_COLS} FROM wallet_payments WHERE merchant_id = $1
         ORDER BY created_at DESC LIMIT $2"
    ))
    .bind(merchant_id)
    .bind(limit.clamp(1, 200))
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(map_row).collect())
}

pub async fn list_by_consumer(
    pool: &PgPool,
    consumer_id: Uuid,
    limit: i64,
) -> Result<Vec<WalletPayment>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        "SELECT {SELECT_COLS} FROM wallet_payments WHERE consumer_id = $1
         ORDER BY created_at DESC LIMIT $2"
    ))
    .bind(consumer_id)
    .bind(limit.clamp(1, 200))
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(map_row).collect())
}

/// Safe status transition for a wallet payment.
pub async fn update_status(pool: &PgPool, id: Uuid, status: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE wallet_payments SET status = $1, updated_at = now() WHERE id = $2")
        .bind(status)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn ledger_account(pool: &PgPool, name: &str) -> Uuid {
        sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO ledger_accounts (id, account_type, name, currency)
             VALUES ($1, 'LIABILITY', $2, 'AOA') RETURNING id",
        )
        .bind(Uuid::new_v4())
        .bind(name)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    /// Seeds a merchant wallet and returns (merchant_id, wallet_id).
    async fn seed_merchant_wallet(pool: &PgPool) -> (Uuid, Uuid) {
        let merchant_id = Uuid::new_v4();
        let wallet_id = Uuid::new_v4();
        let avail = ledger_account(pool, "merchant-available").await;
        let reserved = ledger_account(pool, "merchant-reserved").await;
        sqlx::query(
            "INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id)
             VALUES ($1, $2, 'AOA', 'ACTIVE', $3, $4)",
        )
        .bind(wallet_id)
        .bind(merchant_id)
        .bind(avail)
        .bind(reserved)
        .execute(pool)
        .await
        .unwrap();
        (merchant_id, wallet_id)
    }

    // A merchant QR payment is recorded as a wallet_payment linked to its transfer.
    #[sqlx::test(migrations = "../../db/migrations")]
    async fn merchant_qr_payment_creates_wallet_payment(pool: PgPool) {
        let (merchant_id, _wallet_id) = seed_merchant_wallet(&pool).await;
        let transfer_id = Uuid::new_v4();
        let consumer_id = Uuid::new_v4();
        let qr = Uuid::new_v4();

        let id = record_merchant_qr_payment(
            &pool,
            QrOwnerType::Merchant,
            merchant_id, // owner_id as merchant id (dashboard convention)
            transfer_id,
            consumer_id,
            Some(qr),
            250_000,
            "AOA",
            "trace-key-1",
            "SANDBOX",
        )
        .await
        .unwrap()
        .expect("merchant payment recorded");

        let wp = find_by_transfer_id(&pool, transfer_id)
            .await
            .unwrap()
            .expect("row exists");
        assert_eq!(wp.id, id);
        assert_eq!(wp.merchant_id, merchant_id, "merchant resolved");
        assert_eq!(wp.consumer_id, consumer_id, "payer recorded");
        assert_eq!(wp.transfer_id, transfer_id, "linked to settling transfer");
        assert_eq!(wp.qr_code_id, Some(qr));
        assert_eq!(wp.amount_minor, 250_000);
        assert_eq!(wp.status, "COMPLETED");
        assert_eq!(wp.environment, "SANDBOX");
    }

    // owner_id given as the merchant wallet id (engine convention) still resolves.
    #[sqlx::test(migrations = "../../db/migrations")]
    async fn owner_id_as_wallet_id_resolves_merchant(pool: PgPool) {
        let (merchant_id, wallet_id) = seed_merchant_wallet(&pool).await;
        let transfer_id = Uuid::new_v4();
        record_merchant_qr_payment(
            &pool,
            QrOwnerType::Merchant,
            wallet_id, // owner_id as wallet id
            transfer_id,
            Uuid::new_v4(),
            None,
            100,
            "AOA",
            "t",
            "LIVE",
        )
        .await
        .unwrap()
        .expect("recorded");
        let wp = find_by_transfer_id(&pool, transfer_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(wp.merchant_id, merchant_id);
    }

    // A P2P (consumer-owned) transfer is NOT recorded as a wallet payment.
    #[sqlx::test(migrations = "../../db/migrations")]
    async fn p2p_transfer_creates_no_wallet_payment(pool: PgPool) {
        let transfer_id = Uuid::new_v4();
        let out = record_merchant_qr_payment(
            &pool,
            QrOwnerType::Consumer,
            Uuid::new_v4(),
            transfer_id,
            Uuid::new_v4(),
            None,
            500,
            "AOA",
            "t",
            "LIVE",
        )
        .await
        .unwrap();
        assert!(out.is_none(), "consumer QR is P2P — no wallet payment");
        assert!(find_by_transfer_id(&pool, transfer_id)
            .await
            .unwrap()
            .is_none());
    }

    // An owner id that resolves to no merchant wallet records nothing (no fabrication).
    #[sqlx::test(migrations = "../../db/migrations")]
    async fn unresolvable_merchant_records_nothing(pool: PgPool) {
        let transfer_id = Uuid::new_v4();
        let out = record_merchant_qr_payment(
            &pool,
            QrOwnerType::Merchant,
            Uuid::new_v4(), // no such wallet/merchant
            transfer_id,
            Uuid::new_v4(),
            None,
            500,
            "AOA",
            "t",
            "LIVE",
        )
        .await
        .unwrap();
        assert!(out.is_none());
        assert!(find_by_transfer_id(&pool, transfer_id)
            .await
            .unwrap()
            .is_none());
    }

    // Recording is idempotent on the settling transfer.
    #[sqlx::test(migrations = "../../db/migrations")]
    async fn duplicate_transfer_is_idempotent(pool: PgPool) {
        let (merchant_id, _) = seed_merchant_wallet(&pool).await;
        let transfer_id = Uuid::new_v4();
        let call = || {
            record_merchant_qr_payment(
                &pool,
                QrOwnerType::Merchant,
                merchant_id,
                transfer_id,
                Uuid::new_v4(),
                None,
                700,
                "AOA",
                "t",
                "LIVE",
            )
        };
        let first = call().await.unwrap().unwrap();
        let second = call().await.unwrap().unwrap();
        assert_eq!(first, second, "replay returns the same wallet payment");

        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)::BIGINT FROM wallet_payments WHERE transfer_id = $1",
        )
        .bind(transfer_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1, "no duplicate wallet payment");
    }

    // Listing by merchant and by consumer returns the recorded payment.
    #[sqlx::test(migrations = "../../db/migrations")]
    async fn list_by_merchant_and_consumer(pool: PgPool) {
        let (merchant_id, _) = seed_merchant_wallet(&pool).await;
        let consumer_id = Uuid::new_v4();
        record_merchant_qr_payment(
            &pool,
            QrOwnerType::Merchant,
            merchant_id,
            Uuid::new_v4(),
            consumer_id,
            None,
            900,
            "AOA",
            "t",
            "LIVE",
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(
            list_by_merchant(&pool, merchant_id, 10)
                .await
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            list_by_consumer(&pool, consumer_id, 10)
                .await
                .unwrap()
                .len(),
            1
        );
    }
}
