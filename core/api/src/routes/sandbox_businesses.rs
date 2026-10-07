//! A synthetic Sandbox Business for a Developer Project, provisioned in one Core
//! operation with no operator in the path (ADR-060).
//!
//! WHAT IT IS
//!
//! A test entity. It gets a merchant, an AOA wallet with its PRIMARY account, a
//! handle derived from the Project, and a compliance record that says
//! `SANDBOX_SYNTHETIC` — never `APPROVED`. ADR-058 retired the one-click setup
//! because it wrote `APPROVED` for a Business nobody reviewed; this does not.
//! `merchants.verified` follows only `APPROVED` (migration 0122), so the Business
//! stays unverified on receipts, handle lookup and in BANZADMIN.
//!
//! WHO DECIDES WHAT
//!
//! The developer chooses a use case. Core's Sandbox policy decides the
//! classification and the pricing profile — no request field carries a type, a
//! profile code or a rate:
//!
//! | use_case    | business_account_type | pricing profile   |
//! |-------------|-----------------------|-------------------|
//! | STANDARD    | MERCHANT              | sandbox-default   |
//! | APPLICATION | APPLICATION           | sandbox-reference |
//!
//! LIVE
//!
//! Refused here, on Core's own reading of the environment, before anything is
//! written. The caller's guard is the second of two, not the only one.
//!
//! IDEMPOTENT
//!
//! One Business per Project (`sandbox_businesses.project_id` is unique). A retry
//! — or a second concurrent request — finds the same Business and completes
//! whatever step an earlier attempt did not reach. A compliance decision already
//! recorded against the merchant is never overwritten.

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use banzami_merchants::{CreateMerchantRequest, MerchantEngine, MerchantError};
use banzami_types::{Currency, MerchantId};
use banzami_wallets::{CreateWalletRequest, WalletEngine};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

/// The Sandbox use cases a developer may choose, and what Core does for each.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UseCase {
    Standard,
    Application,
}

impl UseCase {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim() {
            "STANDARD" => Some(Self::Standard),
            "APPLICATION" => Some(Self::Application),
            _ => None,
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Standard => "STANDARD",
            Self::Application => "APPLICATION",
        }
    }
    /// ADR-028 classification this use case receives.
    pub fn business_account_type(self) -> &'static str {
        match self {
            Self::Standard => "MERCHANT",
            Self::Application => "APPLICATION",
        }
    }
    /// The operator-governed Sandbox pricing profile this use case receives.
    pub fn pricing_profile(self) -> &'static str {
        match self {
            Self::Standard => "sandbox-default",
            Self::Application => "sandbox-reference",
        }
    }
}

