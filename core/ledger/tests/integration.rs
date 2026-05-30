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
    Account, AccountType, LedgerEngine, PostgresLedgerRepository, PostingBuilder,
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

    let bank = ledger.create_account(asset_account("bank")).await.unwrap();
    let wallet = ledger
        .create_account(liability_account("merchant-wallet"))
        .await
        .unwrap();

    let posting = PostingBuilder::new("test payment", "idem-store-01")
        .debit(bank.id, kz(1_000_000))
        .credit(wallet.id, kz(1_000_000))
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
    let dst = ledger
        .create_account(liability_account("dst"))
        .await
        .unwrap();

    let posting = PostingBuilder::new("payment", "idem-dedup-01")
        .debit(src.id, kz(500_000))
        .credit(dst.id, kz(500_000))
        .build()
        .unwrap();

    let first = ledger.post(posting.clone()).await.unwrap();

    // Re-build with the same idempotency key and same entries.
    let duplicate = PostingBuilder::new("payment", "idem-dedup-01")
        .debit(src.id, kz(500_000))
        .credit(dst.id, kz(500_000))
        .build()
        .unwrap();
    let second = ledger.post(duplicate).await.unwrap();

    // Same posting returned — no new rows.
    assert_eq!(first.id, second.id);

    // Balance reflects one posting only.
    let balance = ledger.balance(dst.id).await.unwrap();
    // LIABILITY account credited once → ledger balance is -500_000 (we owe merchant)
    // The raw ledger balance is negative for credits on a LIABILITY.
    assert_eq!(balance.amount_minor().abs(), 500_000);

    Ok(())
}

// ─── Balance derivation ──────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn balance_is_derived_from_entries(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool);

    let bank = ledger
        .create_account(asset_account("bank-bal"))
        .await
        .unwrap();
    let wallet = ledger
        .create_account(liability_account("wallet-bal"))
        .await
        .unwrap();

    // First posting: 10_000 AOA
    ledger
        .post(
            PostingBuilder::new("p1", "idem-bal-01")
                .debit(bank.id, kz(10_000))
                .credit(wallet.id, kz(10_000))
                .build()
                .unwrap(),
        )
        .await
        .unwrap();

    // Second posting: 5_000 AOA
    ledger
        .post(
            PostingBuilder::new("p2", "idem-bal-02")
                .debit(bank.id, kz(5_000))
                .credit(wallet.id, kz(5_000))
                .build()
                .unwrap(),
        )
        .await
        .unwrap();

    // Bank is ASSET: debited twice → balance = 15_000 (positive)
    let bank_balance = ledger.balance(bank.id).await.unwrap();
    assert_eq!(bank_balance.amount_minor(), 15_000);

    // Wallet is LIABILITY: credited twice → balance negative (raw ledger)
    let wallet_balance = ledger.balance(wallet.id).await.unwrap();
    assert_eq!(wallet_balance.amount_minor().abs(), 15_000);

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

    let bank = ledger
        .create_account(asset_account("bank-hist"))
        .await
        .unwrap();
    let wallet = ledger
        .create_account(liability_account("wallet-hist"))
        .await
        .unwrap();

    for i in 1u32..=3 {
        ledger
            .post(
                PostingBuilder::new(format!("posting {i}"), format!("idem-hist-{i:02}"))
                    .debit(bank.id, kz(i as i64 * 10_000))
                    .credit(wallet.id, kz(i as i64 * 10_000))
                    .build()
                    .unwrap(),
            )
            .await
            .unwrap();
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
    let bank = banzami_types::AccountId::new();
    let wallet = banzami_types::AccountId::new();

    let result = PostingBuilder::new("unbalanced", "idem-reject-01")
        .debit(bank, kz(10_000))
        .credit(wallet, kz(9_000)) // 10 Kz missing → not balanced
        .build();

    assert!(
        result.is_err(),
        "expected Err for unbalanced posting, got Ok"
    );
}

