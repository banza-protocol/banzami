//! Application Settlement engine (Banzami ADR-021 / BANZA ADR-039).
//!
//! `create` resolves the application fee (via the Pricing Engine) and records a
//! `CREATED` settlement; `complete` checks source funds and writes the balanced
//! ledger postings. All money math is integer minor units; the ledger stays
//! append-only and every posting nets to zero.

use std::sync::Arc;

use chrono::Utc;

use banzami_ledger::{LedgerEngine, PostingBuilder};
use banzami_pricing::{
    BusinessCategory, FeePolicyRef, PricingContext, PricingProfile, PricingRuleProvider,
};
use banzami_types::{ApplicationSettlementId, Money};

use crate::domain::{
    ApplicationSettlement, ApplicationSettlementStatus, CreateApplicationSettlementRequest,
};
use crate::repository::ApplicationSettlementRepository;
use crate::ApplicationSettlementError;

#[allow(async_fn_in_trait)]
pub trait ApplicationSettlementEngine: Send + Sync {
    /// Create a `CREATED` settlement: resolve the application fee, compute the
    /// net, persist with an immutable pricing snapshot. Idempotent on
    /// `idempotency_key`. No ledger movement yet.
    async fn create(
        &self,
        req: CreateApplicationSettlementRequest,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError>;

    /// CREATED|PENDING -> PENDING (optional explicit submit).
    async fn submit(
        &self,
        id: ApplicationSettlementId,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError>;

    /// Settle: check source funds, post the balanced ledger entries, mark
    /// COMPLETED. Idempotent — a completed settlement is returned unchanged.
    async fn complete(
        &self,
        id: ApplicationSettlementId,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError>;

    /// CREATED|PENDING -> CANCELLED (no ledger movement).
    async fn cancel(
        &self,
        id: ApplicationSettlementId,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError>;

    /// CREATED|PENDING -> FAILED (no ledger movement).
    async fn fail(
        &self,
        id: ApplicationSettlementId,
        reason: String,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError>;

    async fn get(
        &self,
        id: ApplicationSettlementId,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError>;

    async fn list_by_owner(
        &self,
        owner_ref: &str,
        environment: &str,
        limit: i64,
    ) -> Result<Vec<ApplicationSettlement>, ApplicationSettlementError>;

    /// Read-only filtered listing for the operator audit surface.
    async fn list_filtered(
        &self,
        filter: &crate::repository::ApplicationSettlementFilter,
    ) -> Result<Vec<ApplicationSettlement>, ApplicationSettlementError>;
}

pub struct PostgresApplicationSettlementEngine<L, P, R>
where
    L: LedgerEngine,
    P: PricingRuleProvider,
    R: ApplicationSettlementRepository,
{
    ledger: Arc<L>,
    pricing: Arc<P>,
    repo: R,
    environment: String,
}

impl<L, P, R> PostgresApplicationSettlementEngine<L, P, R>
where
    L: LedgerEngine,
    P: PricingRuleProvider,
    R: ApplicationSettlementRepository,
{
    pub fn new(ledger: Arc<L>, pricing: Arc<P>, repo: R, environment: impl Into<String>) -> Self {
        Self {
            ledger,
            pricing,
            repo,
            environment: environment.into(),
        }
    }

    fn guard_transition(
        &self,
        s: &ApplicationSettlement,
        to: ApplicationSettlementStatus,
    ) -> Result<(), ApplicationSettlementError> {
        if s.status.can_transition_to(to) {
            Ok(())
        } else {
            Err(ApplicationSettlementError::InvalidStatus {
                from: s.status.as_str().into(),
                to: to.as_str().into(),
            })
        }
    }
}

impl<L, P, R> ApplicationSettlementEngine for PostgresApplicationSettlementEngine<L, P, R>
where
    L: LedgerEngine,
    P: PricingRuleProvider,
    R: ApplicationSettlementRepository,
{
    async fn create(
        &self,
        req: CreateApplicationSettlementRequest,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError> {
        if let Some(existing) = self
            .repo
            .get_by_idempotency_key(&req.idempotency_key)
            .await?
        {
            return Ok(existing);
        }
        if !req.gross_amount.is_positive() {
            return Err(ApplicationSettlementError::InvalidAmount);
        }
        let currency = req.gross_amount.currency;

        // --- Resolve the APPLICATION fee ------------------------------------
        // ADR-029: two mutually-exclusive paths.
        let gross_minor = req.gross_amount.amount_minor();
        let (fee_minor, snapshot_json, pricing_rule_id, pricing_rule_version, engine_version) =
            if let Some(bps) = req.application_fee_bps {
                // APP-DEFINED: the app supplies the rate; the operator validates the
                // bound and computes the amount. The Pricing Engine is NOT consulted
                // and pricing references are ignored (the rate is the app's policy).
                if bps > crate::domain::MAX_APPLICATION_FEE_BPS {
                    return Err(ApplicationSettlementError::FeeBpsOutOfBounds {
                        bps,
                        max: crate::domain::MAX_APPLICATION_FEE_BPS,
                    });
                }
                // floor(gross * bps / 10_000) in i128 to avoid overflow.
                let fee = ((gross_minor as i128 * bps as i128) / 10_000) as i64;
                let snapshot = serde_json::json!({
                    "source": "APP_DEFINED",
                    "application_fee_bps": bps,
                    "gross_minor": gross_minor,
                    "fee_minor": fee,
                });
                (fee, snapshot, None, None, 0_i32)
            } else {
                // OPERATOR-PRICED: the percentage lives only in pricing_rules;
                // nothing is hard-coded. Unpriced => 0.
                let rules = self
                    .pricing
                    .load_rules(&self.environment)
                    .await
                    .map_err(|e| ApplicationSettlementError::Pricing(e.to_string()))?;
                let ctx = PricingContext {
                    amount_minor: gross_minor,
                    currency,
                    business_category: req
                        .business_category
                        .as_deref()
                        .map(BusinessCategory::from_code)
                        .unwrap_or_else(|| BusinessCategory::Other(String::new())),
                    pricing_profile: req
                        .pricing_profile
                        .as_deref()
                        .map(PricingProfile::from_code),
                    fee_policy_ref: req.fee_policy_ref.clone().map(FeePolicyRef::new),
                    country: None,
                    transaction_type: None,
                    as_of: Utc::now(),
                };
                let resolution = banzami_pricing::resolve(&rules, &ctx);

                // Same refusal as capture, for the same reason. `resolve` reports
                // a fee of 0 with no rule id when nothing matched, which in a
                // ledger is indistinguishable from an operator policy of zero —
                // and one of those is a decision while the other is nobody
                // having made one. An explicit 0-bps rule settles at zero; an
                // absent decision does not settle.
                if resolution.snapshot.rule_id.is_none() {
                    return Err(ApplicationSettlementError::PricingNotConfigured);
                }
                let snapshot = serde_json::to_value(&resolution.snapshot).map_err(|e| {
                    ApplicationSettlementError::Pricing(format!("snapshot serialize: {e}"))
                })?;
                (
                    resolution.fee_minor,
                    snapshot,
                    resolution.snapshot.rule_id,
                    resolution.snapshot.rule_version,
                    resolution.snapshot.engine_version as i32,
                )
            };

        if fee_minor > gross_minor {
            return Err(ApplicationSettlementError::FeeExceedsGross {
                fee: fee_minor,
                gross: gross_minor,
            });
        }
        if fee_minor > 0 && req.application_fee_account_id.is_none() {
            return Err(ApplicationSettlementError::MissingFeeAccount { fee: fee_minor });
        }
        let application_fee = Money::new(fee_minor, currency);
        let net_amount = req.gross_amount.checked_sub(application_fee)?; // >= 0

        let now = Utc::now();
        let settlement = ApplicationSettlement {
            id: ApplicationSettlementId::new(),
            owner_ref: req.owner_ref,
            application_id: req.application_id,
            source_account_id: req.source_account_id,
            beneficiary_account_id: req.beneficiary_account_id,
            application_fee_account_id: req.application_fee_account_id,
            gross_amount: req.gross_amount,
            application_fee,
            net_amount,
            currency,
            business_category: req.business_category,
            pricing_profile: req.pricing_profile,
            fee_policy_ref: req.fee_policy_ref,
            pricing_rule_id,
            pricing_rule_version,
            engine_version,
            pricing_snapshot_json: snapshot_json,
            status: ApplicationSettlementStatus::Created,
            settlement_posting_id: None,
            fee_posting_id: None,
            environment: self.environment.clone(),
            idempotency_key: req.idempotency_key,
            metadata: req.metadata.unwrap_or_else(|| serde_json::json!({})),
            created_at: now,
            completed_at: None,
            cancelled_at: None,
            failed_at: None,
            failure_reason: None,
        };
        let stored = self.repo.insert(settlement).await?;
        tracing::info!(
            event = "application.settlement.created",
            settlement_id = %stored.id,
            owner_ref = %stored.owner_ref,
            gross_minor = stored.gross_amount.amount_minor(),
            fee_minor = stored.application_fee.amount_minor(),
            net_minor = stored.net_amount.amount_minor(),
            currency = %stored.currency,
            "application settlement created"
        );
        Ok(stored)
    }

    async fn submit(
        &self,
        id: ApplicationSettlementId,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError> {
        let s = self.repo.get(id).await?;
        if s.status == ApplicationSettlementStatus::Pending {
            return Ok(s);
        }
        self.guard_transition(&s, ApplicationSettlementStatus::Pending)?;
        self.repo
            .update_status(
                id,
                ApplicationSettlementStatus::Pending,
                None,
                None,
                None,
                None,
            )
            .await
    }

    async fn complete(
        &self,
        id: ApplicationSettlementId,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError> {
        let s = self.repo.get(id).await?;
        // Idempotent: a completed settlement is immutable and returned as-is.
        if s.status == ApplicationSettlementStatus::Completed {
            return Ok(s);
        }
        self.guard_transition(&s, ApplicationSettlementStatus::Completed)?;

        // Source funds: a wallet available account is a LIABILITY (Banzami owes),
        // so the merchant-facing available is the negated ledger balance.
        let available = self.ledger.balance(s.source_account_id).await?.negate();
        if available.amount_minor() < s.gross_amount.amount_minor() {
            return Err(ApplicationSettlementError::InsufficientFunds {
                available: available.amount_minor(),
                required: s.gross_amount.amount_minor(),
            });
        }

        // Posting 1 — net to the beneficiary (skipped if net == 0).
        let mut settlement_posting_id = None;
        if s.net_amount.is_positive() {
            let posting = PostingBuilder::new(
                format!("App settlement {} net to beneficiary", s.id),
                format!("{}:settle", s.idempotency_key),
            )
            .debit(s.source_account_id, s.net_amount) // LIABILITY ↓ source obligation
            .credit(s.beneficiary_account_id, s.net_amount) // LIABILITY ↑ beneficiary obligation
            .build()
            .map_err(|e| ApplicationSettlementError::Pricing(e.to_string()))?;
            let posted = self.ledger.post(posting).await?;
            settlement_posting_id = Some(posted.id);
        }

        // Posting 2 — application fee to the app's account (skipped if fee == 0).
        let mut fee_posting_id = None;
        if s.application_fee.is_positive() {
            let fee_account = s.application_fee_account_id.ok_or(
                ApplicationSettlementError::MissingFeeAccount {
                    fee: s.application_fee.amount_minor(),
                },
            )?;
            let posting = PostingBuilder::new(
                format!("App settlement {} application fee", s.id),
                format!("{}:fee", s.idempotency_key),
            )
            .debit(s.source_account_id, s.application_fee)
            .credit(fee_account, s.application_fee)
            .build()
            .map_err(|e| ApplicationSettlementError::Pricing(e.to_string()))?;
            let posted = self.ledger.post(posting).await?;
            fee_posting_id = Some(posted.id);
        }

        let now = Utc::now();
        let completed = self
            .repo
            .update_status(
                id,
                ApplicationSettlementStatus::Completed,
                Some(now),
                None,
                settlement_posting_id,
                fee_posting_id,
            )
            .await?;
        tracing::info!(
            event = "application.settlement.completed",
            settlement_id = %completed.id,
            owner_ref = %completed.owner_ref,
            net_minor = completed.net_amount.amount_minor(),
            fee_minor = completed.application_fee.amount_minor(),
            currency = %completed.currency,
            "application settlement completed"
        );
        Ok(completed)
    }

    async fn cancel(
        &self,
        id: ApplicationSettlementId,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError> {
        let s = self.repo.get(id).await?;
        if s.status == ApplicationSettlementStatus::Cancelled {
            return Ok(s);
        }
        self.guard_transition(&s, ApplicationSettlementStatus::Cancelled)?;
        let now = Utc::now();
        let cancelled = self
            .repo
            .update_status(
                id,
                ApplicationSettlementStatus::Cancelled,
                None,
                Some(now),
                None,
                None,
            )
            .await?;
        tracing::info!(
            event = "application.settlement.cancelled",
            settlement_id = %cancelled.id,
            owner_ref = %cancelled.owner_ref,
            "application settlement cancelled"
        );
        Ok(cancelled)
    }

    async fn fail(
        &self,
        id: ApplicationSettlementId,
        reason: String,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError> {
        let s = self.repo.get(id).await?;
        self.guard_transition(&s, ApplicationSettlementStatus::Failed)?;
        let now = Utc::now();
        let failed = self.repo.fail(id, now, &reason).await?;
        tracing::info!(
            event = "application.settlement.failed",
            settlement_id = %failed.id,
            owner_ref = %failed.owner_ref,
            "application settlement failed"
        );
        Ok(failed)
    }

    async fn get(
        &self,
        id: ApplicationSettlementId,
    ) -> Result<ApplicationSettlement, ApplicationSettlementError> {
        self.repo.get(id).await
    }

    async fn list_by_owner(
        &self,
        owner_ref: &str,
        environment: &str,
        limit: i64,
    ) -> Result<Vec<ApplicationSettlement>, ApplicationSettlementError> {
        self.repo.list_by_owner(owner_ref, environment, limit).await
    }

    async fn list_filtered(
        &self,
        filter: &crate::repository::ApplicationSettlementFilter,
    ) -> Result<Vec<ApplicationSettlement>, ApplicationSettlementError> {
        self.repo.list_filtered(filter).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_machine_is_forward_only_and_terminal_states_lock() {
        use ApplicationSettlementStatus::*;
        assert!(Created.can_transition_to(Pending));
        assert!(Created.can_transition_to(Completed));
        assert!(Created.can_transition_to(Cancelled));
        assert!(Pending.can_transition_to(Completed));
        // terminal states never transition
        assert!(!Completed.can_transition_to(Cancelled));
        assert!(!Completed.can_transition_to(Failed));
        assert!(!Cancelled.can_transition_to(Completed));
        assert!(!Failed.can_transition_to(Completed));
        assert!(Completed.is_terminal());
        assert!(!Created.is_terminal());
    }
}