#[derive(Deserialize)]
pub struct ProvisionBody {
    pub project_id: String,
    pub use_case: String,
    /// The Project's name, used for the Business's display name only.
    pub project_name: Option<String>,
    /// A caller-CHOSEN @banza for a human, interactive flow (the Developer
    /// Console's "create a new test Business" wizard). When present it is
    /// validated against the one canonical grammar and allocated race-safely;
    /// a name already held by another owner is refused with HANDLE_UNAVAILABLE
    /// before any merchant or wallet is created, so a collision leaves nothing
    /// behind. When ABSENT the handle is DERIVED from the project id, exactly as
    /// before — the path that fixtures, tests and non-interactive callers use.
    /// Only ever consulted on the FIRST provisioning of a project; a project that
    /// already has a Business keeps the identity it has.
    pub desired_handle: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct SandboxBusiness {
    pub merchant_id: String,
    pub wallet_id: String,
    pub wallet_account_id: String,
    pub handle: String,
    pub use_case: String,
    pub business_account_type: String,
    pub pricing_profile: String,
    pub kyb_status: String,
    /// True when this call created the Business rather than finding it.
    pub provisioned: bool,
}

/// The handle a Project's Sandbox Business receives. Derived, never chosen: a
/// caller-chosen handle is a caller-chosen public identity. Same derivation the
/// Developer API has always used, so a Project provisioned before keeps its.
pub fn derive_handle(project_id: &str) -> String {
    let sum = Sha256::digest(project_id.as_bytes());
    let hex: String = sum.iter().map(|b| format!("{b:02x}")).collect();
    format!("p{}", &hex[..12])
}

fn internal(e: impl std::fmt::Display) -> ApiError {
    ApiError::internal(e.to_string())
}

/// POST /internal/v1/sandbox/businesses
pub async fn provision(
    State(state): State<AppState>,
    Json(body): Json<ProvisionBody>,
) -> ApiResult<(StatusCode, Json<SandboxBusiness>)> {
    if state.environment.is_live() {
        tracing::error!("sandbox::businesses called in LIVE environment — rejected");
        return Err(ApiError::forbidden(
            "synthetic Sandbox Businesses are not available in LIVE",
        ));
    }
    let project_id = Uuid::parse_str(body.project_id.trim())
        .map_err(|_| ApiError::bad_request("invalid project_id"))?;
    let use_case = UseCase::parse(&body.use_case)
        .ok_or_else(|| ApiError::bad_request("use_case must be STANDARD or APPLICATION"))?;

    // A caller-chosen handle is normalised and grammar-checked here, before any
    // work: a malformed name is a client error, not a half-built Business. The
    // grammar is the one canonical @banza grammar (banzami_identity), identical
    // for Consumer and Business. INVALID_HANDLE is a distinct, non-neutral signal
    // (it is a format problem, not an availability oracle); TAKEN stays neutral.
    let chosen_handle = match body.desired_handle.as_deref().map(str::trim) {
        Some(h) if !h.is_empty() => {
            let norm = banzami_identity::normalize_handle(h);
            banzami_identity::validate_handle(&norm)
                .map_err(|e| ApiError::bad_request_code("INVALID_HANDLE", e))?;
            Some(norm)
        }
        _ => None,
    };

    // One provisioning per Project at a time. A session-level advisory lock on a
    // dedicated connection: the steps below use the pool, and two requests for
    // the same Project must not both create a merchant.
    let mut lock_conn = state.pool.acquire().await.map_err(internal)?;
    let lock_key = format!("sandbox_business:{project_id}");
    sqlx::query("SELECT pg_advisory_lock(hashtextextended($1, 0))")
        .bind(&lock_key)
        .execute(&mut *lock_conn)
        .await
        .map_err(internal)?;
    // A chosen handle has real cross-project contention (two Projects may both
    // ask for @doa): a SECOND advisory lock on the handle serialises same-handle
    // provisions, so the availability pre-check inside provision_locked and the
    // allocation are atomic and a loser never created a merchant or wallet first.
    // The derived path needs no handle lock — the handle is unique to the project.
    if let Some(h) = &chosen_handle {
        sqlx::query("SELECT pg_advisory_lock(hashtextextended($1, 0))")
            .bind(format!("sandbox_handle:{h}"))
            .execute(&mut *lock_conn)
            .await
            .map_err(internal)?;
    }
    let result = provision_locked(
        &state,
        project_id,
        use_case,
        body.project_name,
        chosen_handle.clone(),
    )
    .await;
    if let Some(h) = &chosen_handle {
        let _ = sqlx::query("SELECT pg_advisory_unlock(hashtextextended($1, 0))")
            .bind(format!("sandbox_handle:{h}"))
            .execute(&mut *lock_conn)
            .await;
    }
    let _ = sqlx::query("SELECT pg_advisory_unlock(hashtextextended($1, 0))")
        .bind(&lock_key)
        .execute(&mut *lock_conn)
        .await;
    result.map(|b| {
        let code = if b.provisioned {
            StatusCode::CREATED
        } else {
            StatusCode::OK
        };
        (code, Json(b))
    })
}

async fn provision_locked(
    state: &AppState,
    project_id: Uuid,
    use_case: UseCase,
    project_name: Option<String>,
    chosen_handle: Option<String>,
) -> ApiResult<SandboxBusiness> {
    let pool = &state.pool;
    let mut provisioned = false;

    // A Business this Project already has keeps its use case: changing it is a
    // separate, sealed-aware operation, never a side effect of a retry.
    let existing: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT merchant_id, use_case FROM sandbox_businesses WHERE project_id = $1",
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await
    .map_err(internal)?;
    let effective = match &existing {
        Some((_, uc)) => UseCase::parse(uc).unwrap_or(use_case),
        None => use_case,
    };

    // Pre-flight for a chosen handle on a FIRST provisioning: refuse a name that
    // is already taken BEFORE creating a merchant or wallet, so a collision
    // leaves nothing behind. The caller holds the sandbox_handle advisory lock,
    // so this check and the allocation below are atomic — a concurrent Project
    // cannot take the name in between. Neutral: HANDLE_UNAVAILABLE, never the
    // reason (RESERVED / PROTECTED / owned-by-whom stay invisible).
    if existing.is_none() {
        if let Some(h) = &chosen_handle {
            let taken: Option<String> =
                sqlx::query_scalar("SELECT handle FROM handle_registry WHERE handle = $1")
                    .bind(h)
                    .fetch_optional(pool)
                    .await
                    .map_err(internal)?;
            if taken.is_some() {
                return Err(ApiError::conflict(
                    "HANDLE_UNAVAILABLE",
                    "this @banza is not available",
                ));
            }
        }
    }

    // 1. The merchant — found by the derived address on a retry.
    let email = format!("sandbox+{project_id}@projects.banzami.test");
    let merchant_id = match existing {
        Some((m, _)) => m,
        None => {
            let found: Option<Uuid> =
                sqlx::query_scalar("SELECT id FROM merchants WHERE lower(email) = lower($1)")
                    .bind(&email)
                    .fetch_optional(pool)
                    .await
                    .map_err(internal)?;
            match found {
                Some(m) => m,
                None => {
                    let name = match project_name.as_deref().map(str::trim) {
                        Some(n) if !n.is_empty() => {
                            format!("Sandbox · {}", n.chars().take(60).collect::<String>())
                        }
                        _ => "Sandbox · Project".to_string(),
                    };
                    let m = state
                        .merchant
                        .create(CreateMerchantRequest {
                            name,
                            email: email.clone(),
                            business_account_type: None,
                        })
                        .await
                        .map_err(|e| match e {
                            MerchantError::DuplicateEmail(_) => ApiError::conflict(
                                "SANDBOX_BUSINESS_CONFLICT",
                                "a Business with this Project's address already exists",
                            ),
                            other => internal(other),
                        })?;
                    provisioned = true;
                    m.id.as_uuid()
                }
            }
        }
    };

    // The row that makes every later retry find this Business. Written before
    // anything else can fail, so a partial provisioning is always resumable.
    sqlx::query(
        "INSERT INTO sandbox_businesses (merchant_id, project_id, use_case)
         VALUES ($1, $2, $3) ON CONFLICT (project_id) DO NOTHING",
    )
    .bind(merchant_id)
    .bind(project_id)
    .bind(effective.as_str())
    .execute(pool)
    .await
    .map_err(internal)?;

    // 2. The AOA wallet; its PRIMARY account is made by trigger (0081).
    let wallet_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM wallets WHERE merchant_id = $1 AND currency = 'AOA'
          ORDER BY (status = 'ACTIVE') DESC, created_at LIMIT 1",
    )
    .bind(merchant_id)
    .fetch_optional(pool)
    .await
    .map_err(internal)?;
    let wallet_id = match wallet_id {
        Some(w) => w,
        None => {
            let w = state
                .wallet
                .create(CreateWalletRequest {
                    merchant_id: MerchantId::from_uuid(merchant_id),
                    currency: Currency::AOA,
                })
                .await
                .map_err(internal)?;
            provisioned = true;
            w.id.as_uuid()
        }
    };
    let wallet_account_id: Uuid = sqlx::query_scalar(
        "SELECT id FROM wallet_accounts WHERE wallet_id = $1 AND purpose = 'PRIMARY' LIMIT 1",
    )
    .bind(wallet_id)
    .fetch_optional(pool)
    .await
    .map_err(internal)?
    .ok_or_else(|| ApiError::internal("wallet has no PRIMARY account"))?;

