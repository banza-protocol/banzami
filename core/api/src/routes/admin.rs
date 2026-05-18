/// Admin-only routes for operational control and incident management.
///
/// /internal/v1/admin/freeze          — freeze an entity (merchant or consumer)
/// /internal/v1/admin/freeze/:type/:id — lift an existing freeze
/// /internal/v1/admin/risk-flags      — list active risk flags
/// /internal/v1/admin/audit-log       — query the immutable audit log
/// /internal/v1/admin/acquiring-recon — trigger and query acquiring reconciliation

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    routes::risk,
    state::AppState,
};

// ---------------------------------------------------------------------------
// Freeze / Unfreeze
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct FreezeBody {
    pub entity_type: String, // "MERCHANT" or "CONSUMER"
    pub entity_id:   String,
    pub reason:      String,
    pub frozen_by:   Option<String>,
}

#[derive(Serialize)]
pub struct FreezeResponse {
    pub id:          String,
    pub entity_type: String,
    pub entity_id:   String,
    pub reason:      String,
    pub frozen_by:   String,
    pub created_at:  chrono::DateTime<Utc>,
}

/// POST /internal/v1/admin/freeze — freeze a merchant or consumer account.
pub async fn freeze_account(
    State(state): State<AppState>,
    Json(body):   Json<FreezeBody>,
) -> ApiResult<(StatusCode, Json<FreezeResponse>)> {
    if !matches!(body.entity_type.as_str(), "MERCHANT" | "CONSUMER") {
        return Err(ApiError::bad_request("entity_type must be MERCHANT or CONSUMER"));
    }
    if body.reason.trim().is_empty() {
        return Err(ApiError::bad_request("reason is required"));
    }
    let entity_id: Uuid = body.entity_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid entity_id"))?;

    let frozen_by = body.frozen_by.as_deref().unwrap_or("ADMIN").to_string();
    let now       = Utc::now();

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO account_freezes (entity_type, entity_id, reason, frozen_by, created_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id",
    )
    .bind(&body.entity_type)
    .bind(entity_id)
    .bind(body.reason.trim())
    .bind(&frozen_by)
    .bind(now)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    risk::audit(
        &state.pool,
        &format!("ADMIN:{frozen_by}"),
        "ACCOUNT_FROZEN",
        &format!("{}:{}", body.entity_type, entity_id),
        serde_json::json!({
            "freeze_id": id.to_string(),
            "reason":    body.reason.trim(),
        }),
        None,
    ).await;

    tracing::warn!(
        entity_type = %body.entity_type,
        entity_id   = %entity_id,
        reason      = %body.reason.trim(),
        frozen_by   = %frozen_by,
        "account frozen"
    );

    Ok((StatusCode::CREATED, Json(FreezeResponse {
        id: id.to_string(),
        entity_type: body.entity_type,
        entity_id: entity_id.to_string(),
        reason: body.reason.trim().to_string(),
        frozen_by,
        created_at: now,
    })))
}

#[derive(Deserialize)]
pub struct UnfreezeBody {
    pub reason:    String,
    pub lifted_by: Option<String>,
}

