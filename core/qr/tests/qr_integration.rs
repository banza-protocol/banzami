// Integration tests for QR-001 (static) and QR-002 (dynamic) against a real
// PostgreSQL database — no mocks (CLAUDE.md §7: financial invariant tests MUST
// use a real database).
//
// Each test runs against a fresh database created and migrated by `#[sqlx::test]`,
// exercising the production `PostgresQrEngine` + `PostgresQrRepository` path and
// the real `expire_stale_codes` expiry query.
//
// Invariants verified:
//   INV-QR-001-1  a static QR encodes and resolves to exactly the merchant that
//                 owns it (merchant binding) and never expires
//   INV-QR-002-1  a dynamic QR persists and resolves its pre-set amount + currency
//   INV-QR-002-2  a dynamic QR expires by timeout and by use, and is never reusable
//                 once EXPIRED or USED

use chrono::{Duration, Utc};
use sqlx::PgPool;

use banzami_qr::{
    expire_stale_codes, CreateDynamicQrRequest, CreateStaticQrRequest, PostgresQrEngine,
    PostgresQrRepository, QrCode, QrCodeStatus, QrCodeType, QrEngine, QrError, QrOwnerType,
    QrRepository,
};
use banzami_types::{Currency, QrCodeId};

const SIGNING_KEY: &[u8] = b"qr-integration-test-signing-key";

fn engine(pool: PgPool) -> PostgresQrEngine<PostgresQrRepository> {
    PostgresQrEngine::new(PostgresQrRepository::new(pool), SIGNING_KEY.to_vec())
}

// ---------------------------------------------------------------------------
// QR-001 — Static QR (merchant binding, permanence)
// ---------------------------------------------------------------------------

// INV-QR-001-1: a static QR persists, round-trips through the DB unchanged, and
// resolves to exactly the merchant that owns it.
#[sqlx::test(migrations = "../../db/migrations")]
async fn static_qr_persists_and_binds_to_merchant(pool: PgPool) {
    let eng = engine(pool.clone());
    let merchant_id = uuid::Uuid::new_v4();

    let created = eng
        .create_static(CreateStaticQrRequest {
            owner_id: merchant_id,
            owner_type: QrOwnerType::Merchant,
            currency: Currency::AOA,
            amount_minor: None,
        })
        .await
        .expect("create_static should persist");

    // Round-trips through PostgreSQL unchanged.
    let fetched = eng.get(created.id).await.expect("QR must be persisted");
    assert_eq!(fetched.owner_id, merchant_id);
    assert_eq!(fetched.owner_type, QrOwnerType::Merchant);
    assert_eq!(fetched.qr_type, QrCodeType::Static);
    assert_eq!(fetched.status, QrCodeStatus::Active);

    // Permanent — a static QR never carries an expiry (QR-001: "não expira").
    assert!(
        fetched.expires_at.is_none(),
        "static QR must never expire (INV-QR-001-1)"
    );

    // Merchant binding: encode → decode resolves to the SAME merchant.
    let payload = eng.encode(&fetched).expect("encode");
    let decoded = eng.decode(&payload).expect("decode");
    assert_eq!(decoded.qr_type, QrCodeType::Static);
    assert_eq!(
        decoded.owner_id,
        Some(merchant_id),
        "decoded static QR must bind to the owning merchant (INV-QR-001-1)"
    );
    assert_eq!(decoded.owner_type, Some(QrOwnerType::Merchant));
    assert_eq!(decoded.currency, Some(Currency::AOA));
}

// A static QR is reusable and can never be consumed — it has no single-use semantics.
#[sqlx::test(migrations = "../../db/migrations")]
async fn static_qr_cannot_be_marked_used(pool: PgPool) {
    let eng = engine(pool.clone());

    let qr = eng
        .create_static(CreateStaticQrRequest {
            owner_id: uuid::Uuid::new_v4(),
            owner_type: QrOwnerType::Merchant,
            currency: Currency::AOA,
            amount_minor: None,
        })
        .await
        .unwrap();

    let err = eng.mark_used(qr.id).await.unwrap_err();
    assert!(
        matches!(err, QrError::CannotMarkStaticAsUsed),
        "static QR must reject mark_used, got {err:?}"
    );
}

// ---------------------------------------------------------------------------
// QR-002 — Dynamic QR (amount, single-use, expiry)
// ---------------------------------------------------------------------------

// INV-QR-002-1: a dynamic QR persists and resolves its pre-set amount + currency.
#[sqlx::test(migrations = "../../db/migrations")]
async fn dynamic_qr_persists_amount_and_resolves(pool: PgPool) {
    let eng = engine(pool.clone());
    let merchant_id = uuid::Uuid::new_v4();

    let created = eng
        .create_dynamic(CreateDynamicQrRequest {
            owner_id: merchant_id,
            owner_type: QrOwnerType::Merchant,
            currency: Currency::AOA,
            amount_minor: 250_000, // 2,500 AOA
            expires_at: Utc::now() + Duration::hours(1),
            reference: Some("invoice-42".into()),
            wallet_account_id: None,
        })
        .await
        .expect("create_dynamic should persist");

    let fetched = eng.get(created.id).await.expect("dynamic QR persisted");
    assert_eq!(fetched.qr_type, QrCodeType::Dynamic);
    assert_eq!(
        fetched.amount_minor,
        Some(250_000),
        "dynamic QR must persist its pre-set amount (INV-QR-002-1)"
    );
    assert_eq!(fetched.currency, Currency::AOA);
    assert_eq!(fetched.reference.as_deref(), Some("invoice-42"));
    assert!(fetched.expires_at.is_some(), "dynamic QR must carry expiry");

    // The scannable payload carries the qr_code_id + an HMAC signature; decoding
    // resolves back to the same record id.
    let payload = eng.encode(&fetched).expect("encode");
    let decoded = eng.decode(&payload).expect("decode");
    assert_eq!(decoded.qr_type, QrCodeType::Dynamic);
    assert_eq!(decoded.qr_code_id, Some(created.id));
}

