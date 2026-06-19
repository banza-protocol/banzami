//! Vendor-agnostic KYC/KYB data model (Batch 2A): the merchant KYB business
//! profile and an internal verification tracking record.
//!
//! COLLECTION AND TRACKING ONLY — no vendor is integrated, no identity is
//! verified, and the simulated provider remains development-only. These records
//! reduce future integration friction; they do not change readiness or status.
//! Beneficial-owner modelling (Batch 2B) is intentionally absent.
#![allow(dead_code)]

use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use banzami_compliance::VerificationRecordStatus;

// ───────────────────────── merchant KYB profile ─────────────────────────

#[derive(Debug, Clone)]
pub struct KybProfile {
    pub merchant_id: Uuid,
    pub legal_name: Option<String>,
    pub tax_id: Option<String>,
    pub registration_number: Option<String>,
    pub business_activity: Option<String>,
    pub is_sole_trader: bool,
    pub representative_consumer_id: Option<Uuid>,
}

/// Insert or update the merchant's business KYB facts. Collection only — does not
/// verify the NIF/registry and does not touch KYB/payout gating
/// (merchant_compliance.kyb_status is unaffected).
#[allow(clippy::too_many_arguments)]
pub async fn upsert_kyb_profile(
    pool: &PgPool,
    merchant_id: Uuid,
    legal_name: Option<&str>,
    tax_id: Option<&str>,
    registration_number: Option<&str>,
    business_activity: Option<&str>,
    is_sole_trader: bool,
    representative_consumer_id: Option<Uuid>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO merchant_kyb_profile
            (merchant_id, legal_name, tax_id, registration_number, business_activity,
             is_sole_trader, representative_consumer_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (merchant_id) DO UPDATE SET
            legal_name = EXCLUDED.legal_name,
            tax_id = EXCLUDED.tax_id,
            registration_number = EXCLUDED.registration_number,
            business_activity = EXCLUDED.business_activity,
            is_sole_trader = EXCLUDED.is_sole_trader,
            representative_consumer_id = EXCLUDED.representative_consumer_id,
            updated_at = now()",
    )
    .bind(merchant_id)
    .bind(legal_name)
    .bind(tax_id)
    .bind(registration_number)
    .bind(business_activity)
    .bind(is_sole_trader)
    .bind(representative_consumer_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_kyb_profile(
    pool: &PgPool,
    merchant_id: Uuid,
) -> Result<Option<KybProfile>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT merchant_id, legal_name, tax_id, registration_number, business_activity,
                is_sole_trader, representative_consumer_id
         FROM merchant_kyb_profile WHERE merchant_id = $1",
    )
    .bind(merchant_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| KybProfile {
        merchant_id: r.get("merchant_id"),
        legal_name: r.get("legal_name"),
        tax_id: r.get("tax_id"),
        registration_number: r.get("registration_number"),
        business_activity: r.get("business_activity"),
        is_sole_trader: r.get("is_sole_trader"),
        representative_consumer_id: r.get("representative_consumer_id"),
    }))
}

// ───────────────────────── verification tracking ─────────────────────────

/// Error from a verification status transition.
#[derive(Debug)]
pub enum TransitionError {
    NotFound,
    InvalidTransition { from: String, to: String },
    Db(sqlx::Error),
}

impl From<sqlx::Error> for TransitionError {
    fn from(e: sqlx::Error) -> Self {
        TransitionError::Db(e)
    }
}

/// Creates a PENDING verification record. Idempotent on (provider, provider_ref)
/// when a reference is given — a replay returns the existing record id.
pub async fn create_verification(
    pool: &PgPool,
    subject_type: &str,
    subject_id: Uuid,
    provider: &str,
    provider_ref: Option<&str>,
    level: Option<&str>,
) -> Result<Uuid, sqlx::Error> {
    let inserted: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO kyc_verifications (subject_type, subject_id, provider, provider_ref, level)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (provider, provider_ref) WHERE provider_ref IS NOT NULL DO NOTHING
         RETURNING id",
    )
    .bind(subject_type)
    .bind(subject_id)
    .bind(provider)
    .bind(provider_ref)
    .bind(level)
    .fetch_optional(pool)
    .await?;

    match inserted {
        Some(id) => Ok(id),
        // Conflict (idempotent replay) — return the existing record.
        None => Ok(sqlx::query_scalar::<_, Uuid>(
            "SELECT id FROM kyc_verifications WHERE provider = $1 AND provider_ref = $2",
        )
        .bind(provider)
        .bind(provider_ref)
        .fetch_one(pool)
        .await?),
    }
}

