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
/// The pricing profile these settlements are assigned. A code, not a vertical:
/// nothing about the rate or the kind of business is encoded in it.
const PROFILE: &str = "assurance-standard";

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

/// Seed a SETTLEMENT rule for a business category.
///
/// It names its operation, because a rule that does
/// not is not a wildcard — it applies to nothing. That is the whole point: an
/// operation-less rule can no longer be inherited by a fee-bearing operation
/// nobody meant it for.
///
/// Seed the SETTLEMENT rule for the profile these tests settle under.
///
/// It names a profile because that is the only thing that selects a rule. An
/// earlier version of this helper seeded rules with no profile and relied on
/// them pricing every profile — a wildcard the model now refuses outright, in
/// the database as well as in the resolver.
async fn seed_rule(pool: &PgPool, key: &str, rate_bps: i32) {
    seed_profile_rule(pool, key, PROFILE, rate_bps).await;
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
    profile: Option<&str>,
) -> CreateApplicationSettlementRequest {
    CreateApplicationSettlementRequest {
        idempotency_key: idem.into(),
        owner_ref: "campaign_42".into(),
        application_id: Some("app_x".into()),
        source_account_id: source,
        beneficiary_account_id: beneficiary,
        application_fee_account_id: fee_account,
        gross_amount: kz(gross),
        business_category: None,
        pricing_profile: profile.map(str::to_string),
        fee_policy_ref: None,
        metadata: None,
    }
}

// ─── gross 98000, fee 4900 (5%), net 93100 ──────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn settles_net_and_application_fee_balanced(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "crowd-standard", 500).await; // 5%

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
            Some(PROFILE),
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

// ─── the rate is the operator's, and only the operator's ─────────────────────
//
// There used to be a second fee path here — ADR-029 "app-defined" — where a
// caller-supplied application_fee_bps skipped the Pricing Engine and charged
// whatever it asked for. The two tests that proved it worked were proving a hole.
// These prove it is closed, and that a completed settlement's economics are
// fixed at completion rather than recomputed from whatever pricing says later.

#[sqlx::test(migrations = "../../db/migrations")]
async fn the_fee_is_the_assigned_profile_rate_and_nothing_else(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "assurance-200", 200).await;
    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    let app_fee = account(&fx.pool, AccountType::Liability, "App Fee Account").await;
    fund(&fx, source, 100_000).await;

    // The request type has no field through which a rate could be named — this
    // is the compile-time half of the property. The runtime half: the fee is
    // exactly what the profile's SETTLEMENT rule resolves.
    let created = fx
        .engine
        .create(req(
            "rate-1",
            source,
            beneficiary,
            Some(app_fee),
            100_000,
            Some(PROFILE),
        ))
        .await
        .unwrap();
    assert_eq!(
        created.application_fee.amount_minor(),
        2_000,
        "200 bps of 100 000"
    );
    assert_eq!(created.net_amount.amount_minor(), 98_000);

    let snap: serde_json::Value =
        sqlx::query_scalar("SELECT pricing_snapshot_json FROM app_settlements WHERE id = $1")
            .bind(created.id.as_uuid())
            .fetch_one(&fx.pool)
            .await
            .unwrap();
    assert_eq!(snap["rate_bps"], serde_json::json!(200));
    assert_eq!(snap["pricing_profile"], serde_json::json!(PROFILE));
    assert_eq!(snap["fee_minor"], serde_json::json!(2_000));
    assert!(
        snap.get("application_fee_bps").is_none(),
        "no caller rate is recorded"
    );
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_completed_settlement_keeps_the_economics_it_was_settled_at(
    pool: PgPool,
) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "assurance-200", 200).await;
    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    let app_fee = account(&fx.pool, AccountType::Liability, "App Fee Account").await;
    fund(&fx, source, 100_000).await;

    let created = fx
        .engine
        .create(req(
            "immut-1",
            source,
            beneficiary,
            Some(app_fee),
            100_000,
            Some(PROFILE),
        ))
        .await
        .unwrap();
    let done = fx.engine.complete(created.id).await.unwrap();

    // The operator reprices the profile afterwards.
    sqlx::query("UPDATE pricing_rules SET rate_bps = 900 WHERE rule_key = 'assurance-200'")
        .execute(&fx.pool)
        .await
        .unwrap();

    // What was settled stays what was settled — the settlement carries its own
    // snapshot rather than a pointer into a table that can change under it.
    let again = fx.engine.get(done.id).await.unwrap();
    assert_eq!(again.application_fee.amount_minor(), 2_000);
    assert_eq!(again.net_amount.amount_minor(), 98_000);
    assert_eq!(again.gross_amount.amount_minor(), 100_000);
    assert_eq!(
        again.pricing_snapshot_json["rate_bps"],
        serde_json::json!(200)
    );
    assert_eq!(net_credit(&fx.pool, app_fee).await, 2_000);
    assert_eq!(net_credit(&fx.pool, beneficiary).await, 98_000);

    // And a NEW settlement prices at the new rate — the snapshot is per
    // settlement, not a cache.
    let src2 = account(&fx.pool, AccountType::Liability, "Campaign Wallet 2").await;
    fund(&fx, src2, 100_000).await;
    let later = fx
        .engine
        .create(req(
            "immut-2",
            src2,
            beneficiary,
            Some(app_fee),
            100_000,
            Some(PROFILE),
        ))
        .await
        .unwrap();
    assert_eq!(later.application_fee.amount_minor(), 9_000);
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
    seed_rule(&fx.pool, "donation-zero", 0).await;
    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    fund(&fx, source, 50_000).await;

    let created = fx
        .engine
        .create(req("s2", source, beneficiary, None, 50_000, Some(PROFILE)))
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

