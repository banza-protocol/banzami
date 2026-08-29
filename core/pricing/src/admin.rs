//! Operator administration of pricing rules (Banzami ADR-021).
//!
//! This is the ONLY write path to `pricing_rules` — the single place fee
//! percentages live. It is operator-internal (driven by BANZADMIN via admin-api);
//! no app ever reaches it. Two invariants protect the audit chain:
//!
//! - **Never delete a rule.** Rules are disabled, never removed.
//! - **Never edit a *used* rule in place.** A rule referenced by an
//!   `operator_fees` / `app_settlements` row has already priced real money; an
//!   edit creates a NEW version (and disables the old one), so every historical
//!   snapshot stays reproducible.
//!
//! The engine still reads only ENABLED rows (via [`crate::PricingRuleProvider`]);
//! this module never changes how a fee is computed.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{postgres::PgRow, PgPool, Row};

use banzami_types::PricingRuleId;

use crate::PricingError;

/// A full pricing-rule row for the admin surface, plus a derived `used` flag.
/// Reference fields are raw strings (exactly as stored) — no enum coercion.
#[derive(Debug, Clone, Serialize)]
pub struct PricingRuleRecord {
    pub id: PricingRuleId,
    pub rule_key: String,
    pub version: i32,
    pub environment: String,
    pub enabled: bool,
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub fee_policy_ref: Option<String>,
    pub currency: Option<String>,
    pub country: Option<String>,
    pub transaction_type: Option<String>,
    pub rate_bps: i32,
    pub flat_minor: i64,
    pub min_fee_minor: Option<i64>,
    pub max_fee_minor: Option<i64>,
    pub rounding: String,
    pub priority: i32,
    pub effective_from: DateTime<Utc>,
    pub effective_to: Option<DateTime<Utc>>,
    pub description: Option<String>,
    /// True once this rule has priced a real fee (operator_fees / app_settlements).
    /// A used rule is immutable: an edit produces a new version instead.
    pub used: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Editable fields of a pricing rule. Validated before any write.
#[derive(Debug, Clone)]
pub struct PricingRuleInput {
    pub rule_key: String,
    pub environment: String,
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub fee_policy_ref: Option<String>,
    pub currency: Option<String>,
    pub country: Option<String>,
    pub transaction_type: Option<String>,
    pub rate_bps: i32,
    pub flat_minor: i64,
    pub min_fee_minor: Option<i64>,
    pub max_fee_minor: Option<i64>,
    pub rounding: String,
    pub priority: i32,
    pub effective_from: Option<DateTime<Utc>>,
    pub effective_to: Option<DateTime<Utc>>,
    pub description: Option<String>,
}

const VALID_ROUNDING: [&str; 4] = ["HALF_UP", "HALF_EVEN", "FLOOR", "CEIL"];
const VALID_ENV: [&str; 2] = ["LIVE", "SANDBOX"];

impl PricingRuleInput {
    /// Operator-policy validation. Percentages are allowed here (and only here);
    /// everything else mirrors the DB CHECK constraints so errors surface as
    /// clean 400s rather than 500s.
    pub fn validate(&self) -> Result<(), PricingError> {
        if self.rule_key.trim().is_empty() {
            return Err(PricingError::Config("rule_key must not be empty".into()));
        }
        if !VALID_ENV.contains(&self.environment.as_str()) {
            return Err(PricingError::Config(format!(
                "environment must be LIVE or SANDBOX, got {}",
                self.environment
            )));
        }
        if !VALID_ROUNDING.contains(&self.rounding.as_str()) {
            return Err(PricingError::Config(format!(
                "rounding must be one of HALF_UP/HALF_EVEN/FLOOR/CEIL, got {}",
                self.rounding
            )));
        }
        if self.rate_bps < 0 {
            return Err(PricingError::Config("rate_bps must be >= 0".into()));
        }
        if self.flat_minor < 0 {
            return Err(PricingError::Config("flat_minor must be >= 0".into()));
        }
        if let Some(min) = self.min_fee_minor {
            if min < 0 {
                return Err(PricingError::Config("min_fee_minor must be >= 0".into()));
            }
        }
        if let Some(max) = self.max_fee_minor {
            if max < 0 {
                return Err(PricingError::Config("max_fee_minor must be >= 0".into()));
            }
        }
        if let (Some(min), Some(max)) = (self.min_fee_minor, self.max_fee_minor) {
            if min > max {
                return Err(PricingError::Config(
                    "min_fee_minor must be <= max_fee_minor".into(),
                ));
            }
        }
        if let (Some(from), Some(to)) = (self.effective_from, self.effective_to) {
            if to <= from {
                return Err(PricingError::Config(
                    "effective_to must be after effective_from".into(),
                ));
            }
        }
        if let Some(c) = &self.currency {
            if banzami_types::Currency::from_code(c).is_none() {
                return Err(PricingError::Config(format!("unsupported currency: {c}")));
            }
        }
        Ok(())
    }
}

/// Filters for the admin list view.
#[derive(Debug, Default, Clone)]
pub struct PricingRuleFilter {
    pub environment: Option<String>,
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub currency: Option<String>,
    /// `Some(true)` = enabled only, `Some(false)` = disabled only, `None` = all.
    pub enabled: Option<bool>,
    pub rule_key: Option<String>,
    pub limit: i64,
}

pub struct PostgresPricingRuleAdminRepository {
    pool: PgPool,
}

const USED_EXPR: &str = "(EXISTS (SELECT 1 FROM operator_fees of WHERE of.pricing_rule_id = pr.id)
       OR EXISTS (SELECT 1 FROM app_settlements aps WHERE aps.pricing_rule_id = pr.id))";

impl PostgresPricingRuleAdminRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    fn select_one() -> String {
        format!(
            "SELECT pr.id, pr.rule_key, pr.version, pr.environment, pr.enabled,
                    pr.business_category, pr.pricing_profile, pr.fee_policy_ref, pr.currency,
                    pr.country, pr.transaction_type, pr.rate_bps, pr.flat_minor, pr.min_fee_minor, pr.max_fee_minor,
                    pr.rounding, pr.priority, pr.effective_from, pr.effective_to, pr.description,
                    {USED_EXPR} AS used, pr.created_at, pr.updated_at
               FROM pricing_rules pr"
        )
    }

    /// Highest existing version for a (environment, rule_key), or 0 if none.
    async fn max_version(&self, environment: &str, rule_key: &str) -> Result<i32, PricingError> {
        let v: Option<i32> = sqlx::query_scalar(
            "SELECT MAX(version) FROM pricing_rules WHERE environment = $1 AND rule_key = $2",
        )
        .bind(environment)
        .bind(rule_key)
        .fetch_one(&self.pool)
        .await?;
        Ok(v.unwrap_or(0))
    }

    async fn is_used(&self, id: PricingRuleId) -> Result<bool, PricingError> {
        let used: bool = sqlx::query_scalar(
            "SELECT (EXISTS (SELECT 1 FROM operator_fees WHERE pricing_rule_id = $1)
                  OR EXISTS (SELECT 1 FROM app_settlements WHERE pricing_rule_id = $1))",
        )
        .bind(id.as_uuid())
        .fetch_one(&self.pool)
        .await?;
        Ok(used)
    }

    async fn insert_version(
        &self,
        input: &PricingRuleInput,
        version: i32,
    ) -> Result<PricingRuleRecord, PricingError> {
        let id = PricingRuleId::new();
        sqlx::query(
            "INSERT INTO pricing_rules
               (id, rule_key, version, environment, enabled, business_category, pricing_profile,
                fee_policy_ref, currency, country, transaction_type, rate_bps, flat_minor, min_fee_minor,
                max_fee_minor, rounding, priority, effective_from, effective_to, description)
             VALUES ($1,$2,$3,$4,TRUE,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                     COALESCE($17, NOW()),$18,$19)",
        )
        .bind(id.as_uuid())
        .bind(&input.rule_key)
        .bind(version)
        .bind(&input.environment)
        .bind(&input.business_category)
        .bind(&input.pricing_profile)
        .bind(&input.fee_policy_ref)
        .bind(&input.currency)
        .bind(&input.country)
        .bind(&input.transaction_type)
        .bind(input.rate_bps)
        .bind(input.flat_minor)
        .bind(input.min_fee_minor)
        .bind(input.max_fee_minor)
        .bind(&input.rounding)
        .bind(input.priority)
        .bind(input.effective_from)
        .bind(input.effective_to)
        .bind(&input.description)
        .execute(&self.pool)
        .await?;
        self.get(id).await
    }

    pub async fn get(&self, id: PricingRuleId) -> Result<PricingRuleRecord, PricingError> {
        sqlx::query(&format!("{} WHERE pr.id = $1", Self::select_one()))
            .bind(id.as_uuid())
            .fetch_optional(&self.pool)
            .await?
            .map(row_to_record)
            .transpose()?
            .ok_or_else(|| PricingError::Config(format!("pricing rule {id} not found")))
    }

    pub async fn list(
        &self,
        f: &PricingRuleFilter,
    ) -> Result<Vec<PricingRuleRecord>, PricingError> {
        // Dynamic, fully parameterised filter — no string interpolation of values.
        let mut sql = Self::select_one();
        sql.push_str(" WHERE 1=1");
        let mut idx = 1;
        macro_rules! clause {
            ($opt:expr, $col:literal) => {
                if $opt.is_some() {
                    sql.push_str(&format!(" AND pr.{} = ${}", $col, idx));
                    idx += 1;
                }
            };
        }
        clause!(f.environment, "environment");
        clause!(f.business_category, "business_category");
        clause!(f.pricing_profile, "pricing_profile");
        clause!(f.currency, "currency");
        clause!(f.rule_key, "rule_key");
        if f.enabled.is_some() {
            sql.push_str(&format!(" AND pr.enabled = ${idx}"));
            idx += 1;
        }
        let _ = idx;
        sql.push_str(" ORDER BY pr.environment, pr.rule_key, pr.version DESC");
        sql.push_str(&format!(" LIMIT {}", f.limit.clamp(1, 500)));

        let mut q = sqlx::query(&sql);
        if let Some(v) = &f.environment {
            q = q.bind(v);
        }
        if let Some(v) = &f.business_category {
            q = q.bind(v);
        }
        if let Some(v) = &f.pricing_profile {
            q = q.bind(v);
        }
        if let Some(v) = &f.currency {
            q = q.bind(v);
        }
        if let Some(v) = &f.rule_key {
            q = q.bind(v);
        }
        if let Some(v) = f.enabled {
            q = q.bind(v);
        }
        let rows = q.fetch_all(&self.pool).await?;
        rows.into_iter().map(row_to_record).collect()
    }

    /// Create a brand-new rule (version 1). Errors if the (environment, rule_key)
    /// already exists — an existing key evolves through `update`, not `create`.
    pub async fn create(&self, input: PricingRuleInput) -> Result<PricingRuleRecord, PricingError> {
        input.validate()?;
        if self
            .max_version(&input.environment, &input.rule_key)
            .await?
            > 0
        {
            return Err(PricingError::Config(format!(
                "rule_key '{}' already exists in {}; edit it instead of creating",
                input.rule_key, input.environment
            )));
        }
        self.insert_version(&input, 1).await
    }

    /// Edit a rule. If the rule has already priced real money (`used`), it is
    /// immutable: a NEW version is created (and the old one disabled), preserving
    /// every historical snapshot. If unused, it is edited in place. The
    /// `rule_key`/`environment` of the input are forced to the base rule's.
    pub async fn update(
        &self,
        id: PricingRuleId,
        mut input: PricingRuleInput,
    ) -> Result<PricingRuleRecord, PricingError> {
        let base = self.get(id).await?;
        input.rule_key = base.rule_key.clone();
        input.environment = base.environment.clone();
        input.validate()?;

        if base.used {
            // Immutable: supersede with a new version, disable the old one.
            let next = self.max_version(&base.environment, &base.rule_key).await? + 1;
            let created = self.insert_version(&input, next).await?;
            sqlx::query(
                "UPDATE pricing_rules SET enabled = FALSE, updated_at = NOW() WHERE id = $1",
            )
            .bind(id.as_uuid())
            .execute(&self.pool)
            .await?;
            Ok(created)
        } else {
            sqlx::query(
                "UPDATE pricing_rules SET
                    business_category = $1, pricing_profile = $2, fee_policy_ref = $3,
                    currency = $4, country = $5, rate_bps = $6, flat_minor = $7,
                    min_fee_minor = $8, max_fee_minor = $9, rounding = $10, priority = $11,
                    effective_from = COALESCE($12, effective_from), effective_to = $13,
                    description = $14, updated_at = NOW()
                  WHERE id = $15",
            )
            .bind(&input.business_category)
            .bind(&input.pricing_profile)
            .bind(&input.fee_policy_ref)
            .bind(&input.currency)
            .bind(&input.country)
            .bind(input.rate_bps)
            .bind(input.flat_minor)
            .bind(input.min_fee_minor)
            .bind(input.max_fee_minor)
            .bind(&input.rounding)
            .bind(input.priority)
            .bind(input.effective_from)
            .bind(input.effective_to)
            .bind(&input.description)
            .bind(id.as_uuid())
            .execute(&self.pool)
            .await?;
            self.get(id).await
        }
    }

    /// Enable or disable a rule (never deletes). Disabled rules are skipped by the
    /// engine but remain fully auditable.
    pub async fn set_enabled(
        &self,
        id: PricingRuleId,
        enabled: bool,
    ) -> Result<PricingRuleRecord, PricingError> {
        let _ = self.get(id).await?; // 404 if missing
        sqlx::query("UPDATE pricing_rules SET enabled = $1, updated_at = NOW() WHERE id = $2")
            .bind(enabled)
            .bind(id.as_uuid())
            .execute(&self.pool)
            .await?;
        self.get(id).await
    }

    /// Duplicate a rule into a NEW `rule_key` (version 1), copying every field of
    /// the source. The new key must not already exist.
    pub async fn duplicate(
        &self,
        id: PricingRuleId,
        new_rule_key: String,
    ) -> Result<PricingRuleRecord, PricingError> {
        let src = self.get(id).await?;
        let input = PricingRuleInput {
            rule_key: new_rule_key,
            environment: src.environment,
            business_category: src.business_category,
            pricing_profile: src.pricing_profile,
            fee_policy_ref: src.fee_policy_ref,
            currency: src.currency,
            country: src.country,
            transaction_type: src.transaction_type,
            rate_bps: src.rate_bps,
            flat_minor: src.flat_minor,
            min_fee_minor: src.min_fee_minor,
            max_fee_minor: src.max_fee_minor,
            rounding: src.rounding,
            priority: src.priority,
            effective_from: Some(src.effective_from),
            effective_to: src.effective_to,
            description: src.description,
        };
        self.create(input).await
    }

    /// All versions of a (environment, rule_key), newest first — the version
    /// history surfaced in the admin detail view.
    pub async fn versions(
        &self,
        environment: &str,
        rule_key: &str,
    ) -> Result<Vec<PricingRuleRecord>, PricingError> {
        let rows = sqlx::query(&format!(
            "{} WHERE pr.environment = $1 AND pr.rule_key = $2 ORDER BY pr.version DESC",
            Self::select_one()
        ))
        .bind(environment)
        .bind(rule_key)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(row_to_record).collect()
    }

    /// Expose the used-check for callers that need it before acting.
    pub async fn used(&self, id: PricingRuleId) -> Result<bool, PricingError> {
        self.is_used(id).await
    }
}

fn row_to_record(row: PgRow) -> Result<PricingRuleRecord, PricingError> {
    Ok(PricingRuleRecord {
        id: PricingRuleId::from_uuid(row.try_get("id")?),
        rule_key: row.try_get("rule_key")?,
        version: row.try_get("version")?,
        environment: row.try_get("environment")?,
        enabled: row.try_get("enabled")?,
        business_category: row.try_get("business_category")?,
        pricing_profile: row.try_get("pricing_profile")?,
        fee_policy_ref: row.try_get("fee_policy_ref")?,
        currency: row.try_get("currency")?,
        country: row.try_get("country")?,
        transaction_type: row.try_get("transaction_type")?,
        rate_bps: row.try_get("rate_bps")?,
        flat_minor: row.try_get("flat_minor")?,
        min_fee_minor: row.try_get("min_fee_minor")?,
        max_fee_minor: row.try_get("max_fee_minor")?,
        rounding: row.try_get("rounding")?,
        priority: row.try_get("priority")?,
        effective_from: row.try_get("effective_from")?,
        effective_to: row.try_get("effective_to")?,
        description: row.try_get("description")?,
        used: row.try_get("used")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
