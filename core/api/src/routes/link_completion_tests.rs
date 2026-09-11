//! A link paid from a wallet completes in one transaction: the link is claimed,
//! the refundable wallet payment is recorded with the transfer's own amount, and
//! the Payment Session the link belongs to is paid with its event in the outbox.
//!
//! These were separate best-effort steps. A failure in any of them left the
//! payer debited and the link USED with no refundable object, a session still
//! ACTIVE and no `payment_session.paid` — and nothing would retry (A2-06). An
//! open-amount link recorded amount 0, which the table refuses, so none of those
//! payments could ever be refunded (A7-38).

use axum::extract::{Path, State};
use axum::Json;
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::payment_links::{self, MarkUsedBody};
use crate::routes::payment_sessions::{self, CreateBody};
use crate::state::{AppState, CoreEnvironment};

async fn account(pool: &PgPool, ty: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES (gen_random_uuid(),$1,'a','AOA') RETURNING id",
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

struct Seed {
    merchant: Uuid,
    wallet: Uuid,
    account: Uuid,
    payer: Uuid,
}

async fn seed(pool: &PgPool) -> Seed {
    let merchant = Uuid::new_v4();
    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    let wallet = Uuid::new_v4();
    sqlx::query("INSERT INTO wallets (id,merchant_id,currency,status,available_account_id,reserved_account_id) VALUES ($1,$2,'AOA','ACTIVE',$3,$4)")
        .bind(wallet).bind(merchant).bind(avail).bind(reserved).execute(pool).await.unwrap();
    let wa_acct = account(pool, "LIABILITY").await;
    let wa = Uuid::new_v4();
    sqlx::query("INSERT INTO wallet_accounts (id,wallet_id,account_id,merchant_id,currency,purpose,status,label) VALUES ($1,$2,$3,$4,'AOA','CAMPAIGN','ACTIVE','c')")
        .bind(wa).bind(wallet).bind(wa_acct).bind(merchant).execute(pool).await.unwrap();
    let payer = Uuid::new_v4();
    sqlx::query("INSERT INTO consumers (id, handle, status) VALUES ($1, $2, 'ACTIVE')")
        .bind(payer)
        .bind(format!("p{}", &payer.to_string()[..8]))
        .execute(pool)
        .await
        .unwrap();
    let c_avail = account(pool, "LIABILITY").await;
    let c_res = account(pool, "LIABILITY").await;
    sqlx::query("INSERT INTO consumer_wallets (id, consumer_id, currency, status, available_account_id, reserved_account_id) VALUES (gen_random_uuid(),$1,'AOA','ACTIVE',$2,$3)")
        .bind(payer).bind(c_avail).bind(c_res).execute(pool).await.unwrap();
    Seed { merchant, wallet, account: wa, payer }
}

/// The transfer that paid `link` — COMPLETED, from the payer's wallet.
async fn paying_transfer(pool: &PgPool, s: &Seed, link: Uuid, amount: i64) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO transfers (id, idempotency_key, sender_id, recipient_id, amount_minor, currency, status, description, environment)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'AOA', 'COMPLETED', NULL, 'SANDBOX') RETURNING id",
    )
    .bind(format!("pl-pay-{link}"))
    .bind(s.payer)
    .bind(s.wallet)
    .bind(amount)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn session(state: &AppState, s: &Seed, reference: &str) -> (Uuid, Uuid) {
    let (_, Json(v)) = payment_sessions::create(
        State(state.clone()),
        Json(CreateBody {
            merchant_id: s.merchant.to_string(),
            wallet_account_id: s.account.to_string(),
            purpose: Some("DONATION".into()),
            reference_type: Some("CAMPAIGN".into()),
            reference_id: Some(reference.into()),
            amount_minor: Some(2_000),
            currency: Some("AOA".into()),
            description: Some("Campanha".into()),
            expires_at: None,
            metadata: None,
        }),
    )
    .await
    .unwrap();
    (
        Uuid::parse_str(v["session_id"].as_str().unwrap()).unwrap(),
        Uuid::parse_str(v["payment_link_id"].as_str().unwrap()).unwrap(),
    )
}

async fn complete(state: &AppState, link: Uuid, transfer: Uuid) -> Result<(), u16> {
    payment_links::mark_used(
        State(state.clone()),
        Path(link.to_string()),
        Some(Json(MarkUsedBody { transfer_id: Some(transfer.to_string()) })),
    )
    .await
    .map(|_| ())
    .map_err(|e| e.status.as_u16())
}

async fn scalar_text(pool: &PgPool, sql: &str, id: Uuid) -> String {
    sqlx::query_scalar(sql).bind(id).fetch_one(pool).await.unwrap()
}