/// Seed a SETTLEMENT rule pinned to a specific pricing profile.
///
/// A rule with no profile prices nothing, so "no applicable
/// rule" cannot be arranged by using a different business category — the
/// category stopped being a selector. It is arranged the way it actually
/// happens in production: rules exist, but none of them is for this owner.
async fn seed_profile_rule(pool: &PgPool, key: &str, profile: &str, rate_bps: i32) {
    sqlx::query(
        "INSERT INTO pricing_rules
           (id, rule_key, pricing_profile, rate_bps, environment, pricing_operation)
         VALUES ($1, $2, $3, $4, $5, 'SETTLEMENT')",
    )
    .bind(Uuid::new_v4())
    .bind(key)
    .bind(profile)
    .bind(rate_bps)
    .bind(ENV)
    .execute(pool)
    .await
    .unwrap();
}

// The companion to `zero_application_fee_net_equals_gross`. That test proves an
// explicit 0-bps rule settles at zero; this one proves the absence of any
// applicable rule does not settle at all. Without both, "fee 0" in the ledger
// has two possible meanings and no way to tell them apart afterwards.
//
// The earlier version of this test seeded a CROWDFUNDING rule and settled a
// SPACE_TOURISM category, expecting no match. That worked under V1, where the
// category selected the rule. It does not: the resolver matches on
// operation and profile, so a category rule with no profile applies to
// everyone — and the test failed with MissingFeeAccount for a 500 bps fee it
// did not expect to be charged. Which is the resolver behaving correctly and
// the fixture describing the old model.
#[sqlx::test(migrations = "../../db/migrations")]
async fn no_applicable_rule_refuses_settlement(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    // Rules exist — just not for this settlement, which carries no profile.
    seed_profile_rule(&fx.pool, "someone-elses-plan", "another-profile", 500).await;
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
            Some("assurance-unpriced"),
        ))
        .await
        .expect_err("no applicable rule must refuse, not settle for free");
    assert!(
        matches!(err, ApplicationSettlementError::PricingNotConfigured),
        "expected PricingNotConfigured, got {err:?}"
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

/// More than one applicable rule is refused, not ranked.
///
/// V1 ranked candidates by counting non-null matchers and broke ties by
/// comparing UUIDs — deterministic, and economically arbitrary. A financial tie
/// is a configuration error someone has to resolve.
///
/// The unique index covers rules with an OPEN window — at most one enabled,
/// open rule per (environment, profile, operation). It cannot cover a rule that
/// carries an end date, because a closing rule and its replacement legitimately
/// coexist. So the overlap this test builds is the one the database is unable to
/// forbid: an open rule and a still-current dated one for the same cell. Exactly
/// the case the runtime check has to catch, which is why it is tested here and
/// not left to the constraint.
#[sqlx::test(migrations = "../../db/migrations")]
async fn two_applicable_rules_refuse_rather_than_rank(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "settlement-a", 200).await;
    sqlx::query(
        "INSERT INTO pricing_rules
           (id, rule_key, pricing_profile, rate_bps, environment, pricing_operation,
            effective_from, effective_to)
         VALUES ($1, 'settlement-b', $2, 500, $3, 'SETTLEMENT',
                 now() - interval '1 day', now() + interval '1 day')",
    )
    .bind(Uuid::new_v4())
    .bind(PROFILE)
    .bind(ENV)
    .execute(&fx.pool)
    .await
    .unwrap();
    let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
    let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
    fund(&fx, source, 50_000).await;

    let err = fx
        .engine
        .create(req(
            "s-ambiguous",
            source,
            beneficiary,
            None,
            50_000,
            Some(PROFILE),
        ))
        .await
        .expect_err("an ambiguous configuration must refuse, not pick one");
    assert!(
        matches!(
            err,
            ApplicationSettlementError::PricingAmbiguous { candidates: 2 }
        ),
        "expected PricingAmbiguous with 2 candidates, got {err:?}"
    );
    assert_eq!(
        net_credit(&fx.pool, source).await,
        50_000,
        "a refused settlement moves nothing"
    );
    Ok(())
}

