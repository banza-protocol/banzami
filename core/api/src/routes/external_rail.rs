//! The external rail boundary (ADR-061).
//!
//! Banzami is rail-decoupled, not rail-free. Value that is already inside the
//! network moves through Core and the ledger — a wallet payment, a P2P transfer,
//! a refund of a wallet payment, an application settlement — and none of those
//! asks whether an external rail is up. An operation that crosses a rail does:
//!
//! | Operation                              | Crosses a rail | Where it asks        |
//! |----------------------------------------|----------------|----------------------|
//! | Hosted acquiring payment — initiation  | yes            | `acquiring::initiate_payment` |
//! | Hosted acquiring payment — confirmation| yes            | `acquiring::test_confirm`     |
//! | Payout — submission / confirmation     | yes            | `payouts::mark_sent` / `confirm` |
//! | Wallet payment, P2P, wallet refund     | no             | never                |
//! | Application settlement (internal)      | no             | never                |
//!
//! In LIVE the rail answers for itself: a provider that cannot be reached
//! returns its own error at the adapter. In the Public Sandbox the rail is
//! simulated, and each Business can take its own simulated rail down
//! (`sandbox_external_rail_states`, migration 0144) to see exactly this table
//! happen: internal movements keep working, rail-dependent operations fail
//! closed with `503 PROVIDER_UNAVAILABLE` and nothing is created, credited or
//! confirmed.

use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RailState {
    Available,
    Unavailable,
}

impl RailState {
    fn as_str(self) -> &'static str {
        match self {
            Self::Available => "AVAILABLE",
            Self::Unavailable => "UNAVAILABLE",
        }
    }
}

/// The simulated rail state of one Business. No row is AVAILABLE.
pub async fn sandbox_rail_state(
    pool: &sqlx::PgPool,
    merchant_id: Uuid,
) -> Result<RailState, sqlx::Error> {
    let state: Option<String> =
        sqlx::query_scalar("SELECT state FROM sandbox_external_rail_states WHERE merchant_id = $1")
            .bind(merchant_id)
            .fetch_optional(pool)
            .await?;
    Ok(match state.as_deref() {
        Some("UNAVAILABLE") => RailState::Unavailable,
        _ => RailState::Available,
    })
}

/// Called by an operation that crosses an external rail, before it touches the
/// provider or writes anything. In the Sandbox, a Business whose simulated rail
/// is down gets `503 PROVIDER_UNAVAILABLE`. In LIVE this is a no-op: the real
/// adapter reports its own availability.
pub async fn require_external_rail(state: &AppState, merchant_id: Uuid) -> ApiResult<()> {
    if state.environment.is_live() {
        return Ok(());
    }
    let rail = sandbox_rail_state(&state.pool, merchant_id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    // Operations name their failure domain: this line exists only for an
    // operation that crosses a rail, so a log search for
    // financial_operation=EXTERNAL_RAIL_OPERATION finds every one, and its state.
    tracing::info!(
        financial_operation = "EXTERNAL_RAIL_OPERATION",
        merchant_id = %merchant_id,
        rail_state = rail.as_str(),
        simulated = true,
        "external rail checked"
    );
    match rail {
        RailState::Available => Ok(()),
        RailState::Unavailable => Err(ApiError::service_unavailable_code(
            "PROVIDER_UNAVAILABLE",
            "the external rail this operation needs is unavailable; nothing was created, credited or confirmed",
        )),
    }
}

#[derive(Serialize)]
pub struct RailStateResponse {
    pub state: &'static str,
    pub simulated: bool,
}

fn sandbox_only(state: &AppState) -> ApiResult<()> {
    if state.environment.is_live() {
        return Err(ApiError::forbidden(
            "the external rail simulator exists only in the Sandbox",
        ));
    }
    Ok(())
}

async fn merchant_exists(state: &AppState, merchant_id: Uuid) -> ApiResult<()> {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM merchants WHERE id = $1)")
        .bind(merchant_id)
        .fetch_one(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    if !exists {
        return Err(ApiError::not_found("business not found"));
    }
    Ok(())
}

/// GET /internal/v1/sandbox/external-rail/:merchant_id
pub async fn get(
    State(state): State<AppState>,
    Path(merchant_id): Path<Uuid>,
) -> ApiResult<Json<RailStateResponse>> {
    sandbox_only(&state)?;
    merchant_exists(&state, merchant_id).await?;
    let s = sandbox_rail_state(&state.pool, merchant_id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(Json(RailStateResponse {
        state: s.as_str(),
        simulated: true,
    }))
}

#[derive(Deserialize)]
pub struct SetRailState {
    pub state: String,
}

/// PUT /internal/v1/sandbox/external-rail/:merchant_id  {"state": "AVAILABLE" | "UNAVAILABLE"}
pub async fn put(
    State(state): State<AppState>,
    Path(merchant_id): Path<Uuid>,
    Json(body): Json<SetRailState>,
) -> ApiResult<Json<RailStateResponse>> {
    sandbox_only(&state)?;
    let next = match body.state.trim() {
        "AVAILABLE" => RailState::Available,
        "UNAVAILABLE" => RailState::Unavailable,
        _ => {
            return Err(ApiError {
                status: axum::http::StatusCode::BAD_REQUEST,
                code: "INVALID_PARAM",
                message: "state must be AVAILABLE or UNAVAILABLE".into(),
            })
        }
    };
    merchant_exists(&state, merchant_id).await?;
    sqlx::query(
        "INSERT INTO sandbox_external_rail_states (merchant_id, state, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (merchant_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()",
    )
    .bind(merchant_id)
    .bind(next.as_str())
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;
    tracing::info!(merchant_id = %merchant_id, state = next.as_str(), "sandbox external rail state set");
    Ok(Json(RailStateResponse {
        state: next.as_str(),
        simulated: true,
    }))
}
