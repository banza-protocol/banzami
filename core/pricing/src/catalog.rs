//! Operator-managed reference catalogs (Banzami ADR-021): pricing profiles and
//! fee policies. These NAME and DESCRIBE a profile / fee policy — they carry NO
//! percentages. Fee values live ONLY in `pricing_rules`. A FeePolicy merely
//! identifies a commercial policy; the numbers behind it stay in pricing_rules.
//!
//! Both catalogs share this code path; the table is chosen by [`CatalogKind`]
//! (a fixed literal, never caller input). They are not FK-linked to
//! `pricing_rules`, so existing free-string refs are never broken.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{postgres::PgRow, PgPool, Row};
use uuid::Uuid;

use crate::PricingError;

/// Which catalog a request targets. Maps to a fixed table name — NEVER built from
/// caller input, so there is no SQL injection surface.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CatalogKind {
    PricingProfiles,
    FeePolicies,
}

impl CatalogKind {
    fn table(self) -> &'static str {
        match self {
            CatalogKind::PricingProfiles => "pricing_profiles",
            CatalogKind::FeePolicies => "fee_policies",
        }
    }
    /// Fee policies carry a metadata column; pricing profiles do not.
    fn has_metadata(self) -> bool {
        matches!(self, CatalogKind::FeePolicies)
    }
}

/// One catalog entry. `metadata` is always `{}` for pricing profiles.
#[derive(Debug, Clone, Serialize)]
pub struct CatalogRecord {
    pub id: Uuid,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub environment: String,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Editable fields. `metadata` is ignored for pricing profiles.
#[derive(Debug, Clone)]
pub struct CatalogInput {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub environment: String,
    pub metadata: Option<serde_json::Value>,
}

impl CatalogInput {
    fn validate(&self) -> Result<(), PricingError> {
        if self.code.trim().is_empty() {
            return Err(PricingError::Config("code must not be empty".into()));
        }
        if self.name.trim().is_empty() {
            return Err(PricingError::Config("name must not be empty".into()));
        }
        if !matches!(self.environment.as_str(), "LIVE" | "SANDBOX") {
            return Err(PricingError::Config(format!(
                "environment must be LIVE or SANDBOX, got {}",
                self.environment
            )));
        }
        Ok(())
    }
}

#[derive(Debug, Default, Clone)]
pub struct CatalogFilter {
    pub environment: Option<String>,
    pub enabled: Option<bool>,
    pub code: Option<String>,
    pub limit: i64,
}

pub struct PostgresCatalogRepository {
    pool: PgPool,
}

impl PostgresCatalogRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    fn select(kind: CatalogKind) -> String {
        let meta = if kind.has_metadata() { "metadata" } else { "'{}'::jsonb AS metadata" };
        format!(
            "SELECT id, code, name, description, enabled, environment, {meta},
                    created_at, updated_at FROM {}",
            kind.table()
        )
    }

    pub async fn get(&self, kind: CatalogKind, id: Uuid) -> Result<CatalogRecord, PricingError> {
        sqlx::query(&format!("{} WHERE id = $1", Self::select(kind)))
            .bind(id)
            .fetch_optional(&self.pool)
            .await?
            .map(row_to_record)
            .transpose()?
            .ok_or_else(|| PricingError::Config(format!("catalog entry {id} not found")))
    }

    pub async fn list(
        &self,
        kind: CatalogKind,
        f: &CatalogFilter,
    ) -> Result<Vec<CatalogRecord>, PricingError> {
        let mut sql = Self::select(kind);
        sql.push_str(" WHERE 1=1");
        let mut i = 1;
        if f.environment.is_some() {
            sql.push_str(&format!(" AND environment = ${i}"));
            i += 1;
        }
        if f.enabled.is_some() {
            sql.push_str(&format!(" AND enabled = ${i}"));
            i += 1;
        }
        if f.code.is_some() {
            sql.push_str(&format!(" AND code ILIKE ${i}"));
            i += 1;
        }
        let _ = i;
        sql.push_str(" ORDER BY environment, code");
        sql.push_str(&format!(" LIMIT {}", f.limit.clamp(1, 500)));

        let mut q = sqlx::query(&sql);
        if let Some(v) = &f.environment {
            q = q.bind(v);
        }
        if let Some(v) = f.enabled {
            q = q.bind(v);
        }
        if let Some(v) = &f.code {
            q = q.bind(format!("%{v}%"));
        }
        let rows = q.fetch_all(&self.pool).await?;
        rows.into_iter().map(row_to_record).collect()
    }

