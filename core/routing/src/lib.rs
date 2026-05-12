use thiserror::Error;

use banzami_types::{Currency, Money, TransactionId};

/// A payment rail or acquirer that can process transactions.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PaymentRail {
    /// Multicaixa Express (national Angolan scheme)
    MulticaixaExpress,
    /// VISA international network
    Visa,
    /// Mastercard international network
    Mastercard,
    /// Direct bank transfer (TPA / BNA rails)
    BankTransfer,
}

/// The outcome of a routing decision for a given transaction.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct RoutingDecision {
    pub transaction_id: TransactionId,
    pub selected_rail: PaymentRail,
    /// Expected processing fee for the chosen rail.
    pub expected_fee: Money,
    pub currency: Currency,
    /// Rails considered and rejected, with reasons.
    pub considered: Vec<(PaymentRail, String)>,
}

#[derive(Debug, Error)]
pub enum RoutingError {
    #[error("no eligible rail for currency {0} and amount {1}")]
    NoEligibleRail(Currency, Money),

    #[error("all eligible rails are degraded")]
    AllRailsDegraded,
}
