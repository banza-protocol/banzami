// Integration tests for P2P-001 — @banza to @banza instant transfer.
//
// These tests replicate the production orchestration:
//   1. activate sender + recipient wallets via ConsumerWalletEngine
//   2. resolve recipient via resolve_to_wallet() (HDL-002)
//   3. execute transfer via TransferEngine::send()
//
// Invariants verified:
//   INV-P2P-001-1  transfer debits sender and credits recipient by the exact amount
//   INV-P2P-001-2  every completed P2P transfer is backed by exactly one balanced ledger posting
//   INV-P2P-001-3  concurrent transfers against the same sender cannot overdraw the wallet
//   INV-P2P-001-4  the same idempotency_key always returns the same transfer record
//   INV-P2P-001-5  recipient_handle is snapshotted on the transfer for audit

use std::sync::Arc;

use sqlx::PgPool;

use banzami_consumer_wallets::{
    CompleteOnboardingRequest, ConsumerWalletEngine, ConsumerWalletError,
    PostgresConsumerWalletEngine, PostgresConsumerWalletRepository, PostgresOnboardingRepository,
    StartOnboardingRequest, VerifyOtpRequest,
};
use banzami_ledger::PostgresLedgerRepository;
use banzami_transfers::{
    PostgresTransferEngine, PostgresTransferRepository, SendTransferRequest, TransferEngine,
    TransferError,
};
use banzami_types::Currency;

// ---------------------------------------------------------------------------
// Test setup helpers
// ---------------------------------------------------------------------------

fn cw_engine(pool: PgPool) -> impl ConsumerWalletEngine {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let onboard_repo = PostgresOnboardingRepository::new(pool.clone());
    let wallet_repo = PostgresConsumerWalletRepository::new(pool.clone());
    PostgresConsumerWalletEngine::with_pool(pool, ledger, onboard_repo, wallet_repo)
}

fn transfer_engine(pool: PgPool) -> impl TransferEngine {
    let repo = PostgresTransferRepository::new(pool.clone());
    PostgresTransferEngine::new(pool, repo)
}

/// Activates a consumer wallet via the full onboarding flow.
/// Returns the normalized handle (without @).
async fn activate_wallet(eng: &impl ConsumerWalletEngine, phone: &str, handle: &str) -> String {
    let session = eng
        .start_onboarding(StartOnboardingRequest {
            phone_number: phone.into(),
            currency: Currency::AOA,
            otp_plaintext_for_test: Some("123456".into()),
        })
        .await
        .unwrap();

    eng.verify_otp(VerifyOtpRequest {
        session_id: session.id,
        otp_code: "123456".into(),
    })
    .await
    .unwrap();

    eng.complete_onboarding(CompleteOnboardingRequest {
        session_id: session.id,
        banza_handle: handle.into(),
        pin: "0000".into(),
    })
    .await
    .unwrap();

    handle.to_string()
}

/// Seeds the available ledger account of a just-activated wallet with `balance_minor`.
async fn seed_balance(pool: &PgPool, handle: &str, balance_minor: i64) {
    let account_id: uuid::Uuid = sqlx::query_scalar(
        "SELECT w.available_account_id
         FROM consumer_wallets w
         JOIN consumers c ON c.id = w.consumer_id
         WHERE c.handle = $1 AND w.status = 'ACTIVE'
         LIMIT 1",
    )
    .bind(handle)
    .fetch_one(pool)
    .await
    .unwrap();

    let posting_id = uuid::Uuid::new_v4();
    let entry_id = uuid::Uuid::new_v4();

    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, 'test seed', $2, NOW())",
    )
    .bind(posting_id)
    .bind(format!("seed-{handle}-{balance_minor}"))
    .execute(pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO ledger_entries
         (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
         VALUES ($1, $2, $3, 'CREDIT', $4, 'AOA', NOW())",
    )
    .bind(entry_id)
    .bind(posting_id)
    .bind(account_id)
    .bind(balance_minor)
    .execute(pool)
    .await
    .unwrap();
}