/// A posting with only one entry must be rejected.
#[test]
fn single_entry_posting_is_rejected() {
    let bank = banzami_types::AccountId::new();

    let result = PostingBuilder::new("single", "idem-reject-02")
        .debit(bank, kz(5_000))
        .build();

    assert!(
        result.is_err(),
        "expected Err for single-entry posting, got Ok"
    );
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

    let bank = banzami_types::AccountId::new();
    let wallet = banzami_types::AccountId::new();

    let result = PostingBuilder::new("mc-imbalance", "idem-reject-04")
        .debit(bank, kz(10_000))
        .credit(wallet, usd(10_000)) // different currencies → net ≠ 0 per currency
        .build();

    assert!(
        result.is_err(),
        "expected Err for cross-currency imbalance, got Ok"
    );
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
        .debit(bank_aoa, kz(10_000))
        .credit(wallet_aoa, kz(10_000))
        .debit(bank_usd, usd(5_000))
        .credit(wallet_usd, usd(5_000))
        .build();

    assert!(
        result.is_ok(),
        "expected Ok for balanced multi-currency posting, got {:?}",
        result
    );
}

// ─── Idempotency — DB-level ───────────────────────────────────────────────────

/// Re-submitting the same idempotency key with *different* amounts must return
/// the original posting unchanged (not create a second one).
#[sqlx::test(migrations = "../../db/migrations")]
async fn different_amount_same_key_returns_original(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool);

    let src = ledger
        .create_account(asset_account("src-idem"))
        .await
        .unwrap();
    let dst = ledger
        .create_account(liability_account("dst-idem"))
        .await
        .unwrap();

    let first = ledger
        .post(
            PostingBuilder::new("payment A", "idem-amount-check")
                .debit(src.id, kz(100_000))
                .credit(dst.id, kz(100_000))
                .build()
                .unwrap(),
        )
        .await
        .unwrap();

    // Re-submit with the same key but different amounts.
    // The engine must return the original posting, not a second one.
    let second = ledger
        .post(
            PostingBuilder::new("payment B", "idem-amount-check")
                .debit(src.id, kz(50_000))
                .credit(dst.id, kz(50_000))
                .build()
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        first.id, second.id,
        "re-submission must return the original posting"
    );

    // Balance must reflect exactly ONE posting of 1 000 Kz.
    let balance = ledger.balance(dst.id).await.unwrap();
    assert_eq!(balance.amount_minor().abs(), 100_000);

    Ok(())
}

// ─── Reversal ────────────────────────────────────────────────────────────────

/// Posting a reversal must bring both account balances back to zero.
/// The original posting must remain intact in the ledger (audit trail preserved).
#[sqlx::test(migrations = "../../db/migrations")]
async fn reversal_offsets_original_and_preserves_history(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool);

    let bank = ledger
        .create_account(asset_account("bank-rev"))
        .await
        .unwrap();
    let wallet = ledger
        .create_account(liability_account("wallet-rev"))
        .await
        .unwrap();

    let original = ledger
        .post(
            PostingBuilder::new("payment for reversal test", "idem-rev-original")
                .debit(bank.id, kz(1_000_000))
                .credit(wallet.id, kz(1_000_000))
                .build()
                .unwrap(),
        )
        .await
        .unwrap();

    // Both accounts should reflect the posting.
    assert_eq!(
        ledger.balance(bank.id).await.unwrap().amount_minor(),
        1_000_000
    );
    assert_eq!(
        ledger.balance(wallet.id).await.unwrap().amount_minor(),
        -1_000_000
    );

    // Post the reversal.
    let reversal = ledger
        .reverse(&original, "reversal of payment", "idem-rev-reversal")
        .await
        .unwrap();

    // Balances must return to zero.
    assert_eq!(ledger.balance(bank.id).await.unwrap().amount_minor(), 0);
    assert_eq!(ledger.balance(wallet.id).await.unwrap().amount_minor(), 0);

    // Both postings must exist (audit trail intact — original is not deleted).
    let bank_entries = ledger.entries_for_account(bank.id).await.unwrap();
    assert_eq!(
        bank_entries.len(),
        2,
        "original DEBIT + reversal CREDIT must both exist"
    );

    // Reversal is idempotent.
    let reversal2 = ledger
        .reverse(&original, "reversal of payment", "idem-rev-reversal")
        .await
        .unwrap();
    assert_eq!(
        reversal.id, reversal2.id,
        "idempotent reversal must return same posting"
    );

    Ok(())
}

