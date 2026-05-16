// Integration tests for banzami-transfers.
//
// Each test runs against a fresh PostgreSQL database with all migrations applied.
// #[sqlx::test] creates and drops a database per test automatically.
//
// Run: DATABASE_URL="postgres://banzami:banzami_dev@localhost:5433/banzami_dev" \
//      cargo test -p banzami-transfers --test integration

use sqlx::PgPool;
use uuid::Uuid;

use banzami_transfers::{PostgresTransferEngine, PostgresTransferRepository, TransferEngine, TransferError};
use banzami_types::{ConsumerId, Currency};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/// Creates a consumer and an AOA consumer wallet, seeds the available account
/// with `balance_minor` in the ledger, and returns the `consumer_id`.
async fn make_consumer_with_balance(pool: &PgPool, balance_minor: i64) -> ConsumerId {
    let consumer_id = ConsumerId::new();
    let wallet_id   = Uuid::new_v4();
    let account_id  = Uuid::new_v4(); // available_account_id
    let reserved_id = Uuid::new_v4();
    let posting_id  = Uuid::new_v4();
    let entry_id    = Uuid::new_v4();

    // Consumer record
    sqlx::query(
        "INSERT INTO consumers (id, handle, status, created_at, updated_at)
         VALUES ($1, $2, 'ACTIVE', NOW(), NOW())",
    )
    .bind(consumer_id.as_uuid())
    .bind(format!("consumer-{}", consumer_id.as_uuid()))
    .execute(pool)
    .await
    .unwrap();

    // Ledger accounts (LIABILITY type for consumer funds)
    sqlx::query(
        "INSERT INTO ledger_accounts (id, account_type, name, currency, created_at)
         VALUES ($1, 'LIABILITY', $2, 'AOA', NOW()),
                ($3, 'LIABILITY', $4, 'AOA', NOW())",
    )
    .bind(account_id)
    .bind(format!("consumer-avail-{}", account_id))
    .bind(reserved_id)
    .bind(format!("consumer-reserved-{}", reserved_id))
    .execute(pool)
    .await
    .unwrap();

    // Consumer wallet
    sqlx::query(
        "INSERT INTO consumer_wallets
         (id, consumer_id, currency, status, available_account_id, reserved_account_id, created_at)
         VALUES ($1, $2, 'AOA', 'ACTIVE', $3, $4, NOW())",
    )
    .bind(wallet_id)
    .bind(consumer_id.as_uuid())
    .bind(account_id)
    .bind(reserved_id)
    .execute(pool)
    .await
    .unwrap();

    // Seed balance: a CREDIT entry on the available account gives the consumer funds.
    // LIABILITY account: CREDIT increases balance (we owe the consumer more).
    if balance_minor > 0 {
        sqlx::query(
            "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
             VALUES ($1, 'initial funding', $2, NOW())",
        )
        .bind(posting_id)
        .bind(format!("fund-{}", account_id))
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

    consumer_id
}

fn engine(pool: PgPool) -> impl TransferEngine {
    let repo = PostgresTransferRepository::new(pool.clone());
    PostgresTransferEngine::new(pool, repo)
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn send_transfer_succeeds_and_produces_completed_status(pool: PgPool) -> sqlx::Result<()> {
    let sender    = make_consumer_with_balance(&pool, 100_000).await;
    let recipient = make_consumer_with_balance(&pool, 0).await;

    let eng = engine(pool);

    let transfer = eng.send(banzami_transfers::transfer::SendTransferRequest {
        idempotency_key: "t-happy-01".into(),
        sender_id:       sender,
        recipient_id:    recipient,
        amount_minor:    50_000,
        currency:        Currency::AOA,
        description:     Some("test payment".into()),
    })
    .await
    .unwrap();

    assert_eq!(transfer.status, banzami_transfers::TransferStatus::Completed);
    assert_eq!(transfer.amount.amount_minor(), 50_000);
    assert!(transfer.ledger_posting_id.is_some(), "completed transfer must have a ledger posting");

    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn get_returns_stored_transfer(pool: PgPool) -> sqlx::Result<()> {
    let sender    = make_consumer_with_balance(&pool, 50_000).await;
    let recipient = make_consumer_with_balance(&pool, 0).await;

    let eng = engine(pool);

    let t1 = eng.send(banzami_transfers::transfer::SendTransferRequest {
        idempotency_key: "t-get-01".into(),
        sender_id:       sender,
        recipient_id:    recipient,
        amount_minor:    50_000,
        currency:        Currency::AOA,
        description:     None,
    })
    .await
    .unwrap();

    let fetched = eng.get(t1.id).await.unwrap();
    assert_eq!(fetched.id, t1.id);
    assert_eq!(fetched.amount.amount_minor(), 50_000);

    Ok(())
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn idempotent_send_returns_original_transfer(pool: PgPool) -> sqlx::Result<()> {
    let sender    = make_consumer_with_balance(&pool, 200_000).await;
    let recipient = make_consumer_with_balance(&pool, 0).await;

    let eng = engine(pool);

    let req = || banzami_transfers::transfer::SendTransferRequest {
        idempotency_key: "t-idem-01".into(),
        sender_id:       sender,
        recipient_id:    recipient,
        amount_minor:    50_000,
        currency:        Currency::AOA,
        description:     None,
    };

    let first  = eng.send(req()).await.unwrap();
    let second = eng.send(req()).await.unwrap();

    assert_eq!(first.id, second.id, "re-submission must return the original transfer");

    Ok(())
}

// ---------------------------------------------------------------------------
// Rejection invariants
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn zero_amount_is_rejected(pool: PgPool) -> sqlx::Result<()> {
    let sender    = make_consumer_with_balance(&pool, 50_000).await;
    let recipient = make_consumer_with_balance(&pool, 0).await;

    let err = engine(pool)
        .send(banzami_transfers::transfer::SendTransferRequest {
            idempotency_key: "t-zero".into(),
            sender_id:       sender,
            recipient_id:    recipient,
            amount_minor:    0,
            currency:        Currency::AOA,
            description:     None,
        })
        .await
        .unwrap_err();

    assert!(matches!(err, TransferError::InvalidAmount), "zero amount must be rejected");

    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn negative_amount_is_rejected(pool: PgPool) -> sqlx::Result<()> {
    let sender    = make_consumer_with_balance(&pool, 50_000).await;
    let recipient = make_consumer_with_balance(&pool, 0).await;

    let err = engine(pool)
        .send(banzami_transfers::transfer::SendTransferRequest {
            idempotency_key: "t-neg".into(),
            sender_id:       sender,
            recipient_id:    recipient,
            amount_minor:    -1,
            currency:        Currency::AOA,
            description:     None,
        })
        .await
        .unwrap_err();

    assert!(matches!(err, TransferError::InvalidAmount), "negative amount must be rejected");

    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn self_transfer_is_rejected(pool: PgPool) -> sqlx::Result<()> {
    let consumer = make_consumer_with_balance(&pool, 50_000).await;

    let err = engine(pool)
        .send(banzami_transfers::transfer::SendTransferRequest {
            idempotency_key: "t-self".into(),
            sender_id:       consumer,
            recipient_id:    consumer,
            amount_minor:    1_000,
            currency:        Currency::AOA,
            description:     None,
        })
        .await
        .unwrap_err();

    assert!(matches!(err, TransferError::SelfTransfer), "self-transfer must be rejected");

    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn insufficient_funds_is_rejected(pool: PgPool) -> sqlx::Result<()> {
    let sender    = make_consumer_with_balance(&pool, 1_000).await;
    let recipient = make_consumer_with_balance(&pool, 0).await;

    let err = engine(pool)
        .send(banzami_transfers::transfer::SendTransferRequest {
            idempotency_key: "t-insuf".into(),
            sender_id:       sender,
            recipient_id:    recipient,
            amount_minor:    10_000,  // more than the 1_000 available
            currency:        Currency::AOA,
            description:     None,
        })
        .await
        .unwrap_err();

    assert!(
        matches!(err, TransferError::InsufficientFunds { .. }),
        "transfer exceeding balance must be rejected"
    );

    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn transfer_with_unknown_sender_is_rejected(pool: PgPool) -> sqlx::Result<()> {
    // recipient exists but sender has no wallet
    let recipient = make_consumer_with_balance(&pool, 0).await;
    let ghost     = ConsumerId::new(); // no wallet, no consumer record

    let err = engine(pool)
        .send(banzami_transfers::transfer::SendTransferRequest {
            idempotency_key: "t-ghost".into(),
            sender_id:       ghost,
            recipient_id:    recipient,
            amount_minor:    1_000,
            currency:        Currency::AOA,
            description:     None,
        })
        .await
        .unwrap_err();

    assert!(
        matches!(err, TransferError::WalletNotFound { .. }),
        "unknown sender must produce WalletNotFound"
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// Balance correctness
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn balance_is_reduced_after_send(pool: PgPool) -> sqlx::Result<()> {
    let sender    = make_consumer_with_balance(&pool, 80_000).await;
    let recipient = make_consumer_with_balance(&pool, 0).await;

    let eng = engine(pool.clone());

    eng.send(banzami_transfers::transfer::SendTransferRequest {
        idempotency_key: "t-bal-01".into(),
        sender_id:       sender,
        recipient_id:    recipient,
        amount_minor:    30_000,
        currency:        Currency::AOA,
        description:     None,
    })
    .await
    .unwrap();

    // Verify sender's net balance via ledger (CREDIT - DEBIT on available_account).
    let balance: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type
             WHEN 'DEBIT'  THEN -amount_minor
             WHEN 'CREDIT' THEN  amount_minor
             END), 0)
         FROM ledger_entries le
         JOIN consumer_wallets cw ON cw.available_account_id = le.account_id
         WHERE cw.consumer_id = $1",
    )
    .bind(sender.as_uuid())
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(balance, 50_000, "sender balance must be 80k - 30k = 50k after transfer");

    Ok(())
}

// ---------------------------------------------------------------------------
// Concurrent transfer safety
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn concurrent_transfers_respect_balance(pool: PgPool) -> sqlx::Result<()> {
    let sender    = make_consumer_with_balance(&pool, 10_000).await;
    let recipient = make_consumer_with_balance(&pool, 0).await;

    // Use two engine instances sharing the same pool — same as the ledger concurrency test.
    let e1 = engine(pool.clone());
    let e2 = engine(pool.clone());

    // Race two transfers of 6 000 each.  Only one can succeed because 12 000 > 10 000.
    let (r1, r2) = tokio::join!(
        e1.send(banzami_transfers::transfer::SendTransferRequest {
            idempotency_key: "t-conc-1".into(),
            sender_id:       sender,
            recipient_id:    recipient,
            amount_minor:    6_000,
            currency:        Currency::AOA,
            description:     None,
        }),
        e2.send(banzami_transfers::transfer::SendTransferRequest {
            idempotency_key: "t-conc-2".into(),
            sender_id:       sender,
            recipient_id:    recipient,
            amount_minor:    6_000,
            currency:        Currency::AOA,
            description:     None,
        }),
    );

    let succeeded = [&r1, &r2].iter().filter(|r| r.is_ok()).count();
    let failed    = [&r1, &r2].iter().filter(|r| r.is_err()).count();

    // Exactly one succeeds; the other hits insufficient-funds.
    assert_eq!(succeeded, 1, "exactly one of two concurrent transfers must succeed");
    assert_eq!(failed,    1, "the other must be rejected (insufficient funds)");

    // Final balance: 10 000 - 6 000 = 4 000
    let balance: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type
             WHEN 'DEBIT'  THEN -amount_minor
             WHEN 'CREDIT' THEN  amount_minor
             END), 0)
         FROM ledger_entries le
         JOIN consumer_wallets cw ON cw.available_account_id = le.account_id
         WHERE cw.consumer_id = $1",
    )
    .bind(sender.as_uuid())
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(balance, 4_000, "sender balance must be 10k - 6k = 4k");

    Ok(())
}

// ---------------------------------------------------------------------------
// Financial invariants — zero-sum and double-entry correctness
// ---------------------------------------------------------------------------

/// Core double-entry invariant: when a transfer completes, the recipient's
/// balance must increase by exactly the same amount that the sender's balance
/// decreases.  Money must never be created or destroyed.
#[sqlx::test(migrations = "../../db/migrations")]
async fn transfer_is_zero_sum(pool: PgPool) -> sqlx::Result<()> {
    let sender    = make_consumer_with_balance(&pool, 80_000).await;
    let recipient = make_consumer_with_balance(&pool, 20_000).await;

    let eng = engine(pool.clone());
    eng.send(banzami_transfers::transfer::SendTransferRequest {
        idempotency_key: "t-zerosum-01".into(),
        sender_id:       sender,
        recipient_id:    recipient,
        amount_minor:    30_000,
        currency:        Currency::AOA,
        description:     None,
    })
    .await
    .unwrap();

    let ledger_balance = |consumer_id: Uuid| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, i64>(
                "SELECT COALESCE(SUM(CASE entry_type
                     WHEN 'DEBIT'  THEN -amount_minor
                     WHEN 'CREDIT' THEN  amount_minor
                     END), 0)
                 FROM ledger_entries le
                 JOIN consumer_wallets cw ON cw.available_account_id = le.account_id
                 WHERE cw.consumer_id = $1",
            )
            .bind(consumer_id)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };

    let sender_balance    = ledger_balance(sender.as_uuid()).await;
    let recipient_balance = ledger_balance(recipient.as_uuid()).await;

    assert_eq!(sender_balance,    50_000, "sender:    80k − 30k = 50k");
    assert_eq!(recipient_balance, 50_000, "recipient: 20k + 30k = 50k");

    // Global zero-sum: total funds in the system are unchanged.
    assert_eq!(
        sender_balance + recipient_balance,
        100_000,
        "total funds must be conserved (no money created or destroyed)"
    );

    Ok(())
}

/// Recipient balance must increase after receiving a transfer, even when the
/// recipient had zero funds before.  Verifies the credit side of the ledger
/// posting is correctly attributed to the recipient's wallet.
#[sqlx::test(migrations = "../../db/migrations")]
async fn recipient_balance_increases_after_transfer(pool: PgPool) -> sqlx::Result<()> {
    let sender    = make_consumer_with_balance(&pool, 100_000).await;
    let recipient = make_consumer_with_balance(&pool, 0).await;

    let eng = engine(pool.clone());
    eng.send(banzami_transfers::transfer::SendTransferRequest {
        idempotency_key: "t-recv-01".into(),
        sender_id:       sender,
        recipient_id:    recipient,
        amount_minor:    45_000,
        currency:        Currency::AOA,
        description:     None,
    })
    .await
    .unwrap();

    let balance: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type
             WHEN 'DEBIT'  THEN -amount_minor
             WHEN 'CREDIT' THEN  amount_minor
             END), 0)
         FROM ledger_entries le
         JOIN consumer_wallets cw ON cw.available_account_id = le.account_id
         WHERE cw.consumer_id = $1",
    )
    .bind(recipient.as_uuid())
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(balance, 45_000, "recipient must receive exactly 45 000 minor units");

    Ok(())
}