/// DELETE /internal/v1/admin/freeze/:entity_type/:entity_id — lift all active freezes on entity.
pub async fn unfreeze_account(
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, String)>,
    Json(body): Json<UnfreezeBody>,
) -> ApiResult<Json<serde_json::Value>> {
    if !matches!(entity_type.as_str(), "MERCHANT" | "CONSUMER") {
        return Err(ApiError::bad_request("entity_type must be MERCHANT or CONSUMER"));
    }
    if body.reason.trim().is_empty() {
        return Err(ApiError::bad_request("reason is required"));
    }
    let entity_id_uuid: Uuid = entity_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid entity_id"))?;

    let lifted_by = body.lifted_by.as_deref().unwrap_or("ADMIN").to_string();
    let now       = Utc::now();

    let rows_updated = sqlx::query(
        "UPDATE account_freezes
         SET lifted_at = $1, lifted_by = $2, lift_reason = $3
         WHERE entity_type = $4 AND entity_id = $5 AND lifted_at IS NULL",
    )
    .bind(now)
    .bind(&lifted_by)
    .bind(body.reason.trim())
    .bind(&entity_type)
    .bind(entity_id_uuid)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .rows_affected();

    if rows_updated == 0 {
        return Err(ApiError::not_found("no active freeze found for this entity"));
    }

    risk::audit(
        &state.pool,
        &format!("ADMIN:{lifted_by}"),
        "ACCOUNT_UNFROZEN",
        &format!("{entity_type}:{entity_id}"),
        serde_json::json!({
            "reason":    body.reason.trim(),
            "lifted_by": lifted_by,
        }),
        None,
    ).await;

    tracing::info!(
        entity_type  = %entity_type,
        entity_id    = %entity_id,
        rows_lifted  = rows_updated,
        "account freeze lifted"
    );

    Ok(Json(serde_json::json!({
        "entity_type":   entity_type,
        "entity_id":     entity_id,
        "freezes_lifted": rows_updated,
        "lifted_at":     now,
    })))
}

// ---------------------------------------------------------------------------
// Risk flags
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct RiskFlagRow {
    pub id:          String,
    pub entity_type: String,
    pub entity_id:   String,
    pub flag_type:   String,
    pub severity:    String,
    pub description: String,
    pub resolved:    bool,
    pub created_at:  chrono::DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct RiskFlagsQuery {
    pub entity_type: Option<String>,
    pub entity_id:   Option<String>,
    pub resolved:    Option<bool>,
}

/// GET /internal/v1/admin/risk-flags — list risk flags (active by default).
pub async fn list_risk_flags(
    State(state): State<AppState>,
    Query(q):     Query<RiskFlagsQuery>,
) -> ApiResult<Json<Vec<RiskFlagRow>>> {
    let resolved = q.resolved.unwrap_or(false);
    let rows: Vec<(Uuid, String, Uuid, String, String, String, bool, chrono::DateTime<Utc>)> =
        sqlx::query_as(
            "SELECT id, entity_type, entity_id, flag_type, severity, description, resolved, created_at
             FROM risk_flags
             WHERE resolved = $1
             ORDER BY created_at DESC
             LIMIT 200",
        )
        .bind(resolved)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(rows.into_iter().map(|(id, entity_type, entity_id, flag_type, severity, description, resolved, created_at)| {
        RiskFlagRow { id: id.to_string(), entity_type, entity_id: entity_id.to_string(), flag_type, severity, description, resolved, created_at }
    }).collect()))
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct AuditLogQuery {
    pub subject:    Option<String>,
    pub actor:      Option<String>,
    pub action:     Option<String>,
    pub limit:      Option<i64>,
}

/// GET /internal/v1/admin/audit-log — query the immutable audit log.
pub async fn query_audit_log(
    State(state): State<AppState>,
    Query(q):     Query<AuditLogQuery>,
) -> ApiResult<Json<Vec<serde_json::Value>>> {
    let limit = q.limit.unwrap_or(100).min(500);

    let rows: Vec<(Uuid, String, String, String, serde_json::Value, Option<String>, chrono::DateTime<Utc>)> =
        sqlx::query_as(
            "SELECT id, actor, action, subject, metadata, request_id, created_at
             FROM audit_log
             WHERE ($1::TEXT IS NULL OR subject = $1)
               AND ($2::TEXT IS NULL OR actor   = $2)
               AND ($3::TEXT IS NULL OR action  = $3)
             ORDER BY created_at DESC
             LIMIT $4",
        )
        .bind(q.subject.as_deref())
        .bind(q.actor.as_deref())
        .bind(q.action.as_deref())
        .bind(limit)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(rows.into_iter().map(|(id, actor, action, subject, metadata, request_id, created_at)| {
        serde_json::json!({
            "id":         id.to_string(),
            "actor":      actor,
            "action":     action,
            "subject":    subject,
            "metadata":   metadata,
            "request_id": request_id,
            "created_at": created_at,
        })
    }).collect()))
}

