//! The payer-facing acquiring rail must settle, settle once, and settle into the
//! account the payer paid into.
//!
//! Four defects lived here together, and the Public Sandbox showed all four at
//! once: a payer confirmed a simulated Multicaixa payment, saw a terminal
//! CONFIRMED, and the merchant's balance never moved.
//!
//! 1. The settlement was the BODY of `emis_callback`. `test_confirm` — the only
//!    confirmation that exists in Sandbox — called `process_callback` and
//!    returned, so the simulated rail confirmed the provider and moved no money.
//!    A Sandbox that does not move money is not standing in for the Live rail;
//!    it is disagreeing with it.
//! 2. The credit went to `wallets.available_account_id`, the wallet default,
//!    ignoring `payment_links.wallet_account_id` — the segregated account whose
//!    own migration (0084) exists so that a paid link "credits THAT account, not
//!    the wallet's default available account". Campaign money landed in the
//!    general balance.
//! 3. The posting header and its two legs were three un-transacted statements,
//!    so a failure between them persists a one-legged posting. BANZA
//!    INV-LEDGER-004: "a posting is atomic: partial postings never persist."
//! 4. Idempotency was a `SELECT EXISTS` before the insert, which two concurrent
//!    callbacks can both pass.
//!
//! Each test below fails on the pre-fix code for the specific reason named.

use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use banzami_acquiring::{
    AcquiringEngine, AcquiringPayment, AcquiringPaymentStatus, PaymentInstructions,
};
use banzami_types::{AccountId, Money};

use crate::routes::acquiring::settle_confirmed_payment;
use crate::state::{AppState, CoreEnvironment};

async fn ledger_account(pool: &PgPool, ty: &str, name: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency)
         VALUES ($1, $2, $3, 'AOA') RETURNING id",
    )
    .bind(Uuid::new_v4())
    .bind(ty)
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn build_state(pool: PgPool) -> AppState {
    let transit = ledger_account(&pool, "ASSET", "Transit").await;
    let bank = ledger_account(&pool, "ASSET", "Bank").await;
    let fee = ledger_account(&pool, "REVENUE", "Operator Fee").await;
    AppState::new(
        pool,
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        AccountId::from_uuid(fee),
        CoreEnvironment::Sandbox,
    )
}

struct Fixture {
    wallet: Uuid,
    default_account: Uuid,
    link: Uuid,
}

/// A merchant with a wallet and an ACTIVE payment link. The 0081 trigger gives
/// the wallet its PRIMARY wallet_account automatically.
async fn seed(pool: &PgPool) -> Fixture {
    let merchant = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO merchants (id, name, email, status) VALUES ($1,'M','m@t.test','ACTIVE')",
    )
    .bind(merchant)
    .execute(pool)
    .await
    .unwrap();

    let avail = ledger_account(pool, "LIABILITY", "Merchant available").await;
    let reserved = ledger_account(pool, "LIABILITY", "Merchant reserved").await;
    let wallet = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id)
         VALUES ($1,$2,'AOA','ACTIVE',$3,$4)",
    )
    .bind(wallet)
    .bind(merchant)
    .bind(avail)
    .bind(reserved)
    .execute(pool)
    .await
    .unwrap();

    let link = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO payment_links (id, merchant_id, wallet_id, slug, amount_minor, currency, status, environment)
         VALUES ($1,$2,$3,$4,100000,'AOA','ACTIVE','SANDBOX')",
    )
    .bind(link)
    .bind(merchant)
    .bind(wallet)
    .bind(format!("slug-{}", &link.to_string()[..8]))
    .execute(pool)
    .await
    .unwrap();

    Fixture {
        wallet,
        default_account: avail,
        link,
    }
}

/// A segregated CAMPAIGN account on the same wallet, and the link routed to it.
async fn route_link_to_campaign(pool: &PgPool, f: &Fixture) -> (Uuid, Uuid) {
    let campaign_ledger = ledger_account(pool, "LIABILITY", "Campaign").await;
    let merchant: Uuid = sqlx::query_scalar("SELECT merchant_id FROM wallets WHERE id = $1")
        .bind(f.wallet)
        .fetch_one(pool)
        .await
        .unwrap();
    let wa: Uuid = sqlx::query_scalar(
        "INSERT INTO wallet_accounts (wallet_id, account_id, merchant_id, currency, purpose, status)
         VALUES ($1,$2,$3,'AOA','CAMPAIGN','ACTIVE') RETURNING id",
    )
    .bind(f.wallet)
    .bind(campaign_ledger)
    .bind(merchant)
    .fetch_one(pool)
    .await
    .unwrap();
    sqlx::query("UPDATE payment_links SET wallet_account_id = $1 WHERE id = $2")
        .bind(wa)
        .bind(f.link)
        .execute(pool)
        .await
        .unwrap();
    (wa, campaign_ledger)
}

