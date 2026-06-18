//! Integration tests for refund (REF-001) and dispute (REF-002) financial
//! invariants. Each test runs against a fresh PostgreSQL database created by
//! `#[sqlx::test]` with all migrations applied — financial invariants are
//! asserted against real ledger postings, never mocks (CLAUDE.md §7).
//!
//! Scope is strictly internal: ledger / refund / dispute logic. No EMIS, bank,
//! or external withdrawal provider is assumed or exercised.

use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::routes::{disputes, refunds};
use crate::state::{AppState, CoreEnvironment};
use banzami_types::AccountId;

// ───────────────────────── seed helpers ─────────────────────────

async fn ledger_account(pool: &PgPool, account_type: &str, name: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency)
         VALUES ($1, $2, $3, 'AOA') RETURNING id",
    )
    .bind(Uuid::new_v4())
    .bind(account_type)
    .bind(name)
    .fetch_one(pool)
    .await
    .expect("create ledger account")
}

/// Builds a real `AppState` over the test pool with freshly-provisioned system
/// transit/bank ledger accounts (the simulated acquiring provider is used —
/// `ACQUIRING_PROVIDER` is unset in tests).
async fn build_state(pool: PgPool) -> AppState {
    let transit = ledger_account(&pool, "ASSET", "System — Transit").await;
    let bank = ledger_account(&pool, "ASSET", "System — Bank").await;
    AppState::new(
        pool,
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        CoreEnvironment::Sandbox,
    )
}

struct Seed {
    merchant_id: Uuid,
    transaction_id: Uuid,
    merchant_account: Uuid,
}

/// Seeds a merchant wallet (backed by ledger accounts) and one CAPTURED
/// transaction of `amount` minor units, ready to be refunded or disputed.
async fn seed_captured_tx(pool: &PgPool, amount: i64) -> Seed {
    let merchant_id = Uuid::new_v4();
    let available = ledger_account(pool, "LIABILITY", "merchant-available").await;
    let reserved = ledger_account(pool, "LIABILITY", "merchant-reserved").await;
    let wallet_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id)
         VALUES ($1, $2, 'AOA', 'ACTIVE', $3, $4)",
    )
    .bind(wallet_id)
    .bind(merchant_id)
    .bind(available)
    .bind(reserved)
    .execute(pool)
    .await
    .expect("seed wallet");

    let transaction_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO transactions
            (id, idempotency_key, transaction_type, status, amount_minor, fee_minor, currency, merchant_id, wallet_id)
         VALUES ($1, $2, 'PAYMENT', 'CAPTURED', $3, 0, 'AOA', $4, $5)",
    )
    .bind(transaction_id)
    .bind(format!("seed-{transaction_id}"))
    .bind(amount)
    .bind(merchant_id)
    .bind(wallet_id)
    .execute(pool)
    .await
    .expect("seed transaction");

    Seed {
        merchant_id,
        transaction_id,
        merchant_account: available,
    }
}

/// (debit_sum, credit_sum) for a ledger posting identified by its idempotency key.
async fn posting_sums(pool: &PgPool, idempotency_key: &str) -> (i64, i64) {
    let debit = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(e.amount_minor),0)::BIGINT FROM ledger_entries e
         JOIN ledger_postings p ON p.id = e.posting_id
         WHERE p.idempotency_key = $1 AND e.entry_type = 'DEBIT'",
    )
    .bind(idempotency_key)
    .fetch_one(pool)
    .await
    .unwrap();
    let credit = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(e.amount_minor),0)::BIGINT FROM ledger_entries e
         JOIN ledger_postings p ON p.id = e.posting_id
         WHERE p.idempotency_key = $1 AND e.entry_type = 'CREDIT'",
    )
    .bind(idempotency_key)
    .fetch_one(pool)
    .await
    .unwrap();
    (debit, credit)
}

async fn count_postings(pool: &PgPool, idempotency_key: &str) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::BIGINT FROM ledger_postings WHERE idempotency_key = $1",
    )
    .bind(idempotency_key)
    .fetch_one(pool)
    .await
    .unwrap()
}

fn refund_body(seed: &Seed, amount: i64, key: &str) -> refunds::CreateRefundBody {
    refunds::CreateRefundBody {
        transaction_id: seed.transaction_id.to_string(),
        merchant_id: seed.merchant_id.to_string(),
        amount_minor: amount,
        reason: Some("test".into()),
        idempotency_key: key.to_string(),
    }
}

// ═══════════════════════════ REF-001 — refunds ═══════════════════════════

