use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    routes::risk,
    state::AppState,
};

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Serialize, Debug)]
pub struct DisputeResponse {
    pub id: String,
    pub transaction_id: String,
    pub merchant_id: String,
    pub consumer_id: String,
    pub amount_minor: i64,
    pub currency: String,
    pub reason: String,
    pub status: String,
    pub evidence_deadline: Option<DateTime<Utc>>,
    pub resolution_notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
}

#[derive(Serialize, Debug)]
pub struct EvidenceResponse {
    pub id: String,
    pub dispute_id: String,
    pub submitted_by: String,
    pub party: String,
    pub description: String,
    pub file_url: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// POST /internal/v1/disputes — open a dispute (consumer-initiated)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct OpenDisputeBody {
    pub transaction_id: String,
    pub consumer_id: String,
    pub reason: String,
}

pub async fn open(
    State(state): State<AppState>,
    Json(body): Json<OpenDisputeBody>,
) -> ApiResult<(StatusCode, Json<DisputeResponse>)> {
    if body.reason.trim().is_empty() {
        return Err(ApiError::bad_request("reason is required"));
    }

    let transaction_id: Uuid = body
        .transaction_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid transaction_id"))?;
    let consumer_id: Uuid = body
        .consumer_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer_id"))?;

    // Fetch transaction — must be CAPTURED or SETTLED
    // Note: transactions have no consumer_id; ownership is asserted by the caller.
    let tx = sqlx::query!(
        r#"
        SELECT id, merchant_id, amount_minor, currency, status
        FROM transactions
        WHERE id = $1
        "#,
        transaction_id,
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("transaction not found"))?;

    if !["CAPTURED", "SETTLED"].contains(&tx.status.as_str()) {
        return Err(ApiError::unprocessable(
            "INVALID_TRANSACTION_STATUS",
            "only CAPTURED or SETTLED transactions can be disputed",
        ));
    }

    // Prevent duplicate open dispute on same transaction
    let existing: Option<Uuid> = sqlx::query_scalar!(
        r#"
        SELECT id FROM disputes
        WHERE transaction_id = $1
          AND status NOT IN ('WON_BY_CONSUMER', 'WON_BY_MERCHANT', 'CLOSED')
        "#,
        transaction_id,
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    if existing.is_some() {
        return Err(ApiError::unprocessable(
            "DISPUTE_ALREADY_OPEN",
            "a dispute for this transaction is already open",
        ));
    }

    let merchant_id: Uuid = tx.merchant_id;
    let amount_minor: i64 = tx.amount_minor;
    let currency: String = tx.currency;

    let dispute_id = Uuid::new_v4();
    let evidence_deadline = Utc::now() + Duration::days(7);

    sqlx::query!(
        r#"
        INSERT INTO disputes
            (id, transaction_id, merchant_id, consumer_id, amount_minor, currency,
             reason, status, evidence_deadline)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8)
        "#,
        dispute_id,
        transaction_id,
        merchant_id,
        consumer_id,
        amount_minor,
        currency,
        body.reason.trim(),
        evidence_deadline,
    )
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // Audit log
    risk::audit(
        &state.pool,
        "CONSUMER",
        "DISPUTE_OPENED",
        &format!("transaction:{transaction_id}"),
        serde_json::json!({
            "dispute_id": dispute_id,
            "merchant_id": merchant_id,
            "reason": body.reason,
        }),
        None,
    )
    .await;

    // Emit dispute.opened to the outbox (delivered to the affected merchant only).
    // Idempotent on the dispute id — only one event per dispute opening.
    let _ = super::webhooks::emit(
        &state.pool,
        merchant_id,
        "dispute.opened",
        &format!("dispute.opened:{dispute_id}"),
        serde_json::json!({
            "dispute_id": dispute_id,
            "transaction_id": transaction_id,
            "merchant_id": merchant_id,
            "consumer_id": consumer_id,
            "amount_minor": amount_minor,
            "currency": currency,
            "status": "OPEN",
            "reason": body.reason,
            "trace_id": dispute_id,
            "created_at": Utc::now(),
        }),
    )
    .await;

    let dispute = fetch_dispute(&state.pool, dispute_id).await?;
    Ok((StatusCode::CREATED, Json(dispute)))
}

