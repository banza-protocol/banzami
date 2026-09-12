//! Paying a structured QR, against a real database (CAP-PAY-003).
//!
//! Every assertion here is about money or about who is allowed to move it, so
//! none of it is mocked: the ledger, the single-use claim and the idempotency
//! key are all things that only behave correctly inside a real transaction.
//!
//! The rules being held:
//!
//! * A dynamic QR's amount is the signed record's. A payer-supplied amount is
//!   ignored, not merged — that is the whole meaning of a fixed-amount code.
//! * A dynamic QR is single-use, claimed in the same transaction as the posting.
//!   The second payment moves nothing.
//! * A forged or tampered payload never reaches the ledger.
//! * The book balances: every payment is one DEBIT and one CREDIT of the same
//!   amount, and a replayed idempotency key adds no second pair.
//! * A merchant QR payment is recorded as the refundable object; a P2P one is
//!   not, because it is not a merchant payment.

use axum::extract::State;
use axum::Json;
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::qr::{self, CreateDynamicQrBody, CreateStaticQrBody};
use crate::routes::qr_pay::{self, PayQrBody};
use crate::state::{AppState, CoreEnvironment};

async fn account(pool: &PgPool, ty: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency)
         VALUES (gen_random_uuid(),$1,'a','AOA') RETURNING id",
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

/// A consumer with an ACTIVE AOA wallet funded with `funding` minor units.
async fn consumer_with_funds(pool: &PgPool, funding: i64) -> (Uuid, Uuid) {
    let consumer = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO consumers (id, handle, phone_number, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'ACTIVE', now(), now())",
    )
    .bind(consumer)
    .bind(format!("qrpay{}", rand_suffix()))
    .bind(format!("+2449{:08}", rand_suffix()))
    .execute(pool)
    .await
    .unwrap();

    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    sqlx::query(
        "INSERT INTO consumer_wallets (id, consumer_id, currency, status,
             available_account_id, reserved_account_id)
         VALUES (gen_random_uuid(), $1, 'AOA', 'ACTIVE', $2, $3)",
    )
    .bind(consumer)
    .bind(avail)
    .bind(reserved)
    .execute(pool)
    .await
    .unwrap();

    if funding > 0 {
        let posting = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
             VALUES ($1, 'test-funding', $2, now())",
        )
        .bind(posting)
        .bind(format!("fund-{posting}"))
        .execute(pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO ledger_entries (id, posting_id, account_id, entry_type,
                 amount_minor, currency, created_at)
             VALUES (gen_random_uuid(), $1, $2, 'CREDIT', $3, 'AOA', now())",
        )
        .bind(posting)
        .bind(avail)
        .bind(funding)
        .execute(pool)
        .await
        .unwrap();
    }
    (consumer, avail)
}

async fn merchant_with_wallet(pool: &PgPool) -> (Uuid, Uuid) {
    let merchant = Uuid::new_v4();
    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    sqlx::query(
        "INSERT INTO wallets (id, merchant_id, currency, status,
             available_account_id, reserved_account_id)
         VALUES (gen_random_uuid(), $1, 'AOA', 'ACTIVE', $2, $3)",
    )
    .bind(merchant)
    .bind(avail)
    .bind(reserved)
    .execute(pool)
    .await
    .unwrap();
    (merchant, avail)
}

fn rand_suffix() -> u32 {
    Uuid::new_v4().as_u128() as u32 % 100_000_000
}

async fn balance(pool: &PgPool, account_id: Uuid) -> i64 {
    sqlx::query_scalar::<_, Option<i64>>(
        "SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor
                                  ELSE -amount_minor END),0)::BIGINT
           FROM ledger_entries WHERE account_id = $1",
    )
    .bind(account_id)
    .fetch_one(pool)
    .await
    .unwrap()
    .unwrap_or(0)
}

async fn dynamic_qr(state: &AppState, owner: Uuid, owner_type: &str, amount: i64) -> String {
    let (_, Json(v)) = qr::create_dynamic(
        State(state.clone()),
        Json(CreateDynamicQrBody {
            owner_id: owner.to_string(),
            owner_type: owner_type.into(),
            currency: "AOA".into(),
            amount_minor: amount,
            expires_at: chrono::Utc::now() + chrono::Duration::minutes(30),
            reference: None,
            wallet_account_id: None,
        }),
    )
    .await
    .unwrap();
    v["payload"].as_str().unwrap().to_string()
}