// ---------------------------------------------------------------------------
// Acquiring reconciliation
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct AcquiringReconQuery {
    /// ISO date: "2026-05-18". Defaults to yesterday.
    pub date: Option<String>,
}

/// POST /internal/v1/admin/acquiring-recon
///
/// Compares acquiring_callbacks (processed=true) to ledger_postings for a given
/// date. Inserts results into acquiring_reconciliation_runs / _items.
/// Safe to re-run — uses ON CONFLICT (reconciliation_date) DO NOTHING so only
/// one completed run per day is persisted.
pub async fn run_acquiring_reconciliation(
    State(state): State<AppState>,
    Query(q):     Query<AcquiringReconQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let recon_date: NaiveDate = match q.date.as_deref() {
        Some(s) => s.parse().map_err(|_| ApiError::bad_request("date must be YYYY-MM-DD"))?,
        None    => (Utc::now() - chrono::Duration::days(1)).date_naive(),
    };

    // Insert the run row. UNIQUE(reconciliation_date) prevents duplicate completed runs.
    let run_id: Uuid = sqlx::query_scalar(
        "INSERT INTO acquiring_reconciliation_runs (reconciliation_date, status)
         VALUES ($1, 'RUNNING')
         ON CONFLICT (reconciliation_date) DO UPDATE
             SET status = 'RUNNING', started_at = now(), completed_at = NULL, error_message = NULL
         RETURNING id",
    )
    .bind(recon_date)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // Fetch all processed callbacks for the date.
    type CallbackRow = (Uuid, Option<String>, serde_json::Value);
    let callbacks: Vec<CallbackRow> = sqlx::query_as(
        "SELECT id, external_ref, raw_payload
         FROM acquiring_callbacks
         WHERE processed = TRUE
           AND DATE(received_at AT TIME ZONE 'UTC') = $1
         ORDER BY received_at",
    )
    .bind(recon_date)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let total = callbacks.len() as i64;
    let mut matched            = 0i64;
    let mut missing_posting    = 0i64;
    let mut amount_mismatch    = 0i64;
    let mut duplicate_callbacks = 0i64;
    let mut discrepancy_total  = 0i64;

    for (cb_id, ext_ref_opt, _payload) in &callbacks {
        let ext_ref = match ext_ref_opt {
            Some(r) => r,
            None => {
                // No external ref — record as missing posting.
                missing_posting += 1;
                let _ = sqlx::query(
                    "INSERT INTO acquiring_reconciliation_items
                     (run_id, callback_id, external_ref, status, notes, reconciled_at)
                     VALUES ($1, $2, 'UNKNOWN', 'MISSING_POSTING', 'callback has no external_ref', now())",
                ).bind(run_id).bind(cb_id).execute(&state.pool).await;
                continue;
            }
        };

        // Find the corresponding acquiring_payment.
        let payment: Option<(Uuid, i64, String)> = sqlx::query_as(
            "SELECT id, amount_minor, currency FROM acquiring_payments WHERE external_ref = $1",
        )
        .bind(ext_ref)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

        let (payment_id, expected_amount, currency) = match payment {
            Some(p) => p,
            None => {
                missing_posting += 1;
                let _ = sqlx::query(
                    "INSERT INTO acquiring_reconciliation_items
                     (run_id, callback_id, external_ref, status, notes, reconciled_at)
                     VALUES ($1, $2, $3, 'MISSING_POSTING', 'no acquiring_payment found', now())",
                ).bind(run_id).bind(cb_id).bind(ext_ref).execute(&state.pool).await;
                continue;
            }
        };

        // Check for the ledger posting.
        let idem_key = format!("acquiring-settle-{payment_id}");
        let posting: Option<(Uuid, i64)> = sqlx::query_as(
            "SELECT lp.id, le.amount_minor
             FROM ledger_postings lp
             JOIN ledger_entries  le ON le.posting_id = lp.id AND le.entry_type = 'CREDIT'
             WHERE lp.idempotency_key = $1
             LIMIT 1",
        )
        .bind(&idem_key)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

        match posting {
            None => {
                missing_posting += 1;
                discrepancy_total += expected_amount;
                let _ = sqlx::query(
                    "INSERT INTO acquiring_reconciliation_items
                     (run_id, callback_id, acquiring_payment_id, external_ref,
                      callback_amount_minor, currency, status, discrepancy_minor, reconciled_at)
                     VALUES ($1,$2,$3,$4,$5,$6,'MISSING_POSTING',$5,now())",
                )
                .bind(run_id).bind(cb_id).bind(payment_id).bind(ext_ref)
                .bind(expected_amount).bind(&currency)
                .execute(&state.pool).await;
            }
            Some((_posting_id, ledger_amount)) if ledger_amount == expected_amount => {
                matched += 1;
                let _ = sqlx::query(
                    "INSERT INTO acquiring_reconciliation_items
                     (run_id, callback_id, acquiring_payment_id, external_ref,
                      callback_amount_minor, ledger_amount_minor, currency, status, reconciled_at)
                     VALUES ($1,$2,$3,$4,$5,$5,$6,'MATCHED',now())",
                )
                .bind(run_id).bind(cb_id).bind(payment_id).bind(ext_ref)
                .bind(expected_amount).bind(&currency)
                .execute(&state.pool).await;
            }
            Some((_posting_id, ledger_amount)) => {
                amount_mismatch += 1;
                let discrepancy = (ledger_amount - expected_amount).abs();
                discrepancy_total += discrepancy;
                let _ = sqlx::query(
                    "INSERT INTO acquiring_reconciliation_items
                     (run_id, callback_id, acquiring_payment_id, external_ref,
                      callback_amount_minor, ledger_amount_minor, currency,
                      status, discrepancy_minor, reconciled_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,'AMOUNT_MISMATCH',$8,now())",
                )
                .bind(run_id).bind(cb_id).bind(payment_id).bind(ext_ref)
                .bind(expected_amount).bind(ledger_amount).bind(&currency).bind(discrepancy)
                .execute(&state.pool).await;
            }
        }
    }

    // Mark run as completed.
    sqlx::query(
        "UPDATE acquiring_reconciliation_runs SET
             status = 'COMPLETED', completed_at = now(),
             total_callbacks = $2, matched = $3, missing_posting = $4,
             amount_mismatch = $5, duplicate_callbacks = $6,
             total_discrepancy_minor = $7
         WHERE id = $1",
    )
    .bind(run_id)
    .bind(total)
    .bind(matched)
    .bind(missing_posting)
    .bind(amount_mismatch)
    .bind(duplicate_callbacks)
    .bind(discrepancy_total)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    risk::audit(
        &state.pool,
        "SYSTEM",
        "RECONCILIATION_RUN",
        "ACQUIRING",
        serde_json::json!({
            "run_id":             run_id.to_string(),
            "date":               recon_date.to_string(),
            "total":              total,
            "matched":            matched,
            "missing_posting":    missing_posting,
            "amount_mismatch":    amount_mismatch,
            "discrepancy_total":  discrepancy_total,
        }),
        None,
    ).await;

    tracing::info!(
        run_id            = %run_id,
        date              = %recon_date,
        total             = total,
        matched           = matched,
        missing_posting   = missing_posting,
        amount_mismatch   = amount_mismatch,
        discrepancy_total = discrepancy_total,
        "acquiring reconciliation completed"
    );

    Ok(Json(serde_json::json!({
        "run_id":                run_id.to_string(),
        "reconciliation_date":   recon_date.to_string(),
        "status":                "COMPLETED",
        "total_callbacks":       total,
        "matched":               matched,
        "missing_posting":       missing_posting,
        "amount_mismatch":       amount_mismatch,
        "total_discrepancy_minor": discrepancy_total,
    })))
}