// ---------------------------------------------------------------------------
// GET /internal/v1/disputes/:id
// ---------------------------------------------------------------------------

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<DisputeResponse>> {
    let id: Uuid = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid dispute id"))?;
    Ok(Json(fetch_dispute(&state.pool, id).await?))
}

// ---------------------------------------------------------------------------
// GET /internal/v1/disputes?merchant_id=|consumer_id=&status=
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ListDisputesQuery {
    pub merchant_id: Option<String>,
    pub consumer_id: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListDisputesQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let limit = q.limit.unwrap_or(20).clamp(1, 100);

    let rows = sqlx::query!(
        r#"
        SELECT id, transaction_id, merchant_id, consumer_id, amount_minor, currency,
               reason, status, evidence_deadline, resolution_notes, created_at,
               updated_at, resolved_at
        FROM disputes
        WHERE ($1::uuid IS NULL OR merchant_id = $1)
          AND ($2::uuid IS NULL OR consumer_id = $2)
          AND ($3::text  IS NULL OR status     = $3)
        ORDER BY created_at DESC
        LIMIT $4
        "#,
        q.merchant_id
            .as_deref()
            .and_then(|s| s.parse::<Uuid>().ok()),
        q.consumer_id
            .as_deref()
            .and_then(|s| s.parse::<Uuid>().ok()),
        q.status,
        limit,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let data: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id":                r.id,
                "transaction_id":    r.transaction_id,
                "merchant_id":       r.merchant_id,
                "consumer_id":       r.consumer_id,
                "amount_minor":      r.amount_minor,
                "currency":          r.currency,
                "reason":            r.reason,
                "status":            r.status,
                "evidence_deadline": r.evidence_deadline,
                "resolution_notes":  r.resolution_notes,
                "created_at":        r.created_at,
                "updated_at":        r.updated_at,
                "resolved_at":       r.resolved_at,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "data": data })))
}

// ---------------------------------------------------------------------------
// POST /internal/v1/disputes/:id/evidence — submit evidence
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct SubmitEvidenceBody {
    pub submitted_by: String,
    pub party: String, // CONSUMER | MERCHANT
    pub description: String,
    pub file_url: Option<String>,
}

pub async fn submit_evidence(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<SubmitEvidenceBody>,
) -> ApiResult<(StatusCode, Json<EvidenceResponse>)> {
    let dispute_id: Uuid = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid dispute id"))?;
    let submitted_by: Uuid = body
        .submitted_by
        .parse()
        .map_err(|_| ApiError::bad_request("invalid submitted_by"))?;

    if !["CONSUMER", "MERCHANT"].contains(&body.party.as_str()) {
        return Err(ApiError::bad_request("party must be CONSUMER or MERCHANT"));
    }
    if body.description.trim().is_empty() {
        return Err(ApiError::bad_request("description is required"));
    }

    // Ensure dispute is still accepting evidence
    let dispute_status: String =
        sqlx::query_scalar!("SELECT status FROM disputes WHERE id = $1", dispute_id,)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?
            .ok_or_else(|| ApiError::not_found("dispute not found"))?;

    if ["WON_BY_CONSUMER", "WON_BY_MERCHANT", "CLOSED"].contains(&dispute_status.as_str()) {
        return Err(ApiError::unprocessable(
            "DISPUTE_CLOSED",
            "cannot submit evidence to a closed dispute",
        ));
    }

    let evidence_id = Uuid::new_v4();
    sqlx::query!(
        r#"
        INSERT INTO dispute_evidence
            (id, dispute_id, submitted_by, party, description, file_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
        evidence_id,
        dispute_id,
        submitted_by,
        body.party,
        body.description.trim(),
        body.file_url,
    )
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // Advance dispute to UNDER_REVIEW if still OPEN
    sqlx::query!(
        "UPDATE disputes SET status = 'UNDER_REVIEW', updated_at = NOW() WHERE id = $1 AND status = 'OPEN'",
        dispute_id,
    )
    .execute(&state.pool)
    .await
    .ok();

    let row = sqlx::query!(
        "SELECT id, dispute_id, submitted_by, party, description, file_url, created_at
         FROM dispute_evidence WHERE id = $1",
        evidence_id,
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(EvidenceResponse {
            id: row.id.to_string(),
            dispute_id: row.dispute_id.to_string(),
            submitted_by: row.submitted_by.to_string(),
            party: row.party,
            description: row.description,
            file_url: row.file_url,
            created_at: row.created_at,
        }),
    ))
}

