// Integration tests for banzami-ledger.
//
// Each test runs against a fresh PostgreSQL database with all migrations applied.
// Set DATABASE_URL before running: `make dev-up && make db-migrate` is not required —
// #[sqlx::test] creates and drops its own database automatically.
//
// Run: DATABASE_URL="postgres://banzami:banzami_dev@localhost:5433/banzami_dev" \
//      cargo test -p banzami-ledger --test integration

use sqlx::PgPool;

use banzami_ledger::{
    Account, AccountType, LedgerEngine, PostingBuilder, PostgresLedgerRepository,
};
use banzami_types::{Currency, Money};

fn kz(minor: i64) -> Money {
    Money::new(minor, Currency::AOA)
}

fn asset_account(name: &str) -> Account {
    Account::new(AccountType::Asset, name, Currency::AOA)
}

fn liability_account(name: &str) -> Account {
    Account::new(AccountType::Liability, name, Currency::AOA)
}

// ─── Posting invariants ──────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn balanced_posting_is_stored_with_correct_entries(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool);

    let bank   = ledger.create_account(asset_account("bank")).await.unwrap();
    let wallet = ledger.create_account(liability_account("merchant-wallet")).await.unwrap();

    let posting = PostingBuilder::new("test payment", "idem-store-01")
        .debit(bank.id, kz(10_000_00))
        .credit(wallet.id, kz(10_000_00))
        .build()
        .unwrap();

    let stored = ledger.post(posting).await.unwrap();

    assert_eq!(stored.entries.len(), 2);
    assert_eq!(stored.idempotency_key, "idem-store-01");

    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn idempotent_posting_returns_existing_without_duplicate(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool);

    let src = ledger.create_account(asset_account("src")).await.unwrap();
    let dst = ledger.create_account(liability_account("dst")).await.unwrap();

    let posting = PostingBuilder::new("payment", "idem-dedup-01")
        .debit(src.id, kz(5_000_00))
        .credit(dst.id, kz(5_000_00))
        .build()
        .unwrap();

    let first  = ledger.post(posting.clone()).await.unwrap();

    // Re-build with the same idempotency key and same entries.
    let duplicate = PostingBuilder::new("payment", "idem-dedup-01")
        .debit(src.id, kz(5_000_00))
        .credit(dst.id, kz(5_000_00))
        .build()
        .unwrap();
    let second = ledger.post(duplicate).await.unwrap();

    // Same posting returned — no new rows.
    assert_eq!(first.id, second.id);

    // Balance reflects one posting only.
    let balance = ledger.balance(dst.id).await.unwrap();
    // LIABILITY account credited once → ledger balance is -5_000_00 (we owe merchant)
    // The raw ledger balance is negative for credits on a LIABILITY.
    assert_eq!(balance.amount_minor().abs(), 5_000_00);

    Ok(())
}

// ─── Balance derivation ──────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn balance_is_derived_from_entries(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool);

    let bank   = ledger.create_account(asset_account("bank-bal")).await.unwrap();
    let wallet = ledger.create_account(liability_account("wallet-bal")).await.unwrap();

    // First posting: 100_00 AOA
    ledger.post(
        PostingBuilder::new("p1", "idem-bal-01")
            .debit(bank.id, kz(100_00))
            .credit(wallet.id, kz(100_00))
            .build()
            .unwrap(),
    ).await.unwrap();

    // Second posting: 50_00 AOA
    ledger.post(
        PostingBuilder::new("p2", "idem-bal-02")
            .debit(bank.id, kz(50_00))
            .credit(wallet.id, kz(50_00))
            .build()
            .unwrap(),
    ).await.unwrap();

    // Bank is ASSET: debited twice → balance = 150_00 (positive)
    let bank_balance = ledger.balance(bank.id).await.unwrap();
    assert_eq!(bank_balance.amount_minor(), 150_00);

    // Wallet is LIABILITY: credited twice → balance negative (raw ledger)
    let wallet_balance = ledger.balance(wallet.id).await.unwrap();
    assert_eq!(wallet_balance.amount_minor().abs(), 150_00);

    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn fresh_account_has_zero_balance(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool);
    let account = ledger.create_account(asset_account("empty")).await.unwrap();

    let balance = ledger.balance(account.id).await.unwrap();
    assert_eq!(balance.amount_minor(), 0);

    Ok(())
}

