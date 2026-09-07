//! Persistence for operator pricing rules (Banzami ADR-021).
//!
//! Rules are operator policy and live ONLY here + in the `pricing_rules` table
//! (migration 0070). The engine never reads the database itself — a provider
//! loads the active rule set and hands it to `engine::resolve`, keeping
//! resolution pure and the table the single source of pricing truth.
//!
//! Runtime sqlx queries (no compile-time macro / offline cache), mirroring the
//! collections + payment-links repositories.

use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};

use banzami_types::{Currency, PricingRuleId};

use crate::domain::{
    BusinessCategory, PricingOperation, PricingProfile, PricingRule, RoundingMode,
};
use crate::PricingError;

/// Loads the operator's active pricing rules for an environment. Implemented by
/// the Postgres provider; trait-shaped so the engine path can be unit-tested
/// with an in-memory rule set.
#[allow(async_fn_in_trait)]
pub trait PricingRuleProvider: Send + Sync {
    /// All ENABLED rules for the environment. Effective-window filtering happens
    /// in the engine against the resolution `as_of`, so disabled-but-current and
    /// future rules can coexist in the table.
    async fn load_rules(&self, environment: &str) -> Result<Vec<PricingRule>, PricingError>;
}

pub struct PostgresPricingRuleProvider {
    pool: PgPool,
}

impl PostgresPricingRuleProvider {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn parse_rounding(s: &str) -> RoundingMode {
    match s {
        "HALF_EVEN" => RoundingMode::HalfEven,
        "FLOOR" => RoundingMode::Floor,
        "CEIL" => RoundingMode::Ceil,
        _ => RoundingMode::HalfUp,
    }
}

impl PricingRuleProvider for PostgresPricingRuleProvider {
    async fn load_rules(&self, environment: &str) -> Result<Vec<PricingRule>, PricingError> {
        let rows = sqlx::query(
            r#"
            SELECT id, rule_key, version,
                   business_category, pricing_profile, fee_policy_ref, currency, country,
                   transaction_type,
                   pricing_operation,
                   rate_bps, flat_minor, min_fee_minor, max_fee_minor, rounding,
                   priority, effective_from, effective_to
              FROM pricing_rules
             WHERE environment = $1
               AND enabled = TRUE
            "#,
        )
        .bind(environment)
        .fetch_all(&self.pool)
        .await?;

        let mut rules = Vec::with_capacity(rows.len());
        for row in rows {
            let rate_bps: i32 = row.try_get("rate_bps")?;
            let currency: Option<String> = row.try_get("currency")?;
            rules.push(PricingRule {
                id: PricingRuleId::from_uuid(row.try_get("id")?),
                key: row.try_get("rule_key")?,
                version: row.try_get("version")?,
                business_category: row
                    .try_get::<Option<String>, _>("business_category")?
                    .map(|s| BusinessCategory::from_code(&s)),
                pricing_profile: row
                    .try_get::<Option<String>, _>("pricing_profile")?
                    .map(|s| PricingProfile::from_code(&s)),
                fee_policy_ref: row.try_get("fee_policy_ref")?,
                currency: match currency {
                    Some(c) => Some(
                        Currency::from_code(&c)
                            .ok_or_else(|| PricingError::Config(format!("unknown currency {c}")))?,
                    ),
                    None => None,
                },
                country: row.try_get("country")?,
                transaction_type: row.try_get("transaction_type")?,
                // An unrecognised operation resolves to None, which under the V2
                // path means the rule applies to nothing — not to everything.
                // A rule naming an operation this build does not know is a rule
                // this build must not apply.
                operation: row
                    .try_get::<Option<String>, _>("pricing_operation")?
                    .as_deref()
                    .and_then(PricingOperation::from_code),
                rate_bps: rate_bps as u32,
                flat_minor: row.try_get("flat_minor")?,
                min_fee_minor: row.try_get("min_fee_minor")?,
                max_fee_minor: row.try_get("max_fee_minor")?,
                rounding: parse_rounding(&row.try_get::<String, _>("rounding")?),
                priority: row.try_get("priority")?,
                effective_from: row.try_get::<DateTime<Utc>, _>("effective_from")?,
                effective_to: row.try_get::<Option<DateTime<Utc>>, _>("effective_to")?,
            });
        }
        Ok(rules)
    }
}
