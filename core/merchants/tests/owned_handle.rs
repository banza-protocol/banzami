//! A Business is recognised by the @handle it owns.
//!
//! BANZADMIN's classification picker listed 312 Business Accounts by name, and
//! three of them read like DOA: "Doa" (retired by the @doa consolidation, no
//! handle), "Sandbox · DOA Sandbox" and "Sandbox · Doa-Sandbox" — the one that
//! owns @doa. Classifying by name is how the wrong account gets the class. The
//! merchant record now carries the handle it owns in `handle_registry`, and
//! only that one: not a profile's copy, not a handle it used to own.

use sqlx::PgPool;
use uuid::Uuid;

use banzami_merchants::{MerchantRepository, PostgresMerchantRepository};
use banzami_types::MerchantId;

async fn merchant(pool: &PgPool, name: &str) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO merchants (id, name, email, status, business_account_type, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'ACTIVE', 'MERCHANT', now(), now()) RETURNING id",
    )
    .bind(name)
    .bind(format!("{}@example.test", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .unwrap()
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_merchant_carries_the_handle_it_owns_and_no_other(pool: PgPool) {
    let owner = merchant(&pool, "Sandbox · Doa-Sandbox").await;
    let retired = merchant(&pool, "Doa").await;
    let held = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES
           ('doa', 'MERCHANT', $1),
           ('doa_pending', 'APPLICATION', $2)",
    )
    .bind(owner)
    .bind(held)
    .execute(&pool)
    .await
    .unwrap();

    let repo = PostgresMerchantRepository::new(pool.clone());
    let got = repo.get(MerchantId::from_uuid(owner)).await.unwrap();
    assert_eq!(got.handle.as_deref(), Some("doa"));
    let got = repo.get(MerchantId::from_uuid(retired)).await.unwrap();
    assert_eq!(
        got.handle, None,
        "a merchant that owns no handle shows none"
    );

    let listed = repo.list(Some("doa")).await.unwrap();
    let by_id = |id: Uuid| listed.iter().find(|m| m.id.as_uuid() == id).unwrap();
    assert_eq!(by_id(owner).handle.as_deref(), Some("doa"));
    assert_eq!(by_id(retired).handle, None);

    // Serialised for the admin console: present when owned, absent otherwise.
    let json = serde_json::to_value(by_id(owner)).unwrap();
    assert_eq!(json["handle"], "doa");
    assert!(serde_json::to_value(by_id(retired))
        .unwrap()
        .get("handle")
        .is_none());
}
