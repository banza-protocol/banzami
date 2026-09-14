//! Resetting a Project's Sandbox test data (ADR-060 §10).
//!
//! A developer who has run a hundred tests wants a clean slate without asking
//! anyone. A clean slate here is NOT an empty database: every payment, refund,
//! receipt, posting and audit row stays exactly where it is. What changes is
//! what is still live:
//!
//!   - the Project's test payers are retired: their fictitious balance goes back
//!     to transit through the ledger, they are marked retired and suspended;
//!   - if the Project owns a synthetic Sandbox Business, its open Payment
//!     Sessions and Payment Links are cancelled, every account's fictitious
//!     balance is retired the same way, and its segregated (non-PRIMARY)
//!     accounts are closed.
//!
//! A Business the Project only connected to — a real one, or another Project's
//! synthetic one — is never touched: ownership is read from sandbox_businesses
//! and SANDBOX_SYNTHETIC, not from the caller. LIVE refuses before reading
//! anything. At most `RESETS_PER_DAY` per Project, counted from the audit log.

use axum::{extract::State, Json};
use serde::Deserialize;
use uuid::Uuid;

use banzami_identity::IdentityEngine;

use crate::{
    error::{ApiError, ApiResult},
    routes::sandbox_funds::retire_in_tx,
    state::AppState,
};

pub const RESETS_PER_DAY: i64 = 5;

#[derive(Deserialize)]
pub struct ResetBody {
    pub project_id: String,
    pub requested_by: String,
    pub idempotency_key: String,
}

/// POST /internal/v1/sandbox/projects/reset
pub async fn reset(
    State(state): State<AppState>,
    Json(body): Json<ResetBody>,
) -> ApiResult<Json<serde_json::Value>> {
    if state.environment.is_live() {
        return Err(ApiError::forbidden("test data exists only in the Sandbox"));
    }
    let project = Uuid::parse_str(&body.project_id)
        .map_err(|_| ApiError::bad_request("invalid project_id"))?;
    let by = body.requested_by.trim();
    let key = body.idempotency_key.trim();
    if by.is_empty() || by.len() > 200 || key.is_empty() || key.len() > 100 {
        return Err(ApiError::bad_request(
            "requested_by and idempotency_key are required",
        ));
    }
    let db = |e: sqlx::Error| ApiError::internal(e.to_string());
    let subject = format!("project:{project}");
    let reason = "Sandbox reset requested in the Developers Console";

    let mut tx = state.pool.begin().await.map_err(db)?;
    // One reset at a time per Project.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('sandbox-reset:' || $1::text))")
        .bind(project)
        .execute(&mut *tx)
        .await
        .map_err(db)?;

    // A replay of the same request answers what it did the first time.
    if let Some(prev) = sqlx::query_scalar::<_, serde_json::Value>(
        "SELECT metadata FROM audit_log WHERE action = 'SANDBOX_RESET' AND subject = $1
            AND metadata->>'idempotency_key' = $2 LIMIT 1",
    )
    .bind(&subject)
    .bind(key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db)?
    {
        return Ok(Json(
            serde_json::json!({ "replayed": true, "result": prev }),
        ));
    }
    let recent: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_log WHERE action = 'SANDBOX_RESET' AND subject = $1
            AND created_at > now() - interval '24 hours'",
    )
    .bind(&subject)
    .fetch_one(&mut *tx)
    .await
    .map_err(db)?;
    if recent >= RESETS_PER_DAY {
        return Err(ApiError::too_many_requests(
            "SANDBOX_RESET_LIMIT",
            "at most 5 Sandbox resets a day per Project",
        ));
    }

    let (payers, payers_minor) = retire_test_payers(
        &mut tx,
        &state,
        project,
        by,
        reason,
        &format!("reset:{key}"),
        "reset",
    )
    .await?;
    let mut retired_minor = payers_minor;

    // ── the Project's own synthetic Business ─────────────────────────────────
    let business = owned_synthetic_business(&mut tx, project).await?;
    let (mut sessions, mut links, mut closed) = (0u64, 0u64, 0u64);
    if let Some(merchant) = business {
        let r = retire_business(
            &mut tx,
            &state,
            merchant,
            by,
            reason,
            &format!("reset:{key}"),
            "sandbox_reset",
        )
        .await?;
        sessions = r.sessions_cancelled;
        links = r.links_cancelled;
        closed = r.accounts_closed;
        retired_minor += r.retired_minor;
    }

    let result = serde_json::json!({
        "idempotency_key": key,
        "test_payers_retired": payers.len(),
        "business_reset": business.is_some(),
        "payment_sessions_cancelled": sessions,
        "payment_links_cancelled": links,
        "accounts_closed": closed,
        "retired_minor": retired_minor,
    });
    sqlx::query(
        "INSERT INTO audit_log (actor, action, subject, metadata) VALUES ($1, 'SANDBOX_RESET', $2, $3)",
    )
    .bind(format!("DEVELOPER:{by}"))
    .bind(&subject)
    .bind(&result)
    .execute(&mut *tx)
    .await
    .map_err(db)?;
    tx.commit().await.map_err(db)?;

    // Suspension goes through the identity lifecycle, after the money is back.
    // A payer already suspended stays suspended; a failure here leaves a payer
    // that is retired (refused for payments and top-ups) and suspends on retry.
    for payer in &payers {
        let _ = state
            .identity
            .suspend(
                banzami_types::ConsumerId::from_uuid(*payer),
                Some("Sandbox reset".into()),
            )
            .await;
    }
    Ok(Json(
        serde_json::json!({ "replayed": false, "result": result }),
    ))
}

