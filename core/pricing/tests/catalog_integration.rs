// Real-DB tests for the pricing catalogs (profiles + fee policies) — ADR-021.
//
// Run: DATABASE_URL="postgres://banzami:banzami_dev@localhost:5433/banzami_dev" \
//      cargo test -p banzami-pricing --test catalog_integration

use sqlx::PgPool;

use banzami_pricing::{CatalogFilter, CatalogInput, CatalogKind, PostgresCatalogRepository};

fn input(code: &str, env: &str) -> CatalogInput {
    CatalogInput {
        code: code.into(),
        name: format!("{code} name"),
        description: Some("desc".into()),
        environment: env.into(),
        metadata: None,
    }
}

fn filter() -> CatalogFilter {
    CatalogFilter {
        limit: 200,
        ..Default::default()
    }
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn profiles_crud_and_unique(pool: PgPool) -> sqlx::Result<()> {
    let repo = PostgresCatalogRepository::new(pool);
    let k = CatalogKind::PricingProfiles;

    let p = repo.create(k, input("STANDARD", "LIVE")).await.unwrap();
    assert!(p.enabled);
    assert_eq!(p.code, "STANDARD");

    // unique (env, code)
    assert!(
        repo.create(k, input("STANDARD", "LIVE")).await.is_err(),
        "dup code rejected"
    );
    // same code, other env is fine
    repo.create(k, input("STANDARD", "SANDBOX")).await.unwrap();

    let all = repo.list(k, &filter()).await.unwrap();
    assert_eq!(all.len(), 2);

    // update descriptive fields
    let mut upd = input("IGNORED", "IGNORED");
    upd.name = "New name".into();
    let updated = repo.update(k, p.id, upd).await.unwrap();
    assert_eq!(updated.name, "New name");
    assert_eq!(updated.code, "STANDARD", "code is immutable identity");

    // disable / enable
    assert!(!repo.set_enabled(k, p.id, false).await.unwrap().enabled);
    assert!(repo.set_enabled(k, p.id, true).await.unwrap().enabled);
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn fee_policies_carry_metadata(pool: PgPool) -> sqlx::Result<()> {
    let repo = PostgresCatalogRepository::new(pool);
    let k = CatalogKind::FeePolicies;

    let mut inp = input("pol_donation_standard", "LIVE");
    inp.metadata = Some(serde_json::json!({ "owner": "ops", "note": "donations" }));
    let p = repo.create(k, inp).await.unwrap();
    assert_eq!(p.metadata["owner"], "ops");

    let got = repo.get(k, p.id).await.unwrap();
    assert_eq!(got.metadata["note"], "donations");
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn filters_by_env_status_code(pool: PgPool) -> sqlx::Result<()> {
    let repo = PostgresCatalogRepository::new(pool);
    let k = CatalogKind::PricingProfiles;
    repo.create(k, input("STANDARD", "LIVE")).await.unwrap();
    repo.create(k, input("PARTNER", "LIVE")).await.unwrap();
    let sb = repo.create(k, input("NGO", "SANDBOX")).await.unwrap();
    repo.set_enabled(k, sb.id, false).await.unwrap();

    let live = repo
        .list(
            k,
            &CatalogFilter {
                environment: Some("LIVE".into()),
                ..filter()
            },
        )
        .await
        .unwrap();
    assert_eq!(live.len(), 2);

    let enabled = repo
        .list(
            k,
            &CatalogFilter {
                enabled: Some(true),
                ..filter()
            },
        )
        .await
        .unwrap();
    assert_eq!(enabled.len(), 2);

    let disabled = repo
        .list(
            k,
            &CatalogFilter {
                enabled: Some(false),
                ..filter()
            },
        )
        .await
        .unwrap();
    assert_eq!(disabled.len(), 1);
    assert_eq!(disabled[0].code, "NGO");

    let search = repo
        .list(
            k,
            &CatalogFilter {
                code: Some("part".into()),
                ..filter()
            },
        )
        .await
        .unwrap();
    assert_eq!(search.len(), 1);
    assert_eq!(search[0].code, "PARTNER");
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn validation_rejects_empties(pool: PgPool) -> sqlx::Result<()> {
    let repo = PostgresCatalogRepository::new(pool);
    let k = CatalogKind::PricingProfiles;
    let mut bad = input("", "LIVE");
    assert!(repo.create(k, bad.clone()).await.is_err(), "empty code");
    bad = input("X", "MARS");
    assert!(repo.create(k, bad).await.is_err(), "bad env");
    Ok(())
}
