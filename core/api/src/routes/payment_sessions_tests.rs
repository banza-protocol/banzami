//! Real-DB tests for Payment Sessions (BANZA ADR-043). A session provisions a
//! payment link AND a dynamic QR (when fixed-amount), both bound to the SAME
//! wallet_account — and is idempotent per (merchant, purpose, reference).

use axum::{extract::State, Json};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::payment_sessions::{self as routes, CreateBody};
use crate::state::{AppState, CoreEnvironment};

async fn account(pool: &PgPool, ty: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES ($1,$2,'a','AOA') RETURNING id",
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

/// Merchant wallet + a CAMPAIGN wallet_account. Returns (merchant, wallet, wa_id, wa_account).
async fn seed(pool: &PgPool) -> (Uuid, Uuid, Uuid, Uuid) {
    let merchant = Uuid::new_v4();
    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    let wid = Uuid::new_v4();
    sqlx::query("INSERT INTO wallets (id,merchant_id,currency,status,available_account_id,reserved_account_id) VALUES ($1,$2,'AOA','ACTIVE',$3,$4)")
        .bind(wid).bind(merchant).bind(avail).bind(reserved).execute(pool).await.unwrap();
    let wa_acct = account(pool, "LIABILITY").await;
    let wa = Uuid::new_v4();
    sqlx::query("INSERT INTO wallet_accounts (id,wallet_id,account_id,merchant_id,currency,purpose,status,label) VALUES ($1,$2,$3,$4,'AOA','CAMPAIGN','ACTIVE','c')")
        .bind(wa).bind(wid).bind(wa_acct).bind(merchant).execute(pool).await.unwrap();
    (merchant, wid, wa, wa_acct)
}

fn body(merchant: Uuid, wa: Uuid, amount: Option<i64>, reference: Option<&str>) -> CreateBody {
    CreateBody {
        merchant_id: merchant.to_string(),
        wallet_account_id: wa.to_string(),
        purpose: Some("DONATION".into()),
        reference_type: Some("DOA_CAMPAIGN".into()),
        reference_id: reference.map(|r| r.to_string()),
        amount_minor: amount,
        currency: Some("AOA".into()),
        description: Some("Campanha".into()),
        expires_at: None,
        metadata: None,
    }
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn session_binds_link_and_qr_to_same_account(pool: PgPool) {
    let (merchant, _wid, wa, wa_acct) = seed(&pool).await;
    let state = build_state(pool.clone()).await;

    let (status, Json(s)) = routes::create(
        State(state),
        Json(body(merchant, wa, Some(50_000), Some("camp_A"))),
    )
    .await
    .unwrap();
    assert_eq!(status, axum::http::StatusCode::CREATED);
    assert_eq!(s["wallet_account_id"], wa.to_string());
    assert!(s["payment_link_id"].is_string(), "link interface present");
    assert!(
        s["qr_code_id"].is_string(),
        "QR interface present (fixed amount)"
    );
    assert!(s["qr_payload"].is_string(), "QR payload returned on create");

    // The payment link credits the campaign account.
    let link_wa: Option<Uuid> =
        sqlx::query_scalar("SELECT wallet_account_id FROM payment_links WHERE id = $1")
            .bind(Uuid::parse_str(s["payment_link_id"].as_str().unwrap()).unwrap())
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        link_wa,
        Some(wa),
        "link bound to the campaign wallet_account"
    );

    // The QR credits the SAME campaign account.
    let qr_wa: Option<Uuid> =
        sqlx::query_scalar("SELECT wallet_account_id FROM qr_codes WHERE id = $1")
            .bind(Uuid::parse_str(s["qr_code_id"].as_str().unwrap()).unwrap())
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        qr_wa,
        Some(wa),
        "QR bound to the SAME wallet_account as the link"
    );

    // Both interfaces credit the same ledger account.
    assert_eq!(
        link_wa, qr_wa,
        "link and QR point to the same wallet_account"
    );
    let _ = wa_acct;
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn open_amount_session_has_link_no_qr(pool: PgPool) {
    let (merchant, _wid, wa, _) = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    let (_, Json(s)) = routes::create(
        State(state),
        Json(body(merchant, wa, None, Some("camp_open"))),
    )
    .await
    .unwrap();
    assert!(
        s["payment_link_id"].is_string(),
        "open session still has a link"
    );
    assert!(
        s["qr_code_id"].is_null(),
        "no native dynamic QR for an open amount"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn session_is_idempotent_per_reference(pool: PgPool) {
    let (merchant, _wid, wa, _) = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    let (_, Json(a)) = routes::create(
        State(state.clone()),
        Json(body(merchant, wa, Some(1000), Some("camp_X"))),
    )
    .await
    .unwrap();
    let (status, Json(b)) = routes::create(
        State(state),
        Json(body(merchant, wa, Some(1000), Some("camp_X"))),
    )
    .await
    .unwrap();
    assert_eq!(
        status,
        axum::http::StatusCode::OK,
        "duplicate reference returns existing"
    );
    assert_eq!(a["session_id"], b["session_id"], "same session id");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn rejects_foreign_wallet_account(pool: PgPool) {
    let (_m1, _w1, _wa1, _) = seed(&pool).await;
    let (_m2, _w2, wa2, _) = seed(&pool).await; // belongs to a different merchant
    let attacker = Uuid::new_v4();
    let state = build_state(pool).await;
    let r = routes::create(
        State(state),
        Json(body(attacker, wa2, Some(1000), Some("x"))),
    )
    .await;
    assert!(
        r.is_err(),
        "a wallet_account not owned by the caller is rejected"
    );
}

// A session is paid once: when one interface pays it, the other stops being
// payable in the same step, and the interface that paid is left alone.
#[sqlx::test(migrations = "../../db/migrations")]
async fn paying_a_session_retires_its_other_interface(pool: PgPool) {
    let (merchant, _wid, wa, _) = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    for (kind, reference) in [("link", "camp_link_paid"), ("qr", "camp_qr_paid")] {
        let (_, Json(s)) = routes::create(
            State(state.clone()),
            Json(body(merchant, wa, Some(50_000), Some(reference))),
        )
        .await
        .unwrap();
        let link = Uuid::parse_str(s["payment_link_id"].as_str().unwrap()).unwrap();
        let qr = Uuid::parse_str(s["qr_code_id"].as_str().unwrap()).unwrap();
        let session: Uuid =
            sqlx::query_scalar("SELECT id FROM payment_sessions WHERE payment_link_id = $1")
                .bind(link)
                .fetch_one(&pool)
                .await
                .unwrap();
        let paying = if kind == "link" { link } else { qr };
        routes::settle_for_interface(&state, kind, paying, Uuid::new_v4(), "TEST")
            .await
            .unwrap();

        let status: String =
            sqlx::query_scalar("SELECT status FROM payment_sessions WHERE id = $1")
                .bind(session)
                .fetch_one(&pool)
                .await
                .unwrap();
        let qr_status: String = sqlx::query_scalar("SELECT status FROM qr_codes WHERE id = $1")
            .bind(qr)
            .fetch_one(&pool)
            .await
            .unwrap();
        let link_status: String =
            sqlx::query_scalar("SELECT status FROM payment_links WHERE id = $1")
                .bind(link)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(status, "PAID", "{kind}");
        if kind == "link" {
            assert_eq!(
                qr_status, "EXPIRED",
                "the QR of a session paid by link must stop being payable"
            );
            assert_eq!(
                link_status, "ACTIVE",
                "the paying link is left to its own lifecycle"
            );
        } else {
            assert_eq!(
                link_status, "CANCELLED",
                "the link of a session paid by QR must stop being payable"
            );
            assert_eq!(
                qr_status, "ACTIVE",
                "the paying QR is left to its own lifecycle"
            );
        }
    }
}

// An unpaid session can be ended, and ending it ends its link and its QR. A
// paid one cannot, and another owner's is not found.
#[sqlx::test(migrations = "../../db/migrations")]
async fn an_unpaid_session_cancels_with_its_interfaces(pool: PgPool) {
    use crate::routes::payment_sessions::CancelBody;
    use axum::extract::Path;

    let (merchant, _wid, wa, _) = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    let mk = |reference: &'static str| {
        let state = state.clone();
        async move {
            let (_, Json(s)) = routes::create(
                State(state),
                Json(body(merchant, wa, Some(5_000), Some(reference))),
            )
            .await
            .unwrap();
            s
        }
    };
    let open = mk("camp_cancel").await;
    let sid = open["session_id"].as_str().unwrap().to_string();
    let link = Uuid::parse_str(open["payment_link_id"].as_str().unwrap()).unwrap();
    let qr = Uuid::parse_str(open["qr_code_id"].as_str().unwrap()).unwrap();

    let other = routes::cancel(
        State(state.clone()),
        Path(sid.clone()),
        Json(CancelBody {
            merchant_id: Uuid::new_v4().to_string(),
        }),
    )
    .await;
    assert!(
        other.is_err(),
        "another owner's session must not be cancellable"
    );

    let Json(done) = routes::cancel(
        State(state.clone()),
        Path(sid.clone()),
        Json(CancelBody {
            merchant_id: merchant.to_string(),
        }),
    )
    .await
    .unwrap();
    assert_eq!(done["status"], "CANCELLED");
    let link_status: String = sqlx::query_scalar("SELECT status FROM payment_links WHERE id = $1")
        .bind(link)
        .fetch_one(&pool)
        .await
        .unwrap();
    let qr_status: String = sqlx::query_scalar("SELECT status FROM qr_codes WHERE id = $1")
        .bind(qr)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        link_status, "CANCELLED",
        "a cancelled session left its link payable"
    );
    assert_eq!(
        qr_status, "EXPIRED",
        "a cancelled session left its QR payable"
    );
    // Again: the same answer, nothing else changes.
    let Json(again) = routes::cancel(
        State(state.clone()),
        Path(sid),
        Json(CancelBody {
            merchant_id: merchant.to_string(),
        }),
    )
    .await
    .unwrap();
    assert_eq!(again["status"], "CANCELLED");

    let paid = mk("camp_paid_then_cancel").await;
    let paid_link = Uuid::parse_str(paid["payment_link_id"].as_str().unwrap()).unwrap();
    routes::settle_for_interface(&state, "link", paid_link, Uuid::new_v4(), "TEST")
        .await
        .unwrap();
    let refused = routes::cancel(
        State(state),
        Path(paid["session_id"].as_str().unwrap().to_string()),
        Json(CancelBody {
            merchant_id: merchant.to_string(),
        }),
    )
    .await;
    assert!(refused.is_err(), "a paid session must not be cancellable");
}

// A1-06: a session naming another merchant's account is refused as not found —
// the same answer as an id nobody holds, never a 403 that confirms it exists.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_foreign_account_is_not_found(pool: PgPool) {
    let (_owner, _wid, wa, _acct) = seed(&pool).await;
    let state = build_state(pool.clone()).await;
    let stranger = Uuid::new_v4();
    let err = routes::create(
        State(state),
        Json(body(stranger, wa, Some(1_000), Some("x"))),
    )
    .await
    .expect_err("a foreign account was accepted");
    assert_eq!(err.status.as_u16(), 404);
}
