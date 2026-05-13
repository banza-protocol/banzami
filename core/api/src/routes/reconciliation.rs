use axum::{extract::State, Json};
use serde::Deserialize;

use banzami_reconciliation::{
    ExternalStatementLine, ReconciliationEngine, SettlementView,
};
use banzami_settlement::SettlementEngine;
use banzami_types::MerchantId;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Trigger a reconciliation run
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct RunBody {
    pub merchant_id:    String,
    pub period_start:   chrono::DateTime<chrono::Utc>,
    pub period_end:     chrono::DateTime<chrono::Utc>,
    pub external_lines: Vec<ExternalStatementLineBody>,
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
    let merchant_id: MerchantId = body.merchant_id.parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    let external_lines: Vec<ExternalStatementLine> = body.external_lines
        .into_iter()
        .map(|l| ExternalStatementLine {
            reference:    l.reference,
            amount_minor: l.amount_minor,
            currency:     l.currency,
            posted_at:    l.posted_at,
        })
        .collect();

    // Fetch internal settlements for this merchant, filter by period.
    let all_settlements = state.settlement
        .list_for_merchant(merchant_id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let settlement_views: Vec<SettlementView> = all_settlements
        .into_iter()
        .filter(|s| s.period_start >= body.period_start && s.period_end <= body.period_end)
        .map(|s| SettlementView {
            settlement_id:    s.id,
            net_amount_minor: s.net_amount.amount_minor(),
            currency:         s.currency,
        })
        .collect();

    let report = state.reconciliation
        .run(external_lines, settlement_views)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(serde_json::to_value(&report).unwrap()))
}
