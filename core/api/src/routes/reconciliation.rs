use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

use banzami_reconciliation::{
    ExternalStatementLine, ReconciliationEngine, ReconciliationError, SettlementView,
};
use banzami_settlement::SettlementEngine;
use banzami_types::{MerchantId, ReconciliationRunId};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Trigger a reconciliation run
// ---------------------------------------------------------------------------

#[derive(Deserialize, Default)]
pub struct RunBody {
    pub merchant_id:    Option<String>,
    pub period_start:   Option<chrono::DateTime<chrono::Utc>>,
    pub period_end:     Option<chrono::DateTime<chrono::Utc>>,
    pub external_lines: Option<Vec<ExternalStatementLineBody>>,
}

#[derive(Deserialize)]
pub struct ExternalStatementLineBody {
    pub reference:    String,
    pub amount_minor: i64,
    pub currency:     String,
    pub posted_at:    chrono::DateTime<chrono::Utc>,
}

pub async fn run(
    State(state): State<AppState>,
    Json(body): Json<RunBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let external_lines: Vec<ExternalStatementLine> = body.external_lines
        .unwrap_or_default()
        .into_iter()
        .map(|l| ExternalStatementLine {
            reference:    l.reference,
            amount_minor: l.amount_minor,
            currency:     l.currency,
            posted_at:    l.posted_at,
        })
        .collect();

    let settlement_views: Vec<SettlementView> = if let Some(mid) = body.merchant_id {
        let merchant_id: MerchantId = mid.parse()
            .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

        let all_settlements = state.settlement
            .list_for_merchant(merchant_id)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?;

        let period_start = body.period_start.unwrap_or(chrono::DateTime::<chrono::Utc>::MIN_UTC);
        let period_end   = body.period_end.unwrap_or(chrono::Utc::now());

        all_settlements
            .into_iter()
            .filter(|s| s.period_start >= period_start && s.period_end <= period_end)
            .map(|s| SettlementView {
                settlement_id:    s.id,
                net_amount_minor: s.net_amount.amount_minor(),
                currency:         s.currency,
            })
            .collect()
    } else {
        vec![]
    };

    let report = state.reconciliation
        .run(external_lines, settlement_views)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(serde_json::to_value(&report).unwrap()))
}

// ---------------------------------------------------------------------------
// Retrieve a past reconciliation report by run ID
// ---------------------------------------------------------------------------

pub async fn get_report(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let run_id: ReconciliationRunId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid run id"))?;

    let report = state
        .reconciliation
        .get_report(run_id)
        .await
        .map_err(|e| match e {
            ReconciliationError::NotFound(_) => ApiError::not_found("reconciliation run not found"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&report).unwrap()))
}