    // 3. The handle — a handle this merchant already owns wins (idempotent
    //    retries, and a chosen @banza never overrides a Business's settled
    //    identity). Otherwise: the @banza the human chose, or — only when none
    //    was chosen (machine-to-machine provisioning) — the derived fallback.
    let chose_handle = chosen_handle.is_some();
    let desired = chosen_handle.unwrap_or_else(|| derive_handle(&project_id.to_string()));
    let owned: Option<String> = sqlx::query_scalar(
        "SELECT handle FROM handle_registry WHERE owner_id = $1 AND owner_type = 'MERCHANT'
          ORDER BY created_at, handle LIMIT 1",
    )
    .bind(merchant_id)
    .fetch_optional(pool)
    .await
    .map_err(internal)?;
    let handle = match owned {
        Some(h) => h,
        None => {
            let inserted: Option<String> = sqlx::query_scalar(
                "INSERT INTO handle_registry (handle, owner_type, owner_id, created_at)
                 VALUES ($1, 'MERCHANT', $2, now())
                 ON CONFLICT (handle) DO NOTHING RETURNING handle",
            )
            .bind(&desired)
            .bind(merchant_id)
            .fetch_optional(pool)
            .await
            .map_err(internal)?;
            provisioned = true;
            inserted.ok_or_else(|| {
                // Under the sandbox_handle advisory lock the pre-flight already
                // refused a taken chosen handle, so this loses only on a derived
                // collision (internal) — but for a chosen handle stay neutral.
                if chose_handle {
                    ApiError::conflict("HANDLE_UNAVAILABLE", "this @banza is not available")
                } else {
                    ApiError::conflict(
                        "HANDLE_TAKEN",
                        "the derived handle is already registered to another owner",
                    )
                }
            })?
        }
    };

