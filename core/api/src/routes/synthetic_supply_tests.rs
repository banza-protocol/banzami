//! The Sandbox synthetic-supply fuse (ADR-048, second amendment): Kz 250 000 000
//! of fictitious value may exist in the environment, and no more.
//!
//! Real database, Core's own routes. What is proven here:
//!
//! * the fuse is on ISSUANCE — every route that brings new value across the
//!   system boundary is refused at the cap, with no exemption for a test payer,
//!   a Console top-up or an operator credit;
//! * it is not on MOVEMENT — a payment, a P2P transfer and a refund at a full
//!   cap still go through, and none of them changes the measured supply;
//! * it holds under concurrency — two issuances that together would cross the
//!   cap cannot both post.

use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_compliance::pilot::{limits, PilotLimitPolicy};
use banzami_compliance::pilot_enforce::synthetic_supply_minor;
use banzami_ledger::system::{register_system_account, SystemRole};
use banzami_types::AccountId;

use super::consumer_wallets::{self, TestCreditBody};
use super::external_rail_tests::{
    account, balance, book_sums_to_zero, business, funded_consumer, p2p, pay_business,
};
use super::wallets::{self, AdminCreditBody, SandboxCreditBody};
use crate::state::{AppState, CoreEnvironment};

const CAP: i64 = limits::AGGREGATE_FUNDS_MINOR;
const TOP_UP: i64 = limits::TOP_UP_PER_OPERATION_MINOR;
const REFUSED: &str = "PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED";

struct Sandbox {
    state: AppState,
    transit: Uuid,
}

/// Core as it boots in the Sandbox: system accounts carry their economic roles
/// and the pilot overlay is on.
async fn sandbox(pool: &PgPool) -> Sandbox {
    let transit = account(pool, "ASSET").await;
    let bank = account(pool, "ASSET").await;
    let revenue = account(pool, "REVENUE").await;
    for (id, role) in [
        (transit, SystemRole::ExternalTransit),
        (bank, SystemRole::ExternalBacking),
        (revenue, SystemRole::OperatorRevenue),
    ] {
        register_system_account(pool, AccountId::from_uuid(id), role, true)
            .await
            .unwrap();
    }
    let mut state = AppState::new(
        pool.clone(),
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        AccountId::from_uuid(revenue),
        CoreEnvironment::Sandbox,
    );
    state.pilot_policy = PilotLimitPolicy::enabled();
    Sandbox { state, transit }
}

async fn supply(pool: &PgPool) -> i64 {
    let mut conn = pool.acquire().await.unwrap();
    synthetic_supply_minor(&mut conn).await.unwrap()
}

/// Value already issued before the test begins: DR transit / CR `to`, the shape
/// every issuance has.
async fn issued(pool: &PgPool, transit: Uuid, to: Uuid, amount: i64) {
    let p = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key) VALUES ($1, 'issued', $2)",
    )
    .bind(p)
    .bind(format!("issued-{p}"))
    .execute(pool)
    .await
    .unwrap();
    for (a, t) in [(transit, "DEBIT"), (to, "CREDIT")] {
        sqlx::query(
            "INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, 'AOA')",
        )
        .bind(p)
        .bind(a)
        .bind(t)
        .bind(amount)
        .execute(pool)
        .await
        .unwrap();
    }
}

/// The supply brought to `target` by issuing the difference to a holder nobody
/// in the test otherwise touches.
async fn supply_at(pool: &PgPool, transit: Uuid, target: i64) {
    let (_, _, holder) = funded_consumer(pool, 0).await;
    let now = supply(pool).await;
    if target != now {
        issued(pool, transit, holder, target - now).await;
    }
    assert_eq!(supply(pool).await, target);
}

async fn top_up(state: &AppState, consumer: Uuid, amount: i64) -> Result<i64, String> {
    consumer_wallets::test_credit(
        State(state.clone()),
        Json(TestCreditBody {
            consumer_id: consumer.to_string(),
            amount_minor: amount,
            currency: Some("AOA".into()),
            idempotency_key: Some(format!("top-up-{}", Uuid::new_v4())),
        }),
    )
    .await
    .map(|Json(r)| r.new_balance)
    .map_err(|e| e.code.to_owned())
}

