use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct ProfileResponse {
    pub id: String,
    pub merchant_id: String,
    pub handle: String,
    pub display_name: String,
    pub tagline: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub logo_url: Option<String>,
    pub cover_url: Option<String>,
    pub public: bool,
    pub wallet_id: Option<String>,
    pub social_links: Vec<SocialLink>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Serialize, Clone)]
pub struct SocialLink {
    pub platform: String,
    pub url: String,
}

// ---------------------------------------------------------------------------
// POST /internal/v1/merchant-profiles — create profile
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateProfileBody {
    pub merchant_id: String,
    // No `handle`: the profile never chooses an identity. The Business @banza is
    // the merchant's handle_registry entry; this endpoint only stores metadata.
    pub display_name: String,
    pub tagline: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub logo_url: Option<String>,
    pub cover_url: Option<String>,
    pub wallet_id: Option<String>,
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateProfileBody>,
) -> ApiResult<(StatusCode, Json<ProfileResponse>)> {
    let merchant_id: Uuid = body
        .merchant_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    if body.display_name.trim().is_empty() {
        return Err(ApiError::bad_request("display_name is required"));
    }

    // Ensure merchant exists
    let exists: bool = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM merchants WHERE id = $1)",
        merchant_id,
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .unwrap_or(false);

    if !exists {
        return Err(ApiError::not_found("merchant not found"));
    }

    let wallet_id: Option<Uuid> = body
        .wallet_id
        .as_deref()
        .map(|s| s.parse::<Uuid>())
        .transpose()
        .map_err(|_| ApiError::bad_request("invalid wallet_id"))?;

    let profile_id = Uuid::new_v4();

    sqlx::query!(
        r#"
        INSERT INTO merchant_profiles
            (id, merchant_id, display_name, tagline, description,
             category, logo_url, cover_url, wallet_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
        profile_id,
        merchant_id,
        body.display_name.trim(),
        body.tagline,
        body.description,
        body.category,
        body.logo_url,
        body.cover_url,
        wallet_id,
    )
    .execute(&state.pool)
    .await
    .map_err(|e| {
        if e.to_string().contains("merchant_profiles_merchant_id_key") {
            ApiError::unprocessable("PROFILE_EXISTS", "merchant already has a profile")
        } else {
            ApiError::internal(e.to_string())
        }
    })?;

    let profile = fetch_profile(&state.pool, profile_id).await?;
    Ok((StatusCode::CREATED, Json(profile)))
}

// ---------------------------------------------------------------------------
// PATCH /internal/v1/merchant-profiles/:id — update profile
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct UpdateProfileBody {
    pub display_name: Option<String>,
    pub tagline: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub logo_url: Option<String>,
    pub cover_url: Option<String>,
    pub public: Option<bool>,
    pub wallet_id: Option<String>,
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateProfileBody>,
) -> ApiResult<Json<ProfileResponse>> {
    let id: Uuid = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid profile id"))?;

    let wallet_id: Option<Uuid> = body
        .wallet_id
        .as_deref()
        .map(|s| s.parse::<Uuid>())
        .transpose()
        .map_err(|_| ApiError::bad_request("invalid wallet_id"))?;

    sqlx::query!(
        r#"
        UPDATE merchant_profiles
        SET display_name = COALESCE($1, display_name),
            tagline      = COALESCE($2, tagline),
            description  = COALESCE($3, description),
            category     = COALESCE($4, category),
            logo_url     = COALESCE($5, logo_url),
            cover_url    = COALESCE($6, cover_url),
            public       = COALESCE($7, public),
            wallet_id    = COALESCE($8, wallet_id),
            updated_at   = NOW()
        WHERE id = $9
        "#,
        body.display_name.as_deref(),
        body.tagline.as_deref(),
        body.description.as_deref(),
        body.category.as_deref(),
        body.logo_url.as_deref(),
        body.cover_url.as_deref(),
        body.public,
        wallet_id,
        id,
    )
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(fetch_profile(&state.pool, id).await?))
}

// ---------------------------------------------------------------------------
// GET /internal/v1/merchant-profiles/:id
// ---------------------------------------------------------------------------

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<ProfileResponse>> {
    let id: Uuid = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid profile id"))?;
    Ok(Json(fetch_profile(&state.pool, id).await?))
}

// ---------------------------------------------------------------------------
// GET /internal/v1/merchant-profiles/by-handle/:handle
// ---------------------------------------------------------------------------

