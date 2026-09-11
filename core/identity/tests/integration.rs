use banzami_identity::{
    ConsumerStatus, CreateConsumerRequest, IdentityEngine, IdentityError, PostgresIdentityEngine,
    PostgresIdentityRepository,
};
use sqlx::PgPool;

fn make_engine(pool: PgPool) -> PostgresIdentityEngine<PostgresIdentityRepository> {
    PostgresIdentityEngine::new(PostgresIdentityRepository::new(pool))
}

// ── 1. Valid handle registers successfully ────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn valid_handle_registers(pool: PgPool) {
    let eng = make_engine(pool);
    let identity = eng
        .create(CreateConsumerRequest {
            handle: "ana_silva".into(),
            display_name: Some("Ana Silva".into()),
        })
        .await
        .unwrap();

    assert_eq!(identity.handle, "ana_silva");
    assert_eq!(identity.status, ConsumerStatus::Active);
}

// ── 2. Duplicate handle is rejected ─────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn duplicate_handle_rejected(pool: PgPool) {
    let eng = make_engine(pool);
    eng.create(CreateConsumerRequest {
        handle: "carlos".into(),
        display_name: None,
    })
    .await
    .unwrap();

    let err = eng
        .create(CreateConsumerRequest {
            handle: "carlos".into(),
            display_name: None,
        })
        .await
        .unwrap_err();

    assert!(matches!(err, IdentityError::HandleTaken(_)), "got: {err:?}");
}

// ── 3. Normalization collision rejected ──────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn normalization_collision_rejected(pool: PgPool) {
    let eng = make_engine(pool);
    eng.create(CreateConsumerRequest {
        handle: "@Carlos".into(),
        display_name: None,
    })
    .await
    .unwrap();

    // "@carlos" normalizes to "carlos" — same as the first registration
    let err = eng
        .create(CreateConsumerRequest {
            handle: "@CARLOS".into(),
            display_name: None,
        })
        .await
        .unwrap_err();

    assert!(matches!(err, IdentityError::HandleTaken(_)), "got: {err:?}");
}

// ── 4. Reserved handle rejected ──────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn reserved_handle_rejected(pool: PgPool) {
    let eng = make_engine(pool);
    for reserved in &["admin", "banza", "emis", "multicaixa", "bna"] {
        let err = eng
            .create(CreateConsumerRequest {
                handle: reserved.to_string(),
                display_name: None,
            })
            .await
            .unwrap_err();
        assert!(
            matches!(err, IdentityError::InvalidHandle(_)),
            "expected InvalidHandle for '{reserved}', got: {err:?}"
        );
    }
}

// ── 5. Invalid syntax rejected ───────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn invalid_syntax_rejected(pool: PgPool) {
    let eng = make_engine(pool);
    let too_long = "a".repeat(21);
    let bad_handles = vec![
        "ab",              // too short (2 chars)
        too_long.as_str(), // too long (21 chars)
        "1abc",            // starts with digit
        "_foo",            // starts with underscore
        "foo__bar",        // consecutive underscores
        "foo_",            // trailing underscore
        "héros",           // non-ASCII characters
                           // Note: "Abc" normalizes to "abc" (valid) — uppercase is normalized, not rejected
                           // Note: "@handle" normalizes to "handle" (valid) — @ prefix is stripped, not rejected
    ];

    for handle in bad_handles {
        let err = eng
            .create(CreateConsumerRequest {
                handle: handle.to_string(),
                display_name: None,
            })
            .await
            .unwrap_err();
        assert!(
            matches!(err, IdentityError::InvalidHandle(_)),
            "expected InvalidHandle for '{handle}', got: {err:?}"
        );
    }
}

// ── 6. Handle resolves correctly for active consumer ─────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn handle_resolves_for_active_consumer(pool: PgPool) {
    let eng = make_engine(pool);
    let identity = eng
        .create(CreateConsumerRequest {
            handle: "@Maria".into(),
            display_name: Some("Maria Neto".into()),
        })
        .await
        .unwrap();

    let resolved = eng.resolve_handle("@Maria").await.unwrap();
    assert_eq!(resolved.consumer_id, identity.id);
    assert_eq!(resolved.handle, "maria");
    assert_eq!(resolved.display_name.as_deref(), Some("Maria Neto"));
    assert_eq!(resolved.status, ConsumerStatus::Active);
}