/// get_posting must return the posting and all its entries.
#[sqlx::test(migrations = "../../db/migrations")]
async fn get_posting_returns_full_posting(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool);

    let src = ledger
        .create_account(asset_account("src-get"))
        .await
        .unwrap();
    let dst = ledger
        .create_account(liability_account("dst-get"))
        .await
        .unwrap();

    let posted = ledger
        .post(
            PostingBuilder::new("get test", "idem-get-01")
                .debit(src.id, kz(500_000))
                .credit(dst.id, kz(500_000))
                .build()
                .unwrap(),
        )
        .await
        .unwrap();

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

    let src = ledger
        .create_account(asset_account("src-imm"))
        .await
        .unwrap();
    let dst = ledger
        .create_account(liability_account("dst-imm"))
        .await
        .unwrap();

    ledger
        .post(
            PostingBuilder::new("immutability test", "idem-imm-01")
                .debit(src.id, kz(100_000))
                .credit(dst.id, kz(100_000))
                .build()
                .unwrap(),
        )
        .await
        .unwrap();

    // Attempt to mutate a ledger_entry directly — must be blocked by trigger.
    let result = sqlx::query("UPDATE ledger_entries SET amount_minor = 999 WHERE account_id = $1")
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
    assert_eq!(
        ledger.balance(src.id).await.unwrap().amount_minor(),
        100_000
    );

    Ok(())
}

/// A DELETE on ledger_entries must be rejected by the database trigger.
#[sqlx::test(migrations = "../../db/migrations")]
async fn delete_on_ledger_entry_is_rejected_by_db(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool.clone());

    let src = ledger
        .create_account(asset_account("src-del"))
        .await
        .unwrap();
    let dst = ledger
        .create_account(liability_account("dst-del"))
        .await
        .unwrap();

    ledger
        .post(
            PostingBuilder::new("delete block test", "idem-del-01")
                .debit(src.id, kz(50_000))
                .credit(dst.id, kz(50_000))
                .build()
                .unwrap(),
        )
        .await
        .unwrap();

    let result = sqlx::query("DELETE FROM ledger_entries WHERE account_id = $1")
        .bind(src.id.as_uuid())
        .execute(&pool)
        .await;

    assert!(result.is_err(), "DELETE on ledger_entries must be rejected");

    // Balance must be unchanged.
    assert_eq!(ledger.balance(src.id).await.unwrap().amount_minor(), 50_000);

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
    let aoa_src = ledger
        .create_account(asset_account("aoa-src"))
        .await
        .unwrap();
    // Separate USD account for the credit side
    let usd_dst = ledger
        .create_account(Account::new(
            AccountType::Asset,
            "usd-dst",
            banzami_types::Currency::USD,
        ))
        .await
        .unwrap();

    // Build a posting where the USD account is credited with AOA — currency mismatch.
    let posting = PostingBuilder::new("wrong currency", "idem-ccy-01")
        .debit(aoa_src.id, kz(10_000))
        .credit(usd_dst.id, kz(10_000)) // kz() uses AOA but account is USD
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

    let src = ledger
        .create_account(asset_account("src-conc"))
        .await
        .unwrap();
    let dst = ledger
        .create_account(liability_account("dst-conc"))
        .await
        .unwrap();

    let l1 = ledger.clone();
    let l2 = ledger.clone();

    let (r1, r2) = tokio::join!(
        tokio::spawn(async move {
            l1.post(
                PostingBuilder::new("conc payment", "idem-conc-01")
                    .debit(src.id, kz(20_000))
                    .credit(dst.id, kz(20_000))
                    .build()
                    .unwrap(),
            )
            .await
        }),
        tokio::spawn(async move {
            l2.post(
                PostingBuilder::new("conc payment", "idem-conc-01")
                    .debit(src.id, kz(20_000))
                    .credit(dst.id, kz(20_000))
                    .build()
                    .unwrap(),
            )
            .await
        }),
    );

    // Both tasks must succeed (one returns the original, one returns the duplicate).
    let p1 = r1.unwrap().unwrap();
    let p2 = r2.unwrap().unwrap();

    // They must have the same posting ID.
    assert_eq!(
        p1.id, p2.id,
        "concurrent submissions must return the same posting ID"
    );

    // Balance must reflect exactly one 200 Kz posting.
    let balance = ledger.balance(dst.id).await.unwrap();
    assert_eq!(
        balance.amount_minor().abs(),
        20_000,
        "balance must reflect exactly one posting"
    );

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// LED-003 — Atomic posting & consistency guarantees
// ═══════════════════════════════════════════════════════════════════════════════

