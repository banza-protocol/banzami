//! Retiring a Sandbox Project that its developer deleted (SANDBOX-DELETE-001).
//!
//! developer-api revokes the Project's keys and marks it DELETING in one
//! transaction; this is what it then asks Core to do, as many times as it needs
//! to (a retried request, a resumed deletion after a crash, and a final pass after
//! a grace period for requests that were already in flight). Every step is
//! state-based, so a second pass changes nothing the first one changed and posts
//! nothing twice:
//!
//!   - from the first pass on, Core refuses new Payment Sessions and Payment
//!     Links attributed to the Project (`sandbox_retired_projects`);
//!   - the Project's test payers are retired: fictitious balance back to transit
//!     through a balanced posting, marked retired, suspended;
//!   - open sessions and links the Project created are cancelled;
//!   - if the Project owns a synthetic Sandbox Business that no other live
//!     Project still uses (developer-api decides, from bindings Core cannot see),
//!     the Business is retired the way a reset retires it — open sessions and
//!     links cancelled, every account's fictitious balance retired, segregated
//!     accounts closed — and then suspended, its webhook endpoints disabled and
//!     their pending deliveries ended;
//!   - a Project that only connected to another Project's synthetic Business
//!     retires that Business when it was the last live Project on it AND Core
//!     has already retired the Project that created it: otherwise deleting the
//!     creator first and the partner second would leave a Business nobody can
//!     reach, ACTIVE for ever. developer-api names the Business; Core decides
//!     from its own tables whether it qualifies, so a caller cannot point this
//!     at a real Business or at one whose creator is still live;
//!   - the Project's simulated rail and Sandbox funding reservations are removed.
//!
//! Nothing is rewritten: postings, entries, receipts, completed payments, refunds,
//! settlements, delivery history and audit rows stay exactly as they were. A
//! Business another Project uses, or a real Business the Project only connected
//! to, is never retired. LIVE refuses before reading anything.

use axum::{extract::State, Json};
use serde::Deserialize;
use uuid::Uuid;

use banzami_identity::IdentityEngine;

use crate::{
    error::{ApiError, ApiResult},
    routes::sandbox_reset::{owned_synthetic_business, retire_business, retire_test_payers},
    state::AppState,
};

#[derive(Deserialize)]
pub struct RetireProjectBody {
    pub project_id: String,
    pub requested_by: String,
    /// One id per pass; the postings of a pass are idempotent on it.
    pub pass_id: String,
    /// Whether the Project's own synthetic Business may be retired: false when
    /// another live Project is still bound to it.
    #[serde(default)]
    pub retire_business: bool,
    /// The Business the Project was bound to, when it did not create it.
    #[serde(default)]
    pub bound_business_id: Option<String>,
}