async fn static_qr(state: &AppState, owner: Uuid, owner_type: &str) -> String {
    let (_, Json(v)) = qr::create_static(
        State(state.clone()),
        Json(CreateStaticQrBody {
            owner_id: owner.to_string(),
            owner_type: owner_type.into(),
            currency: "AOA".into(),
            amount_minor: None,
        }),
    )
    .await
    .unwrap();
    v["payload"].as_str().unwrap().to_string()
}

async fn pay(
    state: &AppState,
    payer: Uuid,
    payload: &str,
    amount: Option<i64>,
    key: &str,
) -> Result<serde_json::Value, (u16, String, String)> {
    qr_pay::pay(
        State(state.clone()),
        Json(PayQrBody {
            payer_consumer_id: payer.to_string(),
            payload: payload.to_string(),
            amount_minor: amount,
            idempotency_key: key.to_string(),
        }),
    )
    .await
    .map(|Json(v)| v)
    .map_err(|e| (e.status.as_u16(), e.code.to_string(), e.message.clone()))
}

// ── the happy path ───────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn paying_a_merchant_dynamic_qr_moves_the_money_exactly_once(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, payer_acct) = consumer_with_funds(&pool, 100_000).await;
    let (merchant, merchant_acct) = merchant_with_wallet(&pool).await;
    let payload = dynamic_qr(&state, merchant, "MERCHANT", 25_000).await;

    let out = pay(&state, payer, &payload, None, "key-1").await.unwrap();

    assert_eq!(out["amount_minor"], 25_000);
    assert_eq!(out["qr_type"], "DYNAMIC");
    assert_eq!(balance(&pool, payer_acct).await, 75_000);
    assert_eq!(balance(&pool, merchant_acct).await, 25_000);

    // Exactly one posting, one DEBIT and one CREDIT, and they cancel.
    let (entries, net): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*)::BIGINT,
                COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor
                                  ELSE -amount_minor END),0)::BIGINT
           FROM ledger_entries le
           JOIN ledger_postings lp ON lp.id = le.posting_id
          WHERE lp.idempotency_key = 'qr-pay-key-1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(entries, 2, "a payment must be exactly two entries");
    assert_eq!(net, 0, "the posting must sum to zero");

    // A merchant QR payment is the refundable object.
    assert!(
        out["wallet_payment_id"].is_string(),
        "a merchant QR payment must be recorded as a wallet payment: {out}"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_consumer_static_qr_is_a_p2p_transfer_and_records_no_wallet_payment(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, payer_acct) = consumer_with_funds(&pool, 50_000).await;
    let (payee, payee_acct) = consumer_with_funds(&pool, 0).await;
    let payload = static_qr(&state, payee, "CONSUMER").await;

    let out = pay(&state, payer, &payload, Some(12_000), "key-p2p")
        .await
        .unwrap();

    assert_eq!(out["qr_type"], "STATIC");
    assert_eq!(balance(&pool, payer_acct).await, 38_000);
    assert_eq!(balance(&pool, payee_acct).await, 12_000);
    assert!(
        out["wallet_payment_id"].is_null(),
        "a P2P QR payment is not a merchant payment: {out}"
    );
}

// ── the amount is the code's, not the payer's ────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_dynamic_qr_ignores_the_amount_the_payer_sends(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, payer_acct) = consumer_with_funds(&pool, 100_000).await;
    let (merchant, merchant_acct) = merchant_with_wallet(&pool).await;
    let payload = dynamic_qr(&state, merchant, "MERCHANT", 30_000).await;

    // The payer tries to pay 1 Kz for a 300 Kz code.
    let out = pay(&state, payer, &payload, Some(100), "key-tamper")
        .await
        .unwrap();

    assert_eq!(out["amount_minor"], 30_000, "the code's amount must win");
    assert_eq!(balance(&pool, payer_acct).await, 70_000);
    assert_eq!(balance(&pool, merchant_acct).await, 30_000);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_static_qr_without_an_amount_is_refused_rather_than_paid_for_zero(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, payer_acct) = consumer_with_funds(&pool, 50_000).await;
    let (payee, _) = consumer_with_funds(&pool, 0).await;
    let payload = static_qr(&state, payee, "CONSUMER").await;

    let err = pay(&state, payer, &payload, None, "key-noamount")
        .await
        .unwrap_err();
    assert_eq!(err.0, 422);
    assert_eq!(err.1, "AMOUNT_REQUIRED");
    assert_eq!(balance(&pool, payer_acct).await, 50_000, "nothing moved");

    let err = pay(&state, payer, &payload, Some(-5), "key-negative")
        .await
        .unwrap_err();
    assert_eq!(err.0, 422, "a negative amount must be refused: {err:?}");
    assert_eq!(balance(&pool, payer_acct).await, 50_000, "nothing moved");
}

