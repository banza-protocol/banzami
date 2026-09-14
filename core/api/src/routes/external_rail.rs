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
//! simulated, to see exactly this table happen: internal movements keep working,
//! rail-dependent operations fail closed with `503 PROVIDER_UNAVAILABLE` and
//! nothing is created, credited or confirmed.
//!
//! Scope (0145). A developer's switch is per (Project, Business)
//! (`sandbox_project_rail_states`): it reaches that Project's test payments and
//! the hosted payments of links and sessions that Project created
//! (`sandbox_link_projects`, recorded at creation from the authenticated key).
//! A Business shared with a Project in another Workspace is not taken down by
//! the other Project's switch. The Business-wide rail
//! (`sandbox_external_rail_states`) is set only through the operator route below
//! and is what payouts, and hosted payments no Project created, read.

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

/// The simulated rail one Project set for a Business. No row is AVAILABLE.
pub async fn project_rail_state(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    merchant_id: Uuid,
) -> Result<RailState, sqlx::Error> {
    let state: Option<String> = sqlx::query_scalar(
        "SELECT state FROM sandbox_project_rail_states WHERE project_id = $1 AND merchant_id = $2",
    )
    .bind(project_id)
    .bind(merchant_id)
    .fetch_optional(pool)
    .await?;
    Ok(match state.as_deref() {
        Some("UNAVAILABLE") => RailState::Unavailable,
        _ => RailState::Available,
    })
}

/// What an operation in `project_id`'s scope sees: down if the Business-wide
/// rail is down, or if that Project took its own rail down.
pub async fn effective_rail_state(
    pool: &sqlx::PgPool,
    merchant_id: Uuid,
    project_id: Option<Uuid>,
) -> Result<RailState, sqlx::Error> {
    if sandbox_rail_state(pool, merchant_id).await? == RailState::Unavailable {
        return Ok(RailState::Unavailable);
    }
    match project_id {
        Some(p) => project_rail_state(pool, p, merchant_id).await,
        None => Ok(RailState::Available),
    }
}

/// Validates a creator Project id before anything is created. Sandbox only; the
/// id comes from the gateway's authenticated principal, never a payer.
pub fn link_project(state: &AppState, project_id: Option<&str>) -> ApiResult<Option<Uuid>> {
    let Some(raw) = project_id else {
        return Ok(None);
    };
    if state.environment.is_live() {
        return Err(ApiError::bad_request(
            "sandbox_project_id exists only in the Sandbox",
        ));
    }
    Uuid::parse_str(raw)
        .map(Some)
        .map_err(|_| ApiError::bad_request("invalid sandbox_project_id"))
}

/// Records the Project whose key created a Payment Link.
pub async fn record_link_project(
    state: &AppState,
    payment_link_id: Uuid,
    project_id: Option<Uuid>,
) -> ApiResult<()> {
    let Some(project) = project_id else {
        return Ok(());
    };
    sqlx::query(
        "INSERT INTO sandbox_link_projects (payment_link_id, project_id) VALUES ($1, $2)
         ON CONFLICT (payment_link_id) DO NOTHING",
    )
    .bind(payment_link_id)
    .bind(project)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(())
}

/// The rail check of a hosted payment: the rail of the Project that created the
/// link, on the link's Business. An unknown link passes through to the engine's
/// own 404.
pub async fn require_external_rail_for_link(
    state: &AppState,
    payment_link_id: Uuid,
) -> ApiResult<()> {
    if state.environment.is_live() {
        return Ok(());
    }
    let row: Option<(Uuid, Option<Uuid>)> = sqlx::query_as(
        "SELECT l.merchant_id, lp.project_id
           FROM payment_links l LEFT JOIN sandbox_link_projects lp ON lp.payment_link_id = l.id
          WHERE l.id = $1",
    )
    .bind(payment_link_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;
    let Some((merchant_id, project_id)) = row else {
        return Ok(());
    };
    check(state, merchant_id, project_id).await
}

/// Called by an operation that crosses an external rail, before it touches the
/// provider or writes anything. In the Sandbox, a Business whose simulated rail
/// is down gets `503 PROVIDER_UNAVAILABLE`. In LIVE this is a no-op: the real
/// adapter reports its own availability.
pub async fn require_external_rail(state: &AppState, merchant_id: Uuid) -> ApiResult<()> {
    if state.environment.is_live() {
        return Ok(());
    }
    check(state, merchant_id, None).await
}

async fn check(state: &AppState, merchant_id: Uuid, project_id: Option<Uuid>) -> ApiResult<()> {
    let rail = effective_rail_state(&state.pool, merchant_id, project_id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    // Operations name their failure domain: this line exists only for an
    // operation that crosses a rail, so a log search for
    // financial_operation=EXTERNAL_RAIL_OPERATION finds every one, and its state.
    tracing::info!(
        financial_operation = "EXTERNAL_RAIL_OPERATION",
        merchant_id = %merchant_id,
        project_id = ?project_id,
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

#[derive(Debug, Serialize)]
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

/// GET /internal/v1/sandbox/external-rail/:merchant_id — the Business-wide rail (operator).
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

/// PUT /internal/v1/sandbox/external-rail/:merchant_id  {"state": "AVAILABLE" | "UNAVAILABLE"} — Business-wide (operator).
fn parse_state(raw: &str) -> ApiResult<RailState> {
    match raw.trim() {
        "AVAILABLE" => Ok(RailState::Available),
        "UNAVAILABLE" => Ok(RailState::Unavailable),
        _ => Err(ApiError {
            status: axum::http::StatusCode::BAD_REQUEST,
            code: "INVALID_PARAM",
            message: "state must be AVAILABLE or UNAVAILABLE".into(),
        }),
    }
}

pub async fn put(
    State(state): State<AppState>,
    Path(merchant_id): Path<Uuid>,
    Json(body): Json<SetRailState>,
) -> ApiResult<Json<RailStateResponse>> {
    sandbox_only(&state)?;
    let next = parse_state(&body.state)?;
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

/// GET /internal/v1/sandbox/projects/:project_id/external-rail/:merchant_id
///
/// What that Project sees: its own switch, or the Business-wide rail if an
/// operator took it down.
pub async fn get_for_project(
    State(state): State<AppState>,
    Path((project_id, merchant_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<RailStateResponse>> {
    sandbox_only(&state)?;
    merchant_exists(&state, merchant_id).await?;
    let s = effective_rail_state(&state.pool, merchant_id, Some(project_id))
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(Json(RailStateResponse {
        state: s.as_str(),
        simulated: true,
    }))
}

/// PUT /internal/v1/sandbox/projects/:project_id/external-rail/:merchant_id
///
/// A Project's own switch. The gateway derives both ids from the authenticated
/// key; nothing a developer sends names another Project or Business.
pub async fn put_for_project(
    State(state): State<AppState>,
    Path((project_id, merchant_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<SetRailState>,
) -> ApiResult<Json<RailStateResponse>> {
    sandbox_only(&state)?;
    let next = parse_state(&body.state)?;
    merchant_exists(&state, merchant_id).await?;
    sqlx::query(
        "INSERT INTO sandbox_project_rail_states (project_id, merchant_id, state, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (project_id, merchant_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()",
    )
    .bind(project_id)
    .bind(merchant_id)
    .bind(next.as_str())
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;
    tracing::info!(project_id = %project_id, merchant_id = %merchant_id, state = next.as_str(), "sandbox project external rail state set");
    let effective = effective_rail_state(&state.pool, merchant_id, Some(project_id))
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(Json(RailStateResponse {
        state: effective.as_str(),
        simulated: true,
    }))
}