async fn postings(pool: &PgPool) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM ledger_postings")
        .fetch_one(pool)
        .await
        .unwrap()
}

// 249 950 000 + 50 000 = 250 000 000 passes; a full cap is a valid state; one
// more minor unit, or one more kwanza, is refused and leaves nothing behind.
#[sqlx::test(migrations = "../../db/migrations")]
async fn the_cap_is_reachable_exactly_and_not_by_one_unit_more(pool: PgPool) {
    let sb = sandbox(&pool).await;
    supply_at(&pool, sb.transit, CAP - TOP_UP).await;
    let (consumer, _, wallet) = funded_consumer(&pool, 0).await;

    assert_eq!(top_up(&sb.state, consumer, TOP_UP).await, Ok(TOP_UP));
    assert_eq!(supply(&pool).await, CAP, "the cap itself is a valid state");
    assert!(book_sums_to_zero(&pool).await);

    let before = postings(&pool).await;
    for more in [1, 100] {
        assert_eq!(
            top_up(&sb.state, consumer, more).await,
            Err(REFUSED.to_owned())
        );
    }
    assert_eq!(supply(&pool).await, CAP);
    assert_eq!(balance(&pool, wallet).await, TOP_UP);
    assert_eq!(
        postings(&pool).await,
        before,
        "a refused issuance leaves no posting header"
    );
}

// Two top-ups of 50 000 against 50 000 of room: exactly one posts. Repeated,
// because a race that loses once in a while is still a race.
#[sqlx::test(migrations = "../../db/migrations")]
async fn two_concurrent_issuances_cannot_both_cross_the_cap(pool: PgPool) {
    let sb = sandbox(&pool).await;
    for round in 0..8 {
        supply_at(&pool, sb.transit, CAP - TOP_UP).await;
        let (a, _, _) = funded_consumer(&pool, 0).await;
        let (b, _, _) = funded_consumer(&pool, 0).await;

        let (ra, rb) = tokio::join!(
            tokio::spawn({
                let s = sb.state.clone();
                async move { top_up(&s, a, TOP_UP).await }
            }),
            tokio::spawn({
                let s = sb.state.clone();
                async move { top_up(&s, b, TOP_UP).await }
            }),
        );
        let results = [ra.unwrap(), rb.unwrap()];
        assert_eq!(
            results.iter().filter(|r| r.is_ok()).count(),
            1,
            "round {round}: {results:?}"
        );
        assert!(results.contains(&Err(REFUSED.to_owned())), "{results:?}");
        assert_eq!(supply(&pool).await, CAP, "round {round}");

        // Make room for the next round by destroying what this one issued:
        // the reverse posting, CR transit.
        let (_, _, sink) = funded_consumer(&pool, 0).await;
        issued(&pool, sink, sb.transit, TOP_UP).await;
    }
    assert!(supply(&pool).await <= CAP);
}

// A payment and a P2P transfer at a full cap go through: they move value that
// already exists, and the measured supply does not change by a single unit.
#[sqlx::test(migrations = "../../db/migrations")]
async fn movement_at_a_full_cap_is_permitted_and_changes_no_supply(pool: PgPool) {
    let sb = sandbox(&pool).await;
    let (payer, payer_handle, payer_wallet) = funded_consumer(&pool, 0).await;
    let (_, friend_handle, friend_wallet) = funded_consumer(&pool, 0).await;
    issued(&pool, sb.transit, payer_wallet, 100_000).await;
    supply_at(&pool, sb.transit, CAP).await;
    let b = business(&pool).await;

    pay_business(&sb.state, payer, &b, "pay-at-cap")
        .await
        .expect("a payment at a full cap");
    assert_eq!(balance(&pool, b.available).await, 25_000);
    assert_eq!(supply(&pool).await, CAP, "a payment issued nothing");

    p2p(&sb.state, &payer_handle, &friend_handle, "p2p-at-cap")
        .await
        .expect("a P2P transfer at a full cap");
    assert_eq!(balance(&pool, friend_wallet).await, 5_000);
    assert_eq!(supply(&pool).await, CAP, "a transfer issued nothing");

    // And the cap is still closed to issuance.
    assert_eq!(top_up(&sb.state, payer, 1).await, Err(REFUSED.to_owned()));
    assert!(book_sums_to_zero(&pool).await);
}

