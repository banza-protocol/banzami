//! Onboarding registers the handle in the namespace parties are routed through.
//!
//! `consumers.handle` is the identity's own column. `handle_registry` is the
//! routing table every @banza lookup goes through. Migration 0051 backfilled
//! consumer handles into it once and no ongoing write followed, so every consumer
//! onboarded afterwards was invisible to the router: @fm65 showed an ACTIVE AOA
//! wallet holding 10 000 Kz in the Consumer app while a settlement naming @fm65
//! answered "no active wallet in this currency".
//!
//! Both rows are written in one transaction, so a handle cannot exist in one
//! store and not the other.

use sqlx::PgPool;
use uuid::Uuid;

use banzami_consumer_wallets::{
    CompletedOnboarding, ConsumerWalletRepository, PostgresConsumerWalletRepository,
};
use banzami_types::{AccountId, Currency};

async fn account(pool: &PgPool) -> AccountId {
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO ledger_accounts (id, account_type, name, currency)
         VALUES (gen_random_uuid(),'LIABILITY','c','AOA') RETURNING id",
    )
    .fetch_one(pool)
    .await
    .unwrap();
    AccountId::from_uuid(id)
}

async fn onboard(pool: &PgPool, handle: &str, phone: &str) -> Result<(), String> {
    let repo = PostgresConsumerWalletRepository::new(pool.clone());
    let session = Uuid::new_v4();
    repo.activate(CompletedOnboarding {
        session_id: session,
        phone_number: phone.to_string(),
        banza_handle: handle.to_string(),
        pin_hash: "argon2id$dummy".to_string(),
        currency: Currency::from_code("AOA").unwrap(),
        available_account_id: account(pool).await,
        reserved_account_id: account(pool).await,
    })
    .await
    .map(|_| ())
    .map_err(|e| format!("{e:?}"))
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn onboarding_puts_the_handle_in_the_registry(pool: PgPool) {
    onboard(&pool, "newcomer", "+244900000101").await.expect("onboarding");

    let row: Option<(String, Option<Uuid>)> =
        sqlx::query_as("SELECT owner_type, owner_id FROM handle_registry WHERE handle = 'newcomer'")
            .fetch_optional(&pool)
            .await
            .unwrap();
    let (owner_type, owner_id) = row.expect(
        "the handle is not in handle_registry — parties/resolve reads that table and \
         nothing else, so this consumer cannot be named as a payment beneficiary",
    );
    assert_eq!(owner_type, "CONSUMER");

    let consumer: Uuid = sqlx::query_scalar("SELECT id FROM consumers WHERE handle = 'newcomer'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(owner_id, Some(consumer), "the registry points at a different owner");
}

/// One transaction: a handle must never exist in one store and not the other.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_handle_already_registered_to_another_party_is_refused_whole(pool: PgPool) {
    let merchant = Uuid::new_v4();
    sqlx::query("INSERT INTO merchants (id, name, email, status) VALUES ($1,'M','m@t.test','ACTIVE')")
        .bind(merchant)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ('contested','MERCHANT',$1)")
        .bind(merchant)
        .execute(&pool)
        .await
        .unwrap();

    assert!(
        onboard(&pool, "contested", "+244900000102").await.is_err(),
        "a consumer claimed a handle a merchant already answers to"
    );

    // And left nothing behind: no half-created identity holding a name it does
    // not own in the namespace.
    let consumers: i64 = sqlx::query_scalar("SELECT count(*) FROM consumers WHERE handle = 'contested'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(consumers, 0, "a consumer row survived a refused handle claim");
    let owner: Option<Uuid> =
        sqlx::query_scalar("SELECT owner_id FROM handle_registry WHERE handle = 'contested'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(owner, Some(merchant), "the incumbent lost its handle");
}