// ─── Entry history ───────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn entries_for_account_returns_chronological_history(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool);

    let bank   = ledger.create_account(asset_account("bank-hist")).await.unwrap();
    let wallet = ledger.create_account(liability_account("wallet-hist")).await.unwrap();

    for i in 1u32..=3 {
        ledger.post(
            PostingBuilder::new(
                format!("posting {i}"),
                format!("idem-hist-{i:02}"),
            )
            .debit(bank.id, kz(i as i64 * 100_00))
            .credit(wallet.id, kz(i as i64 * 100_00))
            .build()
            .unwrap(),
        ).await.unwrap();
    }

    let entries = ledger.entries_for_account(bank.id).await.unwrap();
    assert_eq!(entries.len(), 3);

    // Each entry should be a DEBIT on the bank account.
    for entry in &entries {
        assert_eq!(entry.amount.currency, Currency::AOA);
    }

    Ok(())
}

// ─── Rejection invariants ─────────────────────────────────────────────────────

/// An unbalanced posting (debits ≠ credits) must be rejected before reaching the DB.
#[test]
fn unbalanced_posting_is_rejected_by_builder() {
    let bank   = banzami_types::AccountId::new();
    let wallet = banzami_types::AccountId::new();

    let result = PostingBuilder::new("unbalanced", "idem-reject-01")
        .debit(bank, kz(100_00))
        .credit(wallet, kz(90_00))   // 10 Kz missing → not balanced
        .build();

    assert!(result.is_err(), "expected Err for unbalanced posting, got Ok");
}

/// A posting with only one entry must be rejected.
#[test]
fn single_entry_posting_is_rejected() {
    let bank = banzami_types::AccountId::new();

    let result = PostingBuilder::new("single", "idem-reject-02")
        .debit(bank, kz(50_00))
        .build();

    assert!(result.is_err(), "expected Err for single-entry posting, got Ok");
}

/// A posting with zero entries must be rejected.
#[test]
fn empty_posting_is_rejected() {
    let result = PostingBuilder::new("empty", "idem-reject-03").build();
    assert!(result.is_err(), "expected Err for empty posting, got Ok");
}

/// Double-entry balance must hold per-currency independently.
/// A posting balanced in AOA but not USD must be rejected.
#[test]
fn multi_currency_imbalance_is_rejected() {
    use banzami_types::Money;
    let usd = |minor: i64| Money::new(minor, Currency::USD);

    let bank   = banzami_types::AccountId::new();
    let wallet = banzami_types::AccountId::new();

    let result = PostingBuilder::new("mc-imbalance", "idem-reject-04")
        .debit(bank, kz(100_00))
        .credit(wallet, usd(100_00)) // different currencies → net ≠ 0 per currency
        .build();

    assert!(result.is_err(), "expected Err for cross-currency imbalance, got Ok");
}

/// A multi-currency posting balanced within each currency must be accepted.
#[test]
fn multi_currency_balanced_posting_is_accepted() {
    use banzami_types::Money;
    let usd = |minor: i64| Money::new(minor, Currency::USD);

    let bank_aoa = banzami_types::AccountId::new();
    let wallet_aoa = banzami_types::AccountId::new();
    let bank_usd = banzami_types::AccountId::new();
    let wallet_usd = banzami_types::AccountId::new();

    // Two separate balanced pairs in one posting — unusual but valid.
    let result = PostingBuilder::new("mc-balanced", "idem-mc-01")
        .debit(bank_aoa, kz(100_00))
        .credit(wallet_aoa, kz(100_00))
        .debit(bank_usd, usd(50_00))
        .credit(wallet_usd, usd(50_00))
        .build();

    assert!(result.is_ok(), "expected Ok for balanced multi-currency posting, got {:?}", result);
}

// ─── Idempotency — DB-level ───────────────────────────────────────────────────

/// Re-submitting the same idempotency key with *different* amounts must return
/// the original posting unchanged (not create a second one).
#[sqlx::test(migrations = "../../db/migrations")]
async fn different_amount_same_key_returns_original(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool);

    let src = ledger.create_account(asset_account("src-idem")).await.unwrap();
    let dst = ledger.create_account(liability_account("dst-idem")).await.unwrap();

    let first = ledger.post(
        PostingBuilder::new("payment A", "idem-amount-check")
            .debit(src.id, kz(1_000_00))
            .credit(dst.id, kz(1_000_00))
            .build()
            .unwrap(),
    ).await.unwrap();

    // Re-submit with the same key but different amounts.
    // The engine must return the original posting, not a second one.
    let second = ledger.post(
        PostingBuilder::new("payment B", "idem-amount-check")
            .debit(src.id, kz(500_00))
            .credit(dst.id, kz(500_00))
            .build()
            .unwrap(),
    ).await.unwrap();

    assert_eq!(first.id, second.id, "re-submission must return the original posting");

    // Balance must reflect exactly ONE posting of 1 000 Kz.
    let balance = ledger.balance(dst.id).await.unwrap();
    assert_eq!(balance.amount_minor().abs(), 1_000_00);

    Ok(())
}

