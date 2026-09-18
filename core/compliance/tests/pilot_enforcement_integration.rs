// Real-database integration tests for V1.0 pilot-limit RUNTIME enforcement
// (CLAUDE.md §7: financial invariant tests MUST use a real database — no mocks).
//
// Each test runs against a fresh migrated database via `#[sqlx::test]`. We seed
// real ledger accounts / postings / entries (and wallets where needed), then call
// the production enforcement functions and assert the deterministic pilot code,
// and that a rejected check does not mutate ledger state.

use sqlx::PgPool;

use banzami_compliance::pilot::PilotLimitPolicy;
use banzami_compliance::pilot::limits;
use banzami_compliance::pilot_enforce::{check_funding, check_merchant_credit, Party};

const ON: PilotLimitPolicy = PilotLimitPolicy::enabled();
const OFF: PilotLimitPolicy = PilotLimitPolicy::disabled();

async fn new_account(pool: &PgPool) -> uuid::Uuid {
    let id = uuid::Uuid::new_v4();
    sqlx::query("INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES ($1,'LIABILITY',$2,'AOA')")
        .bind(id)
        .bind(format!("acct-{id}"))
        .execute(pool)
        .await
        .unwrap();
    id
}

/// Post a CREDIT of `amount` minor to `account`, dated `days_ago` days back.
async fn credit(pool: &PgPool, account: uuid::Uuid, amount: i64, days_ago: i64) {
    let pid = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key) VALUES ($1,'seed',$2)",
    )
    .bind(pid)
    .bind(format!("idem-{pid}"))
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO ledger_entries (posting_id, account_id, entry_type, amount_minor, currency, created_at) \
         VALUES ($1,$2,'CREDIT',$3,'AOA', now() - ($4 || ' days')::interval)",
    )
    .bind(pid)
    .bind(account)
    .bind(amount)
    .bind(days_ago.to_string())
    .execute(pool)
    .await
    .unwrap();
}

/// Post a CREDIT of `amount` minor to `account`, dated `hours_ago` hours back.
/// The 24h window needs sub-day precision that the `days_ago` helper cannot give.
async fn credit_hours(pool: &PgPool, account: uuid::Uuid, amount: i64, hours_ago: i64) {
    let pid = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key) VALUES ($1,'seed',$2)",
    )
    .bind(pid)
    .bind(format!("idem-{pid}"))
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO ledger_entries (posting_id, account_id, entry_type, amount_minor, currency, created_at) \
         VALUES ($1,$2,'CREDIT',$3,'AOA', now() - ($4 || ' hours')::interval)",
    )
    .bind(pid)
    .bind(account)
    .bind(amount)
    .bind(hours_ago.to_string())
    .execute(pool)
    .await
    .unwrap();
}

/// Merchant VOLUME without merchant BALANCE: a credit of `amount`, and a matching
/// debit as if the merchant settled or paid it out.
///
/// The two caps interact and the tests have to respect it. MERCHANT_MAX_BALANCE
/// is Kz 100.000 while MERCHANT_ROLLING_24H is Kz 250.000, so a merchant that
/// never spends hits the BALANCE cap long before its volume window — the stock
/// cap binds before the flow cap. Only a merchant that actually settles can
/// reach its volume window, which is exactly how a real one behaves.
async fn volume(pool: &PgPool, account: uuid::Uuid, amount: i64, hours_ago: i64) {
    credit_hours(pool, account, amount, hours_ago).await;
    let pid = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key) VALUES ($1,'settle',$2)",
    )
    .bind(pid)
    .bind(format!("idem-{pid}"))
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO ledger_entries (posting_id, account_id, entry_type, amount_minor, currency, created_at) \
         VALUES ($1,$2,'DEBIT',$3,'AOA', now() - ($4 || ' hours')::interval)",
    )
    .bind(pid)
    .bind(account)
    .bind(amount)
    .bind(hours_ago.to_string())
    .execute(pool)
    .await
    .unwrap();
}

