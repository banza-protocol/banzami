// Real-DB invariant tests for Application Settlement (Banzami ADR-021 / ADR-039).
//
// Verifies that a settlement moves accumulated NET value from a source account to
// a beneficiary (plus an optional application fee to the app's account) as
// balanced, append-only ledger postings — funds-checked, idempotent, with an
// immutable pricing snapshot, never mutating a completed settlement.
//
// Run: DATABASE_URL="postgres://banzami:banzami_dev@localhost:5433/banzami_dev" \
//      cargo test -p banzami-app-settlement --test integration

use std::sync::Arc;

use sqlx::PgPool;
use uuid::Uuid;

use banzami_app_settlement::{
    ApplicationSettlementEngine, ApplicationSettlementError, ApplicationSettlementStatus,
    CreateApplicationSettlementRequest, PostgresApplicationSettlementEngine,
    PostgresApplicationSettlementRepository,
};
use banzami_ledger::{
    Account, AccountType, LedgerEngine, PostgresLedgerRepository, PostingBuilder,
};
use banzami_pricing::PostgresPricingRuleProvider;
use banzami_types::{AccountId, Currency, Money};

const ENV: &str = "LIVE";

fn kz(minor: i64) -> Money {
    Money::new(minor, Currency::AOA)
}

type Engine = PostgresApplicationSettlementEngine<
    PostgresLedgerRepository,
    PostgresPricingRuleProvider,
    PostgresApplicationSettlementRepository,
>;

struct Fixture {
    engine: Engine,
    ledger: Arc<PostgresLedgerRepository>,
    pool: PgPool,
    funding: AccountId,
}

async fn account(pool: &PgPool, ty: AccountType, name: &str) -> AccountId {
    let ledger = PostgresLedgerRepository::new(pool.clone());
    let id = AccountId::new();
    ledger
        .create_account(Account {
            id,
            account_type: ty,
            name: name.into(),
            currency: Currency::AOA,
            created_at: chrono::Utc::now(),
        })
        .await
        .unwrap();
    id
}

async fn setup(pool: PgPool) -> Fixture {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let funding = account(&pool, AccountType::Asset, "Test — Funding").await;
    let engine = PostgresApplicationSettlementEngine::new(
        ledger.clone(),
        Arc::new(PostgresPricingRuleProvider::new(pool.clone())),
        PostgresApplicationSettlementRepository::new(pool.clone()),
        ENV,
    );
    Fixture {
        engine,
        ledger,
        pool,
        funding,
    }
}

/// Give `account` a positive available balance (it is a LIABILITY available
/// account: CR raises the obligation Banzami owes).
async fn fund(fx: &Fixture, account_id: AccountId, amount: i64) {
    let posting = PostingBuilder::new(
        format!("fund {account_id}"),
        format!("fund-{}-{}", account_id.as_uuid(), amount),
    )
    .debit(fx.funding, kz(amount))
    .credit(account_id, kz(amount))
    .build()
    .unwrap();
    fx.ledger.post(posting).await.unwrap();
}

async fn seed_rule(pool: &PgPool, key: &str, category: &str, rate_bps: i32) {
    sqlx::query(
        "INSERT INTO pricing_rules (id, rule_key, business_category, rate_bps, environment)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(key)
    .bind(category)
    .bind(rate_bps)
    .bind(ENV)
    .execute(pool)
    .await
    .unwrap();
}

/// Net credit of a ledger account (credits +, debits −).
async fn net_credit(pool: &PgPool, account_id: AccountId) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor
                                  ELSE -amount_minor END), 0)::BIGINT
           FROM ledger_entries WHERE account_id = $1",
    )
    .bind(account_id.as_uuid())
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn posting_balanced(pool: &PgPool, posting_id: Uuid) -> bool {
    let net: Option<i64> = sqlx::query_scalar(
        "SELECT SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor
                         ELSE -amount_minor END)::BIGINT
           FROM ledger_entries WHERE posting_id = $1",
    )
    .bind(posting_id)
    .fetch_one(pool)
    .await
    .unwrap();
    net == Some(0)
}

