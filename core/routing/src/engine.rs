use banzami_types::{Currency, Money, MerchantId, TransactionId};

use crate::{PaymentRail, RoutingDecision, RoutingError};

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

pub struct RouteRequest {
    pub transaction_id: TransactionId,
    pub merchant_id:    MerchantId,
    pub amount:         Money,
}

// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

/// A single routing rule: if the transaction currency matches, consider this
/// rail with the given priority (higher = preferred).
#[derive(Debug, Clone)]
pub struct RoutingRule {
    pub currency: Currency,
    pub rail:     PaymentRail,
    /// Higher priority rules are selected first. Rules with equal priority
    /// for the same currency are selected by insertion order.
    pub priority: u8,
}

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait RoutingEngine: Send + Sync {
    /// Select the best payment rail for the given request.
    async fn route(&self, req: RouteRequest) -> Result<RoutingDecision, RoutingError>;
}

// ---------------------------------------------------------------------------
// Static (rule-based) implementation
// ---------------------------------------------------------------------------

/// Selects a rail by finding the highest-priority rule whose currency matches
/// the transaction currency. Rules are evaluated at engine construction time
/// and never change at runtime.
pub struct StaticRoutingEngine {
    /// Rules sorted descending by priority at construction — first match wins.
    rules: Vec<RoutingRule>,
}

impl StaticRoutingEngine {
    pub fn new(mut rules: Vec<RoutingRule>) -> Self {
        rules.sort_by(|a, b| b.priority.cmp(&a.priority));
        Self { rules }
    }

    /// Returns the default Angola ruleset:
    ///   AOA → MulticaixaExpress (100) → EMIS (80) → BankTransfer (60)
    ///   USD → Visa (100) → Mastercard (90)
    ///   EUR → Mastercard (100) → Visa (90)
    pub fn angola_defaults() -> Self {
        Self::new(vec![
            RoutingRule { currency: Currency::AOA, rail: PaymentRail::MulticaixaExpress, priority: 100 },
            RoutingRule { currency: Currency::AOA, rail: PaymentRail::Emis,              priority:  80 },
            RoutingRule { currency: Currency::AOA, rail: PaymentRail::BankTransfer,      priority:  60 },
            RoutingRule { currency: Currency::USD, rail: PaymentRail::Visa,              priority: 100 },
            RoutingRule { currency: Currency::USD, rail: PaymentRail::Mastercard,        priority:  90 },
            RoutingRule { currency: Currency::EUR, rail: PaymentRail::Mastercard,        priority: 100 },
            RoutingRule { currency: Currency::EUR, rail: PaymentRail::Visa,              priority:  90 },
        ])
    }
}

impl RoutingEngine for StaticRoutingEngine {
    async fn route(&self, req: RouteRequest) -> Result<RoutingDecision, RoutingError> {
        let currency = req.amount.currency;
        let mut considered = Vec::new();

        for rule in &self.rules {
            if rule.currency == currency {
                tracing::debug!(
                    tx_id    = %req.transaction_id,
                    rail     = rule.rail.as_str(),
                    priority = rule.priority,
                    "selected rail"
                );
                return Ok(RoutingDecision {
                    transaction_id: req.transaction_id,
                    selected_rail:  rule.rail,
                    expected_fee:   Money::zero(currency),
                    currency,
                    considered,
                });
            }
            considered.push((rule.rail, format!("currency mismatch: expected {}, got {}", rule.currency, currency)));
        }

        Err(RoutingError::NoEligibleRail { currency, amount: req.amount })
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use banzami_types::{Currency, MerchantId, Money, TransactionId};

    use super::*;
    use crate::PaymentRail;

    fn kz(minor: i64) -> Money { Money::new(minor, Currency::AOA) }
    fn usd(minor: i64) -> Money { Money::new(minor, Currency::USD) }
    fn eur(minor: i64) -> Money { Money::new(minor, Currency::EUR) }

    fn req(amount: Money) -> RouteRequest {
        RouteRequest {
            transaction_id: TransactionId::new(),
            merchant_id:    MerchantId::new(),
            amount,
        }
    }

    #[tokio::test]
    async fn aoa_routes_to_multicaixa() {
        let engine = StaticRoutingEngine::angola_defaults();
        let decision = engine.route(req(kz(50_000))).await.unwrap();
        assert_eq!(decision.selected_rail, PaymentRail::MulticaixaExpress);
        assert_eq!(decision.currency, Currency::AOA);
    }

    #[tokio::test]
    async fn usd_routes_to_visa() {
        let engine = StaticRoutingEngine::angola_defaults();
        let decision = engine.route(req(usd(100_00))).await.unwrap();
        assert_eq!(decision.selected_rail, PaymentRail::Visa);
    }

    #[tokio::test]
    async fn eur_routes_to_mastercard() {
        let engine = StaticRoutingEngine::angola_defaults();
        let decision = engine.route(req(eur(200_00))).await.unwrap();
        assert_eq!(decision.selected_rail, PaymentRail::Mastercard);
    }

    #[tokio::test]
    async fn highest_priority_rule_wins() {
        let engine = StaticRoutingEngine::new(vec![
            RoutingRule { currency: Currency::AOA, rail: PaymentRail::BankTransfer,      priority: 50 },
            RoutingRule { currency: Currency::AOA, rail: PaymentRail::MulticaixaExpress, priority: 90 },
            RoutingRule { currency: Currency::AOA, rail: PaymentRail::Emis,              priority: 70 },
        ]);
        let decision = engine.route(req(kz(10_000))).await.unwrap();
        assert_eq!(decision.selected_rail, PaymentRail::MulticaixaExpress);
    }

    #[tokio::test]
    async fn unknown_currency_returns_no_eligible_rail() {
        let engine = StaticRoutingEngine::new(vec![
            RoutingRule { currency: Currency::AOA, rail: PaymentRail::MulticaixaExpress, priority: 100 },
        ]);
        // USD has no rule → error
        let result = engine.route(req(usd(50_00))).await;
        assert!(matches!(result, Err(RoutingError::NoEligibleRail { .. })));
    }

    #[tokio::test]
    async fn empty_ruleset_returns_no_eligible_rail() {
        let engine = StaticRoutingEngine::new(vec![]);
        let result = engine.route(req(kz(1_000))).await;
        assert!(matches!(result, Err(RoutingError::NoEligibleRail { .. })));
    }
}