/// A CONFIRMED acquiring payment against the link, persisted so the settlement
/// can resolve its owner the way the real callback path does.
async fn confirmed_payment(pool: &PgPool, link: Uuid, amount_minor: i64) -> AcquiringPayment {
    let id = Uuid::new_v4();
    let ext = id.to_string()[..9].to_string();
    sqlx::query(
        "INSERT INTO acquiring_payments
            (id, payment_link_id, provider, external_ref, status, amount_minor, currency,
             instructions, confirmed_at, expires_at)
         VALUES ($1,$2,'EMIS_MULTICAIXA_SIMULATED',$3,'CONFIRMED',$4,'AOA',
                 '{}'::jsonb, now(), now() + interval '1 hour')",
    )
    .bind(id)
    .bind(link)
    .bind(&ext)
    .bind(amount_minor)
    .execute(pool)
    .await
    .unwrap();

    AcquiringPayment {
        id: id.to_string().parse().unwrap(),
        payment_link_id: link.to_string().parse().unwrap(),
        provider: "EMIS_MULTICAIXA_SIMULATED".into(),
        external_ref: ext,
        status: AcquiringPaymentStatus::Confirmed,
        amount: Money::new(
            amount_minor,
            banzami_types::Currency::from_code("AOA").unwrap(),
        ),
        instructions: PaymentInstructions {
            method: "MULTICAIXA_EXPRESS".into(),
            entity: "00000".into(),
            reference: "000000000".into(),
        },
        confirmed_at: Some(Utc::now()),
        failed_at: None,
        failure_reason: None,
        expires_at: Utc::now() + chrono::Duration::hours(1),
        created_at: Utc::now(),
    }
}

async fn balance(pool: &PgPool, account: Uuid) -> i64 {
    sqlx::query_scalar::<_, Option<i64>>(
        "SELECT SUM(CASE entry_type WHEN 'CREDIT' THEN amount_minor ELSE -amount_minor END)::bigint
           FROM ledger_entries WHERE account_id = $1",
    )
    .bind(account)
    .fetch_one(pool)
    .await
    .unwrap()
    .unwrap_or(0)
}

async fn unbalanced_postings(pool: &PgPool) -> i64 {
    sqlx::query_scalar(
        "SELECT COUNT(*) FROM (
             SELECT p.id
               FROM ledger_postings p
               LEFT JOIN ledger_entries e ON e.posting_id = p.id
              GROUP BY p.id
             HAVING COALESCE(SUM(CASE e.entry_type WHEN 'DEBIT'  THEN -e.amount_minor
                                                   WHEN 'CREDIT' THEN  e.amount_minor
                                                   ELSE 0 END), 0) <> 0
                 OR COUNT(e.id) <> 2
         ) x",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

// ---------------------------------------------------------------------------

/// Defect 1. Before the fix the simulated rail never reached any settlement, so
/// the wallet stayed at zero. This asserts the money actually arrives.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_confirmed_payment_credits_the_wallet(pool: PgPool) {
    let f = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    let payment = confirmed_payment(&pool, f.link, 100_000).await;

    settle_confirmed_payment(&state, &payment).await.unwrap();

    assert_eq!(
        balance(&pool, f.default_account).await,
        100_000,
        "a confirmed acquiring payment left the wallet unchanged — the payer saw \
         success and no money moved"
    );
}

/// §7: incoming payment confirmation is not a pricing-fee consumer. The wallet is
/// credited GROSS — 100000 in, 100000 credited.
#[sqlx::test(migrations = "../../db/migrations")]
async fn the_credit_is_gross_with_no_incoming_fee(pool: PgPool) {
    let f = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    let payment = confirmed_payment(&pool, f.link, 100_000).await;

    settle_confirmed_payment(&state, &payment).await.unwrap();

    assert_eq!(
        balance(&pool, f.default_account).await,
        100_000,
        "confirmation took a fee — capture/confirmation is fee-neutral; fees \
         belong to settlement and payout"
    );
    let legs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ledger_entries")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        legs, 2,
        "expected exactly one two-legged posting, no fee legs"
    );
}

