//! ADR-042 — payment routing to a segregated wallet account.
//!
//! Verifies the `recipient_account_id` override on `SendTransferRequest`: when set,
//! a MERCHANT payment credits a specific segregated account instead of the wallet's
//! default available account; when absent, behaviour is unchanged. Validation:
//! the account must belong to the recipient wallet, be ACTIVE, match the currency,
//! and the recipient must be a merchant (routing is rejected for P2P recipients).

use sqlx::PgPool;
use uuid::Uuid;

use banzami_transfers::{
    PostgresTransferEngine, PostgresTransferRepository, SendTransferRequest, TransferEngine,
    TransferError,
};
use banzami_types::{ConsumerId, Currency};

fn engine(pool: &PgPool) -> PostgresTransferEngine<PostgresTransferRepository> {
    PostgresTransferEngine::new(pool.clone(), PostgresTransferRepository::new(pool.clone()))
}

async fn account(pool: &PgPool, ty: &str, currency: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency)
         VALUES ($1, $2, 'acct', $3) RETURNING id",
    )
    .bind(Uuid::new_v4())
    .bind(ty)
    .bind(currency)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// Balance of a LIABILITY account, merchant-facing positive.
async fn balance(pool: &PgPool, account_id: Uuid) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'CREDIT' THEN amount_minor
                                             WHEN 'DEBIT'  THEN -amount_minor END),0)::BIGINT
         FROM ledger_entries WHERE account_id = $1",
    )
    .bind(account_id)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// Seed a funded consumer wallet (the sender). Returns the consumer id.
async fn funded_sender(pool: &PgPool, amount: i64) -> ConsumerId {
    let consumer = Uuid::new_v4();
    sqlx::query("INSERT INTO consumers (id, handle, status) VALUES ($1, $2, 'ACTIVE')")
        .bind(consumer)
        .bind(format!("payer_{}", &consumer.to_string()[..8]))
        .execute(pool)
        .await
        .unwrap();
    let avail = account(pool, "LIABILITY", "AOA").await;
    let reserved = account(pool, "LIABILITY", "AOA").await;
    sqlx::query(
        "INSERT INTO consumer_wallets (id, consumer_id, currency, status, available_account_id, reserved_account_id)
         VALUES ($1, $2, 'AOA', 'ACTIVE', $3, $4)",
    )
    .bind(Uuid::new_v4())
    .bind(consumer)
    .bind(avail)
    .bind(reserved)
    .execute(pool)
    .await
    .unwrap();
    // Fund: balanced posting DEBIT bank / CREDIT sender available.
    if amount == 0 {
        return ConsumerId::from_uuid(consumer);
    }
    let bank = account(pool, "ASSET", "AOA").await;
    let posting = Uuid::new_v4();
    sqlx::query("INSERT INTO ledger_postings (id, description, idempotency_key, created_at) VALUES ($1,'fund',$2,NOW())")
        .bind(posting).bind(format!("fund-{consumer}")).execute(pool).await.unwrap();
    for (acc, ty) in [(bank, "DEBIT"), (avail, "CREDIT")] {
        sqlx::query("INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at) VALUES ($1,$2,$3,$4,$5,'AOA',NOW())")
            .bind(Uuid::new_v4()).bind(posting).bind(acc).bind(ty).bind(amount).execute(pool).await.unwrap();
    }
    ConsumerId::from_uuid(consumer)
}

/// Seed an ACTIVE merchant wallet; the 0081 trigger auto-creates its PRIMARY.
/// Returns (wallet_id, available_account_id).
async fn merchant_wallet(pool: &PgPool, currency: &str) -> (Uuid, Uuid) {
    let avail = account(pool, "LIABILITY", currency).await;
    let reserved = account(pool, "LIABILITY", currency).await;
    let wid = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id)
         VALUES ($1, $2, $3, 'ACTIVE', $4, $5)",
    )
    .bind(wid)
    .bind(Uuid::new_v4())
    .bind(currency)
    .bind(avail)
    .bind(reserved)
    .execute(pool)
    .await
    .unwrap();
    (wid, avail)
}