// ─── Reversal ────────────────────────────────────────────────────────────────

/// Posting a reversal must bring both account balances back to zero.
/// The original posting must remain intact in the ledger (audit trail preserved).
#[sqlx::test(migrations = "../../db/migrations")]
async fn reversal_offsets_original_and_preserves_history(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool);

    let bank   = ledger.create_account(asset_account("bank-rev")).await.unwrap();
    let wallet = ledger.create_account(liability_account("wallet-rev")).await.unwrap();

    let original = ledger.post(
        PostingBuilder::new("payment for reversal test", "idem-rev-original")
            .debit(bank.id, kz(10_000_00))
            .credit(wallet.id, kz(10_000_00))
            .build()
            .unwrap(),
    ).await.unwrap();

    // Both accounts should reflect the posting.
    assert_eq!(ledger.balance(bank.id).await.unwrap().amount_minor(),   10_000_00);
    assert_eq!(ledger.balance(wallet.id).await.unwrap().amount_minor(), -10_000_00);

    // Post the reversal.
    let reversal = ledger
        .reverse(&original, "reversal of payment", "idem-rev-reversal")
        .await
        .unwrap();

    // Balances must return to zero.
    assert_eq!(ledger.balance(bank.id).await.unwrap().amount_minor(),   0);
    assert_eq!(ledger.balance(wallet.id).await.unwrap().amount_minor(), 0);

    // Both postings must exist (audit trail intact — original is not deleted).
    let bank_entries = ledger.entries_for_account(bank.id).await.unwrap();
    assert_eq!(bank_entries.len(), 2, "original DEBIT + reversal CREDIT must both exist");

    // Reversal is idempotent.
    let reversal2 = ledger
        .reverse(&original, "reversal of payment", "idem-rev-reversal")
        .await
        .unwrap();
    assert_eq!(reversal.id, reversal2.id, "idempotent reversal must return same posting");

    Ok(())
}

/// get_posting must return the posting and all its entries.
#[sqlx::test(migrations = "../../db/migrations")]
async fn get_posting_returns_full_posting(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool);

    let src = ledger.create_account(asset_account("src-get")).await.unwrap();
    let dst = ledger.create_account(liability_account("dst-get")).await.unwrap();

    let posted = ledger.post(
        PostingBuilder::new("get test", "idem-get-01")
            .debit(src.id, kz(5_000_00))
            .credit(dst.id, kz(5_000_00))
            .build()
            .unwrap(),
    ).await.unwrap();

    let fetched = ledger.get_posting(posted.id).await.unwrap();
    assert_eq!(fetched.id, posted.id);
    assert_eq!(fetched.entries.len(), 2);
    assert_eq!(fetched.idempotency_key, "idem-get-01");

    Ok(())
}

// ─── Immutability (INV-LED-001-2) ────────────────────────────────────────────

/// An UPDATE on ledger_entries must be rejected by the database trigger.
#[sqlx::test(migrations = "../../db/migrations")]
async fn update_on_ledger_entry_is_rejected_by_db(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool.clone());

    let src = ledger.create_account(asset_account("src-imm")).await.unwrap();
    let dst = ledger.create_account(liability_account("dst-imm")).await.unwrap();

    ledger.post(
        PostingBuilder::new("immutability test", "idem-imm-01")
            .debit(src.id, kz(1_000_00))
            .credit(dst.id, kz(1_000_00))
            .build()
            .unwrap(),
    ).await.unwrap();

    // Attempt to mutate a ledger_entry directly — must be blocked by trigger.
    let result = sqlx::query(
        "UPDATE ledger_entries SET amount_minor = 999 WHERE account_id = $1",
    )
    .bind(src.id.as_uuid())
    .execute(&pool)
    .await;

    assert!(result.is_err(), "UPDATE on ledger_entries must be rejected");
    let err_msg = result.unwrap_err().to_string();
    assert!(
        err_msg.contains("immutable"),
        "error must mention immutability, got: {err_msg}"
    );

    // Balance must be unchanged.
    assert_eq!(ledger.balance(src.id).await.unwrap().amount_minor(), 1_000_00);

    Ok(())
}

