//! A consumer's transfer history pages forward with the cursor it is given.
//!
//! public-api hands the app `next_cursor` (the last transfer's id) and sends it
//! back as `cursor`, but core read only `before_created_at` + `before_id` and
//! ignored `cursor` — so every "next page" was the first page again, and an app
//! paging to the end looped for ever.

use axum::extract::{Query, State};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::transfers::{self, ListTransfersQuery};
use crate::state::{AppState, CoreEnvironment};

async fn account(pool: &PgPool, ty: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES (gen_random_uuid(),$1,'a','AOA') RETURNING id",
    )
    .bind(ty)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn build_state(pool: PgPool) -> AppState {
    let transit = account(&pool, "ASSET").await;
    let bank = account(&pool, "ASSET").await;
    let fee = account(&pool, "REVENUE").await;
    AppState::new(
        pool,
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        AccountId::from_uuid(fee),
        CoreEnvironment::Sandbox,
    )
}

async fn consumer(pool: &PgPool) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO consumers (id, handle, status) VALUES ($1, $2, 'ACTIVE')")
        .bind(id)
        .bind(format!("c{}", &id.to_string()[..8]))
        .execute(pool)
        .await
        .unwrap();
    id
}

/// `n` COMPLETED transfers sent by `consumer`, one second apart, oldest first.
async fn history(pool: &PgPool, consumer_id: Uuid, n: i64) -> Vec<Uuid> {
    let peer = consumer(pool).await;
    let mut ids = Vec::new();
    for i in 0..n {
        let id: Uuid = sqlx::query_scalar(
            "INSERT INTO transfers (id, idempotency_key, sender_id, recipient_id, amount_minor, currency, status, environment, created_at)
             VALUES (gen_random_uuid(), $1, $2, $4, 100, 'AOA', 'COMPLETED', 'SANDBOX', now() - make_interval(secs => $3))
             RETURNING id",
        )
        .bind(format!("cur-{consumer_id}-{i}"))
        .bind(consumer_id)
        .bind((n - i) as f64)
        .bind(peer)
        .fetch_one(pool)
        .await
        .unwrap();
        ids.push(id);
    }
    ids
}

async fn page(
    state: &AppState,
    consumer: Uuid,
    cursor: Option<String>,
) -> Result<(Vec<String>, bool), u16> {
    let q = ListTransfersQuery {
        consumer_id: consumer.to_string(),
        limit: Some(2),
        before_created_at: None,
        before_id: None,
        cursor,
    };
    let v = transfers::list(State(state.clone()), Query(q))
        .await
        .map_err(|e| e.status.as_u16())?
        .0;
    let ids = v["data"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["id"].as_str().unwrap().to_string())
        .collect();
    Ok((ids, v["has_more"].as_bool().unwrap()))
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn the_next_page_continues_after_the_cursor(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let me = consumer(&pool).await;
    let ids = history(&pool, me, 5).await; // newest last

    let (first, more) = page(&state, me, None).await.unwrap();
    assert_eq!(first, vec![ids[4].to_string(), ids[3].to_string()]);
    assert!(more);

    let (second, more) = page(&state, me, Some(first[1].clone())).await.unwrap();
    assert_eq!(
        second,
        vec![ids[2].to_string(), ids[1].to_string()],
        "page two repeated page one"
    );
    assert!(more);

    let (third, more) = page(&state, me, Some(second[1].clone())).await.unwrap();
    assert_eq!(third, vec![ids[0].to_string()]);
    assert!(!more);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_cursor_from_someone_elses_history_is_refused(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let me = consumer(&pool).await;
    let other = consumer(&pool).await;
    history(&pool, me, 2).await;
    let theirs = history(&pool, other, 1).await;

    assert_eq!(
        page(&state, me, Some(theirs[0].to_string()))
            .await
            .unwrap_err(),
        400
    );
    assert_eq!(
        page(&state, me, Some("not-a-cursor".into()))
            .await
            .unwrap_err(),
        400
    );
}