/// Returns the current available balance (in minor units) for a handle's active wallet.
async fn available_balance(pool: &PgPool, handle: &str) -> i64 {
    let account_id: uuid::Uuid = sqlx::query_scalar(
        "SELECT w.available_account_id
         FROM consumer_wallets w
         JOIN consumers c ON c.id = w.consumer_id
         WHERE c.handle = $1 AND w.status = 'ACTIVE'
         LIMIT 1",
    )
    .bind(handle)
    .fetch_one(pool)
    .await
    .unwrap();

    sqlx::query_scalar(
        "SELECT COALESCE(
             SUM(CASE entry_type
                 WHEN 'DEBIT'  THEN -amount_minor
                 WHEN 'CREDIT' THEN  amount_minor
                 END),
             0)::BIGINT
         FROM ledger_entries
         WHERE account_id = $1",
    )
    .bind(account_id)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// Orchestrates a P2P transfer via handle resolution + transfer engine (mirrors the API handler).
async fn p2p_send(
    cw_eng: &impl ConsumerWalletEngine,
    tf_eng: &impl TransferEngine,
    sender_handle: &str,
    recipient_handle: &str,
    amount_minor: i64,
    idempotency_key: &str,
    note: Option<&str>,
) -> Result<banzami_transfers::Transfer, TransferError> {
    let currency = Currency::AOA;
    let sender = cw_eng
        .resolve_to_wallet(sender_handle, currency)
        .await
        .map_err(|_| TransferError::WalletNotFound {
            consumer_id: banzami_types::ConsumerId::new(),
            currency,
        })?;
    let recipient = cw_eng
        .resolve_to_wallet(recipient_handle, currency)
        .await
        .map_err(|e| match e {
            ConsumerWalletError::HandleNotFound(h) => TransferError::RecipientNotFound(h),
            ConsumerWalletError::WalletCannotReceive(_)
            | ConsumerWalletError::SuspendedIdentity(_)
            | ConsumerWalletError::ClosedIdentity(_) => {
                TransferError::RecipientNotRoutable(recipient_handle.to_string())
            }
            _ => TransferError::WalletNotFound {
                consumer_id: banzami_types::ConsumerId::new(),
                currency,
            },
        })?;

    tf_eng
        .send(SendTransferRequest {
            idempotency_key: idempotency_key.to_string(),
            sender_id: sender.consumer_id,
            recipient_id: recipient.consumer_id,
            amount_minor,
            currency,
            description: note.map(str::to_string),
            recipient_handle: Some(recipient.normalized_handle),
            recipient_account_id: None,
        })
        .await
}

// ---------------------------------------------------------------------------
// 1. Happy path — @joao sends 2,000 Kz to @ana (INV-P2P-001-1)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn happy_path_p2p_transfer(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let tf = transfer_engine(pool.clone());

    activate_wallet(&cw, "+244911001001", "joao_p2p").await;
    activate_wallet(&cw, "+244911001002", "ana_p2p").await;
    seed_balance(&pool, "joao_p2p", 500_000).await; // 5,000 Kz

    let transfer = p2p_send(
        &cw,
        &tf,
        "@joao_p2p",
        "@ana_p2p",
        200_000,
        "key-001",
        Some("almoço"),
    )
    .await
    .unwrap();

    assert_eq!(transfer.amount.amount_minor(), 200_000);
    assert_eq!(transfer.status.as_str(), "COMPLETED");
    assert!(transfer.ledger_posting_id.is_some());
}