/// Create a segregated wallet account (its own LIABILITY ledger account).
async fn campaign_account(pool: &PgPool, wallet_id: Uuid, currency: &str, status: &str) -> (Uuid, Uuid) {
    let merchant: Uuid = sqlx::query_scalar("SELECT merchant_id FROM wallets WHERE id = $1")
        .bind(wallet_id)
        .fetch_one(pool)
        .await
        .unwrap();
    let acct = account(pool, "LIABILITY", currency).await;
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO wallet_accounts (id, wallet_id, account_id, merchant_id, currency, purpose, status, label)
         VALUES ($1, $2, $3, $4, $5, 'CAMPAIGN', $6, 'Camp')",
    )
    .bind(id)
    .bind(wallet_id)
    .bind(acct)
    .bind(merchant)
    .bind(currency)
    .bind(status)
    .execute(pool)
    .await
    .unwrap();
    (id, acct)
}

fn req(sender: ConsumerId, recipient: Uuid, account: Option<Uuid>, key: &str) -> SendTransferRequest {
    SendTransferRequest {
        idempotency_key: key.to_string(),
        sender_id: sender,
        recipient_id: ConsumerId::from_uuid(recipient),
        amount_minor: 100_000,
        currency: Currency::from_code("AOA").unwrap(),
        description: None,
        recipient_handle: None,
        recipient_account_id: account,
    }
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn routes_credit_to_campaign_account_and_isolates(pool: PgPool) {
    let sender = funded_sender(&pool, 500_000).await;
    let (wid, avail) = merchant_wallet(&pool, "AOA").await;
    let (camp_id, camp_acct) = campaign_account(&pool, wid, "AOA", "ACTIVE").await;

    let eng = engine(&pool);
    eng.send(req(sender, wid, Some(camp_id), "k1")).await.unwrap();

    assert_eq!(balance(&pool, camp_acct).await, 100_000, "campaign account credited");
    assert_eq!(balance(&pool, avail).await, 0, "default available account untouched (isolation)");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn no_override_credits_default_available(pool: PgPool) {
    let sender = funded_sender(&pool, 500_000).await;
    let (wid, avail) = merchant_wallet(&pool, "AOA").await;
    let (_camp_id, camp_acct) = campaign_account(&pool, wid, "AOA", "ACTIVE").await;

    let eng = engine(&pool);
    eng.send(req(sender, wid, None, "k1")).await.unwrap();

    assert_eq!(balance(&pool, avail).await, 100_000, "default path unchanged");
    assert_eq!(balance(&pool, camp_acct).await, 0, "campaign account not touched");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn rejects_account_from_another_wallet(pool: PgPool) {
    let sender = funded_sender(&pool, 500_000).await;
    let (wid_a, _) = merchant_wallet(&pool, "AOA").await;
    let (wid_b, _) = merchant_wallet(&pool, "AOA").await;
    let (foreign_camp, _) = campaign_account(&pool, wid_b, "AOA", "ACTIVE").await;

    let eng = engine(&pool);
    // Pay wallet A but try to route to wallet B's account → rejected.
    let err = eng.send(req(sender, wid_a, Some(foreign_camp), "k1")).await.unwrap_err();
    assert!(matches!(err, TransferError::InvalidWalletAccount));
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn rejects_inactive_account(pool: PgPool) {
    let sender = funded_sender(&pool, 500_000).await;
    let (wid, _) = merchant_wallet(&pool, "AOA").await;
    let (camp_id, _) = campaign_account(&pool, wid, "AOA", "CLOSED").await;

    let eng = engine(&pool);
    let err = eng.send(req(sender, wid, Some(camp_id), "k1")).await.unwrap_err();
    assert!(matches!(err, TransferError::InvalidWalletAccount));
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn rejects_routing_on_consumer_recipient(pool: PgPool) {
    let sender = funded_sender(&pool, 500_000).await;
    // Recipient is a consumer (P2P): seed a consumer wallet for them.
    let recipient = funded_sender(&pool, 0).await;
    let (wid, _) = merchant_wallet(&pool, "AOA").await;
    let (camp_id, _) = campaign_account(&pool, wid, "AOA", "ACTIVE").await;

    let eng = engine(&pool);
    // A P2P recipient must never accept an account override.
    let err = eng
        .send(req(sender, recipient.as_uuid(), Some(camp_id), "k1"))
        .await
        .unwrap_err();
    assert!(matches!(err, TransferError::InvalidWalletAccount));
}
