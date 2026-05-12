use std::fmt;

use thiserror::Error;

use crate::Currency;

/// A monetary value in integer minor units (cêntimos for AOA, cents for USD/EUR).
///
/// # Invariants
/// - `amount_minor` is always in the correct minor unit for `currency`.
/// - Arithmetic across different currencies is rejected at the type level.
/// - Floating-point arithmetic is never used. (CLAUDE.md §10.3)
///
/// i64 supports ±92.2 trillion minor units — well above any realistic transaction ceiling.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Money {
    /// Signed amount in minor units. Negative values represent debits / amounts owed.
    amount_minor: i64,
    pub currency: Currency,
}

impl Money {
    pub const fn new(amount_minor: i64, currency: Currency) -> Self {
        Self { amount_minor, currency }
    }

    pub const fn zero(currency: Currency) -> Self {
        Self::new(0, currency)
    }

    /// Construct from major + minor parts (e.g. `from_parts(10, 50, AOA)` = 1050 cêntimos).
    pub fn from_parts(major: i64, minor: u32, currency: Currency) -> Self {
        debug_assert!(minor < currency.minor_units_per_major(), "minor must be < minor_units_per_major");
        let factor = currency.minor_units_per_major() as i64;
        Self::new(major * factor + minor as i64, currency)
    }

    pub const fn amount_minor(self) -> i64 {
        self.amount_minor
    }

    pub const fn is_positive(self) -> bool {
        self.amount_minor > 0
    }

    pub const fn is_negative(self) -> bool {
        self.amount_minor < 0
    }

    pub const fn is_zero(self) -> bool {
        self.amount_minor == 0
    }

    pub const fn negate(self) -> Self {
        Self::new(-self.amount_minor, self.currency)
    }

    pub fn abs(self) -> Self {
        Self::new(self.amount_minor.abs(), self.currency)
    }

    pub fn checked_add(self, rhs: Self) -> Result<Self, MoneyError> {
        self.assert_same_currency(rhs)?;
        self.amount_minor
            .checked_add(rhs.amount_minor)
            .map(|v| Self::new(v, self.currency))
            .ok_or(MoneyError::Overflow)
    }

    pub fn checked_sub(self, rhs: Self) -> Result<Self, MoneyError> {
        self.assert_same_currency(rhs)?;
        self.amount_minor
            .checked_sub(rhs.amount_minor)
            .map(|v| Self::new(v, self.currency))
            .ok_or(MoneyError::Overflow)
    }

    /// Multiply by an integer factor (e.g. fee = amount * rate_bps / 10_000).
    pub fn checked_mul_i64(self, factor: i64) -> Result<Self, MoneyError> {
        self.amount_minor
            .checked_mul(factor)
            .map(|v| Self::new(v, self.currency))
            .ok_or(MoneyError::Overflow)
    }

    fn assert_same_currency(self, other: Self) -> Result<(), MoneyError> {
        if self.currency != other.currency {
            Err(MoneyError::CurrencyMismatch {
                left: self.currency,
                right: other.currency,
            })
        } else {
            Ok(())
        }
    }
}

impl fmt::Display for Money {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let factor = self.currency.minor_units_per_major() as i64;
        let major = self.amount_minor / factor;
        let minor = (self.amount_minor % factor).unsigned_abs();
        write!(f, "{}.{:02} {}", major, minor, self.currency)
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum MoneyError {
    #[error("currency mismatch: {left} vs {right}")]
    CurrencyMismatch { left: Currency, right: Currency },

    #[error("arithmetic overflow")]
    Overflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn addition_same_currency() {
        let a = Money::new(500, Currency::AOA);
        let b = Money::new(300, Currency::AOA);
        assert_eq!(a.checked_add(b).unwrap(), Money::new(800, Currency::AOA));
    }

    #[test]
    fn addition_currency_mismatch_is_error() {
        let a = Money::new(100, Currency::AOA);
        let b = Money::new(100, Currency::USD);
        assert!(matches!(a.checked_add(b), Err(MoneyError::CurrencyMismatch { .. })));
    }

    #[test]
    fn display_formats_correctly() {
        let m = Money::new(150_050, Currency::AOA);
        assert_eq!(m.to_string(), "1500.50 AOA");
    }

    #[test]
    fn negate_and_abs() {
        let m = Money::new(1000, Currency::USD);
        assert_eq!(m.negate().amount_minor(), -1000);
        assert_eq!(m.negate().abs().amount_minor(), 1000);
    }

    #[test]
    fn zero_is_zero() {
        assert!(Money::zero(Currency::AOA).is_zero());
    }
}