// ── single use ───────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_dynamic_qr_cannot_be_paid_twice(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, payer_acct) = consumer_with_funds(&pool, 100_000).await;
    let (merchant, merchant_acct) = merchant_with_wallet(&pool).await;
    let payload = dynamic_qr(&state, merchant, "MERCHANT", 20_000).await;

    pay(&state, payer, &payload, None, "first").await.unwrap();
    // A DIFFERENT idempotency key: this is not a replay, it is a second payment
    // of the same code, and the single-use claim is what must stop it.
    let err = pay(&state, payer, &payload, None, "second")
        .await
        .unwrap_err();

    assert_eq!(err.0, 422);
    assert_eq!(err.1, "QR_ALREADY_USED");
    assert_eq!(balance(&pool, payer_acct).await, 80_000, "paid twice");
    assert_eq!(balance(&pool, merchant_acct).await, 20_000, "paid twice");
}

/// The single-use claim, at the statement level.
///
/// The sequential double-payment test above does not prove this: it is caught
/// earlier, by `resolve_for_payment` reading a status that is no longer ACTIVE.
/// Delete the claim's row-count check and that test still passes.
///
/// What makes two simultaneous payers safe is that the claim is a CONDITIONAL
/// update inside the payment's own transaction. Both requests can resolve while
/// the code is still ACTIVE; only one statement can take the row out of ACTIVE,
/// the other matches zero rows, and because it is the same transaction as the
/// posting, the loser's ledger entries never commit.
///
/// This holds both halves of that directly: the second claim matches nothing,
/// and a transaction that rolls back leaves the code payable.
#[sqlx::test(migrations = "../../db/migrations")]
async fn only_one_claim_of_a_dynamic_qr_can_succeed(pool: PgPool) {
    const CLAIM: &str = "UPDATE qr_codes SET status = 'USED', used_at = now() \
                         WHERE id = $1 AND status = 'ACTIVE'";

    let state = build_state(pool.clone()).await;
    let (merchant, _) = merchant_with_wallet(&pool).await;
    dynamic_qr(&state, merchant, "MERCHANT", 20_000).await;
    let qr_id: Uuid = sqlx::query_scalar("SELECT id FROM qr_codes LIMIT 1")
        .fetch_one(&pool)
        .await
        .unwrap();

    // A claim that rolls back leaves the code exactly as it was — this is what
    // makes a refused payment (no funds, frozen account) not burn the code.
    let mut rolled_back = pool.begin().await.unwrap();
    let n = sqlx::query(CLAIM)
        .bind(qr_id)
        .execute(&mut *rolled_back)
        .await
        .unwrap()
        .rows_affected();
    assert_eq!(n, 1);
    rolled_back.rollback().await.unwrap();
    let status: String = sqlx::query_scalar("SELECT status FROM qr_codes WHERE id = $1")
        .bind(qr_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(status, "ACTIVE", "a rolled-back claim burned the code");

    // Two claims, only one winner. The second sees a row that is no longer
    // ACTIVE and matches nothing, which is what aborts the second payment.
    let first = sqlx::query(CLAIM)
        .bind(qr_id)
        .execute(&pool)
        .await
        .unwrap()
        .rows_affected();
    let second = sqlx::query(CLAIM)
        .bind(qr_id)
        .execute(&pool)
        .await
        .unwrap()
        .rows_affected();
    assert_eq!((first, second), (1, 0), "the claim is not exclusive");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_static_qr_stays_payable(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, payer_acct) = consumer_with_funds(&pool, 100_000).await;
    let (merchant, merchant_acct) = merchant_with_wallet(&pool).await;
    let payload = static_qr(&state, merchant, "MERCHANT").await;

    pay(&state, payer, &payload, Some(10_000), "s1")
        .await
        .unwrap();
    pay(&state, payer, &payload, Some(15_000), "s2")
        .await
        .unwrap();

    // A static QR is reusable by design — a shop's printed code is paid all day.
    assert_eq!(balance(&pool, payer_acct).await, 75_000);
    assert_eq!(balance(&pool, merchant_acct).await, 25_000);
}

// ── idempotency ──────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn replaying_the_same_key_does_not_move_the_money_again(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, payer_acct) = consumer_with_funds(&pool, 100_000).await;
    let (merchant, merchant_acct) = merchant_with_wallet(&pool).await;
    let payload = static_qr(&state, merchant, "MERCHANT").await;

    let first = pay(&state, payer, &payload, Some(9_000), "same-key")
        .await
        .unwrap();
    let again = pay(&state, payer, &payload, Some(9_000), "same-key")
        .await
        .unwrap();

    assert_eq!(
        first["transfer_id"], again["transfer_id"],
        "a replay must return the transfer that exists, not a new id"
    );
    assert_eq!(balance(&pool, payer_acct).await, 91_000);
    assert_eq!(balance(&pool, merchant_acct).await, 9_000);

    let transfers: i64 =
        sqlx::query_scalar("SELECT COUNT(*)::BIGINT FROM transfers WHERE idempotency_key = $1")
            .bind("same-key")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(transfers, 1);
}

