// Integration tests for KYC-001 (consumer KYC) and KYC-002 (merchant KYB)
// against a real PostgreSQL database — no mocks (CLAUDE.md §7).
//
// These exercise the full path the missing verification provider adds:
//   submit identity → SimulatedKycProvider decides → engine persists the
//   outcome onto the compliance record → transaction gating reflects it.
//
// `#[sqlx::test]` provisions and migrates a fresh database per test.

use chrono::NaiveDate;
use sqlx::PgPool;

use banzami_compliance::{
    ComplianceEngine, ComplianceStatus, CustomerVerificationRequest, IdDocumentType, KycLevel,
    MerchantVerificationRequest, PostgresComplianceEngine, PostgresComplianceRepository,
    SimulatedKycProvider,
};
use banzami_types::{CustomerId, MerchantId};

fn engine(pool: PgPool) -> PostgresComplianceEngine<PostgresComplianceRepository> {
    PostgresComplianceEngine::new(PostgresComplianceRepository::new(pool))
}

fn customer_req(
    id: CustomerId,
    name: &str,
    doc: &str,
    level: KycLevel,
) -> CustomerVerificationRequest {
    CustomerVerificationRequest {
        customer_id: id,
        full_name: name.into(),
        document_type: IdDocumentType::BilheteDeIdentidade,
        document_number: doc.into(),
        date_of_birth: NaiveDate::from_ymd_opt(1990, 5, 20).unwrap(),
        requested_level: level,
    }
}

// ---------------------------------------------------------------------------
// KYC-001 — consumer verification
// ---------------------------------------------------------------------------

// A successful verification raises the customer's KYC level and approves them,
// and that state survives a re-read from the database.
#[sqlx::test(migrations = "../../db/migrations")]
async fn approved_customer_verification_persists_level(pool: PgPool) {
    let eng = engine(pool.clone());
    let provider = SimulatedKycProvider::new();
    let customer_id = CustomerId::new();

    let record = eng
        .verify_customer(
            &provider,
            customer_req(
                customer_id,
                "João Manuel",
                "006887496LA042",
                KycLevel::Enhanced,
            ),
        )
        .await
        .expect("verification should succeed");

    assert_eq!(record.status, ComplianceStatus::Approved);
    assert_eq!(record.kyc_level, KycLevel::Enhanced);
    assert!(record.reviewed_at.is_some());

    // Persisted: a fresh read returns the same upgraded record.
    let reread = eng.get_or_create_customer(customer_id).await.unwrap();
    assert_eq!(reread.kyc_level, KycLevel::Enhanced);
    assert_eq!(reread.status, ComplianceStatus::Approved);
}

// Before verification a customer cannot transact; after an approved verification
// they can transact within their granted level — the gate reflects the outcome.
#[sqlx::test(migrations = "../../db/migrations")]
async fn verification_unblocks_transactions(pool: PgPool) {
    let eng = engine(pool.clone());
    let provider = SimulatedKycProvider::new();
    let customer_id = CustomerId::new();

    // No record yet → blocked.
    let before = eng
        .check_customer_can_transact(customer_id, 10_000, 10_000)
        .await;
    assert!(before.is_err(), "unverified customer must be blocked");

    eng.verify_customer(
        &provider,
        customer_req(
            customer_id,
            "Maria Lopes",
            "004112233LA088",
            KycLevel::Basic,
        ),
    )
    .await
    .unwrap();

    // 100 AOA is within the Basic single-transaction limit.
    eng.check_customer_can_transact(customer_id, 10_000, 10_000)
        .await
        .expect("verified Basic customer can transact within limit");
}

// A rejected verification records REJECTED and leaves the customer blocked.
#[sqlx::test(migrations = "../../db/migrations")]
async fn rejected_customer_verification_keeps_blocked(pool: PgPool) {
    let eng = engine(pool.clone());
    let provider = SimulatedKycProvider::new();
    let customer_id = CustomerId::new();

    let record = eng
        .verify_customer(
            &provider,
            customer_req(
                customer_id,
                "REJECT Test",
                "006887496LA042",
                KycLevel::Basic,
            ),
        )
        .await
        .unwrap();

    assert_eq!(record.status, ComplianceStatus::Rejected);
    assert_eq!(record.kyc_level, KycLevel::None);

    let gate = eng
        .check_customer_can_transact(customer_id, 10_000, 10_000)
        .await;
    assert!(gate.is_err(), "rejected customer must stay blocked");
}

// FULL is not grantable by an automated check — it routes to manual review.
#[sqlx::test(migrations = "../../db/migrations")]
async fn full_level_request_routes_to_review(pool: PgPool) {
    let eng = engine(pool.clone());
    let provider = SimulatedKycProvider::new();
    let customer_id = CustomerId::new();

    let record = eng
        .verify_customer(
            &provider,
            customer_req(customer_id, "João", "006887496LA042", KycLevel::Full),
        )
        .await
        .unwrap();

    assert_eq!(record.status, ComplianceStatus::UnderReview);
    // Level is not raised while under review.
    assert_eq!(record.kyc_level, KycLevel::None);
}

// ---------------------------------------------------------------------------
// KYC-002 — merchant verification (KYB)
// ---------------------------------------------------------------------------

// An approved KYB sets both KYB and AML to approved, letting the merchant process.
#[sqlx::test(migrations = "../../db/migrations")]
async fn approved_merchant_verification_enables_processing(pool: PgPool) {
    let eng = engine(pool.clone());
    let provider = SimulatedKycProvider::new();
    let merchant_id = MerchantId::new();

    let record = eng
        .verify_merchant(
            &provider,
            MerchantVerificationRequest {
                merchant_id,
                legal_name: "Cantina Boa Vista, Lda".into(),
                tax_id: "5417000000".into(),
                representative_name: "Ana Silva".into(),
            },
        )
        .await
        .unwrap();

    assert_eq!(record.kyb_status, ComplianceStatus::Approved);
    assert_eq!(record.aml_status, ComplianceStatus::Approved);
    assert!(
        record.can_process_transactions(),
        "approved merchant must be able to process"
    );

    // Persisted across a re-read.
    let reread = eng.get_or_create_merchant(merchant_id).await.unwrap();
    assert!(reread.can_process_transactions());
}

// A rejected KYB blocks the merchant and records the reason.
#[sqlx::test(migrations = "../../db/migrations")]
async fn rejected_merchant_verification_blocks_processing(pool: PgPool) {
    let eng = engine(pool.clone());
    let provider = SimulatedKycProvider::new();
    let merchant_id = MerchantId::new();

    let record = eng
        .verify_merchant(
            &provider,
            MerchantVerificationRequest {
                merchant_id,
                legal_name: "REJECT Lda".into(),
                tax_id: "5417000000".into(),
                representative_name: "Ana Silva".into(),
            },
        )
        .await
        .unwrap();

    assert_eq!(record.kyb_status, ComplianceStatus::Rejected);
    assert!(!record.can_process_transactions());
    assert!(record.notes.is_some(), "rejection reason must be recorded");
}