// ---------------------------------------------------------------------------
// 2. Idempotency — same key returns the original transfer (INV-P2P-001-4)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn idempotency_returns_original(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let tf = transfer_engine(pool.clone());

    activate_wallet(&cw, "+244911001003", "joao_idem").await;
    activate_wallet(&cw, "+244911001004", "ana_idem").await;
    seed_balance(&pool, "joao_idem", 500_000).await;

    let t1 = p2p_send(
        &cw,
        &tf,
        "@joao_idem",
        "@ana_idem",
        100_000,
        "key-idem",
        None,
    )
    .await
    .unwrap();
    let t2 = p2p_send(
        &cw,
        &tf,
        "@joao_idem",
        "@ana_idem",
        100_000,
        "key-idem",
        None,
    )
    .await
    .unwrap();

    assert_eq!(
        t1.id, t2.id,
        "idempotent call must return the same transfer"
    );
    // Balance must only have been deducted once.
    let balance = available_balance(&pool, "joao_idem").await;
    assert_eq!(
        balance, 400_000,
        "balance must only decrease once for idempotent transfer"
    );
}

// ---------------------------------------------------------------------------
// 3. Insufficient funds
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn insufficient_funds_rejected(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let tf = transfer_engine(pool.clone());

    activate_wallet(&cw, "+244911001005", "sender_insuf").await;
    activate_wallet(&cw, "+244911001006", "recip_insuf").await;
    seed_balance(&pool, "sender_insuf", 100_000).await; // 1,000 Kz

    let err = p2p_send(
        &cw,
        &tf,
        "@sender_insuf",
        "@recip_insuf",
        200_000,
        "key-insuf",
        None,
    )
    .await
    .unwrap_err();

    assert!(
        matches!(err, TransferError::InsufficientFunds { .. }),
        "got: {err:?}"
    );
}

// ---------------------------------------------------------------------------
// 4. Self-transfer — same handle for sender and recipient
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn self_transfer_rejected(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let tf = transfer_engine(pool.clone());

    activate_wallet(&cw, "+244911001007", "joao_self").await;
    seed_balance(&pool, "joao_self", 500_000).await;

    // The engine's send() catches self-transfer via consumer_id equality.
    let err = p2p_send(
        &cw,
        &tf,
        "@joao_self",
        "@joao_self",
        100_000,
        "key-self",
        None,
    )
    .await
    .unwrap_err();

    assert!(matches!(err, TransferError::SelfTransfer), "got: {err:?}");
}

// ---------------------------------------------------------------------------
// 5. Recipient handle not found
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn recipient_not_found(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let tf = transfer_engine(pool.clone());

    activate_wallet(&cw, "+244911001008", "joao_norf").await;
    seed_balance(&pool, "joao_norf", 500_000).await;

    let err = p2p_send(
        &cw,
        &tf,
        "@joao_norf",
        "@ghost_nobody",
        100_000,
        "key-norf",
        None,
    )
    .await
    .unwrap_err();

    assert!(
        matches!(err, TransferError::RecipientNotFound(_)),
        "got: {err:?}"
    );
}

// ---------------------------------------------------------------------------
// 6. Malformed recipient handle — rejected before DB hit
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn malformed_recipient_handle_rejected(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let bad = ["1abc", "__foo", "foo_", "ab", &"a".repeat(21), "héros"];

    for h in &bad {
        let err = cw.resolve_to_wallet(h, Currency::AOA).await.unwrap_err();
        assert!(
            matches!(err, ConsumerWalletError::InvalidHandle(_)),
            "expected InvalidHandle for '{h}', got: {err:?}"
        );
    }
    let _ = transfer_engine(pool); // ensure engine compiles in this test
}

// ---------------------------------------------------------------------------
// 7. Sender handle not found
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn sender_not_found(pool: PgPool) {
    let cw = cw_engine(pool.clone());

    let err = cw
        .resolve_to_wallet("ghost_sender", Currency::AOA)
        .await
        .unwrap_err();

    assert!(
        matches!(err, ConsumerWalletError::HandleNotFound(_)),
        "got: {err:?}"
    );
}

// ---------------------------------------------------------------------------
// 8. Malformed sender handle — rejected before DB hit
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn malformed_sender_handle_rejected(pool: PgPool) {
    let cw = cw_engine(pool.clone());

    let err = cw
        .resolve_to_wallet("BAD_HANDLE!", Currency::AOA)
        .await
        .unwrap_err();

    assert!(
        matches!(err, ConsumerWalletError::InvalidHandle(_)),
        "got: {err:?}"
    );
}