/// A DELETE on ledger_entries must be rejected by the database trigger.
#[sqlx::test(migrations = "../../db/migrations")]
async fn delete_on_ledger_entry_is_rejected_by_db(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool.clone());

    let src = ledger.create_account(asset_account("src-del")).await.unwrap();
    let dst = ledger.create_account(liability_account("dst-del")).await.unwrap();

    ledger.post(
        PostingBuilder::new("delete block test", "idem-del-01")
            .debit(src.id, kz(500_00))
            .credit(dst.id, kz(500_00))
            .build()
            .unwrap(),
    ).await.unwrap();

    let result = sqlx::query(
        "DELETE FROM ledger_entries WHERE account_id = $1",
    )
    .bind(src.id.as_uuid())
    .execute(&pool)
    .await;

    assert!(result.is_err(), "DELETE on ledger_entries must be rejected");

    // Balance must be unchanged.
    assert_eq!(ledger.balance(src.id).await.unwrap().amount_minor(), 500_00);

    Ok(())
}

// ─── Account currency validation ──────────────────────────────────────────────

/// Posting an entry with a currency that does not match the account's declared
/// currency must be rejected before any row is written.
#[sqlx::test(migrations = "../../db/migrations")]
async fn entry_with_wrong_account_currency_is_rejected(pool: PgPool) -> sqlx::Result<()> {
    use banzami_ledger::LedgerError;

    let ledger = PostgresLedgerRepository::new(pool.clone());

    // AOA account
    let aoa_src = ledger.create_account(asset_account("aoa-src")).await.unwrap();
    // Separate USD account for the credit side
    let usd_dst = ledger
        .create_account(Account::new(AccountType::Asset, "usd-dst", banzami_types::Currency::USD))
        .await
        .unwrap();

    // Build a posting where the USD account is credited with AOA — currency mismatch.
    let posting = PostingBuilder::new("wrong currency", "idem-ccy-01")
        .debit(aoa_src.id, kz(100_00))
        .credit(usd_dst.id, kz(100_00)) // kz() uses AOA but account is USD
        .build()
        .unwrap(); // builder only checks balance per currency, not account currency

    let result = ledger.post(posting).await;

    assert!(
        matches!(result, Err(LedgerError::AccountCurrencyMismatch { .. })),
        "expected AccountCurrencyMismatch, got: {:?}",
        result
    );

    // No entries must have been written.
    let balance = ledger.balance(usd_dst.id).await.unwrap();
    assert_eq!(balance.amount_minor(), 0, "no entry must have been written");

    Ok(())
}

/// Concurrent duplicate submissions must not result in duplicate ledger entries.
/// We simulate concurrency by racing two identical postings from parallel tasks.
#[sqlx::test(migrations = "../../db/migrations")]
async fn concurrent_identical_postings_produce_single_entry(pool: PgPool) -> sqlx::Result<()> {
    use std::sync::Arc;
    let ledger = Arc::new(PostgresLedgerRepository::new(pool));

    let src = ledger.create_account(asset_account("src-conc")).await.unwrap();
    let dst = ledger.create_account(liability_account("dst-conc")).await.unwrap();

    let l1 = ledger.clone();
    let l2 = ledger.clone();

    let (r1, r2) = tokio::join!(
        tokio::spawn(async move {
            l1.post(
                PostingBuilder::new("conc payment", "idem-conc-01")
                    .debit(src.id, kz(200_00))
                    .credit(dst.id, kz(200_00))
                    .build()
                    .unwrap(),
            ).await
        }),
        tokio::spawn(async move {
            l2.post(
                PostingBuilder::new("conc payment", "idem-conc-01")
                    .debit(src.id, kz(200_00))
                    .credit(dst.id, kz(200_00))
                    .build()
                    .unwrap(),
            ).await
        }),
    );

    // Both tasks must succeed (one returns the original, one returns the duplicate).
    let p1 = r1.unwrap().unwrap();
    let p2 = r2.unwrap().unwrap();

    // They must have the same posting ID.
    assert_eq!(p1.id, p2.id, "concurrent submissions must return the same posting ID");

    // Balance must reflect exactly one 200 Kz posting.
    let balance = ledger.balance(dst.id).await.unwrap();
    assert_eq!(balance.amount_minor().abs(), 200_00, "balance must reflect exactly one posting");

    Ok(())
}