// ---------------------------------------------------------------------------
// POST /internal/v1/disputes/:id/resolve — admin resolves dispute
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ResolveDisputeBody {
    pub outcome: String, // WON_BY_CONSUMER | WON_BY_MERCHANT | CLOSED
    pub resolution_notes: Option<String>,
    pub resolved_by: String,
}

pub async fn resolve(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ResolveDisputeBody>,
) -> ApiResult<Json<DisputeResponse>> {
    let dispute_id: Uuid = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid dispute id"))?;
    let resolved_by: Uuid = body
        .resolved_by
        .parse()
        .map_err(|_| ApiError::bad_request("invalid resolved_by"))?;

    if !["WON_BY_CONSUMER", "WON_BY_MERCHANT", "CLOSED"].contains(&body.outcome.as_str()) {
        return Err(ApiError::bad_request(
            "outcome must be WON_BY_CONSUMER, WON_BY_MERCHANT, or CLOSED",
        ));
    }

    let dispute = sqlx::query!(
        r#"
        SELECT id, transaction_id, merchant_id, consumer_id, amount_minor, currency, status
        FROM disputes
        WHERE id = $1
        "#,
        dispute_id,
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("dispute not found"))?;

    if ["WON_BY_CONSUMER", "WON_BY_MERCHANT", "CLOSED"].contains(&dispute.status.as_str()) {
        return Err(ApiError::unprocessable(
            "DISPUTE_ALREADY_RESOLVED",
            "dispute is already resolved",
        ));
    }

    let now = Utc::now();

    // If consumer wins, issue a refund posting (merchant DR, consumer CR)
    if body.outcome == "WON_BY_CONSUMER" {
        let ledger_key = format!("dispute-refund-{dispute_id}");

        let merchant_account: Option<Uuid> = sqlx::query_scalar!(
            r#"
            SELECT available_account_id FROM wallets
            WHERE merchant_id = $1 AND currency = $2 AND status = 'ACTIVE'
            LIMIT 1
            "#,
            dispute.merchant_id,
            dispute.currency,
        )
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

        let consumer_account: Option<Uuid> = sqlx::query_scalar!(
            r#"
            SELECT cw.available_account_id
            FROM consumer_wallets cw
            WHERE cw.consumer_id = $1 AND cw.currency = $2 AND cw.status = 'ACTIVE'
            "#,
            dispute.consumer_id,
            dispute.currency,
        )
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

        if let (Some(ma), Some(ca)) = (merchant_account, consumer_account) {
            let posting_id = Uuid::new_v4();
            sqlx::query!(
                "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
                 VALUES ($1, $2, $3, $4) ON CONFLICT (idempotency_key) DO NOTHING",
                posting_id,
                format!("dispute-refund:{dispute_id}"),
                ledger_key,
                now,
            )
            .execute(&state.pool)
            .await
            .ok();

            let pid: Uuid = sqlx::query_scalar!(
                "SELECT id FROM ledger_postings WHERE idempotency_key = $1",
                ledger_key,
            )
            .fetch_one(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?;

            sqlx::query!(
                "INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
                 VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6) ON CONFLICT DO NOTHING",
                Uuid::new_v4(), pid, ma, dispute.amount_minor, dispute.currency, now,
            ).execute(&state.pool).await.ok();

            sqlx::query!(
                "INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
                 VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6) ON CONFLICT DO NOTHING",
                Uuid::new_v4(), pid, ca, dispute.amount_minor, dispute.currency, now,
            ).execute(&state.pool).await.ok();
        }
    }

    sqlx::query!(
        r#"
        UPDATE disputes
        SET status = $1, resolution_notes = $2, resolved_by = $3,
            resolved_at = $4, updated_at = $4
        WHERE id = $5
        "#,
        body.outcome,
        body.resolution_notes,
        resolved_by,
        now,
        dispute_id,
    )
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    risk::audit(
        &state.pool,
        "ADMIN",
        "DISPUTE_RESOLVED",
        &format!("dispute:{dispute_id}"),
        serde_json::json!({ "outcome": body.outcome, "resolved_by": resolved_by }),
        None,
    )
    .await;

    // Emit dispute.resolved to the outbox (delivered to the affected merchant
    // only). Idempotent on the dispute id — no duplicate on replay (a second
    // resolve is rejected earlier as DISPUTE_ALREADY_RESOLVED).
    let _ = super::webhooks::emit(
        &state.pool,
        dispute.merchant_id,
        "dispute.resolved",
        &format!("dispute.resolved:{dispute_id}"),
        serde_json::json!({
            "dispute_id": dispute_id,
            "resolution": body.outcome,
            "merchant_id": dispute.merchant_id,
            "consumer_id": dispute.consumer_id,
            "amount_minor": dispute.amount_minor,
            "currency": dispute.currency,
            "status": body.outcome,
            "trace_id": dispute_id,
            "resolved_at": now,
        }),
    )
    .await;

    Ok(Json(fetch_dispute(&state.pool, dispute_id).await?))
}