// ---------------------------------------------------------------------------
// 9. Zero amount rejected
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn zero_amount_rejected(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let tf = transfer_engine(pool.clone());

    activate_wallet(&cw, "+244911001009", "joao_zero").await;
    activate_wallet(&cw, "+244911001010", "ana_zero").await;
    seed_balance(&pool, "joao_zero", 500_000).await;

    let err = p2p_send(&cw, &tf, "@joao_zero", "@ana_zero", 0, "key-zero", None)
        .await
        .unwrap_err();

    assert!(matches!(err, TransferError::InvalidAmount), "got: {err:?}");
}

// ---------------------------------------------------------------------------
// 10. Negative amount rejected
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn negative_amount_rejected(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let tf = transfer_engine(pool.clone());

    activate_wallet(&cw, "+244911001011", "joao_neg").await;
    activate_wallet(&cw, "+244911001012", "ana_neg").await;
    seed_balance(&pool, "joao_neg", 500_000).await;

    let err = p2p_send(&cw, &tf, "@joao_neg", "@ana_neg", -100_000, "key-neg", None)
        .await
        .unwrap_err();

    assert!(matches!(err, TransferError::InvalidAmount), "got: {err:?}");
}

// ---------------------------------------------------------------------------
// 11. Sender available balance reduced by transfer amount (INV-P2P-001-1)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn sender_balance_reduced(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let tf = transfer_engine(pool.clone());

    activate_wallet(&cw, "+244911001013", "joao_baldr").await;
    activate_wallet(&cw, "+244911001014", "ana_baldr").await;
    seed_balance(&pool, "joao_baldr", 500_000).await;

    p2p_send(
        &cw,
        &tf,
        "@joao_baldr",
        "@ana_baldr",
        200_000,
        "key-baldr",
        None,
    )
    .await
    .unwrap();

    let balance = available_balance(&pool, "joao_baldr").await;
    assert_eq!(
        balance, 300_000,
        "sender balance should be 3,000 Kz after sending 2,000 Kz"
    );
}

// ---------------------------------------------------------------------------
// 12. Recipient available balance increased by transfer amount (INV-P2P-001-1)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn recipient_balance_increased(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let tf = transfer_engine(pool.clone());

    activate_wallet(&cw, "+244911001015", "joao_balcr").await;
    activate_wallet(&cw, "+244911001016", "ana_balcr").await;
    seed_balance(&pool, "joao_balcr", 500_000).await;

    p2p_send(
        &cw,
        &tf,
        "@joao_balcr",
        "@ana_balcr",
        200_000,
        "key-balcr",
        None,
    )
    .await
    .unwrap();

    let balance = available_balance(&pool, "ana_balcr").await;
    assert_eq!(
        balance, 200_000,
        "recipient balance should be 2,000 Kz after receiving"
    );
}

