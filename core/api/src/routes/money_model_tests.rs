//! MONEY-MODEL-001 (ADR-063): a balance is an obligation, and what backs it is
//! explicit. Real database, Core's own operations.
//!
//! The journey proves that at every step the book balances and the backing
//! covers every obligation; that internal movements change who is owed, never
//! how much; that cash-in and cash-out are the only operations that change the
//! network total, and only on the rail's word. The detection tests prove each
//! integrity finding fires for the defect it names — the mutation proofs of the
//! economic gate.

use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_ledger::system::{register_system_account, withdrawals_in_flight, SystemRole};
use banzami_payouts::{BankDestination, CreatePayoutRequest, PayoutEngine, PayoutStatus};
use banzami_reconciliation::{financial_position, CurrencyPosition, FinancialPosition};
use banzami_settlement::{CreateSettlementBatchRequest, SettlementEngine};
use banzami_types::{AccountId, Currency, MerchantId, Money, WalletId};

use super::consumer_wallets::{self, TestCreditBody};
use super::external_rail::{self, SetRailState};
use super::external_rail_tests::{account, business, funded_consumer, p2p, pay_business, Business};
use super::payouts;
use crate::state::{AppState, CoreEnvironment};

struct Model {
    state: AppState,
    transit: Uuid,
    bank: Uuid,
    revenue: Uuid,
}

/// Core as it boots: its system accounts carry their economic roles, synthetic
/// because this is the Sandbox.
async fn model(pool: &PgPool) -> Model {
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
    let state = AppState::new(
        pool.clone(),
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        AccountId::from_uuid(revenue),
        CoreEnvironment::Sandbox,
    );
    Model {
        state,
        transit,
        bank,
        revenue,
    }
}

async fn position(pool: &PgPool) -> FinancialPosition {
    financial_position(pool).await.unwrap()
}

fn aoa(p: &FinancialPosition) -> CurrencyPosition {
    p.currency("AOA").cloned().unwrap_or_default()
}

/// Healthy, and the double-entry identity holds across the classes: backing +
/// costs = obligations + revenue.
fn assert_consistent(p: &FinancialPosition, step: &str) {
    assert!(p.is_healthy(), "{step}: {:?}", p.findings);
    let c = aoa(p);
    assert_eq!(
        c.backing_total_minor + c.external_costs_minor,
        c.covered_obligations_minor + c.operator_revenue_minor,
        "{step}: the classes do not add up"
    );
    assert!(
        c.coverage_difference_minor >= 0,
        "{step}: backing below obligations"
    );
}

async fn fund(state: &AppState, consumer: Uuid, amount: i64, key: &str) {
    let _ = consumer_wallets::test_credit(
        State(state.clone()),
        Json(TestCreditBody {
            consumer_id: consumer.to_string(),
            amount_minor: amount,
            currency: Some("AOA".into()),
            idempotency_key: Some(key.into()),
        }),
    )
    .await
    .expect("Sandbox funding");
}

async fn priced(pool: &PgPool, b: &Business) {
    sqlx::query(
        "UPDATE merchants SET pricing_profile_id = (SELECT id FROM pricing_profiles WHERE environment = 'SANDBOX' AND code = 'sandbox-default') WHERE id = $1",
    )
    .bind(b.merchant)
    .execute(pool)
    .await
    .unwrap();
}

async fn consumer(pool: &PgPool) -> (Uuid, String) {
    let (id, handle, _) = funded_consumer(pool, 0).await;
    (id, handle)
}

async fn sweep(m: &Model, b: &Business, gross: i64, fee: i64, key: &str) {
    let s = m
        .state
        .settlement
        .create_batch(CreateSettlementBatchRequest {
            idempotency_key: key.into(),
            merchant_id: MerchantId::from_uuid(b.merchant),
            wallet_id: WalletId::from_uuid(b.wallet),
            gross_amount: Money::new(gross, Currency::AOA),
            fee_amount: Money::new(fee, Currency::AOA),
            transaction_count: 1,
            period_start: chrono::Utc::now() - chrono::Duration::days(1),
            period_end: chrono::Utc::now(),
        })
        .await
        .unwrap();
    m.state.settlement.submit(s.id).await.unwrap();
    m.state.settlement.confirm(s.id).await.unwrap();
}

