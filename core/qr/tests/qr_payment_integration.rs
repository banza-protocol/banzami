// Integration test for INV-QR-002-1 — the QR payment-amount invariant:
//
//   QR payment amount == ledger debit on the payer's wallet
//                      == ledger credit on the merchant's wallet
//
// This composes the real production primitives end-to-end against a real
// PostgreSQL database (no mocks, CLAUDE.md §7), mirroring how a dynamic-QR
// payment settles:
//
//   1. merchant has a wallet (banzami-wallets)
//   2. merchant creates a dynamic QR with a pre-set amount (banzami-qr)
//   3. consumer scans → decode resolves the qr_code_id (banzami-qr)
//   4. the QR record is fetched for its authoritative amount + recipient
//   5. the payment settles as a wallet transfer of *exactly the QR amount*
//      from the consumer to the merchant wallet (banzami-transfers), which
//      posts a single balanced double-entry to the ledger
//   6. the dynamic QR is marked USED (banzami-qr)
//
// The amount that moves is read from the persisted QR record, not passed
// independently — so the test proves the encoded amount is the amount settled.

use std::sync::Arc;

use sqlx::PgPool;

use banzami_consumer_wallets::{
    CompleteOnboardingRequest, ConsumerWalletEngine, PostgresConsumerWalletEngine,
    PostgresConsumerWalletRepository, PostgresOnboardingRepository, StartOnboardingRequest,
    VerifyOtpRequest,
};
use banzami_ledger::PostgresLedgerRepository;
use banzami_qr::{
    CreateDynamicQrRequest, PostgresQrEngine, PostgresQrRepository, QrCodeStatus, QrEngine,
    QrOwnerType,
};
use banzami_transfers::{
    PostgresTransferEngine, PostgresTransferRepository, SendTransferRequest, TransferEngine,
};
use banzami_types::{ConsumerId, Currency, MerchantId};
use banzami_wallets::{
    CreateWalletRequest, PostgresWalletEngine, PostgresWalletRepository, WalletEngine,
};

// ---------------------------------------------------------------------------
// Engine builders (mirror core-api wiring)
// ---------------------------------------------------------------------------

fn consumer_wallet_engine(pool: PgPool) -> impl ConsumerWalletEngine {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let onboard_repo = PostgresOnboardingRepository::new(pool.clone());
    let wallet_repo = PostgresConsumerWalletRepository::new(pool.clone());
    PostgresConsumerWalletEngine::with_pool(pool, ledger, onboard_repo, wallet_repo)
}

fn wallet_engine(pool: PgPool) -> impl WalletEngine {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let repo = PostgresWalletRepository::new(pool);
    PostgresWalletEngine::new(ledger, repo)
}

fn transfer_engine(pool: PgPool) -> impl TransferEngine {
    let repo = PostgresTransferRepository::new(pool.clone());
    PostgresTransferEngine::new(pool, repo)
}

fn qr_engine(pool: PgPool) -> PostgresQrEngine<PostgresQrRepository> {
    PostgresQrEngine::new(
        PostgresQrRepository::new(pool),
        b"qr-payment-test-key".to_vec(),
    )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async fn activate_consumer(eng: &impl ConsumerWalletEngine, phone: &str, handle: &str) {
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
}

/// Credit a just-activated consumer wallet's available account directly on the ledger.
async fn seed_consumer_balance(pool: &PgPool, handle: &str, minor: i64) {
    let account_id: uuid::Uuid = sqlx::query_scalar(
        "SELECT w.available_account_id
         FROM consumer_wallets w
         JOIN consumers c ON c.id = w.consumer_id
         WHERE c.handle = $1 AND w.status = 'ACTIVE' LIMIT 1",
    )
    .bind(handle)
    .fetch_one(pool)
    .await
    .unwrap();

    let posting_id = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, 'test seed', $2, NOW())",
    )
    .bind(posting_id)
    .bind(format!("seed-{handle}-{minor}"))
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO ledger_entries
         (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
         VALUES ($1, $2, $3, 'CREDIT', $4, 'AOA', NOW())",
    )
    .bind(uuid::Uuid::new_v4())
    .bind(posting_id)
    .bind(account_id)
    .bind(minor)
    .execute(pool)
    .await
    .unwrap();
}