    // 4. Compliance: a synthetic test entity. DO NOTHING — a real decision already
    //    recorded against this merchant outranks provisioning.
    let kyb_inserted: Option<String> = sqlx::query_scalar(
        "INSERT INTO merchant_compliance
             (merchant_id, kyb_status, aml_status, reviewed_at, notes, created_at, updated_at)
         VALUES ($1, 'SANDBOX_SYNTHETIC', 'PENDING', NULL,
                 'Synthetic Sandbox test entity provisioned for a Developer Project (ADR-060). Not a reviewed Business.',
                 now(), now())
         ON CONFLICT (merchant_id) DO NOTHING
         RETURNING kyb_status",
    )
    .bind(merchant_id)
    .fetch_optional(pool)
    .await
    .map_err(internal)?;
    let kyb_status = match kyb_inserted {
        Some(s) => {
            provisioned = true;
            s
        }
        None => {
            sqlx::query_scalar("SELECT kyb_status FROM merchant_compliance WHERE merchant_id = $1")
                .bind(merchant_id)
                .fetch_one(pool)
                .await
                .map_err(internal)?
        }
    };

    // 5. Policy: classification and pricing follow the use case.
    let (account_type, profile) = apply_use_case(state, merchant_id, effective).await?;

    super::risk::audit(
        pool,
        "SYSTEM",
        "SANDBOX_BUSINESS_PROVISIONED",
        &format!("merchant:{merchant_id}"),
        serde_json::json!({
            "project_id": project_id,
            "use_case": effective.as_str(),
            "business_account_type": account_type,
            "pricing_profile": profile,
            "kyb_status": kyb_status,
            "handle": handle,
            "provisioned": provisioned,
            "environment": state.environment.as_str(),
        }),
        None,
    )
    .await;

    Ok(SandboxBusiness {
        merchant_id: merchant_id.to_string(),
        wallet_id: wallet_id.to_string(),
        wallet_account_id: wallet_account_id.to_string(),
        handle,
        use_case: effective.as_str().to_string(),
        business_account_type: account_type,
        pricing_profile: profile,
        kyb_status,
        provisioned,
    })
}