// INV-REF-001 (correct debit/credit + no money creation): a refund posts a
// balanced double entry — one DEBIT on the merchant account equal to one CREDIT
// on the transit account; debits == credits, so no value is created.
#[sqlx::test(migrations = "../../db/migrations")]
async fn refund_posts_balanced_double_entry(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let seed = seed_captured_tx(&pool, 1_000).await;

    let (status, Json(resp)) = refunds::create(State(state), Json(refund_body(&seed, 1_000, "r1")))
        .await
        .expect("refund should succeed");

    assert_eq!(status, axum::http::StatusCode::CREATED);
    assert_eq!(
        resp.status, "SUCCEEDED",
        "status transition PENDING→SUCCEEDED"
    );

    let key = format!("refund-{}", resp.id);
    let (debit, credit) = posting_sums(&pool, &key).await;
    assert_eq!(debit, 1_000, "merchant debited full amount");
    assert_eq!(credit, 1_000, "transit credited full amount");
    assert_eq!(debit, credit, "no money creation: debits == credits");

    // The debit must hit the merchant's available account.
    let merchant_debit = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(e.amount_minor),0)::BIGINT FROM ledger_entries e
         JOIN ledger_postings p ON p.id = e.posting_id
         WHERE p.idempotency_key = $1 AND e.entry_type='DEBIT' AND e.account_id = $2",
    )
    .bind(&key)
    .bind(seed.merchant_account)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        merchant_debit, 1_000,
        "debit posted to merchant available account"
    );
}

// INV-REF-001-1 (refund ceiling): the sum of refunds may not exceed the
// captured amount; an over-refund is blocked at write time.
#[sqlx::test(migrations = "../../db/migrations")]
async fn partial_refunds_cannot_exceed_captured(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let seed = seed_captured_tx(&pool, 1_000).await;

    // 600 ok
    let _ = refunds::create(State(state.clone()), Json(refund_body(&seed, 600, "p1")))
        .await
        .expect("first partial refund ok");

    // 600 + 500 = 1100 > 1000 → blocked
    let err = refunds::create(State(state.clone()), Json(refund_body(&seed, 500, "p2")))
        .await
        .expect_err("over-refund must be blocked");
    assert_eq!(err.code, "REFUND_EXCEEDS_CAPTURED");

    // 600 + 400 = 1000 → exactly the ceiling, ok
    let _ = refunds::create(State(state.clone()), Json(refund_body(&seed, 400, "p3")))
        .await
        .expect("refund up to the ceiling ok");

    // One more cent over the ceiling → blocked
    let err = refunds::create(State(state), Json(refund_body(&seed, 1, "p4")))
        .await
        .expect_err("any amount beyond the ceiling must be blocked");
    assert_eq!(err.code, "REFUND_EXCEEDS_CAPTURED");
}

// INV-REF-001-2 (idempotency / no double refund): replaying the same
// idempotency key returns the same refund and creates no duplicate ledger
// posting or entries.
#[sqlx::test(migrations = "../../db/migrations")]
async fn refund_idempotent_replay_is_single_posting(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let seed = seed_captured_tx(&pool, 1_000).await;

    let (_, Json(first)) = refunds::create(
        State(state.clone()),
        Json(refund_body(&seed, 700, "same-key")),
    )
    .await
    .expect("first refund");
    let (_, Json(second)) =
        refunds::create(State(state), Json(refund_body(&seed, 700, "same-key")))
            .await
            .expect("replay returns existing refund");

    assert_eq!(first.id, second.id, "replay returns the same refund id");

    // Exactly one refund row and one ledger posting / one DR-CR pair.
    let refund_rows = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::BIGINT FROM refunds WHERE idempotency_key = $1",
    )
    .bind("same-key")
    .fetch_one(&pool)
    .await
    .unwrap_or(0);
    assert_eq!(refund_rows, 1, "no duplicate refund row");

    let key = format!("refund-{}", first.id);
    assert_eq!(
        count_postings(&pool, &key).await,
        1,
        "single ledger posting"
    );
    let (debit, credit) = posting_sums(&pool, &key).await;
    assert_eq!(
        (debit, credit),
        (700, 700),
        "no double refund, still balanced"
    );
}

// Status-transition guard: only CAPTURED/SETTLED transactions are refundable.
#[sqlx::test(migrations = "../../db/migrations")]
async fn refund_rejected_on_non_captured_transaction(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let seed = seed_captured_tx(&pool, 1_000).await;
    sqlx::query("UPDATE transactions SET status = 'PENDING' WHERE id = $1")
        .bind(seed.transaction_id)
        .execute(&pool)
        .await
        .unwrap();

    let err = refunds::create(State(state), Json(refund_body(&seed, 100, "x")))
        .await
        .expect_err("non-captured transaction is not refundable");
    assert_eq!(err.code, "INVALID_TRANSACTION_STATUS");
}

