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
    pub handle: String,
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

    let handle = normalise_handle(&body.handle)?;

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
            (id, merchant_id, handle, display_name, tagline, description,
             category, logo_url, cover_url, wallet_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#,
        profile_id,
        merchant_id,
        handle,
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
        if e.to_string().contains("merchant_profiles_handle_key")
            || e.to_string().contains("unique")
        {
            ApiError::unprocessable("HANDLE_TAKEN", "this handle is already in use")
        } else if e.to_string().contains("merchant_profiles_merchant_id_key") {
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

    let row = sqlx::query!(
        "SELECT id FROM merchant_profiles WHERE handle = $1 AND public = true",
        handle,
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
        SELECT id, merchant_id, handle, display_name, tagline, category,
               logo_url, cover_url, created_at
        FROM merchant_profiles
        WHERE public = true
          AND ($1::text IS NULL OR category = $1)
          AND ($2::text IS NULL OR display_name ILIKE $2)
        ORDER BY created_at DESC
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

fn normalise_handle(raw: &str) -> ApiResult<String> {
    let h = raw.trim().trim_start_matches('@').to_lowercase();
    if h.len() < 3 || h.len() > 50 {
        return Err(ApiError::bad_request("handle must be 3–50 characters"));
    }
    if !h.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(ApiError::bad_request(
            "handle may only contain letters, digits, and underscores",
        ));
    }
    Ok(h)
}

async fn fetch_profile(pool: &sqlx::PgPool, id: Uuid) -> ApiResult<ProfileResponse> {
    let row = sqlx::query!(
        r#"
        SELECT id, merchant_id, handle, display_name, tagline, description,
               category, logo_url, cover_url, public, wallet_id, created_at, updated_at
        FROM merchant_profiles WHERE id = $1
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
        handle: row.handle,
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