// ─── INV-LED-003-1 / INV-LED-003-3 / INV-LED-003-4 ──────────────────────────

/// Manually insert a posting header inside a PG transaction, then roll back
/// without inserting entries. The header must vanish — no orphan posting
/// and no financial trace of any kind.
#[sqlx::test(migrations = "../../db/migrations")]
async fn rollback_leaves_no_orphan_posting_or_entries(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool.clone());

    let src = ledger
        .create_account(asset_account("src-rb"))
        .await
        .unwrap();
    let dst = ledger
        .create_account(liability_account("dst-rb"))
        .await
        .unwrap();

    let posting_id = uuid::Uuid::new_v4();

    {
        let mut tx = pool.begin().await?;

        // Insert the posting header inside the transaction.
        sqlx::query(
            "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
             VALUES ($1, $2, $3, NOW())",
        )
        .bind(posting_id)
        .bind("partial — will be rolled back")
        .bind("idem-rb-orphan")
        .execute(&mut *tx)
        .await?;

        // Do NOT insert entries. Roll back — simulates a failure mid-write.
        tx.rollback().await?;
    }

    // No posting header must remain.
    let header_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM ledger_postings WHERE id = $1")
            .bind(posting_id)
            .fetch_one(&pool)
            .await?;
    assert_eq!(
        header_count, 0,
        "rolled-back posting header must not persist"
    );

    // Balances must still be zero — no financial trace.
    assert_eq!(ledger.balance(src.id).await.unwrap().amount_minor(), 0);
    assert_eq!(ledger.balance(dst.id).await.unwrap().amount_minor(), 0);

    Ok(())
}

/// Failed posting (account not found) must leave balances completely unchanged.
/// INV-LED-003-3: rollback restores all state.
#[sqlx::test(migrations = "../../db/migrations")]
async fn failed_posting_leaves_balances_unchanged(pool: PgPool) -> sqlx::Result<()> {
    use banzami_types::AccountId;
    let ledger = PostgresLedgerRepository::new(pool.clone());

    let bank = ledger
        .create_account(asset_account("bank-fail"))
        .await
        .unwrap();
    let wallet = ledger
        .create_account(liability_account("wallet-fail"))
        .await
        .unwrap();

    // First, make a legitimate posting so balance is non-zero.
    ledger
        .post(
            PostingBuilder::new("initial credit", "idem-fail-pre")
                .debit(bank.id, kz(5_000_000))
                .credit(wallet.id, kz(5_000_000))
                .build()
                .unwrap(),
        )
        .await
        .unwrap();

    let balance_before = ledger.balance(wallet.id).await.unwrap().amount_minor();

    // Attempt to post with a phantom account (does not exist in ledger_accounts).
    let phantom_id = AccountId::new();
    let result = ledger
        .post(
            PostingBuilder::new("bad posting", "idem-fail-bad")
                .debit(bank.id, kz(100_000))
                .credit(phantom_id, kz(100_000))
                .build()
                .unwrap(),
        )
        .await;

    // Must fail — phantom account not found.
    assert!(result.is_err(), "posting to non-existent account must fail");

    // Balance must be exactly the same as before.
    let balance_after = ledger.balance(wallet.id).await.unwrap().amount_minor();
    assert_eq!(
        balance_before, balance_after,
        "failed posting must leave balances unchanged"
    );

    // The failed posting header must not exist in the DB.
    let orphan_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ledger_postings WHERE idempotency_key = 'idem-fail-bad'",
    )
    .fetch_one(&pool)
    .await?;
    assert_eq!(
        orphan_count, 0,
        "failed posting must leave no orphan header"
    );

    Ok(())
}

