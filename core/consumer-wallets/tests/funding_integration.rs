//! Integration tests for the WAL-004 wallet funding engine.
//!
//! Each test runs against a real PostgreSQL database with migrations applied
//! via `#[sqlx::test(migrations = "../../db/migrations")]`.
//!
//! Invariants tested:
//!   INV-WAL-004-1  External callback alone never changes wallet balance.
//!   INV-WAL-004-2  Each settled session maps to exactly one ledger posting.
//!   INV-WAL-004-3  Duplicate provider callbacks cannot duplicate the credit.
//!   INV-WAL-004-4  Reversal preserves immutable audit history.
//!   INV-WAL-004-5  Pending/reconciling operations are never spendable.

use std::sync::Arc;

use chrono::{Duration, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_consumer_wallets::funding::{
    CreateFundingSessionRequest, FundingEngine, FundingError, FundingProvider, FundingSession,
    FundingStatus, PostgresFundingEngine, ReceiveCallbackRequest, ReconcileRequest,
};
use banzami_ledger::{Account, AccountType, LedgerEngine, PostgresLedgerRepository};
use banzami_types::{AccountId, ConsumerId, ConsumerWalletId, Currency, Money};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async fn make_engine(pool: PgPool) -> (PostgresFundingEngine<PostgresLedgerRepository>, AccountId) {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));

    // Transit account: ASSET — external funds arrive here.
    let transit_id = AccountId::new();
    ledger
        .create_account(Account {
            id:           transit_id,
            account_type: AccountType::Asset,
            name:         "test-transit".into(),
            currency:     Currency::AOA,
            created_at:   Utc::now(),
        })
        .await
        .unwrap();

    (PostgresFundingEngine::new(pool, ledger), transit_id)
}

/// Provision a consumer wallet with an available account and return
/// (wallet_id, consumer_id, available_account_id).
async fn make_wallet(pool: &PgPool, ledger: &PostgresLedgerRepository) -> (ConsumerWalletId, ConsumerId, AccountId) {
    let consumer_id = ConsumerId::new();
    let wallet_id   = ConsumerWalletId::new();
    let avail_id    = AccountId::new();
    let rsrv_id     = AccountId::new();

    // Ledger accounts
    ledger.create_account(Account {
        id: avail_id, account_type: AccountType::Liability,
        name: "avail".into(), currency: Currency::AOA, created_at: Utc::now(),
    }).await.unwrap();
    ledger.create_account(Account {
        id: rsrv_id, account_type: AccountType::Liability,
        name: "rsrv".into(), currency: Currency::AOA, created_at: Utc::now(),
    }).await.unwrap();

    // consumers row
    sqlx::query(
        "INSERT INTO consumers (id, handle, status, created_at, updated_at)
         VALUES ($1, $2, 'ACTIVE', NOW(), NOW())"
    )
    .bind(consumer_id.as_uuid())
    .bind(format!("tst{}", &consumer_id.as_uuid().to_string().replace('-', "")[..17]))
    .execute(pool)
    .await
    .unwrap();

    // consumer_wallets row
    sqlx::query(
        "INSERT INTO consumer_wallets
             (id, consumer_id, currency, status, available_account_id, reserved_account_id)
         VALUES ($1, $2, 'AOA', 'ACTIVE', $3, $4)"
    )
    .bind(wallet_id.as_uuid())
    .bind(consumer_id.as_uuid())
    .bind(avail_id.as_uuid())
    .bind(rsrv_id.as_uuid())
    .execute(pool)
    .await
    .unwrap();

    (wallet_id, consumer_id, avail_id)
}

fn funding_req(consumer_id: ConsumerId, wallet_id: ConsumerWalletId) -> CreateFundingSessionRequest {
    CreateFundingSessionRequest {
        consumer_id,
        wallet_id,
        provider:        FundingProvider::Simulated,
        amount:          Money::new(10_000_00, Currency::AOA),
        external_ref:    format!("REF-{}", Uuid::new_v4()),
        idempotency_key: format!("idem-{}", Uuid::new_v4()),
        expires_at:      Utc::now() + Duration::hours(1),
    }
}