// ---------------------------------------------------------------------------
// 13. Concurrent transfers — two 6k sends from 10k balance (INV-P2P-001-3)
//
// Uses concrete Arc types to satisfy tokio::spawn's Send bound.
// The p2p_send helper uses opaque impl Trait whose futures are not guaranteed
// Send, so we inline the resolve+send logic with concrete types here.
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn concurrent_sends_cannot_overdraw(pool: PgPool) {
    use banzami_consumer_wallets::{
        ConsumerWalletEngine, PostgresConsumerWalletEngine, PostgresConsumerWalletRepository,
        PostgresOnboardingRepository,
    };
    use banzami_ledger::PostgresLedgerRepository;
    use banzami_transfers::{PostgresTransferEngine, PostgresTransferRepository, TransferEngine};
    use std::sync::Arc;
    use tokio::task::JoinSet;

    // Build concrete Arc-wrapped engines for this test only.
    let cw_arc: Arc<PostgresConsumerWalletEngine<_, _, _>> = {
        let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
        let onboard_repo = PostgresOnboardingRepository::new(pool.clone());
        let wallet_repo = PostgresConsumerWalletRepository::new(pool.clone());
        Arc::new(PostgresConsumerWalletEngine::with_pool(
            pool.clone(),
            ledger,
            onboard_repo,
            wallet_repo,
        ))
    };
    let tf_arc: Arc<PostgresTransferEngine<PostgresTransferRepository>> = {
        let repo = PostgresTransferRepository::new(pool.clone());
        Arc::new(PostgresTransferEngine::new(pool.clone(), repo))
    };

    activate_wallet(&*cw_arc, "+244911001017", "joao_conc").await;
    activate_wallet(&*cw_arc, "+244911001018", "ana_conc").await;
    seed_balance(&pool, "joao_conc", 1_000_000).await; // 10,000 Kz

    // Resolve sender + recipient once (static data, safe to clone).
    let currency = banzami_types::Currency::AOA;
    let sender = cw_arc
        .resolve_to_wallet("@joao_conc", currency)
        .await
        .unwrap();
    let recipient = cw_arc
        .resolve_to_wallet("@ana_conc", currency)
        .await
        .unwrap();
    let sender_id = sender.consumer_id;
    let recipient_id = recipient.consumer_id;

    let mut set: JoinSet<Result<banzami_transfers::Transfer, TransferError>> = JoinSet::new();
    for i in 0..2u32 {
        let tf = Arc::clone(&tf_arc);
        let key = format!("key-conc-{i}");
        set.spawn(async move {
            tf.send(SendTransferRequest {
                idempotency_key: key,
                sender_id,
                recipient_id,
                amount_minor: 600_000, // 6,000 Kz
                currency,
                description: None,
                recipient_handle: Some("ana_conc".into()),
                recipient_account_id: None,
            })
            .await
        });
    }

    let mut successes = 0usize;
    let mut failures = 0usize;
    while let Some(r) = set.join_next().await {
        match r.unwrap() {
            Ok(_) => successes += 1,
            Err(TransferError::InsufficientFunds { .. }) => failures += 1,
            Err(e) => panic!("unexpected error: {e:?}"),
        }
    }
    assert_eq!(
        successes, 1,
        "exactly one of the two 6k transfers must succeed"
    );
    assert_eq!(failures, 1, "exactly one must fail with InsufficientFunds");

    let final_balance = available_balance(&pool, "joao_conc").await;
    assert_eq!(
        final_balance, 400_000,
        "exactly 6,000 Kz must have left the wallet"
    );
}

// ---------------------------------------------------------------------------
// 14. Zero-sum ledger invariant (INV-P2P-001-2)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn zero_sum_ledger_invariant(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let tf = transfer_engine(pool.clone());

    activate_wallet(&cw, "+244911001019", "joao_zero_sum").await;
    activate_wallet(&cw, "+244911001020", "ana_zero_sum").await;
    seed_balance(&pool, "joao_zero_sum", 500_000).await;

    let transfer = p2p_send(
        &cw,
        &tf,
        "@joao_zero_sum",
        "@ana_zero_sum",
        200_000,
        "key-zero-sum",
        None,
    )
    .await
    .unwrap();

    // The ledger posting backing this transfer must have balanced entries.
    // DR amount + CR amount = 0 when signed correctly.
    let posting_id = transfer.ledger_posting_id.unwrap();
    let signed_sum: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(
             CASE entry_type
                 WHEN 'DEBIT'  THEN -amount_minor
                 WHEN 'CREDIT' THEN  amount_minor
             END
         ), 0)::BIGINT
         FROM ledger_entries
         WHERE posting_id = $1",
    )
    .bind(posting_id.as_uuid())
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(signed_sum, 0, "double-entry posting must net to zero");
}