/// Every ledger row, as a fingerprint. Used to prove a policy decision writes
/// nothing — not a row, not a timestamp, not an amount.
async fn ledger_fingerprint(pool: &PgPool) -> (i64, i64, Option<String>) {
    sqlx::query_as(
        "SELECT count(*)::bigint,
                COALESCE(SUM(amount_minor),0)::bigint,
                md5(COALESCE(string_agg(id::text, ',' ORDER BY id), ''))
           FROM ledger_entries",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn make_merchant_wallet(pool: &PgPool, avail: uuid::Uuid) {
    let reserved = new_account(pool).await;
    sqlx::query(
        "INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id) \
         VALUES ($1,$2,'AOA','ACTIVE',$3,$4)",
    )
    .bind(uuid::Uuid::new_v4())
    .bind(uuid::Uuid::new_v4())
    .bind(avail)
    .bind(reserved)
    .execute(pool)
    .await
    .unwrap();
}

async fn balance(pool: &PgPool, account: uuid::Uuid) -> i64 {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END),0)::bigint \
           FROM ledger_entries WHERE account_id=$1",
    )
    .bind(account)
    .fetch_one(pool)
    .await
    .unwrap()
}

// -- merchant per-received (Kz 25.000 = 2_500_000) ------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn merchant_per_received_over_is_rejected(pool: PgPool) {
    let acct = new_account(&pool).await;
    make_merchant_wallet(&pool, acct).await;
    // at cap → allowed
    assert!(check_merchant_credit(&mut pool.acquire().await.unwrap(), acct, 2_500_000, ON)
        .await
        .unwrap()
        .is_none());
    // over cap → PILOT_LIMIT_MERCHANT_RECEIVE_EXCEEDED
    let v = check_merchant_credit(&mut pool.acquire().await.unwrap(), acct, 2_500_001, ON)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(v.as_str(), "PILOT_LIMIT_MERCHANT_RECEIVE_EXCEEDED");
}

// -- merchant balance (Kz 100.000 = 10_000_000) ---------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn merchant_balance_over_is_rejected(pool: PgPool) {
    let acct = new_account(&pool).await;
    make_merchant_wallet(&pool, acct).await;
    credit(&pool, acct, 10_000_000, 2).await; // balance at cap, but NOT today (daily=0)
    let before = balance(&pool, acct).await;
    let v = check_merchant_credit(&mut pool.acquire().await.unwrap(), acct, 1, ON)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(v.as_str(), "PILOT_LIMIT_MERCHANT_BALANCE_EXCEEDED");
    // rejected check must not mutate ledger state
    assert_eq!(balance(&pool, acct).await, before);
}

// -- consumer balance (Kz 50.000 = 5_000_000) -----------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn consumer_balance_over_is_rejected(pool: PgPool) {
    let acct = new_account(&pool).await;
    credit(&pool, acct, 5_000_000, 0).await; // at cap
    let v = check_funding(&pool, Party::Consumer, acct, 1, ON)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(v.as_str(), "PILOT_LIMIT_CONSUMER_BALANCE_EXCEEDED");
    // below cap → allowed
    let acct2 = new_account(&pool).await;
    credit(&pool, acct2, 1_000_000, 0).await;
    assert!(check_funding(&pool, Party::Consumer, acct2, 1_000_000, ON)
        .await
        .unwrap()
        .is_none());
}

// -- aggregate funds in circulation (Kz 500.000 = 50_000_000) -------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn aggregate_funds_over_is_rejected(pool: PgPool) {
    let acct = new_account(&pool).await;
    make_merchant_wallet(&pool, acct).await;
    credit(&pool, acct, 50_000_000, 1).await; // full circulation already
    let target = new_account(&pool).await;
    let v = check_funding(&pool, Party::Merchant, target, 1, ON)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(v.as_str(), "PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED");
}

// ═══════════════════════════════════════════════════════════════════════════
// Rolling merchant-credit volume windows (owner decision D1)
//
// These replaced a LIFETIME cumulative counter. Retirement of synthetic value
// posts a DEBIT and the counter summed CREDITs only, so it could never fall.
// Each test below seeds real ledger history and asserts what the production
// enforcement path decides against it.
// ═══════════════════════════════════════════════════════════════════════════