// Auditability/traceability: a successful refund writes a refund event and an
// immutable audit-log entry.
#[sqlx::test(migrations = "../../db/migrations")]
async fn refund_is_traceable_via_event_and_audit_log(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let seed = seed_captured_tx(&pool, 1_000).await;
    let (_, Json(resp)) = refunds::create(State(state), Json(refund_body(&seed, 500, "t1")))
        .await
        .expect("refund");

    let events = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::BIGINT FROM refund_events WHERE refund_id = $1 AND event_type = 'refund.succeeded'",
    )
    .bind(Uuid::parse_str(&resp.id).unwrap())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(events, 1, "refund.succeeded event recorded");

    let audits = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::BIGINT FROM audit_log WHERE action = 'REFUND_PROCESSED' AND subject = $1",
    )
    .bind(format!("transaction:{}", seed.transaction_id))
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audits, 1, "immutable audit-log entry recorded");
}

// ═══════════════════════════ REF-002 — disputes ═══════════════════════════

async fn open_dispute(state: &AppState, tx: Uuid, consumer: Uuid) -> disputes::DisputeResponse {
    let (_, Json(d)) = disputes::open(
        State(state.clone()),
        Json(disputes::OpenDisputeBody {
            transaction_id: tx.to_string(),
            consumer_id: consumer.to_string(),
            reason: "item not received".into(),
        }),
    )
    .await
    .expect("open dispute");
    d
}

// Lifecycle consistency: OPEN → UNDER_REVIEW (on evidence) → terminal (resolve).
#[sqlx::test(migrations = "../../db/migrations")]
async fn dispute_lifecycle_open_review_resolve(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let seed = seed_captured_tx(&pool, 2_000).await;
    let consumer = Uuid::new_v4();

    let d = open_dispute(&state, seed.transaction_id, consumer).await;
    assert_eq!(d.status, "OPEN");

    let did = Uuid::parse_str(&d.id).unwrap();
    let _ = disputes::submit_evidence(
        State(state.clone()),
        Path(d.id.clone()),
        Json(disputes::SubmitEvidenceBody {
            submitted_by: seed.merchant_id.to_string(),
            party: "MERCHANT".into(),
            description: "proof of delivery".into(),
            file_url: None,
        }),
    )
    .await
    .expect("submit evidence");

    let status = sqlx::query_scalar::<_, String>("SELECT status FROM disputes WHERE id = $1")
        .bind(did)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(status, "UNDER_REVIEW", "evidence moves OPEN→UNDER_REVIEW");

    let Json(resolved) = disputes::resolve(
        State(state),
        Path(d.id.clone()),
        Json(disputes::ResolveDisputeBody {
            outcome: "WON_BY_MERCHANT".into(),
            resolution_notes: Some("evidence accepted".into()),
            resolved_by: Uuid::new_v4().to_string(),
        }),
    )
    .await
    .expect("resolve");
    assert_eq!(resolved.status, "WON_BY_MERCHANT");
    assert!(resolved.resolved_at.is_some(), "resolved_at stamped");
}

// A second open dispute on the same transaction is rejected.
#[sqlx::test(migrations = "../../db/migrations")]
async fn duplicate_open_dispute_rejected(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let seed = seed_captured_tx(&pool, 2_000).await;
    let consumer = Uuid::new_v4();
    open_dispute(&state, seed.transaction_id, consumer).await;

    let err = disputes::open(
        State(state),
        Json(disputes::OpenDisputeBody {
            transaction_id: seed.transaction_id.to_string(),
            consumer_id: consumer.to_string(),
            reason: "again".into(),
        }),
    )
    .await
    .expect_err("duplicate open dispute must be rejected");
    assert_eq!(err.code, "DISPUTE_ALREADY_OPEN");
}

// Resolve idempotency: a resolved dispute cannot be resolved again.
#[sqlx::test(migrations = "../../db/migrations")]
async fn resolve_is_not_repeatable(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let seed = seed_captured_tx(&pool, 2_000).await;
    let d = open_dispute(&state, seed.transaction_id, Uuid::new_v4()).await;

    let body = || disputes::ResolveDisputeBody {
        outcome: "WON_BY_MERCHANT".into(),
        resolution_notes: None,
        resolved_by: Uuid::new_v4().to_string(),
    };
    let _ = disputes::resolve(State(state.clone()), Path(d.id.clone()), Json(body()))
        .await
        .expect("first resolve");
    let err = disputes::resolve(State(state), Path(d.id.clone()), Json(body()))
        .await
        .expect_err("second resolve must be rejected");
    assert_eq!(err.code, "DISPUTE_ALREADY_RESOLVED");
}