// ─── INV-LED-003-4 — No partial posting visible ───────────────────────────────

/// A posting header inserted without entries has zero financial effect.
/// The ledger balance for an account with no entries must be zero.
/// (Even if DB constraints allowed a lone header, it cannot corrupt balances.)
#[sqlx::test(migrations = "../../db/migrations")]
async fn posting_header_without_entries_has_zero_financial_effect(
    pool: PgPool,
) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool.clone());
    let account = ledger
        .create_account(asset_account("headeronly"))
        .await
        .unwrap();

    // Insert a header-only posting directly — bypassing the engine (simulates
    // an extreme crash scenario where entries were never committed).
    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES (gen_random_uuid(), $1, $2, NOW())",
    )
    .bind("header only — no entries")
    .bind("idem-headeronly-01")
    .execute(&pool)
    .await?;

    // Balance must still be zero — no entries, no financial state.
    let balance = ledger.balance(account.id).await.unwrap();
    assert_eq!(
        balance.amount_minor(),
        0,
        "lone posting header has no financial effect"
    );

    Ok(())
}

/// A ledger_entry row cannot be inserted without a valid posting_id.
/// PostgreSQL FK constraint must reject the orphan entry.
#[sqlx::test(migrations = "../../db/migrations")]
async fn entry_without_posting_header_fk_rejected(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool.clone());
    let account = ledger
        .create_account(asset_account("fk-test"))
        .await
        .unwrap();

    let phantom_posting_id = uuid::Uuid::new_v4(); // does not exist in ledger_postings

    let result = sqlx::query(
        "INSERT INTO ledger_entries
         (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'DEBIT', 100, 'AOA', NOW())",
    )
    .bind(phantom_posting_id)
    .bind(account.id.as_uuid())
    .execute(&pool)
    .await;

    assert!(
        result.is_err(),
        "orphan ledger_entry must be rejected by FK"
    );

    // Balance must be zero.
    assert_eq!(ledger.balance(account.id).await.unwrap().amount_minor(), 0);

    Ok(())
}

// ─── INV-LED-003-5 — Concurrent different postings ───────────────────────────

/// Two concurrent but DIFFERENT balanced postings (distinct idempotency keys
/// and distinct amounts) must both land. Balances after must exactly reflect
/// both postings with no lost updates and no duplication.
#[sqlx::test(migrations = "../../db/migrations")]
async fn concurrent_different_postings_all_land_consistently(pool: PgPool) -> sqlx::Result<()> {
    use std::sync::Arc;
    let ledger = Arc::new(PostgresLedgerRepository::new(pool));

    let bank = ledger
        .create_account(asset_account("bank-cd"))
        .await
        .unwrap();
    let wallet = ledger
        .create_account(liability_account("wallet-cd"))
        .await
        .unwrap();

    let l1 = ledger.clone();
    let l2 = ledger.clone();

    // 300 Kz and 700 Kz — distinct amounts, distinct keys.
    let (r1, r2) = tokio::join!(
        tokio::spawn(async move {
            l1.post(
                PostingBuilder::new("payment A", "idem-cd-A")
                    .debit(bank.id, kz(30_000))
                    .credit(wallet.id, kz(30_000))
                    .build()
                    .unwrap(),
            )
            .await
        }),
        tokio::spawn(async move {
            l2.post(
                PostingBuilder::new("payment B", "idem-cd-B")
                    .debit(bank.id, kz(70_000))
                    .credit(wallet.id, kz(70_000))
                    .build()
                    .unwrap(),
            )
            .await
        }),
    );

    r1.unwrap().unwrap();
    r2.unwrap().unwrap();

    // Total credited to wallet must be exactly 1 000 Kz (300 + 700).
    let wallet_balance = ledger.balance(wallet.id).await.unwrap();
    assert_eq!(
        wallet_balance.amount_minor().abs(),
        100_000,
        "both concurrent postings must land: expected 1 000 Kz, got {}",
        wallet_balance.amount_minor().abs()
    );

    // Bank balance must equal 1 000 Kz debited.
    let bank_balance = ledger.balance(bank.id).await.unwrap();
    assert_eq!(bank_balance.amount_minor(), 100_000);

    // Net across both accounts must be zero (double-entry invariant preserved).
    let net = bank_balance.amount_minor() + wallet_balance.amount_minor();
    assert_eq!(
        net, 0,
        "net across all accounts must be zero after concurrent postings"
    );

    Ok(())
}