// ── retirement steps shared by a reset and a deletion ────────────────────────
//
// Each step is state-based: a payer already retired is skipped, only CREATED /
// ACTIVE sessions and ACTIVE links are cancelled, and a balance is retired only
// if one remains (`retire_in_tx` posts nothing for zero and replays by key). A
// step that runs twice — a retried request, a resumed deletion — changes nothing
// the first run already changed and never posts twice.

type Tx<'a> = sqlx::Transaction<'a, sqlx::Postgres>;

/// Retires the Project's unretired test payers: fictitious balance back to
/// transit through the ledger, marked retired, audited. Returns the payers (to
/// suspend through the identity lifecycle after commit) and the value retired.
pub(crate) async fn retire_test_payers(
    tx: &mut Tx<'_>,
    state: &AppState,
    project: Uuid,
    by: &str,
    reason: &str,
    key_scope: &str,
    via: &str,
) -> ApiResult<(Vec<Uuid>, i64)> {
    let db = |e: sqlx::Error| ApiError::internal(e.to_string());
    // Every payer of the Project, retired or not: value that reached an already
    // retired payer (a refund or a credit that was in flight when it was retired)
    // is retired by the next pass. A zero balance posts nothing.
    let all: Vec<(Uuid, bool)> = sqlx::query_as(
        "SELECT consumer_id, retired_at IS NOT NULL FROM sandbox_test_payers WHERE project_id = $1 FOR UPDATE",
    )
    .bind(project)
    .fetch_all(&mut **tx)
    .await
    .map_err(db)?;
    let mut payers: Vec<Uuid> = Vec::new();
    let mut retired_minor: i64 = 0;
    for (payer, already_retired) in &all {
        let has_wallet: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM consumer_wallets WHERE consumer_id = $1 AND currency = 'AOA')",
        )
        .bind(payer)
        .fetch_one(&mut **tx)
        .await
        .map_err(db)?;
        if has_wallet {
            let (amount, _) = retire_in_tx(
                tx,
                state.transit_account_id.as_uuid(),
                "CONSUMER",
                *payer,
                reason,
                by,
                &format!("{key_scope}:payer:{payer}"),
            )
            .await?;
            retired_minor += amount;
        }
        if *already_retired {
            continue;
        }
        payers.push(*payer);
        sqlx::query("UPDATE sandbox_test_payers SET retired_at = now() WHERE consumer_id = $1")
            .bind(payer)
            .execute(&mut **tx)
            .await
            .map_err(db)?;
        sqlx::query(
            "INSERT INTO audit_log (actor, action, subject, metadata) VALUES ($1, 'SANDBOX_TEST_PAYER_RETIRED', $2, $3)",
        )
        .bind(format!("DEVELOPER:{by}"))
        .bind(format!("consumer:{payer}"))
        .bind(serde_json::json!({ "project_id": project, "via": via }))
        .execute(&mut **tx)
        .await
        .map_err(db)?;
    }
    Ok((payers, retired_minor))
}

