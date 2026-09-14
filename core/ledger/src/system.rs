//! The economic roles of Banzami's system accounts (MONEY-MODEL-001, ADR-063).
//!
//! A participant balance is a LIABILITY account: an obligation of Banzami to its
//! owner. The accounts below are the other side of those obligations — the
//! external positions that back them, the value on its way in or out, and what
//! Banzami has earned for itself. Each carries an explicit `system_role` in
//! `ledger_accounts` (migration 0147), constrained to the one account type the
//! role can have; participant accounts are classified by their owner in the
//! `ledger_account_economic_classes` view.

use banzami_types::{AccountId, Currency};
use sqlx::PgPool;
use uuid::Uuid;

/// The role a system account plays in the money model.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SystemRole {
    /// A bank or approved custodian position that backs participant obligations.
    ExternalBacking,
    /// Value confirmed at an acquirer or provider, not yet settled to backing.
    ExternalTransit,
    /// Obligations reserved for a withdrawal that no rail has confirmed yet.
    WithdrawalsInFlight,
    /// Fees Banzami has earned — Banzami's own position, never a customer's.
    OperatorRevenue,
    /// What an acquirer or provider kept from value it settled — Banzami's cost.
    ExternalCosts,
}

impl SystemRole {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ExternalBacking => "EXTERNAL_BACKING",
            Self::ExternalTransit => "EXTERNAL_TRANSIT",
            Self::WithdrawalsInFlight => "WITHDRAWALS_IN_FLIGHT",
            Self::OperatorRevenue => "OPERATOR_REVENUE",
            Self::ExternalCosts => "EXTERNAL_COSTS",
        }
    }
}

/// The AOA account a withdrawal's obligation waits in between PROCESSING and a
/// rail's confirmation. Created by migration 0147 with this id, so it exists in
/// every database the migrations ran on and no configuration can move it.
pub const WITHDRAWALS_IN_FLIGHT_AOA: Uuid = Uuid::from_u128(0x0a11f170_0000_4000_8000_00000000a0a0);

/// The in-flight account for a currency. Only AOA exists: a withdrawal in any
/// other currency has no account to wait in and is refused before it moves.
pub fn withdrawals_in_flight(currency: Currency) -> Option<AccountId> {
    match currency {
        Currency::AOA => Some(AccountId::from_uuid(WITHDRAWALS_IN_FLIGHT_AOA)),
        _ => None,
    }
}

/// The AOA expense account for what an acquirer keeps when it settles a batch.
/// Created by migration 0147 with this id.
pub const ACQUIRER_FEES_AOA: Uuid = Uuid::from_u128(0x0a11f170_0000_4000_8000_00000000a0a1);

/// The acquirer-fee expense account for a currency, if one exists.
pub fn acquirer_fees(currency: Currency) -> Option<AccountId> {
    match currency {
        Currency::AOA => Some(AccountId::from_uuid(ACQUIRER_FEES_AOA)),
        _ => None,
    }
}

/// Record the role of a system account Core is configured with, and whether it
/// is synthetic (the Public Sandbox, where no bank or provider stands behind it).
///
/// Idempotent. A role already recorded is never replaced: if the configured id
/// points at an account with a different role, or at an account of a type the
/// role cannot have, this fails — Core must not boot with its backing and its
/// revenue swapped.
pub async fn register_system_account(
    pool: &PgPool,
    id: AccountId,
    role: SystemRole,
    synthetic: bool,
) -> Result<(), sqlx::Error> {
    let updated = sqlx::query(
        "UPDATE ledger_accounts
            SET system_role = $2, synthetic = $3
          WHERE id = $1 AND (system_role IS NULL OR system_role = $2)",
    )
    .bind(id.as_uuid())
    .bind(role.as_str())
    .bind(synthetic)
    .execute(pool)
    .await?
    .rows_affected();
    if updated == 1 {
        Ok(())
    } else {
        Err(sqlx::Error::Protocol(format!(
            "system account {id} cannot take role {}: it does not exist or already has another role",
            role.as_str()
        )))
    }
}
