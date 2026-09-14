//! ADR-061 — value moves inside Banzami; external rails are boundaries.
//!
//! These are the canonical architecture tests, run against a real database:
//!
//! * with the Business's simulated external rail DOWN, a wallet payment from a
//!   payer to that Business and a P2P transfer between two consumers still
//!   complete, balanced, with no provider involved;
//! * with the table that holds the rail state gone altogether, the same internal
//!   movements still complete — they do not merely ignore the state, they never
//!   read it (while the rail-dependent operation fails, because it does);
//! * with the rail DOWN, every operation that crosses it fails closed: a hosted
//!   acquiring payment is not created, a pending one is not confirmed and nothing
//!   is credited, a payout is neither submitted nor confirmed.
//!
//! Mutation: make `transfers::send` or `transfers::send_p2p` call
//! `require_external_rail` and the first two tests fail; remove the call from
//! `acquiring::initiate_payment`, `acquiring::test_confirm`, `payouts::mark_sent`
//! or `payouts::confirm` and the fail-closed tests fail.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::acquiring::{self, InitiateBody, TestConfirmQuery};
use crate::routes::external_rail::{self, SetRailState};
use crate::routes::payouts;
use crate::routes::transfers::{self, SendP2pBody, SendTransferBody};
use crate::state::{AppState, CoreEnvironment};

async fn account(pool: &PgPool, ty: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES (gen_random_uuid(), $1, 'acct', 'AOA') RETURNING id",
    )
    .bind(ty)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn build_state(pool: PgPool) -> AppState {
    let transit = account(&pool, "ASSET").await;
    let bank = account(&pool, "ASSET").await;
    let fee = account(&pool, "REVENUE").await;
    AppState::new(
        pool,
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        AccountId::from_uuid(fee),
        CoreEnvironment::Sandbox,
    )
}

