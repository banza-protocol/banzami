//! Readiness and settlement must give the same answer.
//!
//! The defect this file exists to prevent: a readiness view that said READY
//! while settlement refused with FEE_DESTINATION_TYPE_NOT_ALLOWED. It happened
//! because readiness was computed by a second copy of the rules. Every case below
//! therefore asks BOTH — the readiness route and a real settlement create over
//! the same owner — and requires them to agree, including on the refusal code.

use axum::{extract::State, Json};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::application_settlements as settle;
use crate::routes::settlement_readiness::{
    settlement_readiness, FeeDestinationInput, Readiness, ReadinessBody,
};
use crate::state::{AppState, CoreEnvironment};

async fn ledger_account(pool: &PgPool, ty: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency)
         VALUES ($1, $2, 'readiness', 'AOA') RETURNING id",
    )
    .bind(Uuid::new_v4())
    .bind(ty)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn build_state(pool: PgPool) -> AppState {
    let transit = ledger_account(&pool, "ASSET").await;
    let bank = ledger_account(&pool, "ASSET").await;
    let fee = ledger_account(&pool, "REVENUE").await;
    AppState::new(
        pool,
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        AccountId::from_uuid(fee),
        CoreEnvironment::Sandbox,
    )
}

async fn fund(pool: &PgPool, account_id: Uuid, amount: i64) {
    let funding = ledger_account(pool, "ASSET").await;
    let posting = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, 'fund', $2, NOW())",
    )
    .bind(posting)
    .bind(format!("fund-{account_id}"))
    .execute(pool)
    .await
    .unwrap();
    for (acc, ty) in [(funding, "DEBIT"), (account_id, "CREDIT")] {
        sqlx::query(
            "INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
             VALUES ($1, $2, $3, $4, $5, 'AOA', NOW())",
        )
        .bind(Uuid::new_v4())
        .bind(posting)
        .bind(acc)
        .bind(ty)
        .bind(amount)
        .execute(pool)
        .await
        .unwrap();
    }
}

struct Owner {
    merchant: Uuid,
    own_account: Uuid,
}

/// A financial owner the way the platform actually builds one: a Business
/// Account of `account_type` with `kyb`, an ACTIVE AOA wallet, a registered
/// @banza, and (optionally) an operator-assigned pricing profile.
async fn owner(
    pool: &PgPool,
    account_type: &str,
    kyb: &str,
    profile: Option<&str>,
    with_handle: bool,
) -> Owner {
    let m = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO merchants (id, name, email, status, business_account_type)
         VALUES ($1, 'Readiness Owner', $2, 'ACTIVE', $3)",
    )
    .bind(m)
    .bind(format!("r-{m}@example.test"))
    .bind(account_type)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO merchant_compliance (merchant_id, kyb_status, aml_status) VALUES ($1, $2, 'APPROVED')",
    )
    .bind(m)
    .bind(kyb)
    .execute(pool)
    .await
    .unwrap();
    let avail = ledger_account(pool, "LIABILITY").await;
    let reserved = ledger_account(pool, "LIABILITY").await;
    sqlx::query(
        "INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id)
         VALUES ($1, $2, 'AOA', 'ACTIVE', $3, $4)",
    )
    .bind(Uuid::new_v4())
    .bind(m)
    .bind(avail)
    .bind(reserved)
    .execute(pool)
    .await
    .unwrap();
    if with_handle {
        sqlx::query(
            "INSERT INTO handle_registry (handle, owner_type, owner_id, created_at)
             VALUES ($1, 'MERCHANT', $2, now())",
        )
        .bind(format!("r{}", &m.simple().to_string()[..12]))
        .bind(m)
        .execute(pool)
        .await
        .unwrap();
    }
    if let Some(code) = profile {
        sqlx::query(
            "UPDATE merchants SET pricing_profile_id =
               (SELECT id FROM pricing_profiles WHERE code = $2 AND environment = 'SANDBOX')
             WHERE id = $1",
        )
        .bind(m)
        .bind(code)
        .execute(pool)
        .await
        .unwrap();
    }
    Owner {
        merchant: m,
        own_account: avail,
    }
}

async fn readiness(state: &AppState, o: &Owner) -> Readiness {
    let Json(r) = settlement_readiness(
        State(state.clone()),
        Json(ReadinessBody {
            merchant_id: o.merchant.to_string(),
            currency: None,
            fee_destination: None,
        }),
    )
    .await
    .unwrap();
    r
}

