mod engine;

pub use engine::{RouteRequest, RoutingEngine, RoutingRule, StaticRoutingEngine};

use thiserror::Error;

use banzami_types::{Currency, Money, TransactionId};

/// A payment rail or acquirer that can process transactions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PaymentRail {
    /// Multicaixa Express — national Angolan scheme
    MulticaixaExpress,
    /// EMIS — Angolan interbank payment system operator
    Emis,
    /// VISA international network
    Visa,
    /// Mastercard international network
    Mastercard,
    /// Direct bank transfer via BNA rails
    BankTransfer,
}

impl PaymentRail {
    pub const fn as_str(self) -> &'static str {
        match self {
            PaymentRail::MulticaixaExpress => "MULTICAIXA_EXPRESS",
            PaymentRail::Emis             => "EMIS",
            PaymentRail::Visa             => "VISA",
            PaymentRail::Mastercard       => "MASTERCARD",
            PaymentRail::BankTransfer     => "BANK_TRANSFER",
        }
    }
}

/// The outcome of a routing decision for a single transaction attempt.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct RoutingDecision {
    pub transaction_id: TransactionId,
    pub selected_rail:  PaymentRail,
    /// Expected processing fee for the chosen rail (zero until fee engine is wired).
    pub expected_fee:   Money,
    pub currency:       Currency,
    /// Rails evaluated but not selected, with the reason for exclusion.
    pub considered:     Vec<(PaymentRail, String)>,
}

#[derive(Debug, Error)]
pub enum RoutingError {
    #[error("no eligible rail for {currency} amount {amount}")]
    NoEligibleRail { currency: Currency, amount: Money },

    #[error("all eligible rails are currently degraded")]
    AllRailsDegraded,
}