fn req(
    idem: &str,
    source: AccountId,
    beneficiary: AccountId,
    fee_account: Option<AccountId>,
    gross: i64,
    category: Option<&str>,
) -> CreateApplicationSettlementRequest {
    CreateApplicationSettlementRequest {
        idempotency_key: idem.into(),
        owner_ref: "campaign_42".into(),
        application_id: Some("app_x".into()),
        source_account_id: source,
        beneficiary_account_id: beneficiary,
        application_fee_account_id: fee_account,
        gross_amount: kz(gross),
        application_fee_bps: None,
        business_category: category.map(str::to_string),
        pricing_profile: None,
        fee_policy_ref: None,
        metadata: None,
    }
}

// ─── gross 98000, fee 4900 (5%), net 93100 ──────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn settles_net_and_application_fee_balanced(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "crowd-standard", "CROWDFUNDING", 500).await; // 5%

    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    let app_fee = account(&fx.pool, AccountType::Liability, "App Fee Account").await;
    fund(&fx, source, 98_000).await;

    let created = fx
        .engine
        .create(req(
            "s1",
            source,
            beneficiary,
            Some(app_fee),
            98_000,
            Some("CROWDFUNDING"),
        ))
        .await
        .unwrap();
    assert_eq!(created.status, ApplicationSettlementStatus::Created);
    assert_eq!(created.application_fee.amount_minor(), 4_900);
    assert_eq!(created.net_amount.amount_minor(), 93_100);

    let done = fx.engine.complete(created.id).await.unwrap();
    assert_eq!(done.status, ApplicationSettlementStatus::Completed);

    // source debited gross (98000 funded − 98000 = 0); beneficiary +net; fee +fee.
    assert_eq!(
        net_credit(&fx.pool, source).await,
        0,
        "source debited gross"
    );
    assert_eq!(
        net_credit(&fx.pool, beneficiary).await,
        93_100,
        "beneficiary NET"
    );
    assert_eq!(net_credit(&fx.pool, app_fee).await, 4_900, "app fee");

    // both postings balanced
    assert!(posting_balanced(&fx.pool, done.settlement_posting_id.unwrap().as_uuid()).await);
    assert!(posting_balanced(&fx.pool, done.fee_posting_id.unwrap().as_uuid()).await);

    // snapshot persisted, pinned to the rule
    let snap: serde_json::Value =
        sqlx::query_scalar("SELECT pricing_snapshot_json FROM app_settlements WHERE id = $1")
            .bind(done.id.as_uuid())
            .fetch_one(&fx.pool)
            .await
            .unwrap();
    assert_eq!(snap["rate_bps"], serde_json::json!(500));
    assert_eq!(snap["fee_minor"], serde_json::json!(4_900));
    Ok(())
}