async fn account_balance(pool: &PgPool, account_id: uuid::Uuid) -> i64 {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type
             WHEN 'DEBIT' THEN -amount_minor WHEN 'CREDIT' THEN amount_minor END), 0)::BIGINT
         FROM ledger_entries WHERE account_id = $1",
    )
    .bind(account_id)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn consumer_available_account(pool: &PgPool, handle: &str) -> uuid::Uuid {
    sqlx::query_scalar(
        "SELECT w.available_account_id FROM consumer_wallets w
         JOIN consumers c ON c.id = w.consumer_id
         WHERE c.handle = $1 AND w.status = 'ACTIVE' LIMIT 1",
    )
    .bind(handle)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// Sum of every ledger entry under a posting — must be exactly zero (balanced).
async fn posting_sum(pool: &PgPool, posting_id: uuid::Uuid) -> i64 {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type
             WHEN 'DEBIT' THEN -amount_minor WHEN 'CREDIT' THEN amount_minor END), 0)::BIGINT
         FROM ledger_entries WHERE posting_id = $1",
    )
    .bind(posting_id)
    .fetch_one(pool)
    .await
    .unwrap()
}

// ---------------------------------------------------------------------------
// INV-QR-002-1
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn qr_payment_amount_equals_debit_equals_credit(pool: PgPool) {
    let cw = consumer_wallet_engine(pool.clone());
    let we = wallet_engine(pool.clone());
    let tf = transfer_engine(pool.clone());
    let qr = qr_engine(pool.clone());

    // --- merchant with a wallet ---
    let merchant_wallet = we
        .create(CreateWalletRequest {
            merchant_id: MerchantId::new(),
            currency: Currency::AOA,
        })
        .await
        .expect("merchant wallet");
    let merchant_acct = merchant_wallet.available_account_id.as_uuid();

    // --- consumer payer with funds ---
    activate_consumer(&cw, "+244922000001", "qr_payer").await;
    seed_consumer_balance(&pool, "qr_payer", 1_000_000).await; // 10,000 AOA
    let payer = cw
        .resolve_to_wallet("@qr_payer", Currency::AOA)
        .await
        .expect("resolve payer");
    let payer_acct = consumer_available_account(&pool, "qr_payer").await;

    // --- merchant creates a dynamic QR for 2,500 AOA ---
    let qr_amount = 250_000_i64;
    let created = qr
        .create_dynamic(CreateDynamicQrRequest {
            owner_id: merchant_wallet.id.as_uuid(),
            owner_type: QrOwnerType::Merchant,
            currency: Currency::AOA,
            amount_minor: qr_amount,
            expires_at: chrono::Utc::now() + chrono::Duration::hours(1),
            reference: Some("table-7".into()),
        })
        .await
        .unwrap();

    // --- consumer scans: decode → fetch the authoritative record ---
    let encoded = qr.encode(&created).unwrap();
    let parsed = qr.decode(&encoded).unwrap();
    let qr_id = parsed.qr_code_id.expect("dynamic QR resolves an id");
    let record = qr.get(qr_id).await.unwrap();
    let amount_to_settle = record.amount_minor.expect("dynamic QR carries an amount");

    let payer_before = account_balance(&pool, payer_acct).await;
    let merchant_before = account_balance(&pool, merchant_acct).await;

    // --- settle: transfer EXACTLY the QR amount, consumer → merchant wallet ---
    let transfer = tf
        .send(SendTransferRequest {
            idempotency_key: format!("qrpay-{qr_id}"),
            sender_id: payer.consumer_id,
            // Merchant wallet is addressed by its wallet UUID (the QR owner_id).
            recipient_id: ConsumerId::from_uuid(merchant_wallet.id.as_uuid()),
            amount_minor: amount_to_settle,
            currency: Currency::AOA,
            description: Some("QR payment".into()),
            recipient_handle: None,
        })
        .await
        .expect("QR payment should settle");

    // --- dynamic QR consumed ---
    let used = qr.mark_used(qr_id).await.unwrap();
    assert_eq!(used.status, QrCodeStatus::Used);

    let payer_after = account_balance(&pool, payer_acct).await;
    let merchant_after = account_balance(&pool, merchant_acct).await;

    let debit = payer_before - payer_after;
    let credit = merchant_after - merchant_before;

    // INV-QR-002-1: amount settled == QR amount, and debit == credit == amount.
    assert_eq!(
        amount_to_settle, qr_amount,
        "settled the QR's encoded amount"
    );
    assert_eq!(debit, qr_amount, "consumer debited exactly the QR amount");
    assert_eq!(credit, qr_amount, "merchant credited exactly the QR amount");
    assert_eq!(debit, credit, "debit must equal credit");

    // The payment is one balanced double-entry posting.
    let posting_id = transfer
        .ledger_posting_id
        .expect("completed transfer has a ledger posting");
    assert_eq!(
        posting_sum(&pool, posting_id.as_uuid()).await,
        0,
        "the QR payment posting must be balanced (sum of entries == 0)"
    );
    assert_eq!(transfer.amount.amount_minor(), qr_amount);
    assert_eq!(transfer.status.as_str(), "COMPLETED");
}
