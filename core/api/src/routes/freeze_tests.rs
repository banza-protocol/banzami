//! A freeze stops the frozen party's money from leaving — on every debit route,
//! not only the few that read account_freezes before. Each test freezes through
//! the operator route, proves the debit is refused and nothing moved, lifts the
//! freeze, and proves the same call is no longer refused for being frozen.

use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::{admin, payouts, qr, risk, transfers, wallet_account_transfers};
use crate::state::{AppState, CoreEnvironment};

async fn account(pool: &PgPool, ty: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency)
         VALUES ($1, $2, 'acct', 'AOA') RETURNING id",
    )
    .bind(Uuid::new_v4())
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

async fn balance(pool: &PgPool, acct: Uuid) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'CREDIT' THEN amount_minor
                                             WHEN 'DEBIT' THEN -amount_minor END),0)::BIGINT
         FROM ledger_entries WHERE account_id=$1",
    )
    .bind(acct)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn fund(pool: &PgPool, acct: Uuid, amount: i64) {
    let bank = account(pool, "ASSET").await;
    let p = Uuid::new_v4();
    sqlx::query("INSERT INTO ledger_postings (id,description,idempotency_key,created_at) VALUES ($1,'fund',$2,NOW())")
        .bind(p).bind(format!("fund-{acct}")).execute(pool).await.unwrap();
    for (a, t) in [(bank, "DEBIT"), (acct, "CREDIT")] {
        sqlx::query("INSERT INTO ledger_entries (id,posting_id,account_id,entry_type,amount_minor,currency,created_at) VALUES ($1,$2,$3,$4,$5,'AOA',NOW())")
            .bind(Uuid::new_v4()).bind(p).bind(a).bind(t).bind(amount).execute(pool).await.unwrap();
    }
}

/// Funded ACTIVE consumer with a handle. Returns (consumer id, handle, available account).
async fn consumer(pool: &PgPool, amount: i64) -> (Uuid, String, Uuid) {
    let c = Uuid::new_v4();
    let handle = format!("frz{}", &c.simple().to_string()[..8]);
    sqlx::query("INSERT INTO consumers (id, handle, status) VALUES ($1,$2,'ACTIVE')")
        .bind(c)
        .bind(&handle)
        .execute(pool)
        .await
        .unwrap();
    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    sqlx::query("INSERT INTO consumer_wallets (id,consumer_id,currency,status,available_account_id,reserved_account_id) VALUES ($1,$2,'AOA','ACTIVE',$3,$4)")
        .bind(Uuid::new_v4()).bind(c).bind(avail).bind(reserved).execute(pool).await.unwrap();
    if amount > 0 {
        fund(pool, avail, amount).await;
    }
    (c, handle, avail)
}

/// ACTIVE merchant wallet (the 0081 trigger creates its PRIMARY account). Returns
/// (merchant id, wallet id, available account).
async fn merchant(pool: &PgPool) -> (Uuid, Uuid, Uuid) {
    let m = Uuid::new_v4();
    sqlx::query("INSERT INTO merchants (id, name, email, status) VALUES ($1,'M',$2,'ACTIVE')")
        .bind(m)
        .bind(format!("{m}@t.test"))
        .execute(pool)
        .await
        .unwrap();
    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    let w = Uuid::new_v4();
    sqlx::query("INSERT INTO wallets (id,merchant_id,currency,status,available_account_id,reserved_account_id) VALUES ($1,$2,'AOA','ACTIVE',$3,$4)")
        .bind(w).bind(m).bind(avail).bind(reserved).execute(pool).await.unwrap();
    (m, w, avail)
}

async fn freeze(state: &AppState, ty: &str, id: Uuid) {
    let _ = admin::freeze_account(
        State(state.clone()),
        Json(admin::FreezeBody {
            entity_type: ty.into(),
            entity_id: id.to_string(),
            reason: "assurance test".into(),
            frozen_by: Some("test".into()),
        }),
    )
    .await
    .map_err(|e| e.message)
    .expect("freeze");
}

async fn lift(state: &AppState, ty: &str, id: Uuid) {
    let _ = admin::unfreeze_account(
        State(state.clone()),
        Path((ty.to_string(), id.to_string())),
        Json(admin::UnfreezeBody {
            reason: "assurance test".into(),
            lifted_by: Some("test".into()),
        }),
    )
    .await
    .map_err(|e| e.message)
    .expect("lift");
}

