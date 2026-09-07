//! Internal Application Settlement API (Banzami ADR-021 / BANZA ADR-039).
//!
//! OPERATOR-ONLY surface (reached only via the internal `/internal/v1` boundary;
//! never exposed by the public gateway). The caller supplies **references and
//! accounts only** — never a fee or a percentage. The application fee is resolved
//! internally by the Pricing Engine; the client can neither choose nor send it.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use banzami_app_settlement::{
    ApplicationSettlementEngine, ApplicationSettlementError, CreateApplicationSettlementRequest,
};
use banzami_types::{AccountId, ApplicationSettlementId, Currency, Money};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

#[derive(Deserialize)]
pub struct CreateBody {
    pub idempotency_key: String,
    pub owner_ref: String,
    pub application_id: Option<String>,
    // Each party may be given as a ledger account_id (internal callers) OR a
    // wallet_id (app-facing callers via the gateway). When a wallet_id is given,
    // the core resolves its `available_account_id` itself — so account ids never
    // leave the core and an external app never has to handle them.
    pub source_account_id: Option<String>,
    pub source_wallet_id: Option<String>,
    pub beneficiary_account_id: Option<String>,
    pub beneficiary_wallet_id: Option<String>,
    /// Required only when a non-zero application fee is resolved.
    pub application_fee_account_id: Option<String>,
    pub application_fee_wallet_id: Option<String>,
    pub gross_amount_minor: i64,
    pub currency: String,
    /// ADR-029: app-defined fee rate (basis points). When set, the operator
    /// computes the fee from it and the Pricing Engine / pricing refs are ignored.
    pub application_fee_bps: Option<u32>,
    // References only — never a fee/percentage. A client-supplied rate/fee field
    // is not modelled here and is therefore ignored: the client cannot set a fee.
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub fee_policy_ref: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

/// Resolves a wallet_id (merchant OR consumer wallet) to its available ledger
/// account. Account ids are encapsulated here and never exposed externally.
async fn resolve_available_account(pool: &PgPool, wallet_id: Uuid) -> Result<AccountId, ApiError> {
    if let Some(acc) =
        sqlx::query_scalar::<_, Uuid>("SELECT available_account_id FROM wallets WHERE id = $1")
            .bind(wallet_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?
    {
        return Ok(AccountId::from_uuid(acc));
    }
    if let Some(acc) = sqlx::query_scalar::<_, Uuid>(
        "SELECT available_account_id FROM consumer_wallets WHERE id = $1",
    )
    .bind(wallet_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    {
        return Ok(AccountId::from_uuid(acc));
    }
    Err(ApiError::bad_request("wallet not found"))
}

/// account_id wins if present; otherwise resolve from wallet_id; otherwise error.
async fn account_or_wallet(
    pool: &PgPool,
    account_id: Option<String>,
    wallet_id: Option<String>,
    field: &str,
) -> Result<AccountId, ApiError> {
    match (account_id, wallet_id) {
        (Some(a), _) => parse_account(&a, field),
        (None, Some(w)) => {
            let wid = Uuid::parse_str(&w)
                .map_err(|_| ApiError::bad_request(format!("invalid {field}_wallet_id")))?;
            resolve_available_account(pool, wid).await
        }
        (None, None) => Err(ApiError::bad_request(format!(
            "{field}_account_id or {field}_wallet_id is required"
        ))),
    }
}

/// The merchant a settlement notifies = the owner of its source wallet. Used to
/// route the application_settlement.* webhook to the right merchant's endpoints.
async fn merchant_for_account(pool: &PgPool, account_id: AccountId) -> Option<Uuid> {
    // The source may be a wallet's default available account OR a segregated
    // wallet account (ADR-042 — e.g. a DOA campaign account). Resolve the owning
    // merchant from either, so a campaign settlement still routes its webhook.
    sqlx::query_scalar::<_, Uuid>(
        "SELECT merchant_id FROM wallets WHERE available_account_id = $1
         UNION ALL
         SELECT merchant_id FROM wallet_accounts WHERE account_id = $1
         LIMIT 1",
    )
    .bind(account_id.as_uuid())
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
}

/// ADR-028: enforce that an application-fee destination is a validated Business
/// Account — it resolves to a merchant, that merchant is KYB-approved, has an
/// active wallet (it owns the destination account), and is of a type permitted to
/// take an application fee (APPLICATION/PLATFORM). Fail-closed.
pub(crate) async fn guard_application_fee_destination(
    pool: &PgPool,
    fee_account: AccountId,
) -> Result<(), ApiError> {
    let merchant_id = merchant_for_account(pool, fee_account)
        .await
        .ok_or_else(|| {
            ApiError::unprocessable(
                "FEE_DESTINATION_NOT_BUSINESS_ACCOUNT",
                "application fee destination is not a Banzami Business Account",
            )
        })?;

    // The fee destination's merchant must be a validated, permitted Business
    // Account. One row read of its type + KYB status.
    let row = sqlx::query_as::<_, (String, String, Option<String>)>(
        "SELECT m.business_account_type, m.status, c.kyb_status
           FROM merchants m
           LEFT JOIN merchant_compliance c ON c.merchant_id = m.id
          WHERE m.id = $1",
    )
    .bind(merchant_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| {
        ApiError::unprocessable(
            "FEE_DESTINATION_NOT_BUSINESS_ACCOUNT",
            "application fee destination is not a Banzami Business Account",
        )
    })?;
    let (account_type, status, kyb_status) = row;

    if status != "ACTIVE" {
        return Err(ApiError::unprocessable(
            "FEE_DESTINATION_NOT_ACTIVE",
            "application fee destination business account is not active",
        ));
    }
    if kyb_status.as_deref() != Some("APPROVED") {
        return Err(ApiError::unprocessable(
            "FEE_DESTINATION_KYB_NOT_APPROVED",
            "application fee destination is not KYB-approved",
        ));
    }
    if !banzami_merchants::allows_application_fee(&account_type) {
        return Err(ApiError::unprocessable(
            "FEE_DESTINATION_TYPE_NOT_ALLOWED",
            "application fee destination must be an APPLICATION or PLATFORM business account",
        ));
    }
    Ok(())
}

/// Emit an application_settlement.* webhook (idempotent on the settlement id).
async fn emit_settlement_event(pool: &PgPool, event: &str, s: &serde_json::Value) {
    let (Some(id), Some(src)) = (
        s.get("id").and_then(|v| v.as_str()),
        s.get("source_account_id").and_then(|v| v.as_str()),
    ) else {
        return;
    };
    let Ok(acc) = src.parse::<AccountId>() else {
        return;
    };
    if let Some(mid) = merchant_for_account(pool, acc).await {
        let _ = super::webhooks::emit(pool, mid, event, &format!("{event}:{id}"), s.clone()).await;
    }
}

#[derive(Deserialize)]
pub struct FailBody {
    pub reason: String,
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub owner_ref: Option<String>,
    pub status: Option<String>,
    pub currency: Option<String>,
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub environment: Option<String>,
    pub from: Option<chrono::DateTime<chrono::Utc>>,
    pub to: Option<chrono::DateTime<chrono::Utc>>,
    pub limit: Option<i64>,
}

fn map_err(e: ApplicationSettlementError) -> ApiError {
    use ApplicationSettlementError as E;
    match e {
        E::NotFound(_) => ApiError::not_found("application settlement not found"),
        E::InvalidAmount => ApiError::bad_request("gross amount must be positive"),
        E::CurrencyMismatch => ApiError::bad_request("currency mismatch"),
        E::FeeExceedsGross { .. } => ApiError::unprocessable(
            "FEE_EXCEEDS_GROSS",
            "resolved application fee exceeds gross",
        ),
        E::MissingFeeAccount { .. } => {
            ApiError::bad_request("application_fee_account_id is required for this category")
        }
        E::FeeBpsOutOfBounds { max, .. } => ApiError::unprocessable(
            "FEE_BPS_OUT_OF_BOUNDS",
            format!("application_fee_bps exceeds the maximum allowed ({max})"),
        ),
        E::InsufficientFunds { .. } => ApiError::unprocessable(
            "INSUFFICIENT_FUNDS",
            "source account has insufficient funds",
        ),
        E::InvalidStatus { .. } => {
            ApiError::conflict("INVALID_STATUS", "invalid settlement status transition")
        }
        // A refusal, not a fault. Without this arm it fell through to `internal`
        // and a deliberate decision was reported as a 500 — indistinguishable
        // from an outage, and retried by every client that saw it. The code
        // matches what the gateway already returns on the same condition.
        E::PricingNotConfigured => ApiError::conflict(
            "PRICING_NOT_CONFIGURED",
            "no pricing rule applies — this owner has no assigned pricing policy",
        ),
        // A distinct code, because it is a distinct thing to fix. "Not
        // configured" tells an operator to assign a policy; this one tells them
        // two policies apply and one has to go. Collapsing them would send
        // someone looking for a missing rule that is not missing.
        E::PricingAmbiguous { .. } => ApiError::conflict(
            "PRICING_CONFIGURATION_ERROR",
            "more than one pricing rule applies to this settlement",
        ),
        other => ApiError::internal(other.to_string()),
    }
}

fn parse_account(s: &str, field: &str) -> Result<AccountId, ApiError> {
    s.parse()
        .map_err(|_| ApiError::bad_request(format!("invalid {field}")))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;
    if body.gross_amount_minor <= 0 {
        return Err(ApiError::bad_request("gross_amount_minor must be positive"));
    }
    let source_account_id = account_or_wallet(
        &state.pool,
        body.source_account_id,
        body.source_wallet_id,
        "source",
    )
    .await?;
    let beneficiary_account_id = account_or_wallet(
        &state.pool,
        body.beneficiary_account_id,
        body.beneficiary_wallet_id,
        "beneficiary",
    )
    .await?;
    let application_fee_account_id = match (
        body.application_fee_account_id,
        body.application_fee_wallet_id,
    ) {
        (None, None) => None,
        (a, w) => Some(account_or_wallet(&state.pool, a, w, "application_fee").await?),
    };

    // ADR-028: an application fee may only be paid to a validated Business Account
    // — KYB-approved, active wallet, and of a permitted type (APPLICATION/PLATFORM).
    // Fail-closed: a fee to an unvetted destination is rejected, not rerouted.
    if let Some(fee_acct) = application_fee_account_id {
        guard_application_fee_destination(&state.pool, fee_acct).await?;
    }

    let settlement = state
        .app_settlement
        .create(CreateApplicationSettlementRequest {
            idempotency_key: body.idempotency_key,
            owner_ref: body.owner_ref,
            application_id: body.application_id,
            source_account_id,
            beneficiary_account_id,
            application_fee_account_id,
            gross_amount: Money::new(body.gross_amount_minor, currency),
            application_fee_bps: body.application_fee_bps,
            business_category: body.business_category,
            pricing_profile: body.pricing_profile,
            fee_policy_ref: body.fee_policy_ref,
            metadata: body.metadata,
        })
        .await
        .map_err(map_err)?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(&settlement).unwrap()),
    ))
}

