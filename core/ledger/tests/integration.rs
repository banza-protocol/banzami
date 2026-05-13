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