// ---------------------------------------------------------------------------
// GET /internal/v1/disputes/:id/evidence
// ---------------------------------------------------------------------------

pub async fn list_evidence(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let dispute_id: Uuid = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid dispute id"))?;

    let rows = sqlx::query!(
        "SELECT id, dispute_id, submitted_by, party, description, file_url, created_at
         FROM dispute_evidence WHERE dispute_id = $1 ORDER BY created_at ASC",
        dispute_id,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let data: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id":           r.id,
                "dispute_id":   r.dispute_id,
                "submitted_by": r.submitted_by,
                "party":        r.party,
                "description":  r.description,
                "file_url":     r.file_url,
                "created_at":   r.created_at,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "data": data })))
}

// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------

async fn fetch_dispute(pool: &sqlx::PgPool, id: Uuid) -> ApiResult<DisputeResponse> {
    sqlx::query!(
        r#"
        SELECT id, transaction_id, merchant_id, consumer_id, amount_minor, currency,
               reason, status, evidence_deadline, resolution_notes, created_at,
               updated_at, resolved_at
        FROM disputes WHERE id = $1
        "#,
        id,
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .map(|r| DisputeResponse {
        id: r.id.to_string(),
        transaction_id: r.transaction_id.to_string(),
        merchant_id: r.merchant_id.to_string(),
        consumer_id: r.consumer_id.to_string(),
        amount_minor: r.amount_minor,
        currency: r.currency,
        reason: r.reason,
        status: r.status,
        evidence_deadline: r.evidence_deadline,
        resolution_notes: r.resolution_notes,
        created_at: r.created_at,
        updated_at: r.updated_at,
        resolved_at: r.resolved_at,
    })
    .ok_or_else(|| ApiError::not_found("dispute not found"))
}