// Value resting in a reserved account or a Business wallet is still issued
// value. The old measure added up `available` accounts only, so reserving
// funds made room under the cap that did not exist.
#[sqlx::test(migrations = "../../db/migrations")]
async fn value_outside_available_accounts_is_still_counted(pool: PgPool) {
    let sb = sandbox(&pool).await;
    let (consumer, _, wallet) = funded_consumer(&pool, 0).await;
    supply_at(&pool, sb.transit, CAP - TOP_UP).await;
    issued(&pool, sb.transit, wallet, TOP_UP).await;
    assert_eq!(supply(&pool).await, CAP);

    // Move the whole balance into the consumer's reserved account.
    let reserved: Uuid = sqlx::query_scalar(
        "SELECT reserved_account_id FROM consumer_wallets WHERE consumer_id = $1",
    )
    .bind(consumer)
    .fetch_one(&pool)
    .await
    .unwrap();
    issued(&pool, wallet, reserved, TOP_UP).await;
    assert_eq!(balance(&pool, wallet).await, 0);

    assert_eq!(supply(&pool).await, CAP, "a reservation destroyed nothing");
    assert_eq!(
        top_up(&sb.state, consumer, 1).await,
        Err(REFUSED.to_owned())
    );
}

// A Project's test payer issues value like anyone else. It used to be exempt.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_test_payer_does_not_bypass_the_cap(pool: PgPool) {
    let sb = sandbox(&pool).await;
    let (payer, _, wallet) = funded_consumer(&pool, 0).await;
    sqlx::query("INSERT INTO sandbox_test_payers (consumer_id, project_id) VALUES ($1, $2)")
        .bind(payer)
        .bind(Uuid::new_v4())
        .execute(&pool)
        .await
        .unwrap();
    supply_at(&pool, sb.transit, CAP - TOP_UP + 1).await;

    assert_eq!(
        top_up(&sb.state, payer, TOP_UP).await,
        Err(REFUSED.to_owned())
    );
    assert_eq!(balance(&pool, wallet).await, 0);

    // With exactly enough room, the same payer is funded.
    assert_eq!(top_up(&sb.state, payer, TOP_UP - 1).await, Ok(TOP_UP - 1));
    assert_eq!(supply(&pool).await, CAP);
}

// The Console's Business top-up and the operator's manual credit both issue
// value. Neither carried any check at all.
#[sqlx::test(migrations = "../../db/migrations")]
async fn business_and_operator_credits_do_not_bypass_the_cap(pool: PgPool) {
    let sb = sandbox(&pool).await;
    let b = business(&pool).await;
    supply_at(&pool, sb.transit, CAP - 1_000).await;

    let console = |amount: i64| {
        wallets::sandbox_credit(
            State(sb.state.clone()),
            Path(b.wallet.to_string()),
            Json(SandboxCreditBody {
                amount_minor: amount,
                currency: Some("AOA".into()),
                idempotency_key: Some(format!("console-{}", Uuid::new_v4())),
            }),
        )
    };
    let operator = |amount: i64| {
        wallets::admin_credit(
            State(sb.state.clone()),
            Path(b.wallet.to_string()),
            Json(AdminCreditBody {
                amount_minor: amount,
                currency: Some("AOA".into()),
                reason: "fuse test".into(),
                idempotency_key: Some(format!("operator-{}", Uuid::new_v4())),
            }),
        )
    };

    let before = postings(&pool).await;
    assert_eq!(console(1_001).await.err().unwrap().code, REFUSED);
    assert_eq!(operator(1_001).await.err().unwrap().code, REFUSED);
    assert_eq!(balance(&pool, b.available).await, 0);
    assert_eq!(postings(&pool).await, before);

    let _ = console(400).await.expect("a Console top-up under the cap");
    let _ = operator(600)
        .await
        .expect("an operator credit under the cap");
    assert_eq!(supply(&pool).await, CAP);
    assert_eq!(console(1).await.err().unwrap().code, REFUSED);
    assert_eq!(operator(1).await.err().unwrap().code, REFUSED);
    assert!(book_sums_to_zero(&pool).await);
}