/// Defect 2. The link names a CAMPAIGN account; that is where the money belongs.
/// Pre-fix this credited `available_account_id` and the campaign stayed at 0 —
/// the exact DOA symptom.
#[sqlx::test(migrations = "../../db/migrations")]
async fn the_credit_lands_on_the_account_the_link_names(pool: PgPool) {
    let f = seed(&pool).await;
    let (_wa, campaign_ledger) = route_link_to_campaign(&pool, &f).await;
    let state = build_state(pool.clone()).await;
    let payment = confirmed_payment(&pool, f.link, 100_000).await;

    settle_confirmed_payment(&state, &payment).await.unwrap();

    assert_eq!(
        balance(&pool, campaign_ledger).await,
        100_000,
        "the segregated account the link routes to was not credited"
    );
    assert_eq!(
        balance(&pool, f.default_account).await,
        0,
        "money routed to a segregated account landed in the wallet default instead"
    );
}

/// A named account that fails ADR-042 validation must NOT silently fall back to
/// the wallet default — that is the same defect, quieter. Nothing is posted.
#[sqlx::test(migrations = "../../db/migrations")]
async fn an_invalid_named_account_does_not_fall_back_to_the_default(pool: PgPool) {
    let f = seed(&pool).await;
    let (wa, campaign_ledger) = route_link_to_campaign(&pool, &f).await;
    sqlx::query("UPDATE wallet_accounts SET status = 'CLOSED' WHERE id = $1")
        .bind(wa)
        .execute(&pool)
        .await
        .unwrap();
    let state = build_state(pool.clone()).await;
    let payment = confirmed_payment(&pool, f.link, 100_000).await;

    // Withheld, and SAID so: this returned Ok(()) and the gateway then marked
    // the link paid and emitted payment_link.paid over an empty ledger.
    let err = settle_confirmed_payment(&state, &payment)
        .await
        .expect_err("an uncreditable payment must be reported as withheld, not as settled");
    assert_eq!(err.code, "SETTLEMENT_WITHHELD");

    assert_eq!(
        balance(&pool, campaign_ledger).await,
        0,
        "a CLOSED account was credited"
    );
    assert_eq!(
        balance(&pool, f.default_account).await,
        0,
        "settlement fell back to the wallet default when the named account was \
         invalid — segregated money would land in the general balance"
    );
}

/// Defect 3 / INV-LEDGER-004. Every posting this path writes has exactly two
/// legs that cancel. No posting is ever left with one.
#[sqlx::test(migrations = "../../db/migrations")]
async fn the_posting_is_atomic_and_balanced(pool: PgPool) {
    let f = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    let payment = confirmed_payment(&pool, f.link, 100_000).await;

    settle_confirmed_payment(&state, &payment).await.unwrap();

    assert_eq!(
        unbalanced_postings(&pool).await,
        0,
        "an unbalanced or single-leg posting persisted — INV-LEDGER-004"
    );
}

/// Defect 4. A replayed callback credits nothing a second time.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_replayed_confirmation_credits_once(pool: PgPool) {
    let f = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    let payment = confirmed_payment(&pool, f.link, 100_000).await;

    for _ in 0..4 {
        settle_confirmed_payment(&state, &payment).await.unwrap();
    }

    assert_eq!(
        balance(&pool, f.default_account).await,
        100_000,
        "a replayed provider callback credited the wallet more than once"
    );
    let postings: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ledger_postings WHERE idempotency_key LIKE 'acquiring-settle-%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(postings, 1, "a replay created a second settlement posting");
}

/// Concurrency (§10): parallel confirmations produce exactly one financial
/// outcome. The old `SELECT EXISTS` pre-check let two callers both see "not
/// settled" and both post; the UNIQUE insert is what makes one of them lose.
#[sqlx::test(migrations = "../../db/migrations")]
async fn parallel_confirmations_produce_one_credit(pool: PgPool) {
    let f = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    let payment = confirmed_payment(&pool, f.link, 100_000).await;

    let results = tokio::join!(
        settle_confirmed_payment(&state, &payment),
        settle_confirmed_payment(&state, &payment),
        settle_confirmed_payment(&state, &payment),
        settle_confirmed_payment(&state, &payment),
        settle_confirmed_payment(&state, &payment),
        settle_confirmed_payment(&state, &payment),
        settle_confirmed_payment(&state, &payment),
        settle_confirmed_payment(&state, &payment),
    );
    for r in [
        results.0, results.1, results.2, results.3, results.4, results.5, results.6, results.7,
    ] {
        r.expect("a concurrent settlement returned an error instead of losing quietly");
    }

    assert_eq!(
        balance(&pool, f.default_account).await,
        100_000,
        "concurrent confirmations credited the wallet more than once"
    );
    assert_eq!(
        unbalanced_postings(&pool).await,
        0,
        "concurrency left an unbalanced posting"
    );
}