// ---------------------------------------------------------------------------
// 15. recipient_handle is snapshotted on the transfer record (INV-P2P-001-5)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn recipient_handle_snapshotted(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let tf = transfer_engine(pool.clone());

    activate_wallet(&cw, "+244911001021", "joao_snap").await;
    activate_wallet(&cw, "+244911001022", "ana_snap").await;
    seed_balance(&pool, "joao_snap", 500_000).await;

    let transfer = p2p_send(
        &cw,
        &tf,
        "@joao_snap",
        "@ANA_SNAP", // uppercase — must be normalized to "ana_snap"
        200_000,
        "key-snap",
        None,
    )
    .await
    .unwrap();

    assert_eq!(
        transfer.recipient_handle.as_deref(),
        Some("ana_snap"),
        "recipient_handle must be normalized and snapshotted"
    );
}

// ---------------------------------------------------------------------------
// 16. Chain of transfers — A→B, then B→C (INV-P2P-001-1 chained)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn chain_of_transfers(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let tf = transfer_engine(pool.clone());

    activate_wallet(&cw, "+244911001023", "alice_chain").await;
    activate_wallet(&cw, "+244911001024", "bob_chain").await;
    activate_wallet(&cw, "+244911001025", "clara_chain").await;
    seed_balance(&pool, "alice_chain", 500_000).await; // 5,000 Kz to alice

    // Alice → Bob 3,000 Kz
    p2p_send(
        &cw,
        &tf,
        "@alice_chain",
        "@bob_chain",
        300_000,
        "key-chain-ab",
        None,
    )
    .await
    .unwrap();

    // Bob → Clara 2,000 Kz (from the 3,000 Kz just received)
    p2p_send(
        &cw,
        &tf,
        "@bob_chain",
        "@clara_chain",
        200_000,
        "key-chain-bc",
        None,
    )
    .await
    .unwrap();

    assert_eq!(
        available_balance(&pool, "alice_chain").await,
        200_000,
        "alice: 5000−3000=2000 Kz"
    );
    assert_eq!(
        available_balance(&pool, "bob_chain").await,
        100_000,
        "bob: 3000−2000=1000 Kz"
    );
    assert_eq!(
        available_balance(&pool, "clara_chain").await,
        200_000,
        "clara: received 2000 Kz"
    );
}

// ---------------------------------------------------------------------------
// The same key from a DIFFERENT request is refused — never answered with
// someone else's transfer. A second payer on a payment link (key
// "pl-pay-<link>") used to receive the first payer's transfer and receipt.
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_key_reused_by_another_sender_is_refused_not_replayed(pool: PgPool) {
    let cw = cw_engine(pool.clone());
    let tf = transfer_engine(pool.clone());
    activate_wallet(&cw, "+244911009001", "first_payer").await;
    activate_wallet(&cw, "+244911009002", "second_payer").await;
    activate_wallet(&cw, "+244911009003", "the_merchant").await;
    seed_balance(&pool, "first_payer", 500_000).await;
    seed_balance(&pool, "second_payer", 500_000).await;

    let first = p2p_send(
        &cw,
        &tf,
        "@first_payer",
        "@the_merchant",
        100_000,
        "pl-pay-shared",
        None,
    )
    .await
    .unwrap();
    let second = p2p_send(
        &cw,
        &tf,
        "@second_payer",
        "@the_merchant",
        100_000,
        "pl-pay-shared",
        None,
    )
    .await;
    assert!(
        matches!(second, Err(TransferError::DuplicateIdempotencyKey(_))),
        "the second payer must be refused, not handed the first payer's transfer {}",
        first.id
    );
    assert_eq!(
        available_balance(&pool, "second_payer").await,
        500_000,
        "the refused payer was charged"
    );

    // same sender, different amount: refused too
    let drift = p2p_send(
        &cw,
        &tf,
        "@first_payer",
        "@the_merchant",
        999,
        "pl-pay-shared",
        None,
    )
    .await;
    assert!(
        matches!(drift, Err(TransferError::DuplicateIdempotencyKey(_))),
        "payload drift was accepted"
    );

    // the genuine replay still answers with the original
    let again = p2p_send(
        &cw,
        &tf,
        "@first_payer",
        "@the_merchant",
        100_000,
        "pl-pay-shared",
        None,
    )
    .await
    .unwrap();
    assert_eq!(again.id, first.id);
}
