//! The Collections prototype's schema is frozen out of the active migrations
//! (db/migrations.phase2). On a database without it, the routes say so and a
//! payment's settlement hook is silent — neither answers 500 about a missing
//! relation.

use axum::extract::{Query, State};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::{AccountId, TransferId};

use banzami_collections::Surface;

use crate::routes::collections::{self, ScopeQuery};
use crate::state::{AppState, CoreEnvironment};

async fn state(pool: PgPool) -> AppState {
    let acct = |pool: PgPool| async move {
        sqlx::query_scalar::<_, Uuid>("INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES (gen_random_uuid(),'ASSET','a','AOA') RETURNING id")
            .fetch_one(&pool).await.unwrap()
    };
    let (t, b, f) = (
        acct(pool.clone()).await,
        acct(pool.clone()).await,
        acct(pool.clone()).await,
    );
    crate::state::configure_live_secrets_for_tests();
    AppState::new(
        pool,
        AccountId::from_uuid(t),
        AccountId::from_uuid(b),
        AccountId::from_uuid(f),
        CoreEnvironment::Sandbox,
    )
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn without_the_frozen_schema_collections_are_unavailable_not_broken(pool: PgPool) {
    // 0156 folded the Collections schema into the active migrations, so a plain
    // migration run now HAS it. Reproduce a database that predates the schema by
    // dropping the three tables — the guard must still answer "unavailable", not
    // 500 on a missing relation.
    for t in ["collection_shares", "payment_intents", "collections"] {
        sqlx::query(&format!("DROP TABLE IF EXISTS {t} CASCADE"))
            .execute(&pool)
            .await
            .unwrap();
    }
    let st = state(pool).await;
    assert!(!collections::collections_available(&st).await);
    let err = collections::list(
        State(st.clone()),
        Query(ScopeQuery {
            merchant_id: Uuid::new_v4().to_string(),
            environment: "SANDBOX".into(),
            limit: None,
            cursor: None,
        }),
    )
    .await
    .expect_err("no schema, no collections");
    assert_eq!(err.code, "COLLECTIONS_UNAVAILABLE");
    // The hook every link and QR payment calls returns quietly.
    collections::settle_and_emit(
        &st,
        Surface::Link,
        &Uuid::new_v4().to_string(),
        TransferId::new(),
        "SANDBOX",
    )
    .await;
}