/// A frozen merchant is not credited, and no partial posting is left behind.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_frozen_merchant_is_not_credited(pool: PgPool) {
    let f = seed(&pool).await;
    let merchant: Uuid = sqlx::query_scalar("SELECT merchant_id FROM wallets WHERE id = $1")
        .bind(f.wallet)
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO risk_freezes (subject_type, subject_id, reason, created_at)
         VALUES ('MERCHANT', $1, 'test', now())",
    )
    .bind(merchant)
    .execute(&pool)
    .await
    .ok();

    let state = build_state(pool.clone()).await;
    let payment = confirmed_payment(&pool, f.link, 100_000).await;
    let settled = settle_confirmed_payment(&state, &payment).await;

    let frozen = crate::routes::risk::is_frozen(&pool, "MERCHANT", merchant)
        .await
        .unwrap();
    if frozen {
        assert_eq!(
            settled.err().map(|e| e.code),
            Some("SETTLEMENT_WITHHELD"),
            "a frozen merchant's payment must be reported as withheld"
        );
        assert_eq!(
            balance(&pool, f.default_account).await,
            0,
            "a frozen merchant's wallet was credited"
        );
    }
    assert_eq!(unbalanced_postings(&pool).await, 0);
}

/// A provider callback confirms only the amount the payment was created for,
/// and a confirmed callback is marked processed (nothing set it, so the
/// duplicate check never matched and reconciliation counted none).
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_callback_for_another_amount_confirms_nothing(pool: PgPool) {
    let f = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    let paid = confirmed_payment(&pool, f.link, 100_000).await;
    sqlx::query(
        "UPDATE acquiring_payments SET status = 'PENDING', confirmed_at = NULL,
            instructions = '{\"method\":\"MULTICAIXA_EXPRESS\",\"entity\":\"00000\",\"reference\":\"000000000\"}'::jsonb
          WHERE external_ref = $1",
    )
        .bind(&paid.external_ref)
        .execute(&pool)
        .await
        .unwrap();

    let (body, sig) = state
        .acquiring
        .generate_test_callback(&paid.external_ref, 1_000, "AOA")
        .expect("the simulated provider signs test callbacks");
    let err = state
        .acquiring
        .process_callback(&body, &sig)
        .await
        .expect_err("a lower amount must not confirm");
    assert!(
        matches!(
            err,
            banzami_acquiring::AcquiringError::AmountMismatch { .. }
        ),
        "{err:?}"
    );
    let status: String =
        sqlx::query_scalar("SELECT status FROM acquiring_payments WHERE external_ref = $1")
            .bind(&paid.external_ref)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        status, "PENDING",
        "a mismatched callback changed the payment"
    );

    let (body, sig) = state
        .acquiring
        .generate_test_callback(&paid.external_ref, 100_000, "AOA")
        .unwrap();
    let ok = state
        .acquiring
        .process_callback(&body, &sig)
        .await
        .expect("the genuine callback confirms");
    assert!(matches!(ok.status, AcquiringPaymentStatus::Confirmed));
    let processed: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM acquiring_callbacks WHERE external_ref = $1 AND processed",
    )
    .bind(&paid.external_ref)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        processed, 1,
        "the confirming callback was not marked processed"
    );
}