/// A real settlement create for this owner, naming its own account as the fee
/// destination — exactly what an application does.
async fn settle_for(state: &AppState, pool: &PgPool, o: &Owner, profile: Option<&str>) -> Result<serde_json::Value, &'static str> {
    let source = ledger_account(pool, "LIABILITY").await;
    let beneficiary = ledger_account(pool, "LIABILITY").await;
    fund(pool, source, 100_000).await;
    let mut body = serde_json::json!({
        "idempotency_key": format!("rdy-{}", Uuid::new_v4()),
        "owner_ref": "readiness",
        "source_account_id": source.to_string(),
        "beneficiary_account_id": beneficiary.to_string(),
        "application_fee_account_id": o.own_account.to_string(),
        "gross_amount_minor": 100_000,
        "currency": "AOA",
    });
    if let Some(p) = profile {
        body["pricing_profile"] = serde_json::json!(p);
    }
    match settle::create(State(state.clone()), Json(serde_json::from_value(body).unwrap())).await {
        Ok((_, Json(v))) => Ok(v),
        Err(e) => Err(e.code),
    }
}

/// The one invariant: readiness READY ⇔ settlement accepted, and a refusal is
/// the same code in both.
async fn assert_agree(state: &AppState, pool: &PgPool, o: &Owner, profile: Option<&str>) -> Readiness {
    let r = readiness(state, o).await;
    let s = settle_for(state, pool, o, profile).await;
    assert_eq!(
        r.settlement.ready,
        s.is_ok(),
        "readiness said ready={} but settlement returned {:?} (blockers {:?})",
        r.settlement.ready,
        s.as_ref().err(),
        r.settlement.blockers
    );
    if let Err(code) = s {
        assert!(
            r.settlement.blockers.contains(&code),
            "settlement refused with {code}; readiness reported {:?}",
            r.settlement.blockers
        );
    }
    r
}

// ── the cases ───────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_eligible_priced_application_is_ready_and_settles(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let o = owner(&pool, "APPLICATION", "APPROVED", Some("sandbox-reference"), true).await;
    let r = assert_agree(&state, &pool, &o, Some("sandbox-reference")).await;
    assert!(r.settlement.ready);
    assert!(r.settlement.blockers.is_empty());
    assert_eq!(r.pricing.profile.as_deref(), Some("sandbox-reference"));
    assert_eq!(r.pricing.settlement_bps, Some(200));
    assert_eq!(r.pricing.payout_bps, Some(75));
    assert!(r.fee_destination.required);
    assert!(r.fee_destination.resolved && r.fee_destination.owned_by_project);
    assert!(r.fee_destination.kyb_approved && r.fee_destination.wallet_active);
    assert!(r.fee_destination.type_allowed && r.fee_destination.eligible);
    assert!(!r.fee_destination.application_account_required);
    assert_eq!(r.kyb.status, "APPROVED");
    assert!(r.wallet.ready);
}

// The DOA shape before an operator classified it: priced, and a plain MERCHANT.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_priced_merchant_is_blocked_on_type_by_both(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let o = owner(&pool, "MERCHANT", "APPROVED", Some("sandbox-reference"), true).await;
    let r = assert_agree(&state, &pool, &o, Some("sandbox-reference")).await;
    assert_eq!(r.settlement.blockers, vec!["FEE_DESTINATION_TYPE_NOT_ALLOWED"]);
    assert!(!r.fee_destination.type_allowed);
    assert!(r.fee_destination.resolved && r.fee_destination.kyb_approved);
}