// ── integrity ────────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_tampered_dynamic_payload_never_reaches_the_ledger(pool: PgPool) {
    use base64::Engine;
    let state = build_state(pool.clone()).await;
    let (payer, payer_acct) = consumer_with_funds(&pool, 100_000).await;
    let (merchant, merchant_acct) = merchant_with_wallet(&pool).await;
    let payload = dynamic_qr(&state, merchant, "MERCHANT", 20_000).await;

    // Re-sign the body with a signature of our own choosing. The id still names a
    // real, active, unexpired code — only the HMAC is wrong — so nothing but the
    // signature check stands between this and the money.
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(&payload)
        .unwrap();
    let mut v: serde_json::Value = serde_json::from_slice(&raw).unwrap();
    v["sig"] = serde_json::json!("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    let forged =
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(serde_json::to_vec(&v).unwrap());

    let err = pay(&state, payer, &forged, None, "forged")
        .await
        .unwrap_err();
    assert_eq!(err.1, "INVALID_SIGNATURE", "a forged payload was accepted");
    assert_eq!(balance(&pool, payer_acct).await, 100_000);
    assert_eq!(balance(&pool, merchant_acct).await, 0);

    // And the code is still payable: a rejected forgery must not burn it.
    pay(&state, payer, &payload, None, "genuine").await.unwrap();
    assert_eq!(balance(&pool, merchant_acct).await, 20_000);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn nonsense_is_not_a_qr_code(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, payer_acct) = consumer_with_funds(&pool, 10_000).await;

    for bad in ["", "hello", "not-base64!!", "aGVsbG8"] {
        let err = pay(&state, payer, bad, Some(100), &format!("bad-{bad}"))
            .await
            .unwrap_err();
        assert!(
            err.0 == 400 || err.0 == 404,
            "payload {bad:?} answered {}: {err:?}",
            err.0
        );
    }
    assert_eq!(balance(&pool, payer_acct).await, 10_000);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn the_expiry_cannot_be_moved_without_breaking_the_code(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, payer_acct) = consumer_with_funds(&pool, 100_000).await;
    let (merchant, _) = merchant_with_wallet(&pool).await;
    let payload = dynamic_qr(&state, merchant, "MERCHANT", 20_000).await;

    // Push the expiry out by a year, straight in the database — the move an
    // operator with write access, or a compromised row, would make to keep a
    // code alive. The HMAC covers expires_at, so the signature stops matching
    // its own record and the code dies rather than surviving longer.
    sqlx::query("UPDATE qr_codes SET expires_at = now() + interval '1 year'")
        .execute(&pool)
        .await
        .unwrap();

    let err = pay(&state, payer, &payload, None, "moved-expiry")
        .await
        .unwrap_err();
    assert_eq!(
        err.1, "INVALID_SIGNATURE",
        "a QR whose expiry was edited in the database was still honoured"
    );
    assert_eq!(balance(&pool, payer_acct).await, 100_000);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_expired_dynamic_qr_is_refused_even_before_the_worker_notices(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, payer_acct) = consumer_with_funds(&pool, 100_000).await;
    let (merchant, _) = merchant_with_wallet(&pool).await;

    // A genuinely short-lived code, left to lapse. It cannot be forced expired by
    // editing the row — the signature covers the expiry (see the test above) —
    // so the only honest way to reach this state is to let the clock pass it.
    let (_, Json(v)) = qr::create_dynamic(
        State(state.clone()),
        Json(CreateDynamicQrBody {
            owner_id: merchant.to_string(),
            owner_type: "MERCHANT".into(),
            currency: "AOA".into(),
            amount_minor: 20_000,
            expires_at: chrono::Utc::now() + chrono::Duration::milliseconds(600),
            reference: None,
            wallet_account_id: None,
        }),
    )
    .await
    .unwrap();
    let payload = v["payload"].as_str().unwrap().to_string();

    tokio::time::sleep(std::time::Duration::from_millis(900)).await;

    // The status is still ACTIVE: the expiry worker runs on its own interval and
    // has not reached this row. The synchronous check at payment time is what
    // must refuse it — the worker is an optimisation, never the guarantee.
    let status: String = sqlx::query_scalar("SELECT status FROM qr_codes LIMIT 1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(status, "ACTIVE", "the row was expired by something else");

    let err = pay(&state, payer, &payload, None, "expired")
        .await
        .unwrap_err();
    assert_eq!(err.1, "QR_EXPIRED");
    assert_eq!(balance(&pool, payer_acct).await, 100_000);
}

// ── authority and funds ──────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn nobody_pays_their_own_qr(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (person, acct) = consumer_with_funds(&pool, 50_000).await;
    let payload = static_qr(&state, person, "CONSUMER").await;

    let err = pay(&state, person, &payload, Some(1_000), "self")
        .await
        .unwrap_err();
    assert_eq!(err.0, 400);
    assert_eq!(balance(&pool, acct).await, 50_000);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_payer_without_the_funds_pays_nothing(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, payer_acct) = consumer_with_funds(&pool, 1_000).await;
    let (merchant, merchant_acct) = merchant_with_wallet(&pool).await;
    let payload = dynamic_qr(&state, merchant, "MERCHANT", 20_000).await;

    let err = pay(&state, payer, &payload, None, "broke")
        .await
        .unwrap_err();
    assert_eq!(err.1, "INSUFFICIENT_FUNDS");
    assert_eq!(balance(&pool, payer_acct).await, 1_000);
    assert_eq!(balance(&pool, merchant_acct).await, 0);

    // The claim was rolled back with the posting: the code is still payable.
    let status: String = sqlx::query_scalar("SELECT status FROM qr_codes LIMIT 1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        status, "ACTIVE",
        "a refused payment burned the code — the claim did not roll back"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_frozen_payer_pays_nothing(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, payer_acct) = consumer_with_funds(&pool, 100_000).await;
    let (merchant, _) = merchant_with_wallet(&pool).await;
    let payload = static_qr(&state, merchant, "MERCHANT").await;

    sqlx::query(
        "INSERT INTO account_freezes (id, entity_type, entity_id, reason, created_at)
         VALUES (gen_random_uuid(), 'CONSUMER', $1, 'test', now())",
    )
    .bind(payer)
    .execute(&pool)
    .await
    .unwrap();

    let err = pay(&state, payer, &payload, Some(5_000), "frozen")
        .await
        .unwrap_err();
    assert_eq!(err.1, "ACCOUNT_FROZEN");
    assert_eq!(balance(&pool, payer_acct).await, 100_000);
}

// ── the record it leaves ─────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn the_settled_transfer_names_this_environment(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, _) = consumer_with_funds(&pool, 50_000).await;
    let (merchant, _) = merchant_with_wallet(&pool).await;
    let payload = static_qr(&state, merchant, "MERCHANT").await;

    pay(&state, payer, &payload, Some(5_000), "env")
        .await
        .unwrap();

    // The column default is 'LIVE'. A Sandbox payment recorded as real money is
    // invisible to every Sandbox-scoped reconciliation that should find it.
    let env: String = sqlx::query_scalar("SELECT environment FROM transfers LIMIT 1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(env, "SANDBOX");
}