/// A merchant wallet whose available account is returned.
async fn merchant_acct(pool: &PgPool) -> uuid::Uuid {
    let a = new_account(pool).await;
    make_merchant_wallet(pool, a).await;
    a
}

async fn decide(pool: &PgPool, acct: uuid::Uuid, amount: i64) -> Option<&'static str> {
    check_merchant_credit(&mut pool.acquire().await.unwrap(), acct, amount, ON)
        .await
        .unwrap()
        .map(|v| v.as_str())
}

// -- merchant 24h ---------------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn merchant_24h_inside_is_allowed(pool: PgPool) {
    let a = merchant_acct(&pool).await;
    volume(&pool, a, limits::MERCHANT_ROLLING_24H_MINOR - 1_000, 1).await;
    assert_eq!(decide(&pool, a, 1_000).await, None, "exactly at the cap must pass");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn merchant_24h_over_is_rejected(pool: PgPool) {
    let a = merchant_acct(&pool).await;
    volume(&pool, a, limits::MERCHANT_ROLLING_24H_MINOR, 1).await;
    assert_eq!(
        decide(&pool, a, 1).await,
        Some("PILOT_LIMIT_MERCHANT_24H_VOLUME_EXCEEDED")
    );
}

// -- merchant 30d ---------------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn merchant_30d_inside_is_allowed(pool: PgPool) {
    let a = merchant_acct(&pool).await;
    // Spread across the window so no single day trips the 24h cap.
    for d in 2..=20 {
        volume(&pool, a, 1_000_000, d * 24).await;
    }
    assert_eq!(decide(&pool, a, 1_000).await, None);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn merchant_30d_over_is_rejected(pool: PgPool) {
    let a = merchant_acct(&pool).await;
    // 100 x 1.000.000 = the 30d cap exactly, none of it inside the last 24h.
    for d in 2..=29 {
        volume(&pool, a, 3_571_428, d * 24).await;
    }
    volume(&pool, a, limits::MERCHANT_ROLLING_30D_MINOR - 3_571_428 * 28, 48).await;
    assert_eq!(
        decide(&pool, a, 1).await,
        Some("PILOT_LIMIT_MERCHANT_30D_VOLUME_EXCEEDED")
    );
}