// INV-QR-002-2 (use): a dynamic QR is consumed exactly once — a second mark_used
// is rejected, so it cannot be reused after a confirmed payment.
#[sqlx::test(migrations = "../../db/migrations")]
async fn dynamic_qr_single_use_not_reusable(pool: PgPool) {
    let eng = engine(pool.clone());

    let qr = eng
        .create_dynamic(CreateDynamicQrRequest {
            owner_id: uuid::Uuid::new_v4(),
            owner_type: QrOwnerType::Merchant,
            currency: Currency::AOA,
            amount_minor: 100_000,
            expires_at: Utc::now() + Duration::hours(1),
            reference: None,
            wallet_account_id: None,
        })
        .await
        .unwrap();

    // First use transitions ACTIVE → USED and stamps used_at.
    let used = eng.mark_used(qr.id).await.expect("first use succeeds");
    assert_eq!(used.status, QrCodeStatus::Used);
    assert!(used.used_at.is_some(), "used_at must be stamped");

    // Second use is rejected — not reusable.
    let err = eng.mark_used(qr.id).await.unwrap_err();
    assert!(
        matches!(err, QrError::AlreadyUsedOrExpired),
        "a used dynamic QR must not be reusable, got {err:?}"
    );

    // The DB record stays USED.
    assert_eq!(eng.get(qr.id).await.unwrap().status, QrCodeStatus::Used);
}

// QR-002: creating a dynamic QR that is already expired is rejected up front.
#[sqlx::test(migrations = "../../db/migrations")]
async fn dynamic_qr_rejects_past_expiry(pool: PgPool) {
    let eng = engine(pool.clone());

    let err = eng
        .create_dynamic(CreateDynamicQrRequest {
            owner_id: uuid::Uuid::new_v4(),
            owner_type: QrOwnerType::Merchant,
            currency: Currency::AOA,
            amount_minor: 100_000,
            expires_at: Utc::now() - Duration::minutes(1),
            reference: None,
            wallet_account_id: None,
        })
        .await
        .unwrap_err();

    assert!(
        matches!(err, QrError::AlreadyExpired),
        "past-expiry dynamic QR must be rejected, got {err:?}"
    );
}

// INV-QR-002-2 (timeout): the real expiry query transitions a stale ACTIVE
// dynamic QR to EXPIRED, after which it can no longer be used.
#[sqlx::test(migrations = "../../db/migrations")]
async fn dynamic_qr_expires_by_timeout(pool: PgPool) {
    let repo = PostgresQrRepository::new(pool.clone());
    let eng = engine(pool.clone());

    // Insert an ACTIVE dynamic QR whose expiry is already in the past. We go
    // through the repository directly because the engine guards against past
    // expiry at creation — here we are simulating a QR that aged past its expiry.
    let stale = QrCode {
        id: QrCodeId::new(),
        owner_id: uuid::Uuid::new_v4(),
        owner_type: QrOwnerType::Merchant,
        qr_type: QrCodeType::Dynamic,
        currency: Currency::AOA,
        amount_minor: Some(75_000),
        status: QrCodeStatus::Active,
        expires_at: Some(Utc::now() - Duration::minutes(5)),
        used_at: None,
        reference: None,
        wallet_account_id: None,
        created_at: Utc::now() - Duration::hours(1),
    };
    repo.create(stale.clone()).await.expect("seed stale QR");

    // Run the production expiry sweep.
    let expired = expire_stale_codes(&pool).await.expect("expiry sweep");
    assert!(expired >= 1, "the stale QR must be swept to EXPIRED");

    let after = eng.get(stale.id).await.expect("QR still present");
    assert_eq!(
        after.status,
        QrCodeStatus::Expired,
        "stale dynamic QR must be EXPIRED (INV-QR-002-2)"
    );

    // An EXPIRED QR can no longer be used.
    let err = eng.mark_used(stale.id).await.unwrap_err();
    assert!(
        matches!(err, QrError::AlreadyUsedOrExpired),
        "expired QR must not be usable, got {err:?}"
    );
}

// The expiry sweep must never touch static QR codes (they have no expiry).
#[sqlx::test(migrations = "../../db/migrations")]
async fn expiry_sweep_leaves_static_qr_active(pool: PgPool) {
    let eng = engine(pool.clone());

    let qr = eng
        .create_static(CreateStaticQrRequest {
            owner_id: uuid::Uuid::new_v4(),
            owner_type: QrOwnerType::Merchant,
            currency: Currency::AOA,
            amount_minor: None,
        })
        .await
        .unwrap();

    expire_stale_codes(&pool).await.expect("expiry sweep");

    assert_eq!(
        eng.get(qr.id).await.unwrap().status,
        QrCodeStatus::Active,
        "static QR must stay ACTIVE through an expiry sweep"
    );
}