/// The synthetic Sandbox Business the Project owns, if any. Ownership is read
/// from sandbox_businesses and SANDBOX_SYNTHETIC, never taken from a caller.
pub(crate) async fn owned_synthetic_business(
    tx: &mut Tx<'_>,
    project: Uuid,
) -> ApiResult<Option<Uuid>> {
    sqlx::query_scalar(
        "SELECT sb.merchant_id FROM sandbox_businesses sb
           JOIN merchant_compliance c ON c.merchant_id = sb.merchant_id
          WHERE sb.project_id = $1 AND c.kyb_status = 'SANDBOX_SYNTHETIC'",
    )
    .bind(project)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))
}

#[derive(Default)]
pub(crate) struct BusinessRetired {
    pub sessions_cancelled: u64,
    pub links_cancelled: u64,
    pub accounts_closed: u64,
    pub retired_minor: i64,
}

/// Cancels a Business's open sessions and links, retires every account's
/// fictitious balance and closes its segregated accounts. Refuses while a
/// settlement is still in flight.
pub(crate) async fn retire_business(
    tx: &mut Tx<'_>,
    state: &AppState,
    merchant: Uuid,
    by: &str,
    reason: &str,
    key_scope: &str,
    via: &str,
) -> ApiResult<BusinessRetired> {
    let db = |e: sqlx::Error| ApiError::internal(e.to_string());
    let mut out = BusinessRetired::default();
    let pending: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM app_settlements s JOIN wallet_accounts wa ON wa.account_id = s.source_account_id
          WHERE wa.merchant_id = $1 AND s.status IN ('CREATED','PENDING')",
    )
    .bind(merchant)
    .fetch_one(&mut **tx)
    .await
    .map_err(db)?;
    if pending > 0 {
        return Err(ApiError::conflict(
            "PENDING_SETTLEMENT",
            "a settlement has not finished; try again once it has",
        ));
    }
    out.sessions_cancelled = sqlx::query_scalar::<_, i64>(
        "WITH s AS (
            UPDATE payment_sessions SET status = 'CANCELLED', updated_at = now()
             WHERE merchant_id = $1 AND status IN ('CREATED','ACTIVE')
         RETURNING qr_code_id
         ), q AS (
            UPDATE qr_codes SET status = 'EXPIRED'
             WHERE id IN (SELECT qr_code_id FROM s) AND status = 'ACTIVE'
         )
         SELECT count(*) FROM s",
    )
    .bind(merchant)
    .fetch_one(&mut **tx)
    .await
    .map_err(db)? as u64;
    out.links_cancelled = sqlx::query(
        "UPDATE payment_links SET status = 'CANCELLED', updated_at = now()
          WHERE merchant_id = $1 AND status = 'ACTIVE'",
    )
    .bind(merchant)
    .execute(&mut **tx)
    .await
    .map_err(db)?
    .rows_affected();

    let (amount, _) = retire_in_tx(
        tx,
        state.transit_account_id.as_uuid(),
        "MERCHANT",
        merchant,
        reason,
        by,
        &format!("{key_scope}:business:{merchant}"),
    )
    .await?;
    out.retired_minor += amount;

    let segregated: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id FROM wallet_accounts WHERE merchant_id = $1 AND purpose <> 'PRIMARY' AND status <> 'CLOSED' FOR UPDATE",
    )
    .bind(merchant)
    .fetch_all(&mut **tx)
    .await
    .map_err(db)?;
    for account in segregated {
        let (amount, _) = retire_in_tx(
            tx,
            state.transit_account_id.as_uuid(),
            "WALLET_ACCOUNT",
            account,
            reason,
            by,
            &format!("{key_scope}:account:{account}"),
        )
        .await?;
        out.retired_minor += amount;
        sqlx::query(
            "UPDATE wallet_accounts SET status = 'CLOSED', updated_at = now() WHERE id = $1",
        )
        .bind(account)
        .execute(&mut **tx)
        .await
        .map_err(db)?;
        sqlx::query(
            "INSERT INTO audit_log (actor, action, subject, metadata) VALUES ($1, 'WALLET_ACCOUNT_CLOSED', $2, $3)",
        )
        .bind(format!("DEVELOPER:{by}"))
        .bind(format!("wallet_account:{account}"))
        .bind(serde_json::json!({ "merchant_id": merchant, "reason": reason, "via": via }))
        .execute(&mut **tx)
        .await
        .map_err(db)?;
        out.accounts_closed += 1;
    }
    Ok(out)
}