// -- global windows -------------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn global_24h_over_is_rejected_for_a_quiet_merchant(pool: PgPool) {
    // The global window fills from OTHER merchants; the merchant being charged
    // has received nothing. It must still be refused, and told it is the global
    // window — not its own.
    let quiet = merchant_acct(&pool).await;
    let mut filled = 0i64;
    while filled < limits::GLOBAL_ROLLING_24H_MINOR {
        let other = merchant_acct(&pool).await;
        let chunk = limits::MERCHANT_ROLLING_24H_MINOR;
        volume(&pool, other, chunk, 1).await;
        filled += chunk;
    }
    assert_eq!(
        decide(&pool, quiet, 1).await,
        Some("PILOT_LIMIT_GLOBAL_24H_VOLUME_EXCEEDED")
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn global_24h_inside_allows_a_quiet_merchant(pool: PgPool) {
    let quiet = merchant_acct(&pool).await;
    let other = merchant_acct(&pool).await;
    volume(&pool, other, limits::MERCHANT_ROLLING_24H_MINOR, 1).await;
    assert_eq!(decide(&pool, quiet, 1_000).await, None);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn global_30d_over_is_rejected(pool: PgPool) {
    let quiet = merchant_acct(&pool).await;
    let mut filled = 0i64;
    let mut day = 2i64;
    while filled < limits::GLOBAL_ROLLING_30D_MINOR {
        let other = merchant_acct(&pool).await;
        volume(&pool, other, limits::MERCHANT_ROLLING_30D_MINOR, day * 24).await;
        filled += limits::MERCHANT_ROLLING_30D_MINOR;
        day = if day >= 29 { 2 } else { day + 1 };
    }
    assert_eq!(
        decide(&pool, quiet, 1).await,
        Some("PILOT_LIMIT_GLOBAL_30D_VOLUME_EXCEEDED")
    );
}

// -- window aging ---------------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn volume_ages_out_of_the_24h_window(pool: PgPool) {
    // THE property the lifetime counter did not have: identical history, opposite
    // outcomes, decided only by age. Nothing is deleted, edited or reset — the
    // window simply moves.
    //
    // The first version of this test tried to age a row with an UPDATE and the
    // DATABASE refused it (`raise_ledger_immutable`). That refusal is a better
    // result than the test was asking for, and it is asserted directly in
    // `the_ledger_itself_refuses_mutation` below. Here the two ages are seeded
    // rather than edited.
    let recent = merchant_acct(&pool).await;
    let aged = merchant_acct(&pool).await;

    volume(&pool, recent, limits::MERCHANT_ROLLING_24H_MINOR, 1).await;
    volume(&pool, aged, limits::MERCHANT_ROLLING_24H_MINOR, 25).await;

    assert_eq!(
        decide(&pool, recent, 1).await,
        Some("PILOT_LIMIT_MERCHANT_24H_VOLUME_EXCEEDED"),
        "inside the window it is refused"
    );
    assert_eq!(
        decide(&pool, aged, 1).await,
        None,
        "the same volume, one hour older than the window, is allowed"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn the_ledger_itself_refuses_mutation(pool: PgPool) {
    // SANDBOX_LIMIT_POLICY_FINANCIAL_HISTORY_MUTATIONS=0 does not rest on the
    // policy being careful. The database refuses to let ANY caller edit a
    // posted entry, so a rolling window that reads history cannot corrupt it
    // even if it tried. Discovered when an earlier draft of the aging test
    // attempted exactly this.
    let a = merchant_acct(&pool).await;
    volume(&pool, a, 1_000_000, 1).await;

    let err = sqlx::query("UPDATE ledger_entries SET created_at = now() WHERE account_id = $1")
        .bind(a)
        .execute(&pool)
        .await
        .expect_err("the ledger must refuse an UPDATE");
    assert!(
        err.to_string().contains("immutable"),
        "expected a ledger-immutability refusal, got: {err}"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn history_outside_the_30d_window_does_not_count(pool: PgPool) {
    let a = merchant_acct(&pool).await;
    // Far more than every cap, but all of it 40 days old.
    volume(&pool, a, limits::MERCHANT_ROLLING_30D_MINOR * 3, 40 * 24).await;
    assert_eq!(decide(&pool, a, 1_000).await, None);
}

// -- boundary timestamps --------------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn the_window_boundary_is_inclusive_of_recent_and_exclusive_of_old(pool: PgPool) {
    let inside = merchant_acct(&pool).await;
    let outside = merchant_acct(&pool).await;
    // 23h59m ago counts; 24h01m ago does not.
    volume(&pool, inside, limits::MERCHANT_ROLLING_24H_MINOR, 23).await;
    volume(&pool, outside, limits::MERCHANT_ROLLING_24H_MINOR, 25).await;

    assert_eq!(
        decide(&pool, inside, 1).await,
        Some("PILOT_LIMIT_MERCHANT_24H_VOLUME_EXCEEDED")
    );
    assert_eq!(decide(&pool, outside, 1).await, None);
}

// -- multiple merchants are independent -----------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn one_merchant_at_its_cap_does_not_close_another(pool: PgPool) {
    let busy = merchant_acct(&pool).await;
    let quiet = merchant_acct(&pool).await;
    volume(&pool, busy, limits::MERCHANT_ROLLING_24H_MINOR, 1).await;

    assert_eq!(
        decide(&pool, busy, 1).await,
        Some("PILOT_LIMIT_MERCHANT_24H_VOLUME_EXCEEDED")
    );
    assert_eq!(
        decide(&pool, quiet, 1_000).await,
        None,
        "a quiet merchant must not inherit a busy one's usage"
    );
}

// -- THE INVARIANT: a policy decision mutates no financial history ---------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_policy_decision_never_mutates_financial_history(pool: PgPool) {
    // SANDBOX_LIMIT_POLICY_FINANCIAL_HISTORY_MUTATIONS=0.
    //
    // The rolling windows are DERIVED by query from immutable history; there is
    // no stored counter to move. This asserts it over the whole ledger rather
    // than one account: row count, total value and the exact set of entry ids
    // are identical before and after both an allowed and a refused decision.
    let a = merchant_acct(&pool).await;
    volume(&pool, a, limits::MERCHANT_ROLLING_24H_MINOR, 1).await;

    let before = ledger_fingerprint(&pool).await;

    assert_eq!(decide(&pool, a, 1).await, Some("PILOT_LIMIT_MERCHANT_24H_VOLUME_EXCEEDED"));
    assert_eq!(ledger_fingerprint(&pool).await, before, "a REFUSED decision wrote something");

    let quiet = merchant_acct(&pool).await;
    assert_eq!(decide(&pool, quiet, 1_000).await, None);
    assert_eq!(ledger_fingerprint(&pool).await, before, "an ALLOWED decision wrote something");
}

// -- disabled policy is a no-op -------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn disabled_policy_allows_everything(pool: PgPool) {
    let acct = new_account(&pool).await;
    make_merchant_wallet(&pool, acct).await;
    credit(&pool, acct, 200_000_000, 0).await;
    assert!(
        check_merchant_credit(&mut pool.acquire().await.unwrap(), acct, i64::MAX / 4, OFF)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        check_funding(&pool, Party::Consumer, acct, i64::MAX / 4, OFF)
            .await
            .unwrap()
            .is_none()
    );
}

// -- allowed operation below all limits passes ----------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn below_limits_passes(pool: PgPool) {
    let acct = new_account(&pool).await;
    make_merchant_wallet(&pool, acct).await;
    assert!(
        check_merchant_credit(&mut pool.acquire().await.unwrap(), acct, 1_000_000, ON)
            .await
            .unwrap()
            .is_none()
    );
    let c = new_account(&pool).await;
    assert!(check_funding(&pool, Party::Consumer, c, 1_000_000, ON)
        .await
        .unwrap()
        .is_none());
}