    pub async fn create(
        &self,
        kind: CatalogKind,
        input: CatalogInput,
    ) -> Result<CatalogRecord, PricingError> {
        input.validate()?;
        let id = Uuid::new_v4();
        let meta = input.metadata.clone().unwrap_or_else(|| serde_json::json!({}));
        let sql = if kind.has_metadata() {
            format!(
                "INSERT INTO {} (id, code, name, description, environment, metadata)
                 VALUES ($1,$2,$3,$4,$5,$6)",
                kind.table()
            )
        } else {
            format!(
                "INSERT INTO {} (id, code, name, description, environment)
                 VALUES ($1,$2,$3,$4,$5)",
                kind.table()
            )
        };
        let mut q = sqlx::query(&sql)
            .bind(id)
            .bind(&input.code)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.environment);
        if kind.has_metadata() {
            q = q.bind(meta);
        }
        q.execute(&self.pool).await.map_err(|e| match e {
            sqlx::Error::Database(db) if db.constraint().is_some_and(|c| c.contains("code_env")) => {
                PricingError::Config(format!(
                    "code '{}' already exists in {}",
                    input.code, input.environment
                ))
            }
            other => PricingError::Database(other),
        })?;
        self.get(kind, id).await
    }

    pub async fn update(
        &self,
        kind: CatalogKind,
        id: Uuid,
        input: CatalogInput,
    ) -> Result<CatalogRecord, PricingError> {
        // code/environment are immutable identity; only descriptive fields change,
        // so only `name` is validated here (not the ignored code/env).
        if input.name.trim().is_empty() {
            return Err(PricingError::Config("name must not be empty".into()));
        }
        let _ = self.get(kind, id).await?; // 404 if missing
        if kind.has_metadata() {
            let meta = input.metadata.clone().unwrap_or_else(|| serde_json::json!({}));
            sqlx::query(&format!(
                "UPDATE {} SET name = $1, description = $2, metadata = $3, updated_at = NOW()
                  WHERE id = $4",
                kind.table()
            ))
            .bind(&input.name)
            .bind(&input.description)
            .bind(meta)
            .bind(id)
            .execute(&self.pool)
            .await?;
        } else {
            sqlx::query(&format!(
                "UPDATE {} SET name = $1, description = $2, updated_at = NOW() WHERE id = $3",
                kind.table()
            ))
            .bind(&input.name)
            .bind(&input.description)
            .bind(id)
            .execute(&self.pool)
            .await?;
        }
        self.get(kind, id).await
    }

    pub async fn set_enabled(
        &self,
        kind: CatalogKind,
        id: Uuid,
        enabled: bool,
    ) -> Result<CatalogRecord, PricingError> {
        let _ = self.get(kind, id).await?;
        sqlx::query(&format!(
            "UPDATE {} SET enabled = $1, updated_at = NOW() WHERE id = $2",
            kind.table()
        ))
        .bind(enabled)
        .bind(id)
        .execute(&self.pool)
        .await?;
        self.get(kind, id).await
    }
}

fn row_to_record(row: PgRow) -> Result<CatalogRecord, PricingError> {
    Ok(CatalogRecord {
        id: row.try_get("id")?,
        code: row.try_get("code")?,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        enabled: row.try_get("enabled")?,
        environment: row.try_get("environment")?,
        metadata: row.try_get("metadata")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