/// POST /internal/v1/sandbox/projects/retire
pub async fn retire(
    State(state): State<AppState>,
    Json(body): Json<RetireProjectBody>,
) -> ApiResult<Json<serde_json::Value>> {
    if state.environment.is_live() {
        return Err(ApiError::forbidden(
            "a Project's test resources exist only in the Sandbox",
        ));
    }
    let project = Uuid::parse_str(&body.project_id)
        .map_err(|_| ApiError::bad_request("invalid project_id"))?;
    let by = body.requested_by.trim();
    let pass = body.pass_id.trim();
    if by.is_empty() || by.len() > 200 || pass.is_empty() || pass.len() > 100 {
        return Err(ApiError::bad_request(
            "requested_by and pass_id are required",
        ));
    }
    let db = |e: sqlx::Error| ApiError::internal(e.to_string());
    let reason = "Sandbox Project deleted by its developer";
    let scope = format!("delete:{project}:{pass}");

    let mut tx = state.pool.begin().await.map_err(db)?;
    // The same lock a reset takes: a reset and a deletion of one Project never interleave.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('sandbox-reset:' || $1::text))")
        .bind(project)
        .execute(&mut *tx)
        .await
        .map_err(db)?;

    let owned = owned_synthetic_business(&mut tx, project).await?;
    // Not the Project's own: a synthetic Business whose creator Core has already retired.
    let orphaned = match (owned, body.bound_business_id.as_deref()) {
        (None, Some(raw)) => {
            let merchant = Uuid::parse_str(raw.trim())
                .map_err(|_| ApiError::bad_request("invalid bound_business_id"))?;
            sqlx::query_scalar::<_, Uuid>(
                "SELECT sb.merchant_id FROM sandbox_businesses sb
                   JOIN merchant_compliance c ON c.merchant_id = sb.merchant_id
                   JOIN sandbox_retired_projects r ON r.project_id = sb.project_id
                  WHERE sb.merchant_id = $1 AND c.kyb_status = 'SANDBOX_SYNTHETIC' AND sb.project_id <> $2",
            )
            .bind(merchant)
            .bind(project)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db)?
        }
        _ => None,
    };
    sqlx::query(
        "INSERT INTO sandbox_retired_projects (project_id, merchant_id) VALUES ($1, $2)
         ON CONFLICT (project_id) DO UPDATE SET passes = sandbox_retired_projects.passes + 1",
    )
    .bind(project)
    .bind(owned)
    .execute(&mut *tx)
    .await
    .map_err(db)?;

    let (payers, mut retired_minor) = retire_test_payers(
        &mut tx,
        &state,
        project,
        by,
        reason,
        &scope,
        "project_deletion",
    )
    .await?;

    // What the Project itself created, on whichever Business.
    let attributed_sessions: i64 = sqlx::query_scalar(
        "WITH s AS (
            UPDATE payment_sessions SET status = 'CANCELLED', updated_at = now()
             WHERE status IN ('CREATED','ACTIVE')
               AND payment_link_id IN (SELECT payment_link_id FROM sandbox_link_projects WHERE project_id = $1)
         RETURNING qr_code_id
         ), q AS (
            UPDATE qr_codes SET status = 'EXPIRED'
             WHERE id IN (SELECT qr_code_id FROM s) AND status = 'ACTIVE'
         )
         SELECT count(*) FROM s",
    )
    .bind(project)
    .fetch_one(&mut *tx)
    .await
    .map_err(db)?;
    let attributed_links = sqlx::query(
        "UPDATE payment_links SET status = 'CANCELLED', updated_at = now()
          WHERE status = 'ACTIVE'
            AND id IN (SELECT payment_link_id FROM sandbox_link_projects WHERE project_id = $1)",
    )
    .bind(project)
    .execute(&mut *tx)
    .await
    .map_err(db)?
    .rows_affected();
    let attributed_cash_in_failed = crate::routes::sandbox_reset::fail_pending_cash_in(
        &mut tx,
        "SELECT payment_link_id FROM sandbox_link_projects WHERE project_id = $1",
        project,
    )
    .await?;

    let mut business = serde_json::json!(null);
    if let (Some(merchant), true) = (owned.or(orphaned), body.retire_business) {
        let r = retire_business(
            &mut tx,
            &state,
            merchant,
            by,
            reason,
            &scope,
            "project_deletion",
        )
        .await?;
        retired_minor += r.retired_minor;
        let suspended = sqlx::query(
            "UPDATE merchants SET status = 'SUSPENDED', updated_at = now() WHERE id = $1 AND status = 'ACTIVE'",
        )
        .bind(merchant)
        .execute(&mut *tx)
        .await
        .map_err(db)?
        .rows_affected();
        let endpoints: Vec<Uuid> = sqlx::query_scalar(
            "UPDATE webhook_endpoints SET active = false WHERE merchant_id = $1 AND active RETURNING id",
        )
        .bind(merchant)
        .fetch_all(&mut *tx)
        .await
        .map_err(db)?;
        let deliveries = sqlx::query(
            "UPDATE webhook_deliveries SET status = 'FAILED', last_error = 'endpoint disabled: its Sandbox Project was deleted'
              WHERE status = 'PENDING'
                AND endpoint_id IN (SELECT id FROM webhook_endpoints WHERE merchant_id = $1 AND NOT active)",
        )
        .bind(merchant)
        .execute(&mut *tx)
        .await
        .map_err(db)?
        .rows_affected();
        business = serde_json::json!({
            "merchant_id": merchant,
            "sessions_cancelled": r.sessions_cancelled,
            "links_cancelled": r.links_cancelled,
            "acquiring_payments_failed": r.acquiring_payments_failed,
            "accounts_closed": r.accounts_closed,
            "suspended": suspended > 0,
            "webhook_endpoints_disabled": endpoints.len(),
            "pending_deliveries_ended": deliveries,
        });
    }

    // Test metadata with no remaining purpose once the Project cannot act.
    sqlx::query("DELETE FROM sandbox_project_rail_states WHERE project_id = $1")
        .bind(project)
        .execute(&mut *tx)
        .await
        .map_err(db)?;
    sqlx::query("DELETE FROM sandbox_test_fundings WHERE project_id = $1")
        .bind(project)
        .execute(&mut *tx)
        .await
        .map_err(db)?;

    let result = serde_json::json!({
        "project_id": project,
        "pass_id": pass,
        "test_payers_retired": payers.len(),
        "payment_sessions_cancelled": attributed_sessions,
        "payment_links_cancelled": attributed_links,
        "acquiring_payments_failed": attributed_cash_in_failed,
        "business": business,
        "business_owned": owned.is_some(),
        "business_orphaned": orphaned.is_some(),
        "business_retired": owned.or(orphaned).is_some() && body.retire_business,
        "retired_minor": retired_minor,
    });
    sqlx::query(
        "INSERT INTO audit_log (actor, action, subject, metadata) VALUES ($1, 'SANDBOX_PROJECT_RETIRED', $2, $3)",
    )
    .bind(format!("DEVELOPER:{by}"))
    .bind(format!("project:{project}"))
    .bind(&result)
    .execute(&mut *tx)
    .await
    .map_err(db)?;
    tx.commit().await.map_err(db)?;

    for payer in &payers {
        let _ = state
            .identity
            .suspend(
                banzami_types::ConsumerId::from_uuid(*payer),
                Some("Sandbox Project deleted".into()),
            )
            .await;
    }
    tracing::info!(project_id = %project, pass_id = pass, retired_minor, "sandbox project retired");
    Ok(Json(result))
}

/// Whether Core has begun retiring a Project. A retired Project creates nothing.
pub async fn is_retired(pool: &sqlx::PgPool, project: Uuid) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM sandbox_retired_projects WHERE project_id = $1)",
    )
    .bind(project)
    .fetch_one(pool)
    .await
}