fn destination() -> BankDestination {
    BankDestination {
        account_number: "AO06000000000000000000000".into(),
        bank_code: "0040".into(),
        account_holder_name: "Money model".into(),
    }
}

// ---------------------------------------------------------------------------
// The journey
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn fund_move_settle_withdraw_keeps_every_obligation_backed(pool: PgPool) {
    let m = model(&pool).await;
    let b = business(&pool).await;
    priced(&pool, &b).await;
    let (payer, payer_handle) = consumer(&pool).await;
    let (_, friend_handle) = consumer(&pool).await;

    // Start: nothing owed, nothing backing it.
    let p0 = position(&pool).await;
    assert_consistent(&p0, "start");
    assert_eq!(aoa(&p0).covered_obligations_minor, 0);
    assert!(
        aoa(&p0).backing_is_synthetic,
        "Sandbox backing is labelled synthetic"
    );

    // Cash-in: the network total grows, on both sides at once.
    fund(&m.state, payer, 100_000, "mm-fund-0001").await;
    let p1 = position(&pool).await;
    assert_consistent(&p1, "funded");
    assert_eq!(aoa(&p1).covered_obligations_minor, 100_000);
    assert_eq!(aoa(&p1).external_transit_minor, 100_000);

    // The same funding request again: one credit.
    fund(&m.state, payer, 100_000, "mm-fund-0001").await;
    assert_eq!(
        aoa(&position(&pool).await).covered_obligations_minor,
        100_000,
        "duplicate evidence, one effect"
    );

    // Internal movements: who is owed changes, how much is owed does not.
    p2p(&m.state, &payer_handle, &friend_handle, "mm-p2p")
        .await
        .expect("P2P");
    let p2 = position(&pool).await;
    assert_consistent(&p2, "p2p");
    assert_eq!(
        aoa(&p2).covered_obligations_minor,
        100_000,
        "P2P changed the network total"
    );
    assert_eq!(aoa(&p2).backing_total_minor, 100_000);

    pay_business(&m.state, payer, &b, "mm-pay")
        .await
        .expect("merchant payment");
    let p3 = position(&pool).await;
    assert_consistent(&p3, "merchant payment");
    assert_eq!(
        aoa(&p3).covered_obligations_minor,
        100_000,
        "a payment changed the network total"
    );
    assert_eq!(aoa(&p3).business_available_minor, 25_000);
    assert_eq!(aoa(&p3).participant_available_minor, 75_000);

    // The acquirer settles value it held to the backing account: backing moves
    // between locations, obligations do not.
    sweep(&m, &b, 60_000, 0, "mm-sweep").await;
    let p4 = position(&pool).await;
    assert_consistent(&p4, "sweep");
    assert_eq!(aoa(&p4).external_backing_minor, 60_000);
    assert_eq!(aoa(&p4).external_transit_minor, 40_000);
    assert_eq!(aoa(&p4).covered_obligations_minor, 100_000);

    // Cash-out, requested: the obligation is reserved in flight, the fee becomes
    // Banzami's revenue, and no backing moves — no rail has executed anything.
    let payout = m
        .state
        .payout
        .initiate(CreatePayoutRequest {
            idempotency_key: "mm-payout".into(),
            merchant_id: MerchantId::from_uuid(b.merchant),
            wallet_id: WalletId::from_uuid(b.wallet),
            amount: Money::new(20_000, Currency::AOA),
            destination: destination(),
        })
        .await
        .unwrap();
    m.state.payout.process(payout.id).await.unwrap();
    let p5 = position(&pool).await;
    assert_consistent(&p5, "withdrawal processing");
    let fee = aoa(&p5).operator_revenue_minor;
    assert!(fee > 0, "the withdrawal is priced");
    assert_eq!(aoa(&p5).withdrawals_in_flight_minor, 20_000 - fee);
    assert_eq!(
        aoa(&p5).backing_total_minor,
        100_000,
        "no backing moves before the rail"
    );
    assert_eq!(aoa(&p5).covered_obligations_minor, 100_000 - fee);
    assert_eq!(
        aoa(&p5).coverage_difference_minor,
        fee,
        "the surplus is exactly Banzami's revenue"
    );
    assert_eq!(aoa(&p5).pending_withdrawal_count, 1);

    // The rail is down: submitting and confirming refuse; nothing moves.
    let _ = external_rail::put(
        State(m.state.clone()),
        Path(b.merchant),
        Json(SetRailState {
            state: "UNAVAILABLE".into(),
        }),
    )
    .await
    .unwrap();
    assert_eq!(
        payouts::mark_sent(State(m.state.clone()), Path(payout.id.to_string()))
            .await
            .unwrap_err()
            .code,
        "PROVIDER_UNAVAILABLE"
    );
    // Internal value still moves with the rail down.
    p2p(&m.state, &friend_handle, &payer_handle, "mm-p2p-rail-down")
        .await
        .expect("P2P with the rail down");
    let p6 = position(&pool).await;
    assert_consistent(&p6, "rail down");
    assert_eq!(
        aoa(&p6).covered_obligations_minor,
        aoa(&p5).covered_obligations_minor
    );
    assert_eq!(aoa(&p6).backing_total_minor, aoa(&p5).backing_total_minor);

    // The rail returns; the withdrawal is submitted. A timeout is not a failure.
    let _ = external_rail::put(
        State(m.state.clone()),
        Path(b.merchant),
        Json(SetRailState {
            state: "AVAILABLE".into(),
        }),
    )
    .await
    .unwrap();
    let _ = payouts::mark_sent(State(m.state.clone()), Path(payout.id.to_string()))
        .await
        .unwrap();
    let blind = payouts::fail(
        State(m.state.clone()),
        Path(payout.id.to_string()),
        Json(payouts::FailBody {
            reason: "provider timeout".into(),
            evidence_ref: None,
        }),
    )
    .await
    .unwrap_err();
    assert_eq!(blind.code, "EXTERNAL_EVIDENCE_REQUIRED");
    assert_consistent(&position(&pool).await, "ambiguous outcome");

    // The rail's confirmation arrives late: exactly one resolution. The
    // obligation is extinguished and the backing pays the net out.
    let _ = payouts::confirm(State(m.state.clone()), Path(payout.id.to_string()))
        .await
        .unwrap();
    assert!(
        payouts::confirm(State(m.state.clone()), Path(payout.id.to_string()))
            .await
            .is_err(),
        "a second confirmation"
    );
    let p7 = position(&pool).await;
    assert_consistent(&p7, "withdrawal confirmed");
    assert_eq!(aoa(&p7).withdrawals_in_flight_minor, 0);
    assert_eq!(
        aoa(&p7).external_backing_minor,
        60_000 - (20_000 - fee),
        "paid out once"
    );
    assert_eq!(
        aoa(&p7).covered_obligations_minor,
        100_000 - 20_000,
        "cash-out reduced the network total by the gross"
    );
    assert_eq!(aoa(&p7).coverage_difference_minor, fee);
    assert_eq!(
        m.state.payout.get(payout.id).await.unwrap().status,
        PayoutStatus::Confirmed
    );
    let _ = (m.transit, m.bank, m.revenue);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_acquirers_fee_is_a_cost_not_value_left_in_transit(pool: PgPool) {
    let m = model(&pool).await;
    let b = business(&pool).await;
    let (payer, _) = consumer(&pool).await;
    fund(&m.state, payer, 50_000, "fee-fund").await;

    sweep(&m, &b, 50_000, 1_000, "fee-sweep").await;
    let p = position(&pool).await;
    let c = aoa(&p);
    assert_eq!(c.external_transit_minor, 0, "transit gives up the gross");
    assert_eq!(c.external_backing_minor, 49_000);
    assert_eq!(c.external_costs_minor, 1_000, "the fee is recognised");
    // Banzami absorbed a cost it earned nothing to cover: the shortfall is
    // visible, not hidden in transit.
    assert_eq!(c.coverage_difference_minor, -1_000);
    assert!(p
        .findings
        .iter()
        .any(|f| f.code == "BACKING_BELOW_OBLIGATIONS" && f.amount_minor == -1_000));
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_withdrawal_failed_on_the_rails_evidence_restores_the_obligation(pool: PgPool) {
    let m = model(&pool).await;
    let b = business(&pool).await;
    priced(&pool, &b).await;
    let (payer, _) = consumer(&pool).await;
    fund(&m.state, payer, 30_000, "ret-fund").await;
    pay_business(&m.state, payer, &b, "ret-pay").await.unwrap();
    let before = aoa(&position(&pool).await);

    let payout = m
        .state
        .payout
        .initiate(CreatePayoutRequest {
            idempotency_key: "ret-payout".into(),
            merchant_id: MerchantId::from_uuid(b.merchant),
            wallet_id: WalletId::from_uuid(b.wallet),
            amount: Money::new(10_000, Currency::AOA),
            destination: destination(),
        })
        .await
        .unwrap();
    m.state.payout.process(payout.id).await.unwrap();
    m.state.payout.mark_sent(payout.id).await.unwrap();
    let _ = payouts::fail(
        State(m.state.clone()),
        Path(payout.id.to_string()),
        Json(payouts::FailBody {
            reason: "account closed".into(),
            evidence_ref: Some("EMIS-REJ-0001".into()),
        }),
    )
    .await
    .unwrap();

    let after = position(&pool).await;
    assert_consistent(&after, "failed on evidence");
    let c = aoa(&after);
    assert_eq!(
        c.covered_obligations_minor, before.covered_obligations_minor,
        "restored exactly"
    );
    assert_eq!(c.withdrawals_in_flight_minor, 0);
    assert_eq!(c.operator_revenue_minor, 0, "the fee is given back");
    let evidence: Option<String> =
        sqlx::query_scalar("SELECT failure_evidence_ref FROM payouts WHERE id = $1")
            .bind(payout.id.as_uuid())
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(evidence.as_deref(), Some("EMIS-REJ-0001"));
}

// ---------------------------------------------------------------------------
// Detection — each finding fires for the defect it names
// ---------------------------------------------------------------------------

async fn post(pool: &PgPool, legs: &[(Uuid, &str, i64)]) {
    let p = Uuid::new_v4();
    sqlx::query("INSERT INTO ledger_postings (id, description, idempotency_key, created_at) VALUES ($1, 'defect', $2, now())")
        .bind(p)
        .bind(format!("defect-{p}"))
        .execute(pool)
        .await
        .unwrap();
    for (acct, side, amount) in legs {
        sqlx::query("INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'AOA', now())")
            .bind(p)
            .bind(acct)
            .bind(*side)
            .bind(*amount)
            .execute(pool)
            .await
            .unwrap();
    }
}

fn codes(p: &FinancialPosition) -> Vec<&'static str> {
    p.findings.iter().map(|f| f.code).collect()
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn crediting_a_participant_without_backing_is_detected(pool: PgPool) {
    let m = model(&pool).await;
    let (_, _, avail) = funded_consumer(&pool, 0).await;
    // Value created from Banzami's revenue instead of confirmed external funds.
    post(
        &pool,
        &[(m.revenue, "DEBIT", 5_000), (avail, "CREDIT", 5_000)],
    )
    .await;
    let c = codes(&position(&pool).await);
    assert!(c.contains(&"BACKING_BELOW_OBLIGATIONS"), "{c:?}");
    assert!(c.contains(&"NEGATIVE_OPERATOR_REVENUE"), "{c:?}");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_one_legged_credit_is_detected(pool: PgPool) {
    let _m = model(&pool).await;
    let (_, _, avail) = funded_consumer(&pool, 0).await;
    post(&pool, &[(avail, "CREDIT", 5_000)]).await;
    let c = codes(&position(&pool).await);
    assert!(c.contains(&"BOOK_UNBALANCED"), "{c:?}");
    assert!(c.contains(&"BACKING_BELOW_OBLIGATIONS"), "{c:?}");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_participant_balance_counted_as_backing_is_not_backing(pool: PgPool) {
    let m = model(&pool).await;
    let (_, _, a) = funded_consumer(&pool, 0).await;
    let (_, _, b) = funded_consumer(&pool, 0).await;
    // Circular: one participant's balance "backs" another's.
    post(&pool, &[(a, "DEBIT", 7_000), (b, "CREDIT", 7_000)]).await;
    let p = position(&pool).await;
    assert!(
        codes(&p).contains(&"NEGATIVE_OBLIGATION"),
        "{:?}",
        p.findings
    );
    assert_eq!(aoa(&p).backing_total_minor, 0, "a wallet is never backing");
    let _ = m.transit;
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn value_on_an_account_nothing_owns_is_detected(pool: PgPool) {
    let m = model(&pool).await;
    let orphan = account(&pool, "LIABILITY").await;
    post(
        &pool,
        &[(m.transit, "DEBIT", 3_000), (orphan, "CREDIT", 3_000)],
    )
    .await;
    assert!(codes(&position(&pool).await).contains(&"UNCLASSIFIED_ACCOUNT_WITH_ENTRIES"));
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_account_nothing_owns_and_nothing_touched_is_not_a_finding(pool: PgPool) {
    let _m = model(&pool).await;
    account(&pool, "LIABILITY").await;
    let p = position(&pool).await;
    assert!(p.is_healthy(), "{:?}", p.findings);
    assert!(p
        .classes
        .iter()
        .any(|c| c.economic_class == "UNOWNED_EMPTY"));
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn value_left_on_a_retired_test_payer_is_detected(pool: PgPool) {
    let m = model(&pool).await;
    let (payer, _) = consumer(&pool).await;
    fund(&m.state, payer, 8_000, "retired-fund").await;
    sqlx::query("INSERT INTO sandbox_test_payers (consumer_id, project_id, label, retired_at) VALUES ($1, gen_random_uuid(), 'retired', now())")
        .bind(payer)
        .execute(&pool)
        .await
        .unwrap();
    let p = position(&pool).await;
    let f = p
        .findings
        .iter()
        .find(|f| f.code == "RETIRED_RESOURCE_HOLDS_VALUE")
        .expect("retired value found");
    assert_eq!(f.amount_minor, 8_000);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_obligation_left_in_flight_without_a_withdrawal_is_detected(pool: PgPool) {
    let m = model(&pool).await;
    let (payer, _) = consumer(&pool).await;
    fund(&m.state, payer, 8_000, "flight-fund").await;
    let avail: Uuid = sqlx::query_scalar(
        "SELECT available_account_id FROM consumer_wallets WHERE consumer_id = $1",
    )
    .bind(payer)
    .fetch_one(&pool)
    .await
    .unwrap();
    let in_flight = withdrawals_in_flight(Currency::AOA).unwrap().as_uuid();
    post(
        &pool,
        &[(avail, "DEBIT", 2_000), (in_flight, "CREDIT", 2_000)],
    )
    .await;
    let p = position(&pool).await;
    assert!(
        codes(&p).contains(&"WITHDRAWALS_IN_FLIGHT_UNEXPLAINED"),
        "{:?}",
        p.findings
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_backing_position_paid_out_before_it_was_received_is_detected(pool: PgPool) {
    let m = model(&pool).await;
    let (payer, _) = consumer(&pool).await;
    fund(&m.state, payer, 8_000, "neg-fund-0001").await;
    // The bank pays out value that is still at the acquirer.
    post(&pool, &[(m.transit, "DEBIT", 1), (m.bank, "CREDIT", 1)]).await;
    assert!(codes(&position(&pool).await).contains(&"NEGATIVE_BACKING_POSITION"));
}