// ─── fee > gross rejected at create ─────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn fee_exceeding_gross_rejected(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "absurd", 20_000).await; // 200%
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
            Some(PROFILE),
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
    seed_rule(&fx.pool, "crowd-standard", 500).await;
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
            Some(PROFILE),
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
    seed_rule(&fx.pool, "crowd-standard", 500).await;
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
            Some(PROFILE),
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
            Some(PROFILE),
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
    seed_rule(&fx.pool, "crowd-standard", 500).await;
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
            Some(PROFILE),
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
    seed_rule(&fx.pool, "crowd-standard", 500).await; // 5%
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
            Some(PROFILE),
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
    seed_rule(&fx.pool, "crowd-standard", 500).await;
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
            Some(PROFILE),
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

// ─── Races: transitions are serialised, and a source is never overdrawn ─────
//
// complete() checked the balance, posted, then marked COMPLETED unconditionally.
// A cancel in between left a CANCELLED settlement whose money had moved, and two
// settlements on one source could both pass the balance check.

#[sqlx::test(migrations = "../../db/migrations")]
async fn complete_racing_cancel_leaves_money_and_status_agreeing(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "crowd-standard", 500).await;
    for round in 0..8 {
        let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
        let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
        let app_fee = account(&fx.pool, AccountType::Liability, "App Fee Account").await;
        fund(&fx, source, 10_000).await;
        let s = fx
            .engine
            .create(req(&format!("race-cc-{round}"), source, beneficiary, Some(app_fee), 10_000, Some(PROFILE)))
            .await
            .unwrap();
        let (c, x) = tokio::join!(fx.engine.complete(s.id), fx.engine.cancel(s.id));
        assert_eq!(c.is_ok() as u8 + x.is_ok() as u8, 1, "round {round}: exactly one of complete/cancel may win");
        let status = fx.engine.get(s.id).await.unwrap().status;
        let left = net_credit(&fx.pool, source).await;
        match status {
            ApplicationSettlementStatus::Completed => assert_eq!(left, 0, "round {round}: COMPLETED but the source was not debited"),
            ApplicationSettlementStatus::Cancelled => assert_eq!(left, 10_000, "round {round}: CANCELLED but money moved"),
            other => panic!("round {round}: unexpected {other:?}"),
        }
    }
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn two_settlements_never_overdraw_one_source(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "crowd-standard", 500).await;
    for round in 0..6 {
        let source = account(&fx.pool, AccountType::Liability, "Campaign Wallet").await;
        let beneficiary = account(&fx.pool, AccountType::Liability, "Beneficiary Wallet").await;
        let app_fee = account(&fx.pool, AccountType::Liability, "App Fee Account").await;
        fund(&fx, source, 10_000).await;
        let a = fx.engine.create(req(&format!("race-od-a-{round}"), source, beneficiary, Some(app_fee), 6_000, Some(PROFILE))).await.unwrap();
        let b = fx.engine.create(req(&format!("race-od-b-{round}"), source, beneficiary, Some(app_fee), 6_000, Some(PROFILE))).await.unwrap();
        let (ra, rb) = tokio::join!(fx.engine.complete(a.id), fx.engine.complete(b.id));
        assert_eq!(ra.is_ok() as u8 + rb.is_ok() as u8, 1, "round {round}: only one 6 000 settlement fits in 10 000");
        assert!(net_credit(&fx.pool, source).await >= 0, "round {round}: the source was overdrawn");
    }
    Ok(())
}