/// Transitions a verification record, enforcing the legal lifecycle. Stamps
/// `decided_at` on a terminal decision (APPROVED/REJECTED/EXPIRED).
pub async fn transition_verification(
    pool: &PgPool,
    id: Uuid,
    to: VerificationRecordStatus,
    reason: Option<&str>,
    error_code: Option<&str>,
) -> Result<(), TransitionError> {
    let current: Option<String> =
        sqlx::query_scalar("SELECT status FROM kyc_verifications WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    let current = current.ok_or(TransitionError::NotFound)?;
    let from = VerificationRecordStatus::try_from_str(&current).ok_or(TransitionError::NotFound)?;

    if !from.can_transition_to(to) {
        return Err(TransitionError::InvalidTransition {
            from: from.as_str().to_string(),
            to: to.as_str().to_string(),
        });
    }

    let decided_at: Option<DateTime<Utc>> = if to.is_decision() {
        Some(Utc::now())
    } else {
        None
    };
    sqlx::query(
        "UPDATE kyc_verifications
         SET status = $1, reason = $2, error_code = $3, updated_at = now(),
             decided_at = COALESCE($4, decided_at)
         WHERE id = $5",
    )
    .bind(to.as_str())
    .bind(reason)
    .bind(error_code)
    .bind(decided_at)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn seed_merchant(pool: &PgPool) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO merchants (id, name, email) VALUES ($1, $2, $3)")
            .bind(id)
            .bind("Test Comércio")
            .bind(format!("m{}@test.local", &id.to_string()[..8]))
            .execute(pool)
            .await
            .unwrap();
        id
    }

    async fn status_of(pool: &PgPool, id: Uuid) -> String {
        sqlx::query_scalar::<_, String>("SELECT status FROM kyc_verifications WHERE id = $1")
            .bind(id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[sqlx::test(migrations = "../../db/migrations")]
    async fn kyb_profile_store_update_and_independence(pool: PgPool) {
        let m = seed_merchant(&pool).await;
        let rep = Uuid::new_v4();
        upsert_kyb_profile(
            &pool,
            m,
            Some("Comércio, Lda"),
            Some("5000000000"),
            Some("REG-1"),
            Some("Retail"),
            false,
            Some(rep),
        )
        .await
        .unwrap();

        let p = get_kyb_profile(&pool, m).await.unwrap().unwrap();
        assert_eq!(p.legal_name.as_deref(), Some("Comércio, Lda"));
        assert_eq!(p.tax_id.as_deref(), Some("5000000000"));
        assert_eq!(p.registration_number.as_deref(), Some("REG-1"));
        assert_eq!(p.business_activity.as_deref(), Some("Retail"));
        assert!(!p.is_sole_trader);
        assert_eq!(p.representative_consumer_id, Some(rep));

        // Update is safe (upsert) — change one field, keep others.
        upsert_kyb_profile(
            &pool,
            m,
            Some("Comércio, Lda"),
            Some("5000000000"),
            None,
            Some("Wholesale"),
            true,
            Some(rep),
        )
        .await
        .unwrap();
        let p2 = get_kyb_profile(&pool, m).await.unwrap().unwrap();
        assert_eq!(p2.business_activity.as_deref(), Some("Wholesale"));
        assert!(p2.is_sole_trader);

        // Independence: the profile does NOT create/modify the KYB gate status.
        let compliance_rows = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)::BIGINT FROM merchant_compliance WHERE merchant_id = $1",
        )
        .bind(m)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            compliance_rows, 0,
            "profile is independent of KYB/payout gating"
        );
    }

    #[sqlx::test(migrations = "../../db/migrations")]
    async fn verification_create_is_idempotent_on_provider_ref(pool: PgPool) {
        let subject = Uuid::new_v4();
        let a = create_verification(
            &pool,
            "CONSUMER",
            subject,
            "SIMULATED",
            Some("ref-1"),
            Some("BASIC"),
        )
        .await
        .unwrap();
        let b = create_verification(
            &pool,
            "CONSUMER",
            subject,
            "SIMULATED",
            Some("ref-1"),
            Some("BASIC"),
        )
        .await
        .unwrap();
        assert_eq!(a, b, "same provider_ref returns the same record");
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)::BIGINT FROM kyc_verifications WHERE provider = 'SIMULATED' AND provider_ref = 'ref-1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1);
    }

    #[sqlx::test(migrations = "../../db/migrations")]
    async fn valid_transition_stamps_decided_at(pool: PgPool) {
        let id = create_verification(&pool, "MERCHANT", Uuid::new_v4(), "SIMULATED", None, None)
            .await
            .unwrap();
        transition_verification(
            &pool,
            id,
            VerificationRecordStatus::Approved,
            Some("ok"),
            None,
        )
        .await
        .expect("PENDING -> APPROVED");
        assert_eq!(status_of(&pool, id).await, "APPROVED");
        let decided: Option<DateTime<Utc>> =
            sqlx::query_scalar("SELECT decided_at FROM kyc_verifications WHERE id = $1")
                .bind(id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(decided.is_some(), "decided_at stamped on terminal decision");
    }

    #[sqlx::test(migrations = "../../db/migrations")]
    async fn invalid_transition_is_rejected(pool: PgPool) {
        let id = create_verification(&pool, "MERCHANT", Uuid::new_v4(), "SIMULATED", None, None)
            .await
            .unwrap();
        transition_verification(&pool, id, VerificationRecordStatus::Approved, None, None)
            .await
            .unwrap();
        // APPROVED -> PENDING is forbidden.
        let err = transition_verification(&pool, id, VerificationRecordStatus::Pending, None, None)
            .await
            .expect_err("APPROVED -> PENDING rejected");
        assert!(matches!(err, TransitionError::InvalidTransition { .. }));
        assert_eq!(
            status_of(&pool, id).await,
            "APPROVED",
            "status unchanged after rejected transition"
        );
    }

    #[sqlx::test(migrations = "../../db/migrations")]
    async fn rejected_is_terminal_new_attempt_is_new_row(pool: PgPool) {
        let subject = Uuid::new_v4();
        let first = create_verification(&pool, "CONSUMER", subject, "SIMULATED", None, None)
            .await
            .unwrap();
        transition_verification(
            &pool,
            first,
            VerificationRecordStatus::Rejected,
            Some("mismatch"),
            Some("E1"),
        )
        .await
        .unwrap();
        // REJECTED -> APPROVED on the same row is forbidden.
        assert!(transition_verification(
            &pool,
            first,
            VerificationRecordStatus::Approved,
            None,
            None
        )
        .await
        .is_err());
        // A new attempt is a new PENDING row.
        let second = create_verification(&pool, "CONSUMER", subject, "SIMULATED", None, None)
            .await
            .unwrap();
        assert_ne!(first, second);
        assert_eq!(status_of(&pool, second).await, "PENDING");
    }
}