// Evidence cannot be submitted to a closed/resolved dispute.
#[sqlx::test(migrations = "../../db/migrations")]
async fn evidence_rejected_after_resolution(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let seed = seed_captured_tx(&pool, 2_000).await;
    let d = open_dispute(&state, seed.transaction_id, Uuid::new_v4()).await;

    let _ = disputes::resolve(
        State(state.clone()),
        Path(d.id.clone()),
        Json(disputes::ResolveDisputeBody {
            outcome: "CLOSED".into(),
            resolution_notes: None,
            resolved_by: Uuid::new_v4().to_string(),
        }),
    )
    .await
    .expect("resolve");

    let err = disputes::submit_evidence(
        State(state),
        Path(d.id.clone()),
        Json(disputes::SubmitEvidenceBody {
            submitted_by: seed.merchant_id.to_string(),
            party: "MERCHANT".into(),
            description: "late".into(),
            file_url: None,
        }),
    )
    .await
    .expect_err("cannot submit evidence to a closed dispute");
    assert_eq!(err.code, "DISPUTE_CLOSED");
}

// WON_BY_CONSUMER issues a balanced refund posting (merchant DR == consumer CR)
// with no money creation, and is idempotent on the posting key.
#[sqlx::test(migrations = "../../db/migrations")]
async fn won_by_consumer_posts_balanced_refund(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let seed = seed_captured_tx(&pool, 2_000).await;

    // Seed an active consumer + consumer wallet so the resolve posting can land.
    let consumer = Uuid::new_v4();
    sqlx::query("INSERT INTO consumers (id, handle, status) VALUES ($1, $2, 'ACTIVE')")
        .bind(consumer)
        .bind(format!("c{}", &consumer.to_string()[..8]))
        .execute(&pool)
        .await
        .unwrap();
    let c_avail = ledger_account(&pool, "LIABILITY", "consumer-available").await;
    let c_reserved = ledger_account(&pool, "LIABILITY", "consumer-reserved").await;
    sqlx::query(
        "INSERT INTO consumer_wallets (id, consumer_id, currency, status, available_account_id, reserved_account_id)
         VALUES ($1, $2, 'AOA', 'ACTIVE', $3, $4)",
    )
    .bind(Uuid::new_v4())
    .bind(consumer)
    .bind(c_avail)
    .bind(c_reserved)
    .execute(&pool)
    .await
    .unwrap();

    let d = open_dispute(&state, seed.transaction_id, consumer).await;
    let did = Uuid::parse_str(&d.id).unwrap();

    let _ = disputes::resolve(
        State(state),
        Path(d.id.clone()),
        Json(disputes::ResolveDisputeBody {
            outcome: "WON_BY_CONSUMER".into(),
            resolution_notes: Some("consumer wins".into()),
            resolved_by: Uuid::new_v4().to_string(),
        }),
    )
    .await
    .expect("resolve won-by-consumer");

    let key = format!("dispute-refund-{did}");
    assert_eq!(
        count_postings(&pool, &key).await,
        1,
        "single dispute-refund posting"
    );
    let (debit, credit) = posting_sums(&pool, &key).await;
    assert_eq!(debit, 2_000, "merchant debited the disputed amount");
    assert_eq!(credit, 2_000, "consumer credited the disputed amount");
    assert_eq!(debit, credit, "no money creation: debits == credits");

    // Consumer receives the credit on their available account.
    let consumer_credit = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(e.amount_minor),0)::BIGINT FROM ledger_entries e
         JOIN ledger_postings p ON p.id = e.posting_id
         WHERE p.idempotency_key = $1 AND e.entry_type='CREDIT' AND e.account_id = $2",
    )
    .bind(&key)
    .bind(c_avail)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        consumer_credit, 2_000,
        "credit lands on consumer available account"
    );
}

// Auditability: opening and resolving a dispute both write immutable audit-log
// entries.
#[sqlx::test(migrations = "../../db/migrations")]
async fn dispute_open_and_resolve_are_audited(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let seed = seed_captured_tx(&pool, 2_000).await;
    let d = open_dispute(&state, seed.transaction_id, Uuid::new_v4()).await;
    let _ = disputes::resolve(
        State(state),
        Path(d.id.clone()),
        Json(disputes::ResolveDisputeBody {
            outcome: "WON_BY_MERCHANT".into(),
            resolution_notes: None,
            resolved_by: Uuid::new_v4().to_string(),
        }),
    )
    .await
    .expect("resolve");

    let opened = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::BIGINT FROM audit_log WHERE action = 'DISPUTE_OPENED' AND subject = $1",
    )
    .bind(format!("transaction:{}", seed.transaction_id))
    .fetch_one(&pool)
    .await
    .unwrap();
    let resolved = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::BIGINT FROM audit_log WHERE action = 'DISPUTE_RESOLVED' AND subject = $1",
    )
    .bind(format!("dispute:{}", d.id))
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(opened, 1, "DISPUTE_OPENED audited");
    assert_eq!(resolved, 1, "DISPUTE_RESOLVED audited");
}