// ---------------------------------------------------------------------------
// SCENARIO A — happy path: create → received → callback → reconcile → SETTLED
// ---------------------------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn happy_path_full_funding_flow(pool: PgPool) {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let (engine, transit) = make_engine(pool.clone()).await;
    let (wallet_id, consumer_id, avail_id) = make_wallet(&pool, &ledger).await;

    // Step 1: create session
    let session = engine.create_session(funding_req(consumer_id, wallet_id)).await.unwrap();
    assert_eq!(session.status, FundingStatus::PendingPayment);
    assert!(session.ledger_posting_id.is_none());

    // Step 2: consumer initiates payment at bank/ATM
    let session = engine.mark_payment_received(session.id).await.unwrap();
    assert_eq!(session.status, FundingStatus::PendingProviderConfirmation);

    // Step 3: provider callback arrives
    let session = engine.receive_callback(ReceiveCallbackRequest {
        session_id:        session.id,
        provider_event_id: format!("evt-{}", Uuid::new_v4()),
        payload:           serde_json::json!({"confirmed": true}),
        hmac_valid:        true,
    }).await.unwrap();
    assert_eq!(session.status, FundingStatus::Reconciling);
    assert_eq!(session.reconciliation_count, 1);

    // Step 4: reconcile → SETTLED, ledger posting created
    let session = engine.reconcile(ReconcileRequest {
        session_id:      session.id,
        transit_account: transit,
    }).await.unwrap();
    assert_eq!(session.status, FundingStatus::Settled);
    assert!(session.ledger_posting_id.is_some());
    assert!(session.confirmed_at.is_some());

    // INV-WAL-004-2: exactly one ledger posting linked.
    let posting_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ledger_postings WHERE id = $1"
    )
    .bind(session.ledger_posting_id.unwrap().as_uuid())
    .fetch_one(&pool)
    .await.unwrap();
    assert_eq!(posting_count, 1);

    // Balance on available account must reflect the credit (LIABILITY: negative net = consumer owes).
    let net: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'DEBIT' THEN amount_minor ELSE -amount_minor END), 0)::BIGINT
         FROM ledger_entries WHERE account_id = $1"
    )
    .bind(avail_id.as_uuid())
    .fetch_one(&pool)
    .await.unwrap();
    // LIABILITY CREDIT of 10_000_00 → net = -10_000_00 (consumer's available = +10_000_00)
    assert_eq!(net, -10_000_00_i64);
}

// ---------------------------------------------------------------------------
// INV-WAL-004-1 — callback alone never changes wallet balance
// ---------------------------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn inv_wal_004_1_callback_alone_does_not_credit_wallet(pool: PgPool) {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let (engine, _transit) = make_engine(pool.clone()).await;
    let (wallet_id, consumer_id, avail_id) = make_wallet(&pool, &ledger).await;

    let session = engine.create_session(funding_req(consumer_id, wallet_id)).await.unwrap();
    let session = engine.mark_payment_received(session.id).await.unwrap();

    // Receive callback — session moves to RECONCILING, but no ledger write yet.
    let session = engine.receive_callback(ReceiveCallbackRequest {
        session_id:        session.id,
        provider_event_id: format!("evt-{}", Uuid::new_v4()),
        payload:           serde_json::json!({}),
        hmac_valid:        true,
    }).await.unwrap();
    assert_eq!(session.status, FundingStatus::Reconciling);

    // Balance on available account must still be zero — reconcile has not run.
    let net: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'DEBIT' THEN amount_minor ELSE -amount_minor END), 0)::BIGINT
         FROM ledger_entries WHERE account_id = $1"
    )
    .bind(avail_id.as_uuid())
    .fetch_one(&pool)
    .await.unwrap();
    assert_eq!(net, 0, "callback alone must not credit the wallet");
}

