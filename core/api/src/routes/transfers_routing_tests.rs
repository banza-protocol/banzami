//! ADR-030: the internal transfer route honours `recipient_account_id` (set from a
//! Payment Session's payment link), crediting the segregated campaign account — and
//! falls back to the wallet's default account when absent (legacy links). The engine
//! itself is covered by banzami-transfers/tests/wallet_account_routing.rs; these
//! tests prove the ROUTE parses the field and threads it through.

use axum::{extract::State, Json};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::transfers::{self as routes, SendTransferBody};
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
    let operator_fee = account(&pool, "REVENUE").await;
    AppState::new(
        pool,
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        AccountId::from_uuid(operator_fee),
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

/// Funded consumer (the payer). Returns consumer id.
async fn funded_consumer(pool: &PgPool, amount: i64) -> Uuid {
    let c = Uuid::new_v4();
    sqlx::query("INSERT INTO consumers (id, handle, status) VALUES ($1,$2,'ACTIVE')")
        .bind(c)
        .bind(format!("payer_{}", &c.to_string()[..8]))
        .execute(pool)
        .await
        .unwrap();
    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    sqlx::query("INSERT INTO consumer_wallets (id,consumer_id,currency,status,available_account_id,reserved_account_id) VALUES ($1,$2,'AOA','ACTIVE',$3,$4)")
        .bind(Uuid::new_v4()).bind(c).bind(avail).bind(reserved).execute(pool).await.unwrap();
    let bank = account(pool, "ASSET").await;
    let p = Uuid::new_v4();
    sqlx::query("INSERT INTO ledger_postings (id,description,idempotency_key,created_at) VALUES ($1,'fund',$2,NOW())")
        .bind(p).bind(format!("fund-{c}")).execute(pool).await.unwrap();
    for (a, t) in [(bank, "DEBIT"), (avail, "CREDIT")] {
        sqlx::query("INSERT INTO ledger_entries (id,posting_id,account_id,entry_type,amount_minor,currency,created_at) VALUES ($1,$2,$3,$4,$5,'AOA',NOW())")
            .bind(Uuid::new_v4()).bind(p).bind(a).bind(t).bind(amount).execute(pool).await.unwrap();
    }
    c
}

/// Merchant wallet (0081 trigger creates PRIMARY). Returns (wallet_id, available account).
async fn merchant_wallet(pool: &PgPool) -> (Uuid, Uuid) {
    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    let wid = Uuid::new_v4();
    sqlx::query("INSERT INTO wallets (id,merchant_id,currency,status,available_account_id,reserved_account_id) VALUES ($1,$2,'AOA','ACTIVE',$3,$4)")
        .bind(wid).bind(Uuid::new_v4()).bind(avail).bind(reserved).execute(pool).await.unwrap();
    (wid, avail)
}

async fn campaign_account(pool: &PgPool, wallet_id: Uuid) -> (Uuid, Uuid) {
    let merchant: Uuid = sqlx::query_scalar("SELECT merchant_id FROM wallets WHERE id=$1")
        .bind(wallet_id)
        .fetch_one(pool)
        .await
        .unwrap();
    let acct = account(pool, "LIABILITY").await;
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO wallet_accounts (id,wallet_id,account_id,merchant_id,currency,purpose,status,label) VALUES ($1,$2,$3,$4,'AOA','CAMPAIGN','ACTIVE','c')")
        .bind(id).bind(wallet_id).bind(acct).bind(merchant).execute(pool).await.unwrap();
    (id, acct)
}

fn body(
    sender: Uuid,
    wallet: Uuid,
    recipient_account_id: Option<Uuid>,
    key: &str,
) -> SendTransferBody {
    SendTransferBody {
        idempotency_key: key.to_string(),
        sender_id: sender.to_string(),
        recipient_id: wallet.to_string(),
        amount_minor: 50_000,
        currency: "AOA".into(),
        description: Some("Payment link".into()),
        recipient_account_id: recipient_account_id.map(|u| u.to_string()),
    }
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn route_credits_campaign_account_when_set(pool: PgPool) {
    let sender = funded_consumer(&pool, 200_000).await;
    let (wid, avail) = merchant_wallet(&pool).await;
    let (camp_id, camp_acct) = campaign_account(&pool, wid).await;
    let state = build_state(pool.clone()).await;

    // Called for its side effect: the posting must land in the database, which
    // the assertions below read back. The response tuple is deliberately
    // discarded, and axum's Json is #[must_use], so discard it explicitly.
    let _ = routes::send(State(state), Json(body(sender, wid, Some(camp_id), "k1")))
        .await
        .unwrap();

    assert_eq!(
        balance(&pool, camp_acct).await,
        50_000,
        "campaign account credited"
    );
    assert_eq!(
        balance(&pool, avail).await,
        0,
        "default account untouched (isolation)"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn route_credits_default_when_absent(pool: PgPool) {
    let sender = funded_consumer(&pool, 200_000).await;
    let (wid, avail) = merchant_wallet(&pool).await;
    let (_camp_id, camp_acct) = campaign_account(&pool, wid).await;
    let state = build_state(pool.clone()).await;

    let _ = routes::send(State(state), Json(body(sender, wid, None, "k1")))
        .await
        .unwrap();

    assert_eq!(
        balance(&pool, avail).await,
        50_000,
        "legacy link credits default"
    );
    assert_eq!(balance(&pool, camp_acct).await, 0, "campaign untouched");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn route_rejects_foreign_account(pool: PgPool) {
    let sender = funded_consumer(&pool, 200_000).await;
    let (wid_a, _) = merchant_wallet(&pool).await;
    let (wid_b, _) = merchant_wallet(&pool).await;
    let (foreign, _) = campaign_account(&pool, wid_b).await;
    let state = build_state(pool.clone()).await;

    let r = routes::send(State(state), Json(body(sender, wid_a, Some(foreign), "k1"))).await;
    assert!(
        r.is_err(),
        "an account from another wallet must be rejected"
    );
}

// ---------------------------------------------------------------------------
// The receipt line. What a payer writes becomes the description on the
// transfer, the receipt, the proof and the public verification page, so the
// contract is held where it is written: 140 Unicode scalars, no line-breaking
// or direction-overriding characters, never truncated, and a refusal is the
// payer's 4xx — not a 500 that reads as an outage.
// ---------------------------------------------------------------------------

fn with_description(sender: Uuid, wallet: Uuid, key: &str, d: &str) -> SendTransferBody {
    let mut b = body(sender, wallet, None, key);
    b.description = Some(d.to_string());
    b
}

async fn stored_description(pool: &PgPool, key: &str) -> Option<String> {
    sqlx::query_scalar("SELECT description FROM transfers WHERE idempotency_key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .unwrap()
        .flatten()
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_description_of_140_accented_scalars_is_stored_exactly(pool: PgPool) {
    let sender = funded_consumer(&pool, 200_000).await;
    let (wid, _) = merchant_wallet(&pool).await;
    let state = build_state(pool.clone()).await;
    // 140 scalars, far more than 140 bytes: "ç" and "ã" are two bytes each.
    let text: String = "Ação ".repeat(28);
    assert_eq!(text.chars().count(), 140);
    let _ = routes::send(
        State(state),
        Json(with_description(sender, wid, "d140", &text)),
    )
    .await
    .unwrap();
    assert_eq!(
        stored_description(&pool, "d140").await.as_deref(),
        Some(text.as_str())
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_description_of_141_scalars_is_refused_as_the_payer_s_error(pool: PgPool) {
    let sender = funded_consumer(&pool, 200_000).await;
    let (wid, avail) = merchant_wallet(&pool).await;
    let state = build_state(pool.clone()).await;
    let text = "a".repeat(141);
    let err = routes::send(
        State(state),
        Json(with_description(sender, wid, "d141", &text)),
    )
    .await
    .unwrap_err();
    assert_eq!(err.status, axum::http::StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(err.code, "INVALID_DESCRIPTION");
    // Refused, not truncated — and nothing moved.
    assert_eq!(stored_description(&pool, "d141").await, None);
    assert_eq!(balance(&pool, avail).await, 0);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_direction_override_is_refused(pool: PgPool) {
    let sender = funded_consumer(&pool, 200_000).await;
    let (wid, _) = merchant_wallet(&pool).await;
    let state = build_state(pool.clone()).await;
    // U+202E RIGHT-TO-LEFT OVERRIDE: renders "10,00 Kz" as something else.
    let err = routes::send(
        State(state),
        Json(with_description(
            sender,
            wid,
            "dbidi",
            "Pago \u{202E}zK 00,01",
        )),
    )
    .await
    .unwrap_err();
    assert_eq!(err.code, "INVALID_DESCRIPTION");
    assert_eq!(stored_description(&pool, "dbidi").await, None);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn markup_is_ordinary_text_and_is_stored_inert(pool: PgPool) {
    let sender = funded_consumer(&pool, 200_000).await;
    let (wid, _) = merchant_wallet(&pool).await;
    let state = build_state(pool.clone()).await;
    let text = "Pagamento <urgente> <script>alert(1)</script> — obrigado 🙏";
    let _ = routes::send(
        State(state),
        Json(with_description(sender, wid, "dhtml", text)),
    )
    .await
    .unwrap();
    assert_eq!(
        stored_description(&pool, "dhtml").await.as_deref(),
        Some(text)
    );
}

// A consumer pay-link note is written once, at creation, and copied onto the
// transfer that pays it — so it is held to the same rule there, by the same
// function, or it is a way around the rule.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_pay_link_note_is_held_to_the_receipt_rule(pool: PgPool) {
    use crate::routes::consumer_pay_links::{self as links, CreateConsumerPayLinkBody};
    let receiver = funded_consumer(&pool, 1).await;
    let state = build_state(pool.clone()).await;
    let mk = |note: &str| CreateConsumerPayLinkBody {
        receiver_consumer_id: receiver.to_string(),
        amount_minor: Some(1_000),
        note: Some(note.to_string()),
        currency: None,
        locked: None,
        expires_in_hours: None,
    };
    let Err(err) = links::create(State(state.clone()), Json(mk(&"é".repeat(141)))).await else {
        panic!("accepted a note the receipt rule refuses")
    };
    assert_eq!(err.code, "INVALID_DESCRIPTION");
    let Err(err) = links::create(State(state.clone()), Json(mk("Jantar\u{2066}x"))).await else {
        panic!("accepted a note the receipt rule refuses")
    };
    assert_eq!(err.code, "INVALID_DESCRIPTION");
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM consumer_pay_links")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    let ok = "é".repeat(140);
    let _ = links::create(State(state), Json(mk(&ok))).await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT note FROM consumer_pay_links")
            .fetch_one(&pool)
            .await
            .unwrap(),
        ok
    );
}