/// GET /internal/v1/admin/acquiring-recon — list recent reconciliation runs.
pub async fn list_acquiring_reconciliation_runs(
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<serde_json::Value>>> {
    let rows: Vec<(Uuid, NaiveDate, String, i64, i64, i64, i64, i64, chrono::DateTime<Utc>)> =
        sqlx::query_as(
            "SELECT id, reconciliation_date, status,
                    total_callbacks, matched, missing_posting, amount_mismatch,
                    total_discrepancy_minor, started_at
             FROM acquiring_reconciliation_runs
             ORDER BY reconciliation_date DESC
             LIMIT 30",
        )
        .fetch_all(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(rows.into_iter().map(|(id, date, status, total, matched, missing, mismatch, discrepancy, started_at)| {
        serde_json::json!({
            "id":                     id.to_string(),
            "reconciliation_date":    date.to_string(),
            "status":                 status,
            "total_callbacks":        total,
            "matched":                matched,
            "missing_posting":        missing,
            "amount_mismatch":        mismatch,
            "total_discrepancy_minor": discrepancy,
            "started_at":             started_at,
        })
    }).collect()))
}

/// GET /internal/v1/admin/acquiring-recon/:run_id — items for a reconciliation run.
pub async fn get_acquiring_reconciliation_run(
    State(state): State<AppState>,
    Path(run_id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let run_id_uuid: Uuid = run_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid run_id"))?;

    let run: Option<(Uuid, NaiveDate, String, i64, i64, i64, i64, i64, chrono::DateTime<Utc>, Option<chrono::DateTime<Utc>>)> =
        sqlx::query_as(
            "SELECT id, reconciliation_date, status,
                    total_callbacks, matched, missing_posting, amount_mismatch,
                    total_discrepancy_minor, started_at, completed_at
             FROM acquiring_reconciliation_runs WHERE id = $1",
        )
        .bind(run_id_uuid)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let (id, date, status, total, matched, missing, mismatch, discrepancy, started_at, completed_at) =
        run.ok_or_else(|| ApiError::not_found("reconciliation run not found"))?;

    let items: Vec<(Uuid, Uuid, Option<Uuid>, String, Option<i64>, Option<i64>, String, i64, chrono::DateTime<Utc>)> =
        sqlx::query_as(
            "SELECT id, callback_id, acquiring_payment_id, status,
                    callback_amount_minor, ledger_amount_minor,
                    external_ref, discrepancy_minor, reconciled_at
             FROM acquiring_reconciliation_items
             WHERE run_id = $1
             ORDER BY reconciled_at",
        )
        .bind(run_id_uuid)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "id":                     id.to_string(),
        "reconciliation_date":    date.to_string(),
        "status":                 status,
        "total_callbacks":        total,
        "matched":                matched,
        "missing_posting":        missing,
        "amount_mismatch":        mismatch,
        "total_discrepancy_minor": discrepancy,
        "started_at":             started_at,
        "completed_at":           completed_at,
        "items": items.into_iter().map(|(id, cb_id, pmt_id, status, cb_amt, ledger_amt, ext_ref, disc, reconciled_at)| {
            serde_json::json!({
                "id":                    id.to_string(),
                "callback_id":           cb_id.to_string(),
                "acquiring_payment_id":  pmt_id.map(|u| u.to_string()),
                "status":                status,
                "callback_amount_minor": cb_amt,
                "ledger_amount_minor":   ledger_amt,
                "external_ref":         ext_ref,
                "discrepancy_minor":    disc,
                "reconciled_at":        reconciled_at,
            })
        }).collect::<Vec<_>>(),
    })))
}