// An ordinary Project: MERCHANT, zero-rate profile. No fee, so the destination
// is not a prerequisite — and settlement no longer validates one it will not use.
#[sqlx::test(migrations = "../../db/migrations")]
async fn an_ordinary_zero_rate_merchant_is_ready_and_settles_at_zero(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let o = owner(&pool, "MERCHANT", "APPROVED", Some("sandbox-default"), true).await;
    let r = assert_agree(&state, &pool, &o, Some("sandbox-default")).await;
    assert!(r.settlement.ready, "blockers {:?}", r.settlement.blockers);
    assert_eq!(r.pricing.settlement_bps, Some(0));
    assert_eq!(r.pricing.payout_bps, Some(75));
    assert!(!r.fee_destination.required);
    // Reported truthfully, but blocking nothing.
    assert!(!r.fee_destination.type_allowed);
    assert_eq!(r.fee_destination.blocker, Some("FEE_DESTINATION_TYPE_NOT_ALLOWED"));

    let s = settle_for(&state, &pool, &o, Some("sandbox-default")).await.unwrap();
    assert_eq!(s["application_fee"]["amount_minor"], 0);
    assert_eq!(s["net_amount"]["amount_minor"], 100_000);
    assert!(
        s["application_fee_account_id"].is_null(),
        "no fee, so no fee destination is recorded"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_unapproved_kyb_blocks_a_fee_bearing_owner_in_both(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let o = owner(&pool, "APPLICATION", "PENDING", Some("sandbox-reference"), true).await;
    let r = assert_agree(&state, &pool, &o, Some("sandbox-reference")).await;
    assert_eq!(r.settlement.blockers, vec!["FEE_DESTINATION_KYB_NOT_APPROVED"]);
    assert_eq!(r.kyb.status, "PENDING");
}

// Unpriced is not free: no rule applies, and both refuse rather than charge 0.
#[sqlx::test(migrations = "../../db/migrations")]
async fn an_unpriced_owner_is_blocked_on_pricing_in_both(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let o = owner(&pool, "APPLICATION", "APPROVED", None, true).await;
    let r = assert_agree(&state, &pool, &o, None).await;
    assert_eq!(r.settlement.blockers, vec!["PRICING_NOT_CONFIGURED"]);
    assert!(!r.pricing.configured);
    assert_eq!(r.pricing.profile, None);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_owner_without_a_handle_cannot_name_itself_as_fee_destination(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let o = owner(&pool, "APPLICATION", "APPROVED", Some("sandbox-reference"), false).await;
    let r = readiness(&state, &o).await;
    assert_eq!(r.settlement.blockers, vec!["FEE_DESTINATION_NOT_FOUND"]);
    assert_eq!(r.financial_identity.handle, None);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_stranger_s_destination_is_not_owned_and_its_state_is_not_reported(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let me = owner(&pool, "APPLICATION", "APPROVED", Some("sandbox-reference"), true).await;
    let stranger = owner(&pool, "APPLICATION", "APPROVED", Some("sandbox-reference"), true).await;
    let Json(r) = settlement_readiness(
        State(state),
        Json(ReadinessBody {
            merchant_id: me.merchant.to_string(),
            currency: None,
            fee_destination: Some(FeeDestinationInput {
                handle: "stranger".into(),
                account_id: Some(stranger.own_account.to_string()),
                owned: false,
            }),
        }),
    )
    .await
    .unwrap();
    assert_eq!(r.settlement.blockers, vec!["FEE_DESTINATION_NOT_OWNED"]);
    assert!(!r.fee_destination.owned_by_project);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_owner_without_a_wallet_is_not_ready(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let o = owner(&pool, "APPLICATION", "APPROVED", Some("sandbox-reference"), true).await;
    sqlx::query("UPDATE wallets SET status = 'SUSPENDED' WHERE merchant_id = $1")
        .bind(o.merchant)
        .execute(&pool)
        .await
        .unwrap();
    let r = readiness(&state, &o).await;
    assert!(r.settlement.blockers.contains(&"WALLET_MISSING"));
    assert!(!r.wallet.ready);
}

// A fee resolved and no destination named: a precise refusal, not
// "application_fee_account_id is required for this category".
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_fee_with_no_destination_is_refused_precisely(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let source = ledger_account(&pool, "LIABILITY").await;
    let beneficiary = ledger_account(&pool, "LIABILITY").await;
    fund(&pool, source, 100_000).await;
    let e = settle::create(
        State(state),
        Json(
            serde_json::from_value(serde_json::json!({
                "idempotency_key": "no-dest",
                "owner_ref": "x",
                "source_account_id": source.to_string(),
                "beneficiary_account_id": beneficiary.to_string(),
                "gross_amount_minor": 100_000,
                "currency": "AOA",
                "pricing_profile": "sandbox-reference"
            }))
            .unwrap(),
        ),
    )
    .await
    .unwrap_err();
    assert_eq!(e.code, "FEE_DESTINATION_REQUIRED");
}

// The response is projected onto a public contract as-is, so it may carry no
// internal identifier of any kind.
#[sqlx::test(migrations = "../../db/migrations")]
async fn the_readiness_response_carries_no_internal_identifier(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let o = owner(&pool, "APPLICATION", "APPROVED", Some("sandbox-reference"), true).await;
    let raw = serde_json::to_string(&readiness(&state, &o).await).unwrap();
    for leaked in [o.merchant.to_string(), o.own_account.to_string()] {
        assert!(!raw.contains(&leaked), "readiness leaked {leaked}: {raw}");
    }
    let uuid_shape = regex_lite_uuid(&raw);
    assert!(uuid_shape.is_none(), "readiness carries a UUID: {uuid_shape:?}");
}

fn regex_lite_uuid(s: &str) -> Option<String> {
    // 8-4-4-4-12 hex, without pulling a regex crate into the test build.
    let b = s.as_bytes();
    for i in 0..b.len().saturating_sub(36) {
        let w = &b[i..i + 36];
        let ok = w.iter().enumerate().all(|(j, c)| match j {
            8 | 13 | 18 | 23 => *c == b'-',
            _ => c.is_ascii_hexdigit(),
        });
        if ok {
            return Some(String::from_utf8_lossy(w).into_owned());
        }
    }
    None
}