pub async fn get_by_handle(
    State(state): State<AppState>,
    Path(handle): Path<String>,
) -> ApiResult<Json<ProfileResponse>> {
    let handle = normalise_handle(&handle)?;

    // handle_registry is the identity authority: resolve the @banza there and
    // require a MERCHANT owner. merchant_profiles is then looked up by merchant_id
    // (it holds no handle of its own).
    let owner = sqlx::query!(
        "SELECT owner_id FROM handle_registry WHERE handle = $1 AND owner_type = 'MERCHANT'",
        handle,
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .and_then(|r| r.owner_id)
    .ok_or_else(|| ApiError::not_found("merchant profile not found"))?;

    let row = sqlx::query!(
        "SELECT id FROM merchant_profiles WHERE merchant_id = $1 AND public = true",
        owner,
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("merchant profile not found"))?;

    Ok(Json(fetch_profile(&state.pool, row.id).await?))
}

// ---------------------------------------------------------------------------
// GET /internal/v1/merchant-profiles/by-merchant/:merchant_id
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /internal/v1/merchant-profiles?category=&limit=
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ListProfilesQuery {
    pub category: Option<String>,
    pub q: Option<String>, // full-text search on display_name
    pub limit: Option<i64>,
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListProfilesQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let limit = q.limit.unwrap_or(20).clamp(1, 50);
    let search = q.q.as_deref().map(|s| format!("%{s}%"));

    let rows = sqlx::query!(
        r#"
        SELECT mp.id, mp.merchant_id,
               (SELECT hr.handle FROM handle_registry hr
                 WHERE hr.owner_type = 'MERCHANT' AND hr.owner_id = mp.merchant_id) AS handle,
               mp.display_name, mp.tagline, mp.category,
               mp.logo_url, mp.cover_url, mp.created_at
        FROM merchant_profiles mp
        WHERE mp.public = true
          AND ($1::text IS NULL OR mp.category = $1)
          AND ($2::text IS NULL OR mp.display_name ILIKE $2)
        ORDER BY mp.created_at DESC
        LIMIT $3
        "#,
        q.category,
        search,
        limit,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let data: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id":           r.id,
                "merchant_id":  r.merchant_id,
                "handle":       r.handle,
                "display_name": r.display_name,
                "tagline":      r.tagline,
                "category":     r.category,
                "logo_url":     r.logo_url,
                "cover_url":    r.cover_url,
                "created_at":   r.created_at,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "data": data })))
}

// ---------------------------------------------------------------------------
// POST /internal/v1/merchant-profiles/:id/social-links
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Normalize + syntax-validate a @banza passed to the by-handle lookup. The
// profile no longer stores a handle; this only sanitises the lookup input before
// it is resolved against handle_registry (the identity authority), using the one
// canonical @banza grammar.
fn normalise_handle(raw: &str) -> ApiResult<String> {
    let h = banzami_identity::normalize_handle(raw);
    banzami_identity::validate_handle(&h).map_err(|e| ApiError::bad_request(e))?;
    Ok(h)
}

async fn fetch_profile(pool: &sqlx::PgPool, id: Uuid) -> ApiResult<ProfileResponse> {
    let row = sqlx::query!(
        r#"
        SELECT mp.id, mp.merchant_id,
               (SELECT hr.handle FROM handle_registry hr
                 WHERE hr.owner_type = 'MERCHANT' AND hr.owner_id = mp.merchant_id) AS handle,
               mp.display_name, mp.tagline, mp.description,
               mp.category, mp.logo_url, mp.cover_url, mp.public, mp.wallet_id,
               mp.created_at, mp.updated_at
        FROM merchant_profiles mp WHERE mp.id = $1
        "#,
        id,
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("merchant profile not found"))?;

    let social_links = sqlx::query!(
        "SELECT platform, url FROM merchant_social_links WHERE profile_id = $1 ORDER BY platform",
        id,
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|r| SocialLink {
        platform: r.platform,
        url: r.url,
    })
    .collect();

    Ok(ProfileResponse {
        id: row.id.to_string(),
        merchant_id: row.merchant_id.to_string(),
        // Derived from handle_registry (the authority), not stored on the profile.
        handle: row.handle.unwrap_or_default(),
        display_name: row.display_name,
        tagline: row.tagline,
        description: row.description,
        category: row.category,
        logo_url: row.logo_url,
        cover_url: row.cover_url,
        public: row.public,
        wallet_id: row.wallet_id.map(|u| u.to_string()),
        social_links,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}