// -- a Project-owned Sandbox test payer is not held to the shared aggregate cap ---
// ADR-060 §6: the aggregate funds cap is shared by every developer, so one
// Project's test payers must not be able to exhaust it for the rest. The
// per-party balance cap still applies to them.
#[sqlx::test(migrations = "../../db/migrations")]
async fn test_payer_funding_ignores_the_aggregate_but_keeps_the_balance_cap(pool: PgPool) {
    use banzami_compliance::pilot::limits::{AGGREGATE_FUNDS_MINOR, CONSUMER_MAX_BALANCE_MINOR};
    use banzami_compliance::pilot_enforce::check_test_payer_funding;
    // Fill the Sandbox-wide aggregate through a merchant wallet.
    let big = new_account(&pool).await;
    make_merchant_wallet(&pool, big).await;
    credit(&pool, big, AGGREGATE_FUNDS_MINOR, 0).await;

    let payer = new_account(&pool).await;
    // An ordinary consumer is refused by the aggregate…
    assert!(check_funding(&pool, Party::Consumer, payer, 1_000_000, ON)
        .await
        .unwrap()
        .is_some());
    // …a test payer is not…
    assert!(check_test_payer_funding(&pool, payer, 1_000_000, ON)
        .await
        .unwrap()
        .is_none());
    // …but its own balance cap still holds.
    credit(&pool, payer, CONSUMER_MAX_BALANCE_MINOR, 0).await;
    assert!(check_test_payer_funding(&pool, payer, 1, ON)
        .await
        .unwrap()
        .is_some());
    // And a disabled policy decides nothing.
    assert!(check_test_payer_funding(&pool, payer, 1, OFF)
        .await
        .unwrap()
        .is_none());
}
