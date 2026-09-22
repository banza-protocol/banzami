//! Real-Postgres idempotency tests for Collection creation (INV-COLLECTION-008,
//! BANZA spec/idempotency.md). These prove the DB-level guarantees the in-memory
//! engine tests cannot: the (merchant_id, environment, idempotency_key) unique
//! boundary, ON CONFLICT convergence under real concurrency, and that the key +
//! request fingerprint are actually persisted (the original defect: the key was
//! dropped on INSERT, leaving the column NULL so the unique never activated).
//!
//! Run: DATABASE_URL="postgresql://<user>@localhost:5432/postgres" \
//!      cargo test -p banzami-collections --test idempotency_db

use std::sync::Arc;

use sqlx::PgPool;

use banzami_collections::CollectionEngine;
use banzami_collections::{
    CollectionError, CollectionRule, CreateCollectionRequest, Divisibility,
    PostgresCollectionEngine, PostgresCollectionRepository,
};
use banzami_types::{MerchantId, WalletId};

fn req(m: MerchantId, w: WalletId, total: i64, key: Option<&str>) -> CreateCollectionRequest {
    CreateCollectionRequest {
        operator_id: "banzami".into(),
        creator: m.to_string(),
        owner: m.to_string(),
        merchant_id: m,
        wallet_id: w,
        title: Some("Conta do jantar".into()),
        description: None,
        currency: "AOA".into(),
        total_amount_minor: total,
        rule: CollectionRule::EqualSplit {
            participants_count: 2,
            divisibility: Divisibility::Exact,
        },
        environment: "SANDBOX".into(),
        idempotency_key: key.map(|s| s.to_string()),
        expires_at: None,
        open_immediately: true,
    }
}

fn engine(pool: &PgPool) -> PostgresCollectionEngine<PostgresCollectionRepository> {
    PostgresCollectionEngine::new(PostgresCollectionRepository::new(pool.clone()))
}

async fn count_for(pool: &PgPool, m: MerchantId, key: &str) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM collections WHERE merchant_id = $1 AND environment = 'SANDBOX' AND idempotency_key = $2",
    )
    .bind(m.as_uuid())
    .bind(key)
    .fetch_one(pool)
    .await
    .unwrap()
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn key_and_fingerprint_are_persisted(pool: PgPool) {
    // The original defect: the INSERT dropped idempotency_key, so the column was
    // NULL and the unique never fired. Prove both columns land.
    let e = engine(&pool);
    let (m, w) = (MerchantId::new(), WalletId::new());
    let (c, _) = e
        .create_collection(req(m, w, 45_200, Some("k-persist")))
        .await
        .unwrap();

    let (k, fp): (Option<String>, Option<String>) = sqlx::query_as(
        "SELECT idempotency_key, request_fingerprint FROM collections WHERE id = $1",
    )
    .bind(c.id.as_uuid())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        k.as_deref(),
        Some("k-persist"),
        "idempotency_key must be persisted"
    );
    assert!(
        fp.is_some_and(|f| f.len() == 64),
        "request_fingerprint (sha256 hex) must be persisted"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn replay_returns_same_collection(pool: PgPool) {
    let e = engine(&pool);
    let (m, w) = (MerchantId::new(), WalletId::new());
    let (c1, s1) = e
        .create_collection(req(m, w, 45_200, Some("k-1")))
        .await
        .unwrap();
    let (c2, s2) = e
        .create_collection(req(m, w, 45_200, Some("k-1")))
        .await
        .unwrap();
    assert_eq!(c1.id.as_uuid(), c2.id.as_uuid());
    // The DB repo returns shares created_at ASC — same order both times.
    assert_eq!(
        s1.iter().map(|s| s.id.as_uuid()).collect::<Vec<_>>(),
        s2.iter().map(|s| s.id.as_uuid()).collect::<Vec<_>>(),
    );
    assert_eq!(
        count_for(&pool, m, "k-1").await,
        1,
        "exactly one collection row"
    );
    let shares: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM collection_shares WHERE collection_id = $1")
            .bind(c1.id.as_uuid())
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(shares, 2, "replay did not duplicate shares");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn payload_conflict_is_rejected(pool: PgPool) {
    let e = engine(&pool);
    let (m, w) = (MerchantId::new(), WalletId::new());
    e.create_collection(req(m, w, 45_200, Some("k-2")))
        .await
        .unwrap();
    let err = e
        .create_collection(req(m, w, 90_000, Some("k-2")))
        .await
        .unwrap_err();
    assert!(
        matches!(err, CollectionError::IdempotencyConflict),
        "got {err:?}"
    );
    assert_eq!(
        count_for(&pool, m, "k-2").await,
        1,
        "conflict must not create a second row"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn cross_business_same_key_is_independent(pool: PgPool) {
    let e = Arc::new(engine(&pool));
    let (a, b, w) = (MerchantId::new(), MerchantId::new(), WalletId::new());
    let (ca, _) = e
        .create_collection(req(a, w, 45_200, Some("shared")))
        .await
        .unwrap();
    let (cb, _) = e
        .create_collection(req(b, w, 45_200, Some("shared")))
        .await
        .unwrap();
    assert_ne!(ca.id.as_uuid(), cb.id.as_uuid());
    assert_eq!(count_for(&pool, a, "shared").await, 1);
    assert_eq!(count_for(&pool, b, "shared").await, 1);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn concurrent_identical_creates_converge_to_one(pool: PgPool) {
    // 8 concurrent identical creates → exactly one collection, all callers get the
    // same id, zero exposed unique-violation errors (INV-COLLECTION-008, §7/§8).
    let (m, w) = (MerchantId::new(), WalletId::new());
    let mut handles = Vec::new();
    for _ in 0..8 {
        let pool = pool.clone();
        handles.push(tokio::spawn(async move {
            let e = engine(&pool);
            e.create_collection(req(m, w, 45_200, Some("race"))).await
        }));
    }
    let mut ids = Vec::new();
    for h in handles {
        let (c, _) = h
            .await
            .unwrap()
            .expect("no create may fail — no exposed 500");
        ids.push(c.id.as_uuid());
    }
    assert!(
        ids.windows(2).all(|p| p[0] == p[1]),
        "all callers converge on one id: {ids:?}"
    );
    assert_eq!(
        count_for(&pool, m, "race").await,
        1,
        "exactly one collection row"
    );
    let shares: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM collection_shares WHERE collection_id = $1")
            .bind(ids[0])
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(shares, 2, "no duplicated shares under concurrency");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn no_key_always_creates_new(pool: PgPool) {
    let e = engine(&pool);
    let (m, w) = (MerchantId::new(), WalletId::new());
    let (c1, _) = e.create_collection(req(m, w, 45_200, None)).await.unwrap();
    let (c2, _) = e.create_collection(req(m, w, 45_200, None)).await.unwrap();
    assert_ne!(c1.id.as_uuid(), c2.id.as_uuid());
    let n: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM collections WHERE merchant_id = $1 AND idempotency_key IS NULL",
    )
    .bind(m.as_uuid())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(n, 2, "keyless creates are never deduped");
}