fn parse_id(id: &str) -> Result<ApplicationSettlementId, ApiError> {
    id.parse()
        .map_err(|_| ApiError::bad_request("invalid settlement id"))
}

pub async fn complete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let s = state
        .app_settlement
        .complete(parse_id(&id)?)
        .await
        .map_err(map_err)?;
    let v = serde_json::to_value(&s).unwrap();
    emit_settlement_event(&state.pool, "application_settlement.completed", &v).await;
    Ok(Json(v))
}

pub async fn cancel(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let s = state
        .app_settlement
        .cancel(parse_id(&id)?)
        .await
        .map_err(map_err)?;
    let v = serde_json::to_value(&s).unwrap();
    emit_settlement_event(&state.pool, "application_settlement.cancelled", &v).await;
    Ok(Json(v))
}

pub async fn fail(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<FailBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let s = state
        .app_settlement
        .fail(parse_id(&id)?, body.reason)
        .await
        .map_err(map_err)?;
    let v = serde_json::to_value(&s).unwrap();
    emit_settlement_event(&state.pool, "application_settlement.failed", &v).await;
    Ok(Json(v))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let s = state
        .app_settlement
        .get(parse_id(&id)?)
        .await
        .map_err(map_err)?;
    Ok(Json(serde_json::to_value(&s).unwrap()))
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let filter = banzami_app_settlement::ApplicationSettlementFilter {
        owner_ref: q.owner_ref,
        status: q.status,
        currency: q.currency,
        business_category: q.business_category,
        pricing_profile: q.pricing_profile,
        environment: q.environment,
        from: q.from,
        to: q.to,
        limit: q.limit.unwrap_or(100),
    };
    let items = state
        .app_settlement
        .list_filtered(&filter)
        .await
        .map_err(map_err)?;
    Ok(Json(serde_json::json!({ "data": items })))
}
