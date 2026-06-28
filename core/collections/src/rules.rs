//! Rule resolution + validation (BANZA ADR-036 invariants).
//!
//! INV-COLLECTION-002: closed-rule shares sum exactly to total_amount_minor.
//! INV-COLLECTION-003: EQUAL_SPLIT with EXACT divisibility rejects a non-divisible
//! total — NO silent rounding.

use crate::domain::{CollectionRule, Divisibility, ResolvedShare};
use crate::CollectionError;

/// Resolve the predeclared shares for a closed rule, or an empty vec for open
/// rules. Enforces the financial invariants; never rounds silently.
pub fn resolve_closed_shares(
    rule: &CollectionRule,
    total_amount_minor: i64,
) -> Result<Vec<ResolvedShare>, CollectionError> {
    match rule {
        CollectionRule::EqualSplit {
            participants_count,
            divisibility,
        } => {
            let n = *participants_count;
            if n < 2 {
                return Err(CollectionError::InvalidRule(
                    "EQUAL_SPLIT requires participants_count >= 2".into(),
                ));
            }
            if total_amount_minor <= 0 {
                return Err(CollectionError::InvalidAmount);
            }
            let per = total_amount_minor / n;
            let remainder = total_amount_minor % n;
            if remainder != 0 && matches!(divisibility, Divisibility::Exact) {
                return Err(CollectionError::Indivisible);
            }
            let mut shares = Vec::with_capacity(n as usize);
            for i in 0..n {
                // REMAINDER_TO_FIRST: the (explicitly opted-in) remainder goes to share 1.
                let amount = if i == 0 { per + remainder } else { per };
                shares.push(ResolvedShare {
                    amount_minor: amount,
                    participant: None,
                });
            }
            Ok(shares)
        }

        CollectionRule::FixedAmounts { shares } => {
            if shares.is_empty() {
                return Err(CollectionError::InvalidRule(
                    "FIXED_AMOUNTS requires at least one share".into(),
                ));
            }
            let mut sum: i64 = 0;
            let mut out = Vec::with_capacity(shares.len());
            for s in shares {
                if s.amount_minor <= 0 {
                    return Err(CollectionError::InvalidAmount);
                }
                sum += s.amount_minor;
                out.push(ResolvedShare {
                    amount_minor: s.amount_minor,
                    participant: s.participant.clone(),
                });
            }
            if sum != total_amount_minor {
                return Err(CollectionError::SumMismatch {
                    sum,
                    total: total_amount_minor,
                });
            }
            Ok(out)
        }

        CollectionRule::Percentage {
            shares,
            divisibility,
        } => {
            if shares.is_empty() {
                return Err(CollectionError::InvalidRule(
                    "PERCENTAGE requires at least one share".into(),
                ));
            }
            let percent_sum: f64 = shares.iter().map(|s| s.percent).sum();
            if (percent_sum - 100.0).abs() > 0.001 {
                return Err(CollectionError::InvalidRule(format!(
                    "PERCENTAGE shares must sum to 100, got {percent_sum}"
                )));
            }
            // Resolve to integer minor units; track remainder.
            let mut out = Vec::with_capacity(shares.len());
            let mut allocated: i64 = 0;
            for s in shares {
                if s.percent <= 0.0 {
                    return Err(CollectionError::InvalidRule(
                        "percent must be > 0".into(),
                    ));
                }
                let amount = ((total_amount_minor as f64) * s.percent / 100.0).floor() as i64;
                allocated += amount;
                out.push(ResolvedShare {
                    amount_minor: amount,
                    participant: s.participant.clone(),
                });
            }
            let remainder = total_amount_minor - allocated;
            if remainder != 0 {
                if matches!(divisibility, Divisibility::Exact) {
                    return Err(CollectionError::Indivisible);
                }
                // REMAINDER_TO_FIRST
                out[0].amount_minor += remainder;
            }
            // Post-condition: exact sum (INV-COLLECTION-002).
            let check: i64 = out.iter().map(|s| s.amount_minor).sum();
            if check != total_amount_minor {
                return Err(CollectionError::SumMismatch {
                    sum: check,
                    total: total_amount_minor,
                });
            }
            Ok(out)
        }

        // Open rules: no predeclared shares; contributions are created dynamically.
        CollectionRule::OpenContribution { .. } | CollectionRule::MinimumContribution { .. } => {
            Ok(Vec::new())
        }
    }
}

/// Validate a dynamic contribution amount against an open rule.
pub fn validate_open_contribution(
    rule: &CollectionRule,
    amount_minor: i64,
) -> Result<(), CollectionError> {
    if amount_minor <= 0 {
        return Err(CollectionError::InvalidAmount);
    }
    match rule {
        CollectionRule::MinimumContribution { min_minor, .. } => {
            if amount_minor < *min_minor {
                return Err(CollectionError::BelowMinimum {
                    amount: amount_minor,
                    min: *min_minor,
                });
            }
            Ok(())
        }
        CollectionRule::OpenContribution { .. } => Ok(()),
        // Closed rules do not accept ad-hoc shares.
        _ => Err(CollectionError::ClosedRuleNoDynamicShares),
    }
}