// ─── ADR-029: app-defined fee (bps) bypasses the Pricing Engine ─────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn app_defined_fee_bypasses_pricing_engine(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    // NO pricing rule seeded — proving the fee comes from the app's bps, not rules.
    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    let app_fee = account(&fx.pool, AccountType::Liability, "App Fee Account").await;
    fund(&fx, source, 200_000).await;

    let mut r = req("doa-1", source, beneficiary, Some(app_fee), 200_000, None);
    r.application_fee_bps = Some(500); // DOA's 5% — app policy

    let created = fx.engine.create(r).await.unwrap();
    assert_eq!(created.application_fee.amount_minor(), 10_000, "5% of 200k");
    assert_eq!(created.net_amount.amount_minor(), 190_000);

    let done = fx.engine.complete(created.id).await.unwrap();
    assert_eq!(
        net_credit(&fx.pool, beneficiary).await,
        190_000,
        "beneficiary NET 95%"
    );
    assert_eq!(net_credit(&fx.pool, app_fee).await, 10_000, "app fee 5%");
    assert!(posting_balanced(&fx.pool, done.settlement_posting_id.unwrap().as_uuid()).await);
    assert!(posting_balanced(&fx.pool, done.fee_posting_id.unwrap().as_uuid()).await);

    // snapshot marks the fee as APP_DEFINED, not a pricing-rule resolution.
    let snap: serde_json::Value =
        sqlx::query_scalar("SELECT pricing_snapshot_json FROM app_settlements WHERE id = $1")
            .bind(done.id.as_uuid())
            .fetch_one(&fx.pool)
            .await
            .unwrap();
    assert_eq!(snap["source"], serde_json::json!("APP_DEFINED"));
    assert_eq!(snap["application_fee_bps"], serde_json::json!(500));
    // no pricing rule was pinned
    let rule_id: Option<uuid::Uuid> =
        sqlx::query_scalar("SELECT pricing_rule_id FROM app_settlements WHERE id = $1")
            .bind(done.id.as_uuid())
            .fetch_one(&fx.pool)
            .await
            .unwrap();
    assert!(rule_id.is_none(), "app-defined fee pins no pricing rule");
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn app_defined_fee_bps_over_bound_is_rejected(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    let app_fee = account(&fx.pool, AccountType::Liability, "App Fee Account").await;
    fund(&fx, source, 100_000).await;

    let mut r = req("doa-2", source, beneficiary, Some(app_fee), 100_000, None);
    r.application_fee_bps = Some(6000); // 60% > 50% cap
    let err = fx.engine.create(r).await.unwrap_err();
    assert!(
        matches!(
            err,
            banzami_app_settlement::ApplicationSettlementError::FeeBpsOutOfBounds { .. }
        ),
        "got {err:?}"
    );
    Ok(())
}

// ─── zero application fee → net == gross ────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn zero_application_fee_net_equals_gross(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    // An EXPLICIT zero rule, not the absence of one.
    //
    // This test used to rely on "no rule for this category -> 0 fee", which is
    // the defect rather than the behaviour: an absent pricing decision and a
    // decision of zero produce the same number in a ledger and are entirely
    // different facts. Zero is now something a rule has to say.
    seed_rule(&fx.pool, "donation-zero", "DONATION", 0).await;
    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    fund(&fx, source, 50_000).await;

    let created = fx
        .engine
        .create(req(
            "s2",
            source,
            beneficiary,
            None,
            50_000,
            Some("DONATION"),
        ))
        .await
        .unwrap();
    assert_eq!(created.application_fee.amount_minor(), 0);
    assert_eq!(created.net_amount.amount_minor(), 50_000);

    let done = fx.engine.complete(created.id).await.unwrap();
    assert_eq!(
        net_credit(&fx.pool, beneficiary).await,
        50_000,
        "all to beneficiary"
    );
    assert!(
        done.fee_posting_id.is_none(),
        "no fee posting when fee is 0"
    );
    Ok(())
}

// ─── no applicable rule → settlement refuses (fails closed) ────────────────

// The companion to `zero_application_fee_net_equals_gross`. That test proves an
// explicit 0-bps rule settles at zero; this one proves the absence of any rule
// does not settle at all. Without both, "fee 0" in the ledger has two possible
// meanings and no way to tell them apart after the fact.

#[sqlx::test(migrations = "../../db/migrations")]
async fn no_applicable_rule_refuses_settlement(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    // A rule exists, but for a different category — so nothing matches.
    seed_rule(&fx.pool, "crowd-standard", "CROWDFUNDING", 500).await;
    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    fund(&fx, source, 50_000).await;

    let err = fx
        .engine
        .create(req(
            "s-unpriced",
            source,
            beneficiary,
            None,
            50_000,
            Some("SPACE_TOURISM"),
        ))
        .await
        .expect_err("no applicable rule must refuse, not settle for free");
    assert!(
        matches!(err, ApplicationSettlementError::Pricing(_)),
        "expected Pricing refusal, got {err:?}"
    );

    // Nothing moved: the beneficiary was never credited and the source is intact.
    assert_eq!(
        net_credit(&fx.pool, beneficiary).await,
        0,
        "refused settlement must not credit the beneficiary"
    );
    assert_eq!(
        net_credit(&fx.pool, source).await,
        50_000,
        "refused settlement must not debit the source"
    );
    Ok(())
}

