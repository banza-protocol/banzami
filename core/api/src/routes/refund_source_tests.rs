//! Real-database tests for merchant-safe refundable-source discovery.
//! `#[sqlx::test]` applies all migrations; no mocks. The resolver reads only
//! `wallet_payments`, so these seed that table directly.

use sqlx::PgPool;
use uuid::Uuid;

use crate::routes::refund_source;

/// Insert a COMPLETED wallet payment; returns its id.
async fn seed_wp(
    pool: &PgPool,
    merchant_id: Uuid,
    transfer_id: Uuid,
    payment_link_id: Option<Uuid>,
    qr_code_id: Option<Uuid>,
    status: &str,
) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO wallet_payments
            (id, transfer_id, merchant_id, consumer_id, qr_code_id, payment_link_id,
             amount_minor, currency, status, trace_id, environment)
         VALUES ($1, $2, $3, $4, $5, $6, 5000, 'AOA', $7, $8, 'SANDBOX')",
    )
    .bind(id)
    .bind(transfer_id)
    .bind(merchant_id)
    .bind(Uuid::new_v4())
    .bind(qr_code_id)
    .bind(payment_link_id)
    .bind(status)
    .bind(format!("trace-{id}"))
    .execute(pool)
    .await
    .unwrap();
    id
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn resolve_by_interface_returns_typed_wallet_payment(pool: PgPool) {
    let merchant = Uuid::new_v4();
    let link = Uuid::new_v4();
    let wp = seed_wp(&pool, merchant, Uuid::new_v4(), Some(link), None, "COMPLETED").await;

    let v = refund_source::resolve_by_interface(&pool, merchant, Some(link), None)
        .await
        .expect("owning merchant + completed payment must resolve");

    assert_eq!(v["source_type"], "WALLET_PAYMENT");
    assert_eq!(v["source_id"], serde_json::json!(wp));
    // The internal Core token must NEVER surface.
    assert_ne!(v["source_type"], "TRANSACTION");
    assert!(!v.to_string().contains("TRANSACTION"));
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn resolve_by_interface_is_merchant_scoped(pool: PgPool) {
    let owner = Uuid::new_v4();
    let attacker = Uuid::new_v4();
    let link = Uuid::new_v4();
    seed_wp(&pool, owner, Uuid::new_v4(), Some(link), None, "COMPLETED").await;

    // A different merchant asking about the same link id gets nothing — no
    // existence signal, mirroring the refund endpoint's indistinguishable-404.
    let leaked = refund_source::resolve_by_interface(&pool, attacker, Some(link), None).await;
    assert!(leaked.is_none(), "cross-tenant lookup must not resolve");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn resolve_absent_before_completed(pool: PgPool) {
    let merchant = Uuid::new_v4();
    let link = Uuid::new_v4();
    // A PENDING payment is not yet refundable → absent.
    seed_wp(&pool, merchant, Uuid::new_v4(), Some(link), None, "PENDING").await;
    let v = refund_source::resolve_by_interface(&pool, merchant, Some(link), None).await;
    assert!(v.is_none(), "pre-completed payment must not expose a refund source");

    // No interface ids at all → absent.
    let none = refund_source::resolve_by_interface(&pool, merchant, None, None).await;
    assert!(none.is_none());
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn resolve_by_transfer_exact_and_scoped(pool: PgPool) {
    let owner = Uuid::new_v4();
    let attacker = Uuid::new_v4();
    let transfer = Uuid::new_v4();
    let wp = seed_wp(&pool, owner, transfer, None, Some(Uuid::new_v4()), "COMPLETED").await;

    let v = refund_source::resolve_by_transfer(&pool, owner, transfer)
        .await
        .expect("owner resolves by transfer");
    assert_eq!(v["source_type"], "WALLET_PAYMENT");
    assert_eq!(v["source_id"], serde_json::json!(wp));

    // Same transfer, wrong merchant → nothing.
    assert!(refund_source::resolve_by_transfer(&pool, attacker, transfer)
        .await
        .is_none());
    // Unknown transfer → nothing.
    assert!(refund_source::resolve_by_transfer(&pool, owner, Uuid::new_v4())
        .await
        .is_none());
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn resolve_by_interface_matches_qr_interface(pool: PgPool) {
    let merchant = Uuid::new_v4();
    let qr = Uuid::new_v4();
    let wp = seed_wp(&pool, merchant, Uuid::new_v4(), None, Some(qr), "COMPLETED").await;
    let v = refund_source::resolve_by_interface(&pool, merchant, None, Some(qr))
        .await
        .expect("qr interface resolves");
    assert_eq!(v["source_id"], serde_json::json!(wp));
}