async fn count(pool: &PgPool, sql: &str, id: Uuid) -> i64 {
    sqlx::query_scalar(sql).bind(id).fetch_one(pool).await.unwrap()
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_session_link_payment_completes_whole(pool: PgPool) {
    let s = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    let (session_id, link) = session(&state, &s, "camp_whole").await;
    let transfer = paying_transfer(&pool, &s, link, 2_000).await;

    complete(&state, link, transfer).await.expect("completion");

    assert_eq!(scalar_text(&pool, "SELECT status FROM payment_links WHERE id = $1", link).await, "USED");
    assert_eq!(scalar_text(&pool, "SELECT status FROM payment_sessions WHERE id = $1", session_id).await, "PAID");
    assert_eq!(
        count(&pool, "SELECT count(*) FROM wallet_payments WHERE transfer_id = $1 AND amount_minor = 2000", transfer).await,
        1
    );
    assert_eq!(
        count(&pool, "SELECT count(*) FROM webhook_events WHERE event_type = 'payment_session.paid' AND payload->'data'->>'payment_session_id' = $1::text", session_id).await,
        1
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_failed_completion_leaves_nothing_half_done_and_a_retry_completes_it(pool: PgPool) {
    let s = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    let (session_id, link) = session(&state, &s, "camp_retry").await;
    let transfer = paying_transfer(&pool, &s, link, 2_000).await;

    // The outbox write fails (a transient fault, here made certain).
    sqlx::query(
        "CREATE FUNCTION test_refuse_event() RETURNS trigger LANGUAGE plpgsql AS
           $$ BEGIN RAISE EXCEPTION 'outbox unavailable'; END $$;
         ",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "CREATE TRIGGER test_refuse_event BEFORE INSERT ON webhook_events
           FOR EACH ROW EXECUTE FUNCTION test_refuse_event()",
    )
    .execute(&pool)
    .await
    .unwrap();

    assert_eq!(complete(&state, link, transfer).await.unwrap_err(), 500, "a failed completion was reported as done");
    // Nothing half-done: the link is still payable by this same transfer's
    // replay, the session is open, and no refundable object claims the money.
    assert_eq!(scalar_text(&pool, "SELECT status FROM payment_links WHERE id = $1", link).await, "ACTIVE");
    assert_eq!(scalar_text(&pool, "SELECT status FROM payment_sessions WHERE id = $1", session_id).await, "ACTIVE");
    assert_eq!(count(&pool, "SELECT count(*) FROM wallet_payments WHERE transfer_id = $1", transfer).await, 0);

    sqlx::query("DROP TRIGGER test_refuse_event ON webhook_events").execute(&pool).await.unwrap();

    // The payer's retry replays the transfer and completes the payment here.
    complete(&state, link, transfer).await.expect("the retry completes it");
    assert_eq!(scalar_text(&pool, "SELECT status FROM payment_sessions WHERE id = $1", session_id).await, "PAID");
    assert_eq!(count(&pool, "SELECT count(*) FROM wallet_payments WHERE transfer_id = $1", transfer).await, 1);
    assert_eq!(
        count(&pool, "SELECT count(*) FROM webhook_events WHERE event_type = 'payment_session.paid' AND payload->'data'->>'payment_session_id' = $1::text", session_id).await,
        1
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_open_amount_link_records_what_was_paid(pool: PgPool) {
    let s = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    let (_, Json(link)) = payment_links::create(
        State(state.clone()),
        Json(payment_links::CreateBody {
            merchant_id: s.merchant.to_string(),
            wallet_id: s.wallet.to_string(),
            wallet_account_id: None,
            amount_minor: None,
            currency: "AOA".into(),
            description: None,
            expires_at: None,
        }),
    )
    .await
    .unwrap();
    let link = Uuid::parse_str(&link.id).unwrap();
    let transfer = paying_transfer(&pool, &s, link, 7_500).await;

    complete(&state, link, transfer).await.expect("completion");
    assert_eq!(
        count(&pool, "SELECT count(*) FROM wallet_payments WHERE transfer_id = $1 AND amount_minor = 7500", transfer).await,
        1,
        "an open-amount link payment is refundable for what was paid"
    );

    // A plain link paid from a wallet tells its integrator: payment_link.paid,
    // naming the refundable payment. Nothing emitted it on this rail before.
    let (wp, event_source): (Uuid, Option<String>) = sqlx::query_as(
        "SELECT wp.id, e.payload->'data'->'refund_source'->>'source_id'
           FROM wallet_payments wp
           LEFT JOIN webhook_events e
             ON e.event_type = 'payment_link.paid' AND e.payload->'data'->>'id' = $2::text
          WHERE wp.transfer_id = $1",
    )
    .bind(transfer)
    .bind(link)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(event_source, Some(wp.to_string()), "payment_link.paid is missing or names no refund source");
}