// ---------------------------------------------------------------------------
// INV-WAL-004-3 — duplicate provider callbacks cannot duplicate the credit
// SCENARIO C — duplicate callback from bank
// ---------------------------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn inv_wal_004_3_duplicate_callback_rejected(pool: PgPool) {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let (engine, _transit) = make_engine(pool.clone()).await;
    let (wallet_id, consumer_id, _) = make_wallet(&pool, &ledger).await;

    let session = engine.create_session(funding_req(consumer_id, wallet_id)).await.unwrap();
    let session = engine.mark_payment_received(session.id).await.unwrap();
    let event_id = format!("evt-{}", Uuid::new_v4());

    // First callback succeeds.
    engine.receive_callback(ReceiveCallbackRequest {
        session_id:        session.id,
        provider_event_id: event_id.clone(),
        payload:           serde_json::json!({}),
        hmac_valid:        true,
    }).await.unwrap();

    // Second callback with same event_id must be rejected.
    // Session is now RECONCILING, so we need a fresh session for the second callback test.
    // The duplicate is caught at the provider_callbacks UNIQUE constraint level,
    // independent of session state. Simulate by creating a second session and replaying.
    let session2 = engine.create_session(CreateFundingSessionRequest {
        consumer_id,
        wallet_id,
        provider:        FundingProvider::Simulated,
        amount:          Money::new(5_000_00, Currency::AOA),
        external_ref:    format!("REF2-{}", Uuid::new_v4()),
        idempotency_key: format!("idem2-{}", Uuid::new_v4()),
        expires_at:      Utc::now() + Duration::hours(1),
    }).await.unwrap();
    engine.mark_payment_received(session2.id).await.unwrap();

    // Replay the same event_id → DuplicateCallback.
    let err = engine.receive_callback(ReceiveCallbackRequest {
        session_id:        session2.id,
        provider_event_id: event_id.clone(),
        payload:           serde_json::json!({}),
        hmac_valid:        true,
    }).await.unwrap_err();

    assert!(
        matches!(err, FundingError::DuplicateCallback { .. }),
        "expected DuplicateCallback, got: {err}"
    );

    // Confirm only one row exists in provider_callbacks for this event_id.
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM provider_callbacks WHERE provider_event_id = $1"
    )
    .bind(&event_id)
    .fetch_one(&pool)
    .await.unwrap();
    assert_eq!(count, 1, "duplicate callback must not insert a second row");
}

// ---------------------------------------------------------------------------
// SCENARIO B — delayed settlement (callback arrives late, wallet stays pending)
// ---------------------------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn delayed_callback_settles_eventually(pool: PgPool) {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let (engine, transit) = make_engine(pool.clone()).await;
    let (wallet_id, consumer_id, avail_id) = make_wallet(&pool, &ledger).await;

    let session = engine.create_session(funding_req(consumer_id, wallet_id)).await.unwrap();
    let session = engine.mark_payment_received(session.id).await.unwrap();

    // Simulate 17-minute delay: balance is still 0.
    let net_before: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'DEBIT' THEN amount_minor ELSE -amount_minor END), 0)::BIGINT
         FROM ledger_entries WHERE account_id = $1"
    )
    .bind(avail_id.as_uuid())
    .fetch_one(&pool)
    .await.unwrap();
    assert_eq!(net_before, 0);

    // Callback eventually arrives.
    let session = engine.receive_callback(ReceiveCallbackRequest {
        session_id:        session.id,
        provider_event_id: format!("evt-delayed-{}", Uuid::new_v4()),
        payload:           serde_json::json!({"delay_minutes": 17}),
        hmac_valid:        true,
    }).await.unwrap();

    // Reconcile settles the session.
    let session = engine.reconcile(ReconcileRequest {
        session_id:      session.id,
        transit_account: transit,
    }).await.unwrap();
    assert_eq!(session.status, FundingStatus::Settled);

    let net_after: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'DEBIT' THEN amount_minor ELSE -amount_minor END), 0)::BIGINT
         FROM ledger_entries WHERE account_id = $1"
    )
    .bind(avail_id.as_uuid())
    .fetch_one(&pool)
    .await.unwrap();
    // LIABILITY CREDIT: net = -10_000_00
    assert_eq!(net_after, -10_000_00_i64, "wallet must be credited after delayed settlement");
}