/// A link that belongs to a Payment Session pays the session on this rail too.
/// Before the fix the account was credited and the link marked used while the
/// session stayed ACTIVE — its dynamic QR still payable, and no
/// payment_session.paid for the integrator. A replayed confirmation changes
/// nothing further and emits nothing further.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_session_paid_on_the_acquiring_rail_is_paid(pool: PgPool) {
    use axum::{extract::State, Json};

    let f = seed(&pool).await;
    let (wa, campaign_ledger) = route_link_to_campaign(&pool, &f).await;
    let merchant: Uuid = sqlx::query_scalar("SELECT merchant_id FROM wallets WHERE id = $1")
        .bind(f.wallet)
        .fetch_one(&pool)
        .await
        .unwrap();
    let state = build_state(pool.clone()).await;
    let (_, Json(s)) = crate::routes::payment_sessions::create(
        State(state.clone()),
        Json(crate::routes::payment_sessions::CreateBody {
            merchant_id: merchant.to_string(),
            wallet_account_id: wa.to_string(),
            purpose: Some("DONATION".into()),
            reference_type: Some("DOA_CAMPAIGN".into()),
            reference_id: Some("hosted-rail".into()),
            amount_minor: Some(100_000),
            currency: Some("AOA".into()),
            description: Some("Campanha".into()),
            expires_at: None,
            metadata: None,
        }),
    )
    .await
    .unwrap();
    let link = Uuid::parse_str(s["payment_link_id"].as_str().unwrap()).unwrap();
    let qr = Uuid::parse_str(s["qr_code_id"].as_str().unwrap()).unwrap();

    let payment = confirmed_payment(&pool, link, 100_000).await;
    settle_confirmed_payment(&state, &payment).await.unwrap();
    let after_first: String =
        sqlx::query_scalar("SELECT status FROM payment_sessions WHERE payment_link_id = $1")
            .bind(link)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        after_first, "PAID",
        "the confirmation that credited the account did not pay the session"
    );
    settle_confirmed_payment(&state, &payment).await.unwrap(); // the provider retries

    assert_eq!(
        balance(&pool, campaign_ledger).await,
        100_000,
        "credited once"
    );
    let session: String =
        sqlx::query_scalar("SELECT status FROM payment_sessions WHERE payment_link_id = $1")
            .bind(link)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        session, "PAID",
        "the session its link paid for is still open"
    );
    let qr_status: String = sqlx::query_scalar("SELECT status FROM qr_codes WHERE id = $1")
        .bind(qr)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        qr_status, "EXPIRED",
        "the paid session's QR is still payable"
    );
    let events: Vec<serde_json::Value> = sqlx::query_scalar(
        "SELECT payload FROM webhook_events WHERE merchant_id = $1 AND event_type = 'payment_session.paid'",
    )
    .bind(merchant)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(events.len(), 1, "one payment, one event");
    let data = &events[0]["data"];
    assert_eq!(data["acquiring_payment_id"], payment.id.to_string());
    assert!(
        data.get("transfer_id").is_none(),
        "no transfer paid this session"
    );
    assert!(data["refund_source"].is_null());
    // Nothing was paid from a wallet, so nothing claims it was.
    let wallet_payments: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM wallet_payments")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(wallet_payments, 0);
}

/// The credit committed and the process died before the session heard. The
/// provider retries; the retry credits nothing (the posting exists) and must
/// still pay the session, or it stays open for good.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_retried_confirmation_pays_a_session_the_first_one_missed(pool: PgPool) {
    use axum::{extract::State, Json};

    let f = seed(&pool).await;
    let (wa, _) = route_link_to_campaign(&pool, &f).await;
    let merchant: Uuid = sqlx::query_scalar("SELECT merchant_id FROM wallets WHERE id = $1")
        .bind(f.wallet)
        .fetch_one(&pool)
        .await
        .unwrap();
    let state = build_state(pool.clone()).await;
    let (_, Json(s)) = crate::routes::payment_sessions::create(
        State(state.clone()),
        Json(crate::routes::payment_sessions::CreateBody {
            merchant_id: merchant.to_string(),
            wallet_account_id: wa.to_string(),
            purpose: Some("DONATION".into()),
            reference_type: Some("DOA_CAMPAIGN".into()),
            reference_id: Some("hosted-rail-crash".into()),
            amount_minor: Some(100_000),
            currency: Some("AOA".into()),
            description: None,
            expires_at: None,
            metadata: None,
        }),
    )
    .await
    .unwrap();
    let link = Uuid::parse_str(s["payment_link_id"].as_str().unwrap()).unwrap();
    let payment = confirmed_payment(&pool, link, 100_000).await;
    // What the first confirmation left behind: its posting, and nothing after it.
    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES (gen_random_uuid(), 'first confirmation', $1, now())",
    )
    .bind(format!("acquiring-settle-{}", payment.id))
    .execute(&pool)
    .await
    .unwrap();

    settle_confirmed_payment(&state, &payment).await.unwrap();

    let session: String =
        sqlx::query_scalar("SELECT status FROM payment_sessions WHERE payment_link_id = $1")
            .bind(link)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        session, "PAID",
        "the retry found the credit posted and left the session open"
    );
}