async fn balance(pool: &PgPool, acct: Uuid) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'CREDIT' THEN amount_minor WHEN 'DEBIT' THEN -amount_minor END),0)::BIGINT
           FROM ledger_entries WHERE account_id = $1",
    )
    .bind(acct)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn book_sums_to_zero(pool: &PgPool) -> bool {
    let unbalanced: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM (
           SELECT posting_id FROM ledger_entries GROUP BY posting_id
           HAVING SUM(CASE entry_type WHEN 'DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0) u",
    )
    .fetch_one(pool)
    .await
    .unwrap();
    unbalanced == 0
}

/// A consumer with an ACTIVE wallet holding `amount` (fictitious value, one
/// balanced posting from a bank asset). Returns (consumer id, handle, available account).
async fn funded_consumer(pool: &PgPool, amount: i64) -> (Uuid, String, Uuid) {
    let c = Uuid::new_v4();
    let handle = format!("rail{}", &c.simple().to_string()[..10]);
    sqlx::query("INSERT INTO consumers (id, handle, status) VALUES ($1, $2, 'ACTIVE')")
        .bind(c)
        .bind(&handle)
        .execute(pool)
        .await
        .unwrap();
    let _ = sqlx::query(
        "INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1, 'CONSUMER', $2)",
    )
    .bind(&handle)
    .bind(c)
    .execute(pool)
    .await;
    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    sqlx::query("INSERT INTO consumer_wallets (id, consumer_id, currency, status, available_account_id, reserved_account_id) VALUES (gen_random_uuid(), $1, 'AOA', 'ACTIVE', $2, $3)")
        .bind(c).bind(avail).bind(reserved).execute(pool).await.unwrap();
    if amount > 0 {
        let bank = account(pool, "ASSET").await;
        let p = Uuid::new_v4();
        sqlx::query("INSERT INTO ledger_postings (id, description, idempotency_key, created_at) VALUES ($1, 'fund', $2, now())")
            .bind(p).bind(format!("fund-{c}")).execute(pool).await.unwrap();
        for (a, t) in [(bank, "DEBIT"), (avail, "CREDIT")] {
            sqlx::query("INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'AOA', now())")
                .bind(p).bind(a).bind(t).bind(amount).execute(pool).await.unwrap();
        }
    }
    (c, handle, avail)
}

struct Business {
    merchant: Uuid,
    wallet: Uuid,
    available: Uuid,
    link: Uuid,
}

async fn business(pool: &PgPool) -> Business {
    let merchant = Uuid::new_v4();
    sqlx::query("INSERT INTO merchants (id, name, email, status) VALUES ($1, 'Rail test', 'rail@t.test', 'ACTIVE')")
        .bind(merchant)
        .execute(pool)
        .await
        .unwrap();
    let available = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    let wallet = Uuid::new_v4();
    sqlx::query("INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id) VALUES ($1, $2, 'AOA', 'ACTIVE', $3, $4)")
        .bind(wallet).bind(merchant).bind(available).bind(reserved).execute(pool).await.unwrap();
    let link = Uuid::new_v4();
    sqlx::query("INSERT INTO payment_links (id, merchant_id, wallet_id, slug, amount_minor, currency, status, environment) VALUES ($1, $2, $3, $4, 25000, 'AOA', 'ACTIVE', 'SANDBOX')")
        .bind(link).bind(merchant).bind(wallet).bind(format!("rail-{}", &link.to_string()[..8]))
        .execute(pool)
        .await
        .unwrap();
    Business {
        merchant,
        wallet,
        available,
        link,
    }
}

async fn take_rail_down(state: &AppState, merchant: Uuid) {
    let Json(r) = external_rail::put(
        State(state.clone()),
        Path(merchant),
        Json(SetRailState {
            state: "UNAVAILABLE".into(),
        }),
    )
    .await
    .unwrap();
    assert_eq!(r.state, "UNAVAILABLE");
}

async fn pay_business(state: &AppState, payer: Uuid, b: &Business, key: &str) -> Result<(), u16> {
    transfers::send(
        State(state.clone()),
        Json(SendTransferBody {
            idempotency_key: key.into(),
            sender_id: payer.to_string(),
            recipient_id: b.wallet.to_string(),
            amount_minor: 25_000,
            currency: "AOA".into(),
            description: Some("Pedido".into()),
            recipient_account_id: None,
        }),
    )
    .await
    .map(|_| ())
    .map_err(|e| e.status.as_u16())
}

async fn p2p(state: &AppState, from: &str, to: &str, key: &str) -> Result<(), (u16, String)> {
    transfers::send_p2p(
        State(state.clone()),
        Json(SendP2pBody {
            idempotency_key: key.into(),
            sender: from.into(),
            recipient: to.into(),
            amount_minor: 5_000,
            currency: "AOA".into(),
            note: None,
        }),
    )
    .await
    .map(|_| ())
    .map_err(|e| (e.status.as_u16(), e.message))
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_down_rail_does_not_stop_a_wallet_payment_to_that_business(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let b = business(&pool).await;
    let (payer, _, payer_avail) = funded_consumer(&pool, 100_000).await;
    take_rail_down(&state, b.merchant).await;

    pay_business(&state, payer, &b, "rail-down-pay-1")
        .await
        .expect("an internal wallet payment needs no external rail");

    assert_eq!(balance(&pool, payer_avail).await, 75_000);
    assert_eq!(balance(&pool, b.available).await, 25_000);
    assert!(book_sums_to_zero(&pool).await);
    let acquiring: i64 = sqlx::query_scalar("SELECT count(*) FROM acquiring_payments")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(acquiring, 0, "no provider was involved");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_down_rail_does_not_stop_p2p(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let b = business(&pool).await;
    take_rail_down(&state, b.merchant).await;
    let (_, from, from_avail) = funded_consumer(&pool, 20_000).await;
    let (_, to, to_avail) = funded_consumer(&pool, 0).await;

    p2p(&state, &from, &to, "rail-down-p2p-1")
        .await
        .expect("P2P between Banzami participants needs no external rail");

    assert_eq!(balance(&pool, from_avail).await, 15_000);
    assert_eq!(balance(&pool, to_avail).await, 5_000);
    assert!(book_sums_to_zero(&pool).await);
}

/// The strongest form: internal movements do not read the rail state at all.
/// Remove the table and they still complete; the rail-dependent operation, which
/// does read it, cannot.
#[sqlx::test(migrations = "../../db/migrations")]
async fn internal_movements_never_read_the_rail(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let b = business(&pool).await;
    let (payer, from, _) = funded_consumer(&pool, 100_000).await;
    let (_, to, _) = funded_consumer(&pool, 0).await;
    sqlx::query(
        "ALTER TABLE sandbox_external_rail_states RENAME TO sandbox_external_rail_states_gone",
    )
    .execute(&pool)
    .await
    .unwrap();

    pay_business(&state, payer, &b, "no-rail-pay")
        .await
        .expect("wallet payment");
    p2p(&state, &from, &to, "no-rail-p2p").await.expect("P2P");

    let r = acquiring::initiate_payment(
        State(state.clone()),
        Json(InitiateBody {
            payment_link_id: b.link.to_string(),
            amount_minor: 25_000,
            currency: "AOA".into(),
        }),
    )
    .await;
    assert!(
        r.is_err(),
        "the rail-dependent operation reads the rail state, so it cannot proceed without it"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_down_rail_creates_no_hosted_acquiring_payment(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let b = business(&pool).await;
    take_rail_down(&state, b.merchant).await;

    let err = acquiring::initiate_payment(
        State(state.clone()),
        Json(InitiateBody {
            payment_link_id: b.link.to_string(),
            amount_minor: 25_000,
            currency: "AOA".into(),
        }),
    )
    .await
    .err()
    .expect("a hosted acquiring payment crosses the rail");
    assert_eq!(err.status.as_u16(), 503);
    assert_eq!(err.code, "PROVIDER_UNAVAILABLE");
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM acquiring_payments")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 0, "nothing was created");

    // The same request with the rail back succeeds: the refusal was the rail.
    let Json(_) = external_rail::put(
        State(state.clone()),
        Path(b.merchant),
        Json(SetRailState {
            state: "AVAILABLE".into(),
        }),
    )
    .await
    .unwrap();
    let _ = acquiring::initiate_payment(
        State(state.clone()),
        Json(InitiateBody {
            payment_link_id: b.link.to_string(),
            amount_minor: 25_000,
            currency: "AOA".into(),
        }),
    )
    .await
    .expect("rail available");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_down_rail_confirms_nothing_and_credits_nothing(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let b = business(&pool).await;
    let (_, Json(pending)) = acquiring::initiate_payment(
        State(state.clone()),
        Json(InitiateBody {
            payment_link_id: b.link.to_string(),
            amount_minor: 25_000,
            currency: "AOA".into(),
        }),
    )
    .await
    .unwrap();
    take_rail_down(&state, b.merchant).await;

    let err = acquiring::test_confirm(
        State(state.clone()),
        Query(TestConfirmQuery {
            external_ref: pending.external_ref.clone(),
            currency: None,
            payment_link_id: Some(b.link),
        }),
    )
    .await
    .err()
    .expect("a confirmation comes from the rail");
    assert_eq!(err.code, "PROVIDER_UNAVAILABLE");

    let status: String =
        sqlx::query_scalar("SELECT status FROM acquiring_payments WHERE external_ref = $1")
            .bind(&pending.external_ref)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        status, "PENDING",
        "the payment waits for the rail; it is not failed and not confirmed"
    );
    assert_eq!(balance(&pool, b.available).await, 0, "nothing was credited");
    assert!(
        book_sums_to_zero(&pool).await,
        "a delayed external result leaves the ledger consistent"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_down_rail_neither_submits_nor_confirms_a_payout(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let b = business(&pool).await;
    let mut ids = Vec::new();
    for status in ["PROCESSING", "SENT"] {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO payouts (id, merchant_id, wallet_id, idempotency_key, status, amount_minor, currency,
                                  bank_account_number, bank_code, account_holder_name, environment)
             VALUES ($1, $2, $3, $4, $5, 10000, 'AOA', 'AO06000000000000000000000', '0040', 'Rail test', 'SANDBOX')",
        )
        .bind(id).bind(b.merchant).bind(b.wallet).bind(format!("po-{id}")).bind(status)
        .execute(&pool)
        .await
        .unwrap();
        ids.push(id);
    }
    take_rail_down(&state, b.merchant).await;

    let sent = payouts::mark_sent(State(state.clone()), Path(ids[0].to_string()))
        .await
        .expect_err("submission crosses the rail");
    assert_eq!(sent.code, "PROVIDER_UNAVAILABLE");
    let confirmed = payouts::confirm(State(state.clone()), Path(ids[1].to_string()))
        .await
        .expect_err("only the rail confirms");
    assert_eq!(confirmed.code, "PROVIDER_UNAVAILABLE");

    for (id, want) in [(ids[0], "PROCESSING"), (ids[1], "SENT")] {
        let s: String = sqlx::query_scalar("SELECT status FROM payouts WHERE id = $1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            s, want,
            "a payout is never marked further than the rail has taken it"
        );
    }
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn the_simulator_refuses_in_live(pool: PgPool) {
    let mut live = build_state(pool.clone()).await;
    live.environment = CoreEnvironment::Live;
    let b = business(&pool).await;
    let err = external_rail::put(
        State(live.clone()),
        Path(b.merchant),
        Json(SetRailState {
            state: "UNAVAILABLE".into(),
        }),
    )
    .await
    .err()
    .expect("LIVE has no simulated rail");
    assert_eq!(err.status.as_u16(), 403);
    // And in LIVE the Sandbox table is never the answer: the adapter reports its own availability.
    sqlx::query(
        "INSERT INTO sandbox_external_rail_states (merchant_id, state) VALUES ($1, 'UNAVAILABLE')",
    )
    .bind(b.merchant)
    .execute(&pool)
    .await
    .unwrap();
    external_rail::require_external_rail(&live, b.merchant)
        .await
        .expect("LIVE ignores the Sandbox simulator");
}