/// Classification and pricing for a synthetic Business, from its use case.
/// Only ever called for a merchant recorded in `sandbox_businesses`.
async fn apply_use_case(
    state: &AppState,
    merchant_id: Uuid,
    use_case: UseCase,
) -> ApiResult<(String, String)> {
    let pool = &state.pool;
    let current: (Option<String>, Option<String>) = sqlx::query_as(
        "SELECT m.business_account_type, pp.code
           FROM merchants m LEFT JOIN pricing_profiles pp ON pp.id = m.pricing_profile_id
          WHERE m.id = $1",
    )
    .bind(merchant_id)
    .fetch_one(pool)
    .await
    .map_err(internal)?;

    let want_type = use_case.business_account_type();
    if current.0.as_deref().unwrap_or("MERCHANT") != want_type {
        state
            .merchant
            .set_business_account_type(MerchantId::from_uuid(merchant_id), want_type)
            .await
            .map_err(internal)?;
        super::risk::audit(
            pool,
            "SYSTEM",
            "BUSINESS_ACCOUNT_TYPE_CHANGED",
            &format!("merchant:{merchant_id}"),
            serde_json::json!({
                "from": current.0, "to": want_type,
                "source": "sandbox_use_case_policy", "use_case": use_case.as_str(),
            }),
            None,
        )
        .await;
    }

    let want_profile = use_case.pricing_profile();
    if current.1.as_deref() != Some(want_profile) {
        let updated: Option<Uuid> = sqlx::query_scalar(
            "UPDATE merchants m SET pricing_profile_id = pp.id, updated_at = now()
               FROM pricing_profiles pp
              WHERE m.id = $1 AND pp.code = $2 AND pp.enabled AND pp.environment = 'SANDBOX'
             RETURNING m.id",
        )
        .bind(merchant_id)
        .bind(want_profile)
        .fetch_optional(pool)
        .await
        .map_err(internal)?;
        if updated.is_none() {
            return Err(ApiError::internal(format!(
                "Sandbox pricing profile {want_profile} is not available"
            )));
        }
        super::risk::audit(
            pool,
            "SYSTEM",
            "PRICING_PROFILE_ASSIGNED",
            &format!("merchant:{merchant_id}"),
            serde_json::json!({
                "from": current.1, "to": want_profile,
                "source": "sandbox_use_case_policy", "use_case": use_case.as_str(),
            }),
            None,
        )
        .await;
    }
    Ok((want_type.to_string(), want_profile.to_string()))
}

#[derive(Deserialize)]
pub struct UseCaseBody {
    pub project_id: String,
    pub use_case: String,
}

/// PUT /internal/v1/sandbox/businesses/use-case
///
/// Changes the use case of a Project's synthetic Business. The Developer API
/// refuses it for a sealed binding (ADR-055); Core refuses it for any merchant
/// that is not a synthetic Sandbox Business, so it can never reprice or
/// reclassify a reviewed one.
pub async fn change_use_case(
    State(state): State<AppState>,
    Json(body): Json<UseCaseBody>,
) -> ApiResult<Json<SandboxBusiness>> {
    if state.environment.is_live() {
        return Err(ApiError::forbidden(
            "synthetic Sandbox Businesses are not available in LIVE",
        ));
    }
    let project_id = Uuid::parse_str(body.project_id.trim())
        .map_err(|_| ApiError::bad_request("invalid project_id"))?;
    let use_case = UseCase::parse(&body.use_case)
        .ok_or_else(|| ApiError::bad_request("use_case must be STANDARD or APPLICATION"))?;
    let row: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT sb.merchant_id, c.kyb_status
           FROM sandbox_businesses sb JOIN merchant_compliance c ON c.merchant_id = sb.merchant_id
          WHERE sb.project_id = $1",
    )
    .bind(project_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal)?;
    let Some((merchant_id, kyb)) = row else {
        return Err(ApiError::not_found(
            "this Project has no synthetic Sandbox Business",
        ));
    };
    if kyb != "SANDBOX_SYNTHETIC" {
        return Err(ApiError::unprocessable(
            "NOT_A_SYNTHETIC_BUSINESS",
            "only a synthetic Sandbox Business follows the Sandbox use-case policy",
        ));
    }
    sqlx::query(
        "UPDATE sandbox_businesses SET use_case = $2, updated_at = now() WHERE project_id = $1",
    )
    .bind(project_id)
    .bind(use_case.as_str())
    .execute(&state.pool)
    .await
    .map_err(internal)?;
    let b = provision_locked(&state, project_id, use_case, None, None).await?;
    let _ = merchant_id;
    Ok(Json(b))
}

/// Whether a KYB status lets a Business receive an application fee here.
///
/// `APPROVED` everywhere. `SANDBOX_SYNTHETIC` only outside LIVE — and Core never
/// writes that status in LIVE, so the second branch has nothing to match there
/// even if this check were wrong.
pub fn kyb_allows_application_fee(environment_is_live: bool, kyb_status: Option<&str>) -> bool {
    match kyb_status {
        Some("APPROVED") => true,
        Some("SANDBOX_SYNTHETIC") => !environment_is_live,
        _ => false,
    }
}