/// After a chain of transfers A→B and B→C, the global ledger balance equals
/// the original funding.  Verifies invariants hold across multiple postings.
#[sqlx::test(migrations = "../../db/migrations")]
async fn chain_of_transfers_preserves_total(pool: PgPool) -> sqlx::Result<()> {
    let alice = make_consumer_with_balance(&pool, 100_000).await;
    let bob   = make_consumer_with_balance(&pool, 0).await;
    let carol = make_consumer_with_balance(&pool, 0).await;

    let eng = engine(pool.clone());

    // Alice → Bob: 60 000
    eng.send(banzami_transfers::transfer::SendTransferRequest {
        idempotency_key: "t-chain-ab".into(),
        sender_id:       alice,
        recipient_id:    bob,
        amount_minor:    60_000,
        currency:        Currency::AOA,
        description:     None,
    })
    .await
    .unwrap();

    // Bob → Carol: 40 000 (Bob received 60k, pays on 40k)
    eng.send(banzami_transfers::transfer::SendTransferRequest {
        idempotency_key: "t-chain-bc".into(),
        sender_id:       bob,
        recipient_id:    carol,
        amount_minor:    40_000,
        currency:        Currency::AOA,
        description:     None,
    })
    .await
    .unwrap();

    let total_in_system: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type
             WHEN 'DEBIT'  THEN -amount_minor
             WHEN 'CREDIT' THEN  amount_minor
             END), 0)
         FROM ledger_entries le
         JOIN consumer_wallets cw ON cw.available_account_id = le.account_id
         WHERE cw.consumer_id = ANY($1)",
    )
    .bind(&[alice.as_uuid(), bob.as_uuid(), carol.as_uuid()])
    .fetch_one(&pool)
    .await
    .unwrap();

    // alice=40k + bob=20k + carol=40k = 100k (original funding)
    assert_eq!(
        total_in_system, 100_000,
        "total funds across all consumers must equal original funding"
    );

    Ok(())
}