// ---------------------------------------------------------------------------
// SCENARIO D — reversal after settlement (INV-WAL-004-4)
// ---------------------------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn inv_wal_004_4_reversal_preserves_audit_trail(pool: PgPool) {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let (engine, transit) = make_engine(pool.clone()).await;
    let (wallet_id, consumer_id, avail_id) = make_wallet(&pool, &ledger).await;

    // Settle a session.
    let session = engine.create_session(funding_req(consumer_id, wallet_id)).await.unwrap();
    let session = engine.mark_payment_received(session.id).await.unwrap();
    engine.receive_callback(ReceiveCallbackRequest {
        session_id:        session.id,
        provider_event_id: format!("evt-{}", Uuid::new_v4()),
        payload:           serde_json::json!({}),
        hmac_valid:        true,
    }).await.unwrap();
    let settled = engine.reconcile(ReconcileRequest {
        session_id:      session.id,
        transit_account: transit,
    }).await.unwrap();
    assert_eq!(settled.status, FundingStatus::Settled);

    let original_posting_id = settled.ledger_posting_id.unwrap();

    // Now the bank reverses the transaction.
    let reversed = engine.reverse_session(
        settled.id,
        "bank reversal: chargeback".into(),
    ).await.unwrap();
    assert_eq!(reversed.status, FundingStatus::Reversed);
    assert!(reversed.reversed_at.is_some());

    // INV-WAL-004-4: the ORIGINAL posting is still immutable and present.
    let orig_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM ledger_postings WHERE id = $1)"
    )
    .bind(original_posting_id.as_uuid())
    .fetch_one(&pool)
    .await.unwrap();
    assert!(orig_exists, "original posting must be immutable and preserved");

    // Reversal posting must also exist.
    let reversal_posting_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT reversal_posting_id FROM consumer_deposits WHERE id = $1"
    )
    .bind(settled.id)
    .fetch_one(&pool)
    .await.unwrap();
    assert!(reversal_posting_id.is_some(), "reversal posting must be linked");

    // Net balance on available account after reversal should be 0
    // (credit + reversal debit cancel out).
    let net: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'DEBIT' THEN amount_minor ELSE -amount_minor END), 0)::BIGINT
         FROM ledger_entries WHERE account_id = $1"
    )
    .bind(avail_id.as_uuid())
    .fetch_one(&pool)
    .await.unwrap();
    assert_eq!(net, 0, "balance must be zero after reversal offsets original credit");

    // Both postings preserved in ledger — audit trail intact.
    let posting_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ledger_postings WHERE id = ANY($1)"
    )
    .bind(vec![
        original_posting_id.as_uuid(),
        reversal_posting_id.unwrap(),
    ])
    .fetch_one(&pool)
    .await.unwrap();
    assert_eq!(posting_count, 2, "both original and reversal postings must exist");
}

// ---------------------------------------------------------------------------
// SCENARIO E — expired session cannot be settled
// INV-WAL-004-5 — expired operations are never spendable
// ---------------------------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn inv_wal_004_5_expired_session_cannot_be_settled(pool: PgPool) {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let (engine, transit) = make_engine(pool.clone()).await;
    let (wallet_id, consumer_id, _) = make_wallet(&pool, &ledger).await;

    // Create a session with a past expiry.
    let session = engine.create_session(CreateFundingSessionRequest {
        consumer_id,
        wallet_id,
        provider:        FundingProvider::Simulated,
        amount:          Money::new(1_000_00, Currency::AOA),
        external_ref:    format!("REF-{}", Uuid::new_v4()),
        idempotency_key: format!("idem-{}", Uuid::new_v4()),
        expires_at:      Utc::now() - Duration::minutes(5), // already expired
    }).await.unwrap();

    // Expire stale sessions.
    let expired_count = engine.expire_stale_sessions().await.unwrap();
    assert!(expired_count >= 1);

    let fetched = engine.get_session(session.id).await.unwrap();
    assert_eq!(fetched.status, FundingStatus::Expired);

    // Attempting to mark payment received on an expired session must fail.
    let err = engine.mark_payment_received(session.id).await.unwrap_err();
    assert!(
        matches!(err, FundingError::InvalidTransition { from: FundingStatus::Expired, .. }),
        "expired session must reject state transitions: {err}"
    );
}

