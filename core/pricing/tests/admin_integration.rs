// Real-DB tests for the pricing-rules admin repository (Banzami ADR-021).
//
// Run: DATABASE_URL="postgres://banzami:banzami_dev@localhost:5433/banzami_dev" \
//      cargo test -p banzami-pricing --test admin_integration

use sqlx::PgPool;
use uuid::Uuid;

use banzami_pricing::{PostgresPricingRuleAdminRepository, PricingRuleFilter, PricingRuleInput};
use banzami_types::PricingRuleId;

/// A rule the canonical model accepts: it names the profile it belongs to and
/// the operation it prices. `business_category` is deliberately absent — it is
/// descriptive KYB data and carries no pricing authority, so a rule keyed on it
/// would select nothing.
fn input(key: &str, env: &str, profile: &str, bps: i32) -> PricingRuleInput {
    PricingRuleInput {
        rule_key: key.into(),
        environment: env.into(),
        business_category: None,
        pricing_profile: Some(profile.into()),
        fee_policy_ref: None,
        currency: Some("AOA".into()),
        country: None,
        transaction_type: None,
        pricing_operation: "SETTLEMENT".into(),
        rate_bps: bps,
        flat_minor: 0,
        min_fee_minor: None,
        max_fee_minor: None,
        rounding: "HALF_UP".into(),
        priority: 0,
        effective_from: None,
        effective_to: None,
        description: Some("test".into()),
    }
}

fn filter() -> PricingRuleFilter {
    PricingRuleFilter {
        limit: 200,
        ..Default::default()
    }
}

/// The database is not empty after migration.
///
/// The canonical matrix seeds four SANDBOX rules — sandbox-default and
/// sandbox-reference, each priced for SETTLEMENT and PAYOUT — because "no rule"
/// and "a rule that says zero" have to be different states. Tests that counted
/// every row were counting those too. The seeds are correct; an unscoped count
/// is what was wrong, so these helpers scope each assertion to what the test
/// itself created.
fn live_filter() -> PricingRuleFilter {
    PricingRuleFilter {
        environment: Some("LIVE".into()),
        ..filter()
    }
}

fn key_filter(key: &str) -> PricingRuleFilter {
    PricingRuleFilter {
        rule_key: Some(key.into()),
        ..filter()
    }
}

