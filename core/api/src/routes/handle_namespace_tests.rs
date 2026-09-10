//! One namespace: every party that can be paid by @banza is in `handle_registry`.
//!
//! `consumers.handle` is an identity's own column. `handle_registry` is the
//! routing table every @banza lookup goes through — parties/resolve reads it and
//! nothing else. Migration 0051 backfilled consumer handles into it, so the
//! design intent is settled: one namespace, holding CONSUMER, MERCHANT,
//! APPLICATION and reserved SYSTEM names together.
//!
//! That backfill was one-time and no ongoing write followed it, so every consumer
//! onboarded afterwards was invisible to the router. All 27 in the Sandbox were.
//! @fm65 showed an ACTIVE AOA wallet holding 10 000 Kz in the Consumer app while
//! an application settlement naming @fm65 answered "beneficiary_banza_name has no
//! active wallet in this currency" — the resolver never found the handle, let
//! alone the wallet. No consumer could be a settlement beneficiary.
//!
//! The consumer app was right and the settlement was wrong.

use sqlx::PgPool;
use uuid::Uuid;

async fn ledger_account(pool: &PgPool) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency)
         VALUES (gen_random_uuid(),'LIABILITY','consumer','AOA') RETURNING id",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

/// A consumer as the onboarding path now creates one: identity, registry entry,
/// and an ACTIVE AOA wallet.
async fn onboarded_consumer(pool: &PgPool, handle: &str) -> (Uuid, Uuid) {
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO consumers (id, handle, phone_number, status, created_at, updated_at)
         VALUES ($1,$2,$3,'ACTIVE',now(),now())",
    )
    .bind(id)
    .bind(handle)
    .bind(format!("+2449{}", &id.to_string()[..8]))
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1,'CONSUMER',$2)",
    )
    .bind(handle)
    .bind(id)
    .execute(pool)
    .await
    .unwrap();
    let avail = ledger_account(pool).await;
    sqlx::query(
        "INSERT INTO consumer_wallets
             (id, consumer_id, currency, status, available_account_id, reserved_account_id,
              kyc_status, pin_hash, failed_pin_attempts, created_at, updated_at, activated_at)
         VALUES (gen_random_uuid(),$1,'AOA','ACTIVE',$2,$3,'NONE','x',0,now(),now(),now())",
    )
    .bind(id)
    .bind(avail)
    .bind(ledger_account(pool).await)
    .execute(pool)
    .await
    .unwrap();
    (id, avail)
}

/// The chain settlement walks: handle → party → consumer wallet → account.
async fn resolve_beneficiary(pool: &PgPool, handle: &str, currency: &str) -> Option<Uuid> {
    let owner: Option<(String, Option<Uuid>)> =
        sqlx::query_as("SELECT owner_type, owner_id FROM handle_registry WHERE handle = $1")
            .bind(handle)
            .fetch_optional(pool)
            .await
            .unwrap();
    let (owner_type, owner_id) = owner?;
    let owner_id = owner_id?;
    match owner_type.as_str() {
        "CONSUMER" => sqlx::query_scalar(
            "SELECT available_account_id FROM consumer_wallets
              WHERE consumer_id = $1 AND currency = $2 AND status = 'ACTIVE'",
        )
        .bind(owner_id)
        .bind(currency)
        .fetch_optional(pool)
        .await
        .unwrap()
        .flatten(),
        _ => None,
    }
}

/// THE DEFECT, as the deployed Sandbox showed it.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_consumer_with_an_active_wallet_resolves_as_a_beneficiary(pool: PgPool) {
    let (_id, avail) = onboarded_consumer(&pool, "someuser").await;
    let got = resolve_beneficiary(&pool, "someuser", "AOA").await;
    assert_eq!(
        got,
        Some(avail),
        "a consumer with an ACTIVE AOA wallet did not resolve as a settlement \
         beneficiary — this is the state where the app showed a balance and the \
         settlement answered 'no active wallet in this currency'"
    );
}

/// A handle the router cannot see is a party that cannot be paid, and a name
/// another party type could claim from under them.
#[sqlx::test(migrations = "../../db/migrations")]
async fn no_consumer_handle_may_live_outside_the_registry(pool: PgPool) {
    // Exactly the pre-fix shape: an identity with a handle and no registry row.
    let stray = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO consumers (id, handle, phone_number, status, created_at, updated_at)
         VALUES ($1,'strayuser','+244900000001','ACTIVE',now(),now())",
    )
    .bind(stray)
    .execute(&pool)
    .await
    .unwrap();

    let orphans: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM consumers c
          WHERE c.handle IS NOT NULL AND c.handle <> ''
            AND NOT EXISTS (SELECT 1 FROM handle_registry h WHERE h.handle = lower(c.handle))",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        orphans, 1,
        "the fixture did not reproduce a handle outside the registry, so the \
         invariant below would prove nothing"
    );
    assert!(
        resolve_beneficiary(&pool, "strayuser", "AOA")
            .await
            .is_none(),
        "a handle outside the registry resolved anyway — then the registry is not \
         the namespace and something else is routing payments"
    );
}

/// Uniqueness must span party types: with consumers absent from the registry, a
/// merchant could claim a name a consumer already answers to.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_consumer_handle_cannot_be_claimed_by_another_party(pool: PgPool) {
    onboarded_consumer(&pool, "taken").await;
    let merchant = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO merchants (id, name, email, status) VALUES ($1,'M','m@t.test','ACTIVE')",
    )
    .bind(merchant)
    .execute(&pool)
    .await
    .unwrap();
    let stolen = sqlx::query(
        "INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ('taken','MERCHANT',$1)",
    )
    .bind(merchant)
    .execute(&pool)
    .await;
    assert!(
        stolen.is_err(),
        "a merchant registered a handle a consumer already answers to — one @banza, two parties"
    );
}

// ── negative cases: each must stay precise, not collapse into one error ──

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_unknown_handle_does_not_resolve(pool: PgPool) {
    assert!(resolve_beneficiary(&pool, "nobodyhere", "AOA")
        .await
        .is_none());
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_registered_consumer_with_no_wallet_does_not_resolve(pool: PgPool) {
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO consumers (id, handle, phone_number, status, created_at, updated_at)
         VALUES ($1,'walletless','+244900000002','ACTIVE',now(),now())",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ('walletless','CONSUMER',$1)")
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        resolve_beneficiary(&pool, "walletless", "AOA")
            .await
            .is_none(),
        "a consumer with no wallet resolved to an account"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_wallet_in_another_currency_does_not_resolve(pool: PgPool) {
    onboarded_consumer(&pool, "aoaonly").await;
    assert!(
        resolve_beneficiary(&pool, "aoaonly", "USD").await.is_none(),
        "an AOA wallet was offered as a USD beneficiary"
    );
    assert!(resolve_beneficiary(&pool, "aoaonly", "AOA").await.is_some());
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_inactive_wallet_does_not_resolve(pool: PgPool) {
    let (id, _) = onboarded_consumer(&pool, "frozenuser").await;
    sqlx::query("UPDATE consumer_wallets SET status = 'LOCKED' WHERE consumer_id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        resolve_beneficiary(&pool, "frozenuser", "AOA")
            .await
            .is_none(),
        "a locked wallet was offered as a beneficiary"
    );
}