// ─── fee > gross rejected at create ─────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn fee_exceeding_gross_rejected(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "absurd", "CROWDFUNDING", 20_000).await; // 200%
    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    let app_fee = account(&fx.pool, AccountType::Liability, "App Fee").await;

    let result = fx
        .engine
        .create(req(
            "s3",
            source,
            beneficiary,
            Some(app_fee),
            10_000,
            Some("CROWDFUNDING"),
        ))
        .await;
    assert!(
        matches!(
            result,
            Err(ApplicationSettlementError::FeeExceedsGross { .. })
        ),
        "got {result:?}"
    );
    Ok(())
}

// ─── insufficient funds rejected, no partial postings ───────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn insufficient_funds_rejected_no_partial(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "crowd-standard", "CROWDFUNDING", 500).await;
    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    let app_fee = account(&fx.pool, AccountType::Liability, "App Fee").await;
    fund(&fx, source, 50_000).await; // less than gross 98000

    let created = fx
        .engine
        .create(req(
            "s4",
            source,
            beneficiary,
            Some(app_fee),
            98_000,
            Some("CROWDFUNDING"),
        ))
        .await
        .unwrap();
    let result = fx.engine.complete(created.id).await;
    assert!(
        matches!(
            result,
            Err(ApplicationSettlementError::InsufficientFunds { .. })
        ),
        "got {result:?}"
    );
    // no money moved; settlement still CREATED
    assert_eq!(net_credit(&fx.pool, beneficiary).await, 0);
    assert_eq!(net_credit(&fx.pool, app_fee).await, 0);
    assert_eq!(
        net_credit(&fx.pool, source).await,
        50_000,
        "source untouched"
    );
    assert_eq!(
        fx.engine.get(created.id).await.unwrap().status,
        ApplicationSettlementStatus::Created
    );
    Ok(())
}

// ─── replay does not double-settle ──────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn complete_replay_is_idempotent(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "crowd-standard", "CROWDFUNDING", 500).await;
    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    let app_fee = account(&fx.pool, AccountType::Liability, "App Fee").await;
    fund(&fx, source, 98_000).await;

    let created = fx
        .engine
        .create(req(
            "s5",
            source,
            beneficiary,
            Some(app_fee),
            98_000,
            Some("CROWDFUNDING"),
        ))
        .await
        .unwrap();
    fx.engine.complete(created.id).await.unwrap();
    let again = fx.engine.complete(created.id).await.unwrap();
    assert_eq!(again.status, ApplicationSettlementStatus::Completed);

    // credited exactly once
    assert_eq!(net_credit(&fx.pool, beneficiary).await, 93_100);
    assert_eq!(net_credit(&fx.pool, app_fee).await, 4_900);

    // create replay returns the same aggregate
    let recreated = fx
        .engine
        .create(req(
            "s5",
            source,
            beneficiary,
            Some(app_fee),
            98_000,
            Some("CROWDFUNDING"),
        ))
        .await
        .unwrap();
    assert_eq!(recreated.id, created.id, "idempotent create");
    Ok(())
}