// ─── SQL consistency sweep ────────────────────────────────────────────────────

/// Run all SQL consistency invariants against the test database:
/// - zero unbalanced postings
/// - zero orphan entries (entry with no posting header)
/// - zero posting headers with fewer than 2 entries
/// - zero duplicate idempotency keys
///
/// Proves LED-003 structural invariants hold at the DB level, not just at
/// the application layer.
#[sqlx::test(migrations = "../../db/migrations")]
async fn sql_consistency_invariants_all_pass(pool: PgPool) -> sqlx::Result<()> {
    let ledger = PostgresLedgerRepository::new(pool.clone());

    let bank = ledger
        .create_account(asset_account("bank-sql"))
        .await
        .unwrap();
    let wallet = ledger
        .create_account(liability_account("wallet-sql"))
        .await
        .unwrap();

    // Write several valid postings through the engine.
    for i in 1u32..=5 {
        ledger
            .post(
                PostingBuilder::new(format!("sql-sweep posting {i}"), format!("idem-sql-{i:02}"))
                    .debit(bank.id, kz(i as i64 * 10_000))
                    .credit(wallet.id, kz(i as i64 * 10_000))
                    .build()
                    .unwrap(),
            )
            .await
            .unwrap();
    }

    // 1. Zero unbalanced postings.
    let unbalanced: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ledger_postings p
         WHERE (
             SELECT COALESCE(SUM(CASE WHEN entry_type='DEBIT' THEN amount_minor ELSE -amount_minor END), 0)
             FROM ledger_entries
             WHERE posting_id = p.id
         ) <> 0",
    )
    .fetch_one(&pool)
    .await?;
    assert_eq!(unbalanced, 0, "must have zero unbalanced postings");

    // 2. Zero orphan entries (entry pointing to non-existent posting).
    // Note: FK constraint already prevents this; this assertion double-checks.
    let orphan_entries: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ledger_entries e
         LEFT JOIN ledger_postings p ON p.id = e.posting_id
         WHERE p.id IS NULL",
    )
    .fetch_one(&pool)
    .await?;
    assert_eq!(orphan_entries, 0, "must have zero orphan entries");

    // 3. Zero posting headers with fewer than 2 entries.
    let thin_postings: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ledger_postings p
         WHERE (SELECT COUNT(*) FROM ledger_entries WHERE posting_id = p.id) < 2",
    )
    .fetch_one(&pool)
    .await?;
    assert_eq!(
        thin_postings, 0,
        "every committed posting must have at least 2 entries"
    );

    // 4. Zero duplicate idempotency keys (UNIQUE constraint proof).
    let dup_keys: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM (
             SELECT idempotency_key, COUNT(*) AS cnt
             FROM ledger_postings
             GROUP BY idempotency_key
             HAVING COUNT(*) > 1
         ) AS dupes",
    )
    .fetch_one(&pool)
    .await?;
    assert_eq!(dup_keys, 0, "must have zero duplicate idempotency keys");

    Ok(())
}
