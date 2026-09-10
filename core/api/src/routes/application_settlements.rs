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
    // References only — never a fee, a percentage or a rate. There used to be an
    // application_fee_bps here that, when present, skipped the Pricing Engine and
    // charged what the caller asked. The operator's pricing decision is the only
    // rate now; an unknown field in the body is simply not modelled.
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

/// Every ADR-028 condition on an application-fee destination, evaluated one by
/// one rather than as a verdict.
///
/// This is THE rule. The settlement path enforces it through
/// `guard_application_fee_destination`, and readiness reports it through
/// `settlement_readiness` — both call this function. A readiness answer computed
/// any other way can say READY while settlement refuses with
/// FEE_DESTINATION_TYPE_NOT_ALLOWED, which is exactly how DOA's integration view
/// and its settlement came to disagree.
///
/// The destination is the ACCOUNT the fee will be credited to. ADR-028 requires
/// it to belong to a Business Account that is ACTIVE, KYB-approved and of a type
/// permitted to take an application fee. It does not require a dedicated
/// APPLICATION-purpose wallet account: the fee lands in whichever of the
/// destination's accounts is named — in practice its primary available account.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct FeeDestinationEvaluation {
    /// The account resolves to a Business Account at all.
    pub resolved: bool,
    pub active: bool,
    pub kyb_approved: bool,
    /// ACTIVE wallet holding the account. Resolution goes through `wallets` and
    /// `wallet_accounts`, so a resolved account is one a wallet holds.
    pub wallet_active: bool,
    /// APPLICATION or PLATFORM (ADR-028 taxonomy). The type itself never leaves
    /// the operator; only whether it permits an application fee does.
    pub type_allowed: bool,
    /// The first unmet condition, in the order settlement checks them, as the
    /// exact code settlement would return.
    pub blocker: Option<&'static str>,
    #[serde(skip)]
    pub blocker_message: Option<&'static str>,
}

pub(crate) async fn evaluate_fee_destination(
    pool: &PgPool,
    fee_account: AccountId,
) -> Result<FeeDestinationEvaluation, ApiError> {
    let mut ev = FeeDestinationEvaluation::default();
    let Some(merchant_id) = merchant_for_account(pool, fee_account).await else {
        ev.blocker = Some("FEE_DESTINATION_NOT_BUSINESS_ACCOUNT");
        ev.blocker_message = Some("application fee destination is not a Banzami Business Account");
        return Ok(ev);
    };
    // One row: the owner's type, status, KYB, and whether the wallet holding the
    // account is ACTIVE.
    let row = sqlx::query_as::<_, (String, String, Option<String>, bool)>(
        "SELECT COALESCE(m.business_account_type, 'MERCHANT'), m.status, c.kyb_status,
                EXISTS (
                  SELECT 1 FROM wallets w
                   WHERE w.merchant_id = m.id AND w.status = 'ACTIVE'
                     AND (w.available_account_id = $2
                          OR EXISTS (SELECT 1 FROM wallet_accounts wa
                                      WHERE wa.wallet_id = w.id AND wa.account_id = $2
                                        AND wa.status = 'ACTIVE')))
           FROM merchants m
           LEFT JOIN merchant_compliance c ON c.merchant_id = m.id
          WHERE m.id = $1",
    )
    .bind(merchant_id)
    .bind(fee_account.as_uuid())
    .fetch_optional(pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;
    let Some((account_type, status, kyb_status, wallet_active)) = row else {
        ev.blocker = Some("FEE_DESTINATION_NOT_BUSINESS_ACCOUNT");
        ev.blocker_message = Some("application fee destination is not a Banzami Business Account");
        return Ok(ev);
    };
    ev.resolved = true;
    ev.active = status == "ACTIVE";
    ev.kyb_approved = kyb_status.as_deref() == Some("APPROVED");
    ev.wallet_active = wallet_active;
    ev.type_allowed = banzami_merchants::allows_application_fee(&account_type);

    // Settlement's order. The first failure is the code settlement returns.
    if !ev.active {
        ev.blocker = Some("FEE_DESTINATION_NOT_ACTIVE");
        ev.blocker_message = Some("application fee destination business account is not active");
    } else if !ev.kyb_approved {
        ev.blocker = Some("FEE_DESTINATION_KYB_NOT_APPROVED");
        ev.blocker_message = Some("application fee destination is not KYB-approved");
    } else if !ev.wallet_active {
        ev.blocker = Some("FEE_DESTINATION_WALLET_UNAVAILABLE");
        ev.blocker_message =
            Some("application fee destination has no active wallet for this account");
    } else if !ev.type_allowed {
        ev.blocker = Some("FEE_DESTINATION_TYPE_NOT_ALLOWED");
        ev.blocker_message =
            Some("application fee destination must be an APPLICATION or PLATFORM business account");
    }
    Ok(ev)
}

/// ADR-028, enforced: an application fee may only be credited to a destination
/// that passes every condition in `evaluate_fee_destination`. Fail-closed.
pub(crate) async fn guard_application_fee_destination(
    pool: &PgPool,
    fee_account: AccountId,
) -> Result<(), ApiError> {
    let ev = evaluate_fee_destination(pool, fee_account).await?;
    match (ev.blocker, ev.blocker_message) {
        (Some(code), Some(msg)) => Err(ApiError::unprocessable(code, msg)),
        _ => Ok(()),
    }
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
        // The operator's pricing resolved a fee and nobody named where it goes.
        // This used to say "application_fee_account_id is required for this
        // category" — a field the public contract never asks for, and a category
        // that no longer chooses anything.
        E::MissingFeeAccount { .. } => ApiError::unprocessable(
            "FEE_DESTINATION_REQUIRED",
            "this settlement carries an application fee under your pricing profile — name a fee destination",
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
    let named_fee_account = match (
        body.application_fee_account_id,
        body.application_fee_wallet_id,
    ) {
        (None, None) => None,
        (a, w) => Some(account_or_wallet(&state.pool, a, w, "application_fee").await?),
    };

    // The operator's pricing decision FIRST, and the fee destination only when
    // that decision is a fee.
    //
    // The destination used to be validated whenever one was named. So a Project
    // on a zero-rate profile that named its own account was refused with
    // FEE_DESTINATION_TYPE_NOT_ALLOWED for a fee it was never going to pay, and
    // the only way through was to classify every ordinary Business as an
    // APPLICATION — a privilege ADR-028 reserves for operators to grant.
    //
    //   fee > 0  → a destination is required, and must pass ADR-028
    //   fee == 0 → there is no fee to allocate; nothing is validated or recorded
    let quote = state
        .app_settlement
        .resolve_settlement_fee(
            Money::new(body.gross_amount_minor, currency),
            body.pricing_profile.as_deref(),
        )
        .await
        .map_err(map_err)?;
    let application_fee_account_id = if quote.fee_minor > 0 {
        let fee_acct = named_fee_account.ok_or_else(|| {
            map_err(ApplicationSettlementError::MissingFeeAccount {
                fee: quote.fee_minor,
            })
        })?;
        guard_application_fee_destination(&state.pool, fee_acct).await?;
        Some(fee_acct)
    } else {
        None
    };

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