fn code<T>(r: &crate::error::ApiResult<T>) -> Option<&'static str> {
    r.as_ref().err().map(|e| e.code)
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_frozen_consumer_sends_nothing_by_id(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (c, _, avail) = consumer(&pool, 100_000).await;
    let (_, wallet, merchant_avail) = merchant(&pool).await;
    let body = || transfers::SendTransferBody {
        idempotency_key: "frz-send-1".into(),
        sender_id: c.to_string(),
        recipient_id: wallet.to_string(),
        amount_minor: 40_000,
        currency: "AOA".into(),
        description: None,
        recipient_account_id: None,
    };

    freeze(&state, "CONSUMER", c).await;
    let r = transfers::send(State(state.clone()), Json(body())).await;
    assert_eq!(code(&r), Some("ACCOUNT_FROZEN"));
    assert_eq!(
        balance(&pool, avail).await,
        100_000,
        "a frozen sender's money moved"
    );
    assert_eq!(balance(&pool, merchant_avail).await, 0);

    lift(&state, "CONSUMER", c).await;
    let r = transfers::send(State(state.clone()), Json(body())).await;
    assert!(
        r.is_ok(),
        "after the lift the same transfer goes through: {:?}",
        code(&r)
    );
    assert_eq!(balance(&pool, avail).await, 60_000);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_frozen_consumer_sends_nothing_by_handle(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (c, sender, avail) = consumer(&pool, 100_000).await;
    let (_, recipient, recipient_avail) = consumer(&pool, 0).await;
    let body = || transfers::SendP2pBody {
        idempotency_key: "frz-p2p-1".into(),
        sender: sender.clone(),
        recipient: recipient.clone(),
        amount_minor: 25_000,
        currency: "AOA".into(),
        note: None,
    };

    freeze(&state, "CONSUMER", c).await;
    let r = transfers::send_p2p(State(state.clone()), Json(body())).await;
    assert_eq!(code(&r), Some("ACCOUNT_FROZEN"));
    assert_eq!(balance(&pool, avail).await, 100_000);
    assert_eq!(balance(&pool, recipient_avail).await, 0);

    lift(&state, "CONSUMER", c).await;
    let r = transfers::send_p2p(State(state.clone()), Json(body())).await;
    assert!(
        r.is_ok(),
        "after the lift the same transfer goes through: {:?}",
        code(&r)
    );
    assert_eq!(balance(&pool, recipient_avail).await, 25_000);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_frozen_merchant_withdraws_nothing(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (m, w, avail) = merchant(&pool).await;
    fund(&pool, avail, 500_000).await;
    let body = || payouts::InitiateBody {
        idempotency_key: "frz-payout-1".into(),
        merchant_id: m.to_string(),
        wallet_id: w.to_string(),
        amount_minor: 100_000,
        currency: "AOA".into(),
        bank_account_number: "AO06000000000000000000000".into(),
        bank_code: "0040".into(),
        account_holder_name: "M".into(),
    };

    freeze(&state, "MERCHANT", m).await;
    let r = payouts::initiate(State(state.clone()), Json(body())).await;
    assert_eq!(code(&r), Some("ACCOUNT_FROZEN"));
    assert_eq!(balance(&pool, avail).await, 500_000);

    lift(&state, "MERCHANT", m).await;
    let r = payouts::initiate(State(state.clone()), Json(body())).await;
    assert_ne!(code(&r), Some("ACCOUNT_FROZEN"));
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_frozen_merchant_moves_nothing_between_its_accounts(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (m, w, _) = merchant(&pool).await;
    let primary: Uuid = sqlx::query_scalar(
        "SELECT id FROM wallet_accounts WHERE wallet_id=$1 AND purpose='PRIMARY'",
    )
    .bind(w)
    .fetch_one(&pool)
    .await
    .unwrap();
    let body = || wallet_account_transfers::CreateBody {
        merchant_id: m.to_string(),
        source_wallet_account_id: primary.to_string(),
        destination_wallet_account_id: Uuid::new_v4().to_string(),
        amount_minor: 1_000,
        currency: "AOA".into(),
        idempotency_key: "frz-wat-1".into(),
        description: None,
    };

    freeze(&state, "MERCHANT", m).await;
    let r = wallet_account_transfers::create(State(state.clone()), Json(body())).await;
    assert_eq!(code(&r), Some("ACCOUNT_FROZEN"));

    lift(&state, "MERCHANT", m).await;
    let r = wallet_account_transfers::create(State(state.clone()), Json(body())).await;
    assert_ne!(code(&r), Some("ACCOUNT_FROZEN"));
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_frozen_consumer_pays_no_qr(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (c, payer, avail) = consumer(&pool, 100_000).await;
    let (owner, _, owner_avail) = consumer(&pool, 0).await;
    let (_, Json(created)) = qr::create_static(
        State(state.clone()),
        Json(qr::CreateStaticQrBody {
            owner_id: owner.to_string(),
            owner_type: "CONSUMER".into(),
            currency: "AOA".into(),
            amount_minor: None,
        }),
    )
    .await
    .map_err(|e| e.message)
    .expect("static QR");
    let payload = created["payload"].as_str().expect("payload").to_string();
    let body = || qr::PayQrBody {
        idempotency_key: "frz-qr-1".into(),
        payer: payer.clone(),
        payload: payload.clone(),
        amount_minor: Some(10_000),
        note: None,
        device_id: None,
    };

    freeze(&state, "CONSUMER", c).await;
    let r = qr::pay(State(state.clone()), Json(body())).await;
    assert_eq!(code(&r), Some("ACCOUNT_FROZEN"));
    assert_eq!(balance(&pool, avail).await, 100_000);
    assert_eq!(balance(&pool, owner_avail).await, 0);

    // The next gate (KYC) now answers instead: the freeze no longer refuses.
    lift(&state, "CONSUMER", c).await;
    let r = qr::pay(State(state.clone()), Json(body())).await;
    assert_ne!(code(&r), Some("ACCOUNT_FROZEN"));
}

/// The freeze read used to fall back to "not frozen" on any database error.
#[sqlx::test(migrations = "../../db/migrations")]
async fn an_unreadable_freeze_refuses(pool: PgPool) {
    let id = Uuid::new_v4();
    pool.close().await;
    assert!(risk::is_frozen(&pool, "CONSUMER", id).await.is_err());
    let r = risk::ensure_not_frozen(&pool, "CONSUMER", id).await;
    assert!(r.is_err(), "an unreadable freeze must refuse, not allow");
}

// A freeze is total: a frozen party receives nothing either.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_frozen_consumer_receives_nothing(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (_, sender, sender_avail) = consumer(&pool, 100_000).await;
    let (frozen, recipient, recipient_avail) = consumer(&pool, 0).await;
    freeze(&state, "CONSUMER", frozen).await;
    let r = transfers::send_p2p(
        State(state.clone()),
        Json(transfers::SendP2pBody {
            idempotency_key: "frz-in-1".into(),
            sender,
            recipient,
            amount_minor: 10_000,
            currency: "AOA".into(),
            note: None,
        }),
    )
    .await;
    assert_eq!(code(&r), Some("ACCOUNT_FROZEN"));
    assert_eq!(balance(&pool, sender_avail).await, 100_000);
    assert_eq!(balance(&pool, recipient_avail).await, 0);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_frozen_merchant_receives_nothing(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (payer, _, payer_avail) = consumer(&pool, 100_000).await;
    let (m, wallet, merchant_avail) = merchant(&pool).await;
    freeze(&state, "MERCHANT", m).await;
    let r = transfers::send(
        State(state.clone()),
        Json(transfers::SendTransferBody {
            idempotency_key: "frz-in-2".into(),
            sender_id: payer.to_string(),
            recipient_id: wallet.to_string(),
            amount_minor: 10_000,
            currency: "AOA".into(),
            description: None,
            recipient_account_id: None,
        }),
    )
    .await;
    assert_eq!(code(&r), Some("ACCOUNT_FROZEN"));
    assert_eq!(balance(&pool, payer_avail).await, 100_000);
    assert_eq!(balance(&pool, merchant_avail).await, 0);

    lift(&state, "MERCHANT", m).await;
    let r = transfers::send(
        State(state.clone()),
        Json(transfers::SendTransferBody {
            idempotency_key: "frz-in-2".into(),
            sender_id: payer.to_string(),
            recipient_id: wallet.to_string(),
            amount_minor: 10_000,
            currency: "AOA".into(),
            description: None,
            recipient_account_id: None,
        }),
    )
    .await;
    assert!(
        r.is_ok(),
        "after the lift the payment goes through: {:?}",
        code(&r)
    );
    assert_eq!(balance(&pool, merchant_avail).await, 10_000);
}