// ---------------------------------------------------------------------------
// Reconcile idempotency — calling reconcile twice returns same session
// ---------------------------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn reconcile_is_idempotent(pool: PgPool) {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let (engine, transit) = make_engine(pool.clone()).await;
    let (wallet_id, consumer_id, avail_id) = make_wallet(&pool, &ledger).await;

    let session = engine.create_session(funding_req(consumer_id, wallet_id)).await.unwrap();
    let session = engine.mark_payment_received(session.id).await.unwrap();
    engine.receive_callback(ReceiveCallbackRequest {
        session_id:        session.id,
        provider_event_id: format!("evt-{}", Uuid::new_v4()),
        payload:           serde_json::json!({}),
        hmac_valid:        true,
    }).await.unwrap();

    let req = ReconcileRequest { session_id: session.id, transit_account: transit };

    let first  = engine.reconcile(ReconcileRequest { session_id: req.session_id, transit_account: req.transit_account }).await.unwrap();
    let second = engine.reconcile(ReconcileRequest { session_id: req.session_id, transit_account: req.transit_account }).await.unwrap();

    assert_eq!(first.status, FundingStatus::Settled);
    assert_eq!(second.status, FundingStatus::Settled);
    assert_eq!(first.ledger_posting_id, second.ledger_posting_id,
        "idempotent reconcile must return the same posting");

    // Exactly one posting must exist — not two.
    let posting_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ledger_postings WHERE idempotency_key = $1"
    )
    .bind(format!("funding-settle-{}", session.id))
    .fetch_one(&pool)
    .await.unwrap();
    assert_eq!(posting_count, 1, "idempotent reconcile must not create duplicate postings");

    // Balance credited exactly once.
    let net: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'DEBIT' THEN amount_minor ELSE -amount_minor END), 0)::BIGINT
         FROM ledger_entries WHERE account_id = $1"
    )
    .bind(avail_id.as_uuid())
    .fetch_one(&pool)
    .await.unwrap();
    assert_eq!(net, -10_000_00_i64, "balance credited exactly once despite double reconcile");
}

// ---------------------------------------------------------------------------
// Invalid state transition is rejected
// ---------------------------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn invalid_state_transition_is_rejected(pool: PgPool) {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let (engine, transit) = make_engine(pool.clone()).await;
    let (wallet_id, consumer_id, _) = make_wallet(&pool, &ledger).await;

    let session = engine.create_session(funding_req(consumer_id, wallet_id)).await.unwrap();
    // Session is PendingPayment. Trying to receive a callback (requires PendingProviderConfirmation first).
    // receive_callback requires PendingProviderConfirmation → Reconciling transition.
    // PendingPayment → Reconciling is invalid.
    let err = engine.receive_callback(ReceiveCallbackRequest {
        session_id:        session.id,
        provider_event_id: format!("evt-{}", Uuid::new_v4()),
        payload:           serde_json::json!({}),
        hmac_valid:        true,
    }).await.unwrap_err();

    assert!(
        matches!(err, FundingError::InvalidTransition { .. }),
        "PendingPayment → Reconciling must be rejected: {err}"
    );
}

// ---------------------------------------------------------------------------
// create_session is idempotent on idempotency_key
// ---------------------------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn create_session_is_idempotent(pool: PgPool) {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let (engine, _transit) = make_engine(pool.clone()).await;
    let (wallet_id, consumer_id, _) = make_wallet(&pool, &ledger).await;

    let idem_key = format!("idem-fixed-{}", Uuid::new_v4());
    let make = || CreateFundingSessionRequest {
        consumer_id,
        wallet_id,
        provider:        FundingProvider::Simulated,
        amount:          Money::new(2_000_00, Currency::AOA),
        external_ref:    format!("REF-{}", Uuid::new_v4()),
        idempotency_key: idem_key.clone(),
        expires_at:      Utc::now() + Duration::hours(1),
    };

    let first  = engine.create_session(make()).await.unwrap();
    let second = engine.create_session(make()).await.unwrap();

    assert_eq!(first.id, second.id, "same idempotency_key must return the same session");

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM consumer_deposits WHERE idempotency_key = $1"
    )
    .bind(&idem_key)
    .fetch_one(&pool)
    .await.unwrap();
    assert_eq!(count, 1, "idempotent create must not insert duplicate rows");
}