// ── 7. Suspended consumer not returned by resolve_handle ─────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn suspended_consumer_not_resolved(pool: PgPool) {
    let eng = make_engine(pool);
    let identity = eng
        .create(CreateConsumerRequest {
            handle: "rui".into(),
            display_name: None,
        })
        .await
        .unwrap();

    eng.suspend(identity.id, Some("AML hold".into()))
        .await
        .unwrap();

    let err = eng.resolve_handle("rui").await.unwrap_err();
    assert!(
        matches!(err, IdentityError::SuspendedIdentity(_)),
        "got: {err:?}"
    );
}

// ── 8. Closed consumer not returned by resolve_handle ────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn closed_consumer_not_resolved(pool: PgPool) {
    let eng = make_engine(pool);
    let identity = eng
        .create(CreateConsumerRequest {
            handle: "pedro".into(),
            display_name: None,
        })
        .await
        .unwrap();

    eng.close(identity.id).await.unwrap();

    let err = eng.resolve_handle("pedro").await.unwrap_err();
    assert!(
        matches!(err, IdentityError::ClosedIdentity(_)),
        "got: {err:?}"
    );
}

// ── 9. Unknown handle returns HandleNotFound ──────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn unknown_handle_returns_not_found(pool: PgPool) {
    let eng = make_engine(pool);
    let err = eng.resolve_handle("nobody").await.unwrap_err();
    assert!(
        matches!(err, IdentityError::HandleNotFound(_)),
        "got: {err:?}"
    );
}

// ── 10. Concurrent same-handle registration creates exactly one owner ─────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn concurrent_registration_creates_one_owner(pool: PgPool) {
    use std::sync::Arc;
    use tokio::task::JoinSet;

    let eng = Arc::new(make_engine(pool));
    let mut set = JoinSet::new();

    for _ in 0..5 {
        let eng = Arc::clone(&eng);
        set.spawn(async move {
            eng.create(CreateConsumerRequest {
                handle: "disputed".into(),
                display_name: None,
            })
            .await
        });
    }

    let mut successes = 0usize;
    let mut conflicts = 0usize;
    while let Some(result) = set.join_next().await {
        match result.unwrap() {
            Ok(_) => successes += 1,
            Err(IdentityError::HandleTaken(_)) => conflicts += 1,
            Err(e) => panic!("unexpected error: {e:?}"),
        }
    }

    assert_eq!(successes, 1, "exactly one registration must succeed");
    assert_eq!(conflicts, 4, "all other attempts must be rejected");
}

// ── The handle is registered in the one @banza namespace ─────────────────────
//
// This path wrote `consumers` only: its consumers were invisible to every
// @banza lookup, and a Business could claim the same name.
#[sqlx::test(migrations = "../../db/migrations")]
async fn created_consumer_is_in_the_handle_registry(pool: PgPool) {
    let eng = make_engine(pool.clone());
    let identity = eng
        .create(CreateConsumerRequest {
            handle: "registo_ok".into(),
            display_name: None,
        })
        .await
        .unwrap();
    let owner: Option<(String, uuid::Uuid)> = sqlx::query_as(
        "SELECT owner_type, owner_id FROM handle_registry WHERE handle = 'registo_ok'",
    )
    .fetch_optional(&pool)
    .await
    .unwrap();
    assert_eq!(
        owner,
        Some(("CONSUMER".to_string(), identity.id.as_uuid())),
        "the consumer's handle must route to the consumer"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_name_a_business_holds_is_refused_and_nothing_is_written(pool: PgPool) {
    let merchant = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO merchants (id, name, email, status) VALUES ($1,'B','b@x.test','ACTIVE')",
    )
    .bind(merchant)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ('loja_x','MERCHANT',$1)")
        .bind(merchant)
        .execute(&pool)
        .await
        .unwrap();
    let eng = make_engine(pool.clone());
    let err = eng
        .create(CreateConsumerRequest {
            handle: "loja_x".into(),
            display_name: None,
        })
        .await
        .unwrap_err();
    assert!(matches!(err, IdentityError::HandleTaken(_)), "{err:?}");
    let consumers: i64 =
        sqlx::query_scalar("SELECT count(*) FROM consumers WHERE handle = 'loja_x'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        consumers, 0,
        "a refused handle must leave no consumer behind"
    );
}