// ─── completed settlement is immutable ──────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn completed_settlement_is_immutable(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "crowd-standard", "CROWDFUNDING", 500).await;
    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    let app_fee = account(&fx.pool, AccountType::Liability, "App Fee").await;
    fund(&fx, source, 98_000).await;

    let created = fx
        .engine
        .create(req(
            "s6",
            source,
            beneficiary,
            Some(app_fee),
            98_000,
            Some("CROWDFUNDING"),
        ))
        .await
        .unwrap();
    fx.engine.complete(created.id).await.unwrap();

    // cancel/fail after COMPLETED is rejected (terminal)
    assert!(matches!(
        fx.engine.cancel(created.id).await,
        Err(ApplicationSettlementError::InvalidStatus { .. })
    ));
    assert!(matches!(
        fx.engine.fail(created.id, "x".into()).await,
        Err(ApplicationSettlementError::InvalidStatus { .. })
    ));
    Ok(())
}

// ─── a later rule change never alters a completed settlement ────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn rule_change_does_not_alter_completed(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "crowd-standard", "CROWDFUNDING", 500).await; // 5%
    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    let app_fee = account(&fx.pool, AccountType::Liability, "App Fee").await;
    fund(&fx, source, 98_000).await;

    let created = fx
        .engine
        .create(req(
            "s7",
            source,
            beneficiary,
            Some(app_fee),
            98_000,
            Some("CROWDFUNDING"),
        ))
        .await
        .unwrap();
    let done = fx.engine.complete(created.id).await.unwrap();

    // operator changes the rate afterwards
    sqlx::query("UPDATE pricing_rules SET rate_bps = 1000 WHERE rule_key = 'crowd-standard'")
        .execute(&fx.pool)
        .await
        .unwrap();

    let reloaded = fx.engine.get(done.id).await.unwrap();
    assert_eq!(
        reloaded.application_fee.amount_minor(),
        4_900,
        "fee unchanged"
    );
    assert_eq!(reloaded.net_amount.amount_minor(), 93_100, "net unchanged");
    assert_eq!(
        reloaded.pricing_snapshot_json["rate_bps"],
        serde_json::json!(500),
        "snapshot still v1's 5%"
    );
    Ok(())
}

// ─── filtered admin listing (audit surface) ─────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn list_filtered_by_owner_status_currency(pool: PgPool) -> sqlx::Result<()> {
    use banzami_app_settlement::ApplicationSettlementFilter;
    use banzami_app_settlement::ApplicationSettlementRepository;
    use banzami_app_settlement::PostgresApplicationSettlementRepository;

    let fx = setup(pool).await;
    seed_rule(&fx.pool, "crowd-standard", "CROWDFUNDING", 500).await;
    let source = account(&fx.pool, AccountType::Liability, "Campaign").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary").await;
    let app_fee = account(&fx.pool, AccountType::Liability, "AppFee").await;
    fund(&fx, source, 98_000).await;

    let created = fx
        .engine
        .create(req(
            "lf1",
            source,
            beneficiary,
            Some(app_fee),
            98_000,
            Some("CROWDFUNDING"),
        ))
        .await
        .unwrap();
    fx.engine.complete(created.id).await.unwrap();

    let repo = PostgresApplicationSettlementRepository::new(fx.pool.clone());
    let base = ApplicationSettlementFilter {
        limit: 100,
        ..Default::default()
    };

    assert_eq!(repo.list_filtered(&base).await.unwrap().len(), 1);
    assert_eq!(
        repo.list_filtered(&ApplicationSettlementFilter {
            owner_ref: Some("campaign_42".into()),
            ..base.clone()
        })
        .await
        .unwrap()
        .len(),
        1
    );
    assert_eq!(
        repo.list_filtered(&ApplicationSettlementFilter {
            status: Some("COMPLETED".into()),
            ..base.clone()
        })
        .await
        .unwrap()
        .len(),
        1
    );
    assert_eq!(
        repo.list_filtered(&ApplicationSettlementFilter {
            status: Some("CANCELLED".into()),
            ..base.clone()
        })
        .await
        .unwrap()
        .len(),
        0
    );
    assert_eq!(
        repo.list_filtered(&ApplicationSettlementFilter {
            currency: Some("USD".into()),
            ..base.clone()
        })
        .await
        .unwrap()
        .len(),
        0
    );
    Ok(())
}
