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
            // Money is never computed in floating point (MONEY-MODEL-001). The
            // published contract states a share as a decimal percent; it is
            // turned into integer basis points once, exactly or not at all, and
            // every amount below is integer arithmetic on minor units.
            let mut bps = Vec::with_capacity(shares.len());
            for s in shares {
                bps.push(percent_to_bps(s.percent)?);
            }
            let bps_sum: i64 = bps.iter().sum();
            if bps_sum != 10_000 {
                return Err(CollectionError::InvalidRule(format!(
                    "PERCENTAGE shares must sum to 100, got {}.{:02}",
                    bps_sum / 100,
                    bps_sum % 100
                )));
            }
            // Resolve to integer minor units; track remainder.
            let mut out = Vec::with_capacity(shares.len());
            let mut allocated: i64 = 0;
            for (s, share_bps) in shares.iter().zip(&bps) {
                let amount =
                    i64::try_from(i128::from(total_amount_minor) * i128::from(*share_bps) / 10_000)
                        .map_err(|_| CollectionError::InvalidRule("amount out of range".into()))?;
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

/// A decimal percent from the published contract, as integer basis points.
///
/// Refused unless it is positive, at most 100 and has at most two decimal places:
/// a share that basis points cannot state exactly is not rounded into existence.
fn percent_to_bps(percent: f64) -> Result<i64, CollectionError> {
    if !percent.is_finite() || percent <= 0.0 || percent > 100.0 {
        return Err(CollectionError::InvalidRule(
            "percent must be > 0 and at most 100".into(),
        ));
    }
    let bps = (percent * 100.0).round();
    if ((bps / 100.0) - percent).abs() > 1e-9 {
        return Err(CollectionError::InvalidRule(
            "percent must have at most two decimal places".into(),
        ));
    }
    Ok(bps as i64)
}

#[cfg(test)]
mod percent_tests {
    use super::percent_to_bps;

    #[test]
    fn a_percent_is_exact_basis_points_or_refused() {
        assert_eq!(percent_to_bps(33.33).unwrap(), 3_333);
        assert_eq!(percent_to_bps(100.0).unwrap(), 10_000);
        assert_eq!(percent_to_bps(0.01).unwrap(), 1);
        assert!(percent_to_bps(33.333).is_err());
        assert!(percent_to_bps(0.0).is_err());
        assert!(percent_to_bps(-5.0).is_err());
        assert!(percent_to_bps(f64::NAN).is_err());
        assert!(percent_to_bps(100.01).is_err());
    }
}