// The overlay is a Sandbox control. Where it is off — which is everywhere it is
// not asked for, and always in Live — it refuses nothing and takes no lock.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_disabled_overlay_refuses_nothing(pool: PgPool) {
    let mut sb = sandbox(&pool).await;
    sb.state.pilot_policy = PilotLimitPolicy::disabled();
    supply_at(&pool, sb.transit, CAP).await;
    let (consumer, _, _) = funded_consumer(&pool, 0).await;
    assert_eq!(top_up(&sb.state, consumer, TOP_UP).await, Ok(TOP_UP));
}

// Every route that can reach the transit account is named here and says what
// it does with it. A route that ISSUES must pass the fuse; a new route that
// touches transit fails this test until someone has decided which it is. That
// is the difference between "every issuing route is covered" being true today
// and staying true.
#[test]
fn every_route_that_touches_transit_is_classified() {
    #[derive(PartialEq)]
    enum Transit {
        /// Posts DR transit / CR a participant: new value. Must pass the fuse.
        Issues,
        /// Credits transit back (retirement, restitution of acquired value) or
        /// only hands the account id on to one that does. Issues nothing.
        DestroysOrPassesOn,
    }
    let classified = [
        ("acquiring.rs", Transit::Issues),
        ("consumer_wallets.rs", Transit::Issues),
        ("wallets.rs", Transit::Issues),
        ("account_deletion.rs", Transit::DestroysOrPassesOn),
        ("disputes.rs", Transit::DestroysOrPassesOn),
        ("refunds.rs", Transit::DestroysOrPassesOn),
        ("restitution.rs", Transit::DestroysOrPassesOn),
        ("sandbox_funds.rs", Transit::DestroysOrPassesOn),
        ("sandbox_reset.rs", Transit::DestroysOrPassesOn),
    ];

    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/routes");
    let mut touching = Vec::new();
    for entry in std::fs::read_dir(&dir).unwrap() {
        let path = entry.unwrap().path();
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        if !name.ends_with(".rs") || name.ends_with("_tests.rs") {
            continue;
        }
        let src = std::fs::read_to_string(&path).unwrap();
        if !src.contains("transit_account_id") {
            continue;
        }
        let fuse_calls = src
            .matches("pilot_enforce::check_synthetic_issuance(")
            .count();
        match classified.iter().find(|(f, _)| *f == name) {
            None => panic!(
                "{name} touches the transit account and is not classified: \
                 if it issues value it must call check_synthetic_issuance"
            ),
            Some((_, Transit::Issues)) => {
                assert!(
                    fuse_calls > 0,
                    "{name} issues value and never asks the fuse"
                )
            }
            Some((_, Transit::DestroysOrPassesOn)) => {}
        }
        touching.push(name);
    }
    for (file, _) in &classified {
        assert!(
            touching.iter().any(|t| t == file),
            "{file} is classified but no longer touches transit — remove it"
        );
    }

    // The legacy transaction engine holds the transit account itself, so its
    // route never names it: authorising reserves FROM transit, which issues.
    let transactions = std::fs::read_to_string(dir.join("transactions.rs")).unwrap();
    assert!(
        transactions.contains("pilot_enforce::check_synthetic_issuance("),
        "transactions.rs authorises from transit and never asks the fuse"
    );

    // wallets.rs has two issuing routes (Console top-up, operator credit).
    let wallets = std::fs::read_to_string(dir.join("wallets.rs")).unwrap();
    assert_eq!(
        wallets
            .matches("pilot_enforce::check_synthetic_issuance(")
            .count(),
        2,
        "both Business credit routes must ask the fuse"
    );
    // The exemption that used to exist does not come back under another name.
    let consumer = std::fs::read_to_string(dir.join("consumer_wallets.rs")).unwrap();
    assert!(!consumer.contains("check_test_payer_funding"));
    assert!(!consumer.contains("is_test_payer"));
}