/// Mark a rule as "used" by inserting an app_settlements row referencing it
/// (app_settlements.pricing_rule_id has no FK; any UUID is accepted).
async fn mark_used(pool: &PgPool, rule_id: PricingRuleId, key: &str) {
    sqlx::query(
        "INSERT INTO app_settlements
           (id, owner_ref, source_account_id, beneficiary_account_id, gross_amount_minor,
            application_fee_minor, net_amount_minor, currency, pricing_rule_id, engine_version,
            pricing_snapshot_json, idempotency_key)
         VALUES ($1,'c1',$2,$3,1000,0,1000,'AOA',$4,1,'{}'::jsonb,$5)",
    )
    .bind(Uuid::new_v4())
    .bind(Uuid::new_v4())
    .bind(Uuid::new_v4())
    .bind(rule_id.as_uuid())
    .bind(format!("used-{key}"))
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn create_get_list(pool: PgPool) -> sqlx::Result<()> {
    let repo = PostgresPricingRuleAdminRepository::new(pool.clone());
    let r = repo
        .create(input("donation-standard", "LIVE", "live-standard", 200))
        .await
        .unwrap();
    assert_eq!(r.version, 1);
    assert!(r.enabled);
    assert!(!r.used);
    assert_eq!(r.rate_bps, 200);

    let got = repo.get(r.id).await.unwrap();
    assert_eq!(got.rule_key, "donation-standard");

    let all = repo.list(&live_filter()).await.unwrap();
    assert_eq!(all.len(), 1, "exactly the one LIVE rule this test created");
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn duplicate_key_create_is_rejected(pool: PgPool) -> sqlx::Result<()> {
    let repo = PostgresPricingRuleAdminRepository::new(pool.clone());
    repo.create(input("k", "LIVE", "live-standard", 200))
        .await
        .unwrap();
    let err = repo.create(input("k", "LIVE", "live-standard", 300)).await;
    assert!(
        err.is_err(),
        "duplicate rule_key in same env must be rejected"
    );
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn update_unused_rule_edits_in_place(pool: PgPool) -> sqlx::Result<()> {
    let repo = PostgresPricingRuleAdminRepository::new(pool.clone());
    let r = repo
        .create(input("k", "LIVE", "live-standard", 200))
        .await
        .unwrap();

    let updated = repo
        .update(r.id, input("k", "LIVE", "live-standard", 250))
        .await
        .unwrap();
    assert_eq!(updated.id, r.id, "same row edited in place");
    assert_eq!(updated.version, 1, "version unchanged");
    assert_eq!(updated.rate_bps, 250);

    // still exactly one row for the key — asserted BY key, which is what the
    // claim actually is; counting the whole table also counted the seeds.
    let all = repo.list(&key_filter("k")).await.unwrap();
    assert_eq!(all.len(), 1);
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn update_used_rule_creates_new_version_and_disables_old(pool: PgPool) -> sqlx::Result<()> {
    let repo = PostgresPricingRuleAdminRepository::new(pool.clone());
    let v1 = repo
        .create(input("k", "LIVE", "live-standard", 200))
        .await
        .unwrap();
    mark_used(&pool, v1.id, "k").await;
    assert!(repo.get(v1.id).await.unwrap().used);

    let v2 = repo
        .update(v1.id, input("k", "LIVE", "live-standard", 500))
        .await
        .unwrap();
    assert_ne!(v2.id, v1.id, "a NEW row is created");
    assert_eq!(v2.version, 2);
    assert_eq!(v2.rate_bps, 500);
    assert!(v2.enabled);

    // old version preserved + disabled (auditable, snapshot still valid)
    let old = repo.get(v1.id).await.unwrap();
    assert!(!old.enabled, "old used version disabled");
    assert_eq!(old.rate_bps, 200, "old version unchanged");

    let history = repo.versions("LIVE", "k").await.unwrap();
    assert_eq!(history.len(), 2);
    assert_eq!(history[0].version, 2, "newest first");
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn disable_then_enable(pool: PgPool) -> sqlx::Result<()> {
    let repo = PostgresPricingRuleAdminRepository::new(pool.clone());
    let r = repo
        .create(input("k", "LIVE", "live-standard", 200))
        .await
        .unwrap();
    assert!(!repo.set_enabled(r.id, false).await.unwrap().enabled);
    assert!(repo.set_enabled(r.id, true).await.unwrap().enabled);
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn duplicate_into_new_key(pool: PgPool) -> sqlx::Result<()> {
    let repo = PostgresPricingRuleAdminRepository::new(pool.clone());
    let src = repo
        .create(input("k", "LIVE", "live-standard", 200))
        .await
        .unwrap();
    let dup = repo.duplicate(src.id, "k-copy".into()).await.unwrap();
    assert_eq!(dup.rule_key, "k-copy");
    assert_eq!(dup.version, 1);
    assert_eq!(dup.rate_bps, 200);
    assert_ne!(dup.id, src.id);
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn filters_by_env_profile_status(pool: PgPool) -> sqlx::Result<()> {
    let repo = PostgresPricingRuleAdminRepository::new(pool.clone());
    repo.create(input("a", "LIVE", "live-standard", 200))
        .await
        .unwrap();
    repo.create(input("b", "LIVE", "live-marketplace", 300))
        .await
        .unwrap();
    let sb = repo
        .create(input("c", "SANDBOX", "sandbox-probe", 100))
        .await
        .unwrap();
    repo.set_enabled(sb.id, false).await.unwrap();

    let live = repo
        .list(&PricingRuleFilter {
            environment: Some("LIVE".into()),
            ..filter()
        })
        .await
        .unwrap();
    assert_eq!(live.len(), 2);

    // Filtering is by PROFILE, which is what actually selects a rule. The
    // category filter still exists on the admin surface for descriptive search,
    // but no rule is keyed on a category any more, so it selects nothing.
    let standard = repo
        .list(&PricingRuleFilter {
            pricing_profile: Some("live-standard".into()),
            ..filter()
        })
        .await
        .unwrap();
    assert_eq!(standard.len(), 1);
    assert_eq!(standard[0].rule_key, "a");

    let by_category = repo
        .list(&PricingRuleFilter {
            business_category: Some("DONATION".into()),
            ..filter()
        })
        .await
        .unwrap();
    assert!(
        by_category.is_empty(),
        "a business category must not select a pricing rule"
    );

    let disabled = repo
        .list(&PricingRuleFilter {
            enabled: Some(false),
            ..filter()
        })
        .await
        .unwrap();
    assert_eq!(disabled.len(), 1);
    assert_eq!(disabled[0].rule_key, "c");
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn validation_rejects_bad_input(pool: PgPool) -> sqlx::Result<()> {
    let repo = PostgresPricingRuleAdminRepository::new(pool.clone());

    let mut bad = input("k", "LIVE", "live-standard", -1);
    assert!(repo.create(bad.clone()).await.is_err(), "negative rate");

    bad = input("k", "LIVE", "live-standard", 200);
    bad.min_fee_minor = Some(500);
    bad.max_fee_minor = Some(100);
    assert!(repo.create(bad.clone()).await.is_err(), "min > max");

    bad = input("k", "LIVE", "live-standard", 200);
    bad.rounding = "WONKY".into();
    assert!(repo.create(bad.clone()).await.is_err(), "bad rounding");

    bad = input("k", "BADENV", "live-standard", 200);
    assert!(repo.create(bad).await.is_err(), "bad environment");
    Ok(())
}
