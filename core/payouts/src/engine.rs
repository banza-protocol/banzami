use std::sync::Arc;

use chrono::Utc;

use banzami_ledger::{LedgerEngine, PostingBuilder};
use banzami_pricing::{BusinessCategory, PricingContext, PricingRuleProvider};
use banzami_types::{AccountId, MerchantId, Money, PayoutId};
use banzami_wallets::WalletRepository;

use crate::{
    repository::PayoutRepository, CreatePayoutRequest, Payout, PayoutError, PayoutStatus,
    WithdrawalPricing,
};

/// The operator transaction-type this engine prices against (Banzami ADR-031).
const WITHDRAWAL_TX_TYPE: &str = "wallet_withdrawal";

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait PayoutEngine: Send + Sync {
    /// Create a payout record (Pending). Validates balance; does NOT post the ledger yet.
    async fn initiate(&self, req: CreatePayoutRequest) -> Result<Payout, PayoutError>;

    /// Pending → Processing: post ledger entry (DR available / CR bank).
    async fn process(&self, id: PayoutId) -> Result<Payout, PayoutError>;

    /// Processing → Sent: record bank submission.
    async fn mark_sent(&self, id: PayoutId) -> Result<Payout, PayoutError>;

    /// Sent → Confirmed: bank confirmed receipt (no ledger change — already balanced).
    async fn confirm(&self, id: PayoutId) -> Result<Payout, PayoutError>;

    /// Any non-terminal → Failed. Reverses ledger if posting_id exists.
    async fn fail(&self, id: PayoutId, reason: String) -> Result<Payout, PayoutError>;

    /// Sent → Returned: bank returned funds. Reverses ledger.
    async fn mark_returned(&self, id: PayoutId) -> Result<Payout, PayoutError>;

    async fn get(&self, id: PayoutId) -> Result<Payout, PayoutError>;
    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
        limit: i64,
    ) -> Result<Vec<Payout>, PayoutError>;
    async fn list_all(
        &self,
        limit: i64,
        status: Option<String>,
    ) -> Result<Vec<Payout>, PayoutError>;
}

// ---------------------------------------------------------------------------
// Production implementation
// ---------------------------------------------------------------------------

pub struct PostgresPayoutEngine<
    WR: WalletRepository,
    L: LedgerEngine,
    R: PayoutRepository,
    P: PricingRuleProvider,
> {
    wallet_repo: WR,
    ledger: Arc<L>,
    repo: R,
    /// System ASSET account representing our bank balance. Credited at process,
    /// debited on reversal.
    bank_account_id: AccountId,
    /// Operator Pricing Engine (ADR-021/031) — the ONLY place the withdrawal fee
    /// is resolved. Never hard-codes a percentage.
    pricing: Arc<P>,
    /// Internal REVENUE account the withdrawal fee is credited to.
    operator_fee_account_id: AccountId,
    /// Environment (LIVE/SANDBOX) — scopes rule loading.
    environment: String,
}

impl<WR: WalletRepository, L: LedgerEngine, R: PayoutRepository, P: PricingRuleProvider>
    PostgresPayoutEngine<WR, L, R, P>
{
    pub fn new(
        wallet_repo: WR,
        ledger: Arc<L>,
        repo: R,
        bank_account_id: AccountId,
        pricing: Arc<P>,
        operator_fee_account_id: AccountId,
        environment: impl Into<String>,
    ) -> Self {
        Self {
            wallet_repo,
            ledger,
            repo,
            bank_account_id,
            pricing,
            operator_fee_account_id,
            environment: environment.into(),
        }
    }

    /// Resolve the operator withdrawal fee, and return the decision — not just
    /// the number.
    ///
    /// The decision is returned so it can be PERSISTED. `payouts` used to record
    /// `amount_minor` and nothing else, so reconstructing why a withdrawal cost
    /// what it did meant joining to `ledger_postings` on a derived idempotency
    /// key. That is how the RA-063 incident was eventually explained, and it is
    /// not a reasonable way to answer "which rule priced this".
    ///
    /// **Missing still resolves to zero, deliberately.** The doc here used to
    /// call that "fail-safe", which described who it was safe for: the failure
    /// mode is silent operator revenue loss. It stays until the completeness
    /// gate proves on the deployed Sandbox that every eligible payout has
    /// exactly one explicit rule — refusing before that would turn a revenue
    /// leak into a customer-facing outage. The refusal is written and unraised;
    /// see `PayoutError::PricingNotConfigured`.
    ///
    /// Ambiguity, however, refuses NOW. There is no cutover risk in refusing a
    /// configuration that should not exist and that the database's unique index
    /// prevents from being created.
    async fn resolve_withdrawal_fee(
        &self,
        gross: Money,
        merchant_id: banzami_types::MerchantId,
    ) -> Result<WithdrawalPricing, PayoutError> {
        let rules = self
            .pricing
            .load_rules(&self.environment)
            .await
            .map_err(|e| PayoutError::Pricing(e.to_string()))?;
        let ctx = PricingContext {
            amount_minor: gross.amount_minor(),
            currency: gross.currency,
            business_category: BusinessCategory::Other(String::new()),
            // The merchant's assigned plan, read from its own record inside
            // Core. It used to be None, which was fine while one network-wide
            // rule priced every withdrawal; with per-profile PAYOUT rules a
            // profile-pinned rule cannot price an owner that names none.
            pricing_profile: self
                .repo
                .pricing_profile_for_merchant(merchant_id)
                .await?
                .map(|c| banzami_pricing::PricingProfile::from_code(&c)),
            fee_policy_ref: None,
            country: None,
            transaction_type: Some(WITHDRAWAL_TX_TYPE.to_string()),
            // Derived from the operation being executed, never from a caller.
            // There is no payout request field for it and there must not be:
            // choosing your own operation is choosing your own tariff.
            operation: Some(banzami_pricing::PricingOperation::Payout),
            as_of: Utc::now(),
        };
        let decided_at = ctx.as_of;
        let resolution = match banzami_pricing::resolve_for_operation(&rules, &ctx) {
            Ok(r) => r,
            Err(banzami_pricing::PricingFailure::Ambiguous { candidates }) => {
                return Err(PayoutError::PricingAmbiguous { candidates });
            }
            // The pre-cutover behaviour, and the last place in this operator
            // where an absent decision still costs nothing. Loudly logged so it
            // is visible while it lasts.
            Err(_) => {
                tracing::warn!(
                    environment = %self.environment,
                    gross_minor = gross.amount_minor(),
                    "withdrawal priced at ZERO because no rule applies — pre-cutover behaviour, see REPAIR_LOG RA-063"
                );
                return Ok(WithdrawalPricing {
                    fee_minor: 0,
                    rule_id: None,
                    rule_version: None,
                    rate_bps: None,
                    decided_at,
                });
            }
        };

        let fee = resolution.fee_minor;
        if fee > gross.amount_minor() {
            return Err(PayoutError::FeeExceedsGross {
                fee,
                gross: gross.amount_minor(),
            });
        }
        Ok(WithdrawalPricing {
            fee_minor: fee,
            rule_id: resolution.snapshot.rule_id,
            rule_version: resolution.snapshot.rule_version,
            rate_bps: Some(resolution.snapshot.rate_bps),
            decided_at,
        })
    }

    /// Compute merchant-facing available balance from the ledger.
    /// LIABILITY accounts have negative ledger balance; negate for merchant view.
    async fn available_balance(
        &self,
        available_account_id: banzami_types::AccountId,
    ) -> Result<banzami_types::Money, PayoutError> {
        Ok(self.ledger.balance(available_account_id).await?.negate())
    }

    /// Post the initiation, splitting the operator withdrawal fee out of the gross.
    /// The ledger is strictly one DR + one CR per posting (like `wallet.settle`),
    /// so the fee is its OWN paired posting, never a third leg (ADR-031):
    ///   Posting 1 (net): DR merchant_available (LIABILITY) net / CR bank (ASSET) net
    ///   Posting 2 (fee): DR merchant_available (LIABILITY) fee / CR operator_fee (REVENUE) fee
    /// Net effect: available −gross, bank +net, operator_fee +fee → gross = net + fee
    /// (`INV-STL-001`). The NET posting is returned + stored as the payout's
    /// `ledger_posting_id`; the fee posting has a derived `:fee` key (idempotent).
    async fn post_initiation(
        &self,
        payout: &Payout,
        available_account_id: banzami_types::AccountId,
    ) -> Result<banzami_ledger::LedgerPosting, PayoutError> {
        let gross = payout.amount;
        let pricing = self
            .resolve_withdrawal_fee(gross, payout.merchant_id)
            .await?;
        let fee_minor = pricing.fee_minor;

        // Persist the decision before the money moves, so a completed payout can
        // explain its own price without ledger archaeology. Written once — the
        // repository refuses to overwrite an existing decision, so a later rule
        // change cannot reach back and rewrite history.
        self.repo
            .record_pricing(payout.id, &pricing, gross.amount_minor() - fee_minor)
            .await?;
        let net = Money::new(gross.amount_minor() - fee_minor, gross.currency);

        // Posting 1 — net to bank. (net == gross when fee == 0.)
        let net_posting = PostingBuilder::new(
            format!("Payout {} — initiation (net)", payout.id),
            format!("{}:process", payout.idempotency_key),
        )
        .debit(available_account_id, net) // LIABILITY ↓ by net
        .credit(self.bank_account_id, net) // ASSET ↓ net leaves to bank
        .build()
        .map_err(|_| {
            PayoutError::Ledger(banzami_ledger::LedgerError::UnbalancedPosting {
                debits_minor: net.amount_minor(),
                credits_minor: net.amount_minor(),
                currency: gross.currency,
            })
        })?;
        let posted = self.ledger.post(net_posting).await?;

        // Posting 2 — operator fee (separate paired posting; idempotent :fee key).
        if fee_minor > 0 {
            let fee = Money::new(fee_minor, gross.currency);
            let fee_posting = PostingBuilder::new(
                format!("Payout {} — operator withdrawal fee", payout.id),
                format!("{}:process:fee", payout.idempotency_key),
            )
            .debit(available_account_id, fee) // LIABILITY ↓ by fee
            .credit(self.operator_fee_account_id, fee) // REVENUE ↑ operator fee
            .build()
            .map_err(|_| {
                PayoutError::Ledger(banzami_ledger::LedgerError::UnbalancedPosting {
                    debits_minor: fee_minor,
                    credits_minor: fee_minor,
                    currency: gross.currency,
                })
            })?;
            self.ledger.post(fee_posting).await?;
        }

        Ok(posted)
    }

    /// Reverse a processed payout — BOTH the net posting and (if any) the fee
    /// posting. The net posting is reversed exactly via `ledger.reverse`. The fee
    /// is derived from the actual posted amounts (fee = gross − net) — never
    /// re-resolved — so a rule change between process and reversal can never
    /// unbalance it, and nothing strands on the fee account. Idempotent on the
    /// reversal keys (a second call re-posts nothing).
    async fn post_reversal(&self, payout: &Payout, reason: &str) -> Result<(), PayoutError> {
        let Some(posting_id) = payout.ledger_posting_id else {
            return Ok(()); // never processed — nothing to reverse
        };
        let net_posting = self.ledger.get_posting(posting_id).await?;

        // Reverse the net posting exactly (flips DR available / CR bank).
        self.ledger
            .reverse(
                &net_posting,
                format!("Payout {} — {} reversal (net)", payout.id, reason),
                format!("{}:reverse:{}", payout.idempotency_key, reason),
            )
            .await?;

        // Derive the fee from what was actually posted: net = the credit leg of
        // the net posting; fee = gross − net. Reverse the fee posting if any.
        let net_minor: i64 = net_posting
            .entries
            .iter()
            .find(|e| e.entry_type == banzami_ledger::EntryType::Credit)
            .map(|e| e.amount.amount_minor())
            .unwrap_or(payout.amount.amount_minor());
        let available_account_id = net_posting
            .entries
            .iter()
            .find(|e| e.entry_type == banzami_ledger::EntryType::Debit)
            .map(|e| e.account_id);
        let fee_minor = payout.amount.amount_minor() - net_minor;

        if fee_minor > 0 {
            if let Some(available_account_id) = available_account_id {
                let fee = Money::new(fee_minor, payout.amount.currency);
                // Reverse of (DR available fee / CR operator_fee fee).
                let fee_reversal = PostingBuilder::new(
                    format!("Payout {} — {} reversal (fee)", payout.id, reason),
                    format!("{}:reverse:fee:{}", payout.idempotency_key, reason),
                )
                .debit(self.operator_fee_account_id, fee) // REVENUE ↓ give the fee back
                .credit(available_account_id, fee) // LIABILITY ↑ restore to merchant
                .build()
                .map_err(|_| {
                    PayoutError::Ledger(banzami_ledger::LedgerError::UnbalancedPosting {
                        debits_minor: fee_minor,
                        credits_minor: fee_minor,
                        currency: payout.amount.currency,
                    })
                })?;
                self.ledger.post(fee_reversal).await?;
            }
        }
        Ok(())
    }
}

impl<WR: WalletRepository, L: LedgerEngine, R: PayoutRepository, P: PricingRuleProvider>
    PayoutEngine for PostgresPayoutEngine<WR, L, R, P>
{
    async fn initiate(&self, req: CreatePayoutRequest) -> Result<Payout, PayoutError> {
        // A payout must move a positive amount — a zero/negative withdrawal is rejected.
        if req.amount.amount_minor() <= 0 {
            return Err(PayoutError::InvalidAmount);
        }
        // Idempotency: return existing payout if key already exists.
        if let Some(existing) = self
            .repo
            .get_by_idempotency_key(&req.idempotency_key)
            .await?
        {
            return Ok(existing);
        }

        let wallet = self
            .wallet_repo
            .get(req.wallet_id)
            .await
            .map_err(|e| PayoutError::Wallet(e.to_string()))?;

        // Authority (RA-056): the request NAMES a wallet — a resource selector,
        // not authority over it. Without this the engine read a foreign
        // merchant's balance and queued a withdrawal from it to the caller's own
        // bank account (confirmed on the deployed Sandbox: HTTP 201, attacker
        // merchant_id, victim wallet_id).
        //
        // It belongs here, not only at the API edge: the ledger must not be
        // reachable by a caller that has not proved ownership of the source of
        // funds. It runs BEFORE the balance check so the endpoint cannot be used
        // as a balance oracle for wallets the caller does not own.
        if wallet.merchant_id != req.merchant_id {
            return Err(PayoutError::WalletNotOwned {
                wallet_id: req.wallet_id,
                merchant_id: req.merchant_id,
            });
        }

        // Balance check — prevents overdrawing the merchant's available account.
        let available = self.available_balance(wallet.available_account_id).await?;
        if available.amount_minor() < req.amount.amount_minor() {
            return Err(PayoutError::InsufficientBalance {
                available,
                requested: req.amount,
            });
        }

        let payout = Payout {
            id: PayoutId::new(),
            merchant_id: req.merchant_id,
            wallet_id: req.wallet_id,
            idempotency_key: req.idempotency_key,
            status: PayoutStatus::Pending,
            amount: req.amount,
            destination: req.destination,
            ledger_posting_id: None,
            failure_reason: None,
            created_at: Utc::now(),
            sent_at: None,
            confirmed_at: None,
            returned_at: None,
            failed_at: None,
        };
        self.repo.create(&payout).await?;
        Ok(payout)
    }

    async fn process(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Processing) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to: PayoutStatus::Processing,
            });
        }

        let wallet = self
            .wallet_repo
            .get(payout.wallet_id)
            .await
            .map_err(|e| PayoutError::Wallet(e.to_string()))?;

        let posting = self
            .post_initiation(&payout, wallet.available_account_id)
            .await?;

        self.repo
            .update_status(id, PayoutStatus::Processing, Some(posting.id), None)
            .await
    }

    async fn mark_sent(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Sent) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to: PayoutStatus::Sent,
            });
        }
        self.repo
            .update_status(id, PayoutStatus::Sent, None, None)
            .await
    }

    async fn confirm(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Confirmed) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to: PayoutStatus::Confirmed,
            });
        }
        // Ledger is already balanced from process() — no additional entry needed.
        self.repo
            .update_status(id, PayoutStatus::Confirmed, None, None)
            .await
    }

    async fn fail(&self, id: PayoutId, reason: String) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Failed) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to: PayoutStatus::Failed,
            });
        }

        // Reverse the ledger posting if it was already made (i.e., we reached Processing/Sent).
        if payout.ledger_posting_id.is_some() {
            self.post_reversal(&payout, "fail").await?;
        }

        self.repo
            .update_status(id, PayoutStatus::Failed, None, Some(reason))
            .await
    }

    async fn mark_returned(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        let payout = self.repo.get(id).await?;
        if !payout.status.can_transition_to(PayoutStatus::Returned) {
            return Err(PayoutError::InvalidStatusTransition {
                from: payout.status,
                to: PayoutStatus::Returned,
            });
        }

        self.post_reversal(&payout, "return").await?;

        self.repo
            .update_status(id, PayoutStatus::Returned, None, None)
            .await
    }

    async fn get(&self, id: PayoutId) -> Result<Payout, PayoutError> {
        self.repo.get(id).await
    }

    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
        limit: i64,
    ) -> Result<Vec<Payout>, PayoutError> {
        self.repo.list_for_merchant(merchant_id, limit).await
    }

    async fn list_all(
        &self,
        limit: i64,
        status: Option<String>,
    ) -> Result<Vec<Payout>, PayoutError> {
        self.repo.list_all(limit, status.as_deref()).await
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use banzami_ledger::{
        Account, AccountType, EntryType, LedgerEngine, LedgerEntry, LedgerPosting,
    };
    use banzami_pricing::{PricingError, PricingRule, PricingRuleProvider, RoundingMode};
    use banzami_types::PricingRuleId;
    use banzami_types::{
        AccountId, Currency, LedgerEntryId, LedgerPostingId, MerchantId, Money, PayoutId, WalletId,
    };
    use banzami_wallets::{Wallet, WalletError, WalletRepository, WalletStatus};

    use super::*;
    use crate::{BankDestination, CreatePayoutRequest, PayoutError, PayoutStatus};

    // -----------------------------------------------------------------------
    // In-memory mocks
    // -----------------------------------------------------------------------

    struct MockLedger {
        accounts: Mutex<Vec<Account>>,
        entries: Mutex<Vec<LedgerEntry>>,
        postings: Mutex<Vec<LedgerPosting>>,
    }

    impl MockLedger {
        fn with_account(account: Account) -> Self {
            Self {
                accounts: Mutex::new(vec![account]),
                entries: Mutex::new(vec![]),
                postings: Mutex::new(vec![]),
            }
        }
    }

    impl LedgerEngine for MockLedger {
        async fn create_account(&self, a: Account) -> Result<Account, banzami_ledger::LedgerError> {
            self.accounts.lock().unwrap().push(a.clone());
            Ok(a)
        }
        async fn post(
            &self,
            p: LedgerPosting,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            // Enforce the real ledger's UNIQUE(posting_id, entry_type): exactly one
            // DEBIT and one CREDIT per posting (no third leg). Catches invalid
            // multi-leg postings in tests, exactly as Postgres would.
            let debits = p
                .entries
                .iter()
                .filter(|e| e.entry_type == EntryType::Debit)
                .count();
            let credits = p
                .entries
                .iter()
                .filter(|e| e.entry_type == EntryType::Credit)
                .count();
            if debits > 1 || credits > 1 {
                return Err(banzami_ledger::LedgerError::InsufficientEntries);
            }
            // Idempotent on idempotency_key, mirroring the real ledger: a replay
            // returns the existing posting and never double-applies entries.
            let mut postings = self.postings.lock().unwrap();
            if let Some(existing) = postings
                .iter()
                .find(|x| x.idempotency_key == p.idempotency_key)
                .cloned()
            {
                return Ok(existing);
            }
            self.entries.lock().unwrap().extend(p.entries.clone());
            postings.push(p.clone());
            Ok(p)
        }
        async fn reverse(
            &self,
            original: &LedgerPosting,
            description: impl Into<String> + Send,
            new_idempotency_key: impl Into<String> + Send,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            // Flip every leg (DEBIT↔CREDIT) and post — idempotent via `post`.
            let mut builder = PostingBuilder::new(description.into(), new_idempotency_key.into());
            for e in &original.entries {
                builder = match e.entry_type {
                    EntryType::Debit => builder.credit(e.account_id, e.amount),
                    EntryType::Credit => builder.debit(e.account_id, e.amount),
                };
            }
            let reversal = builder
                .build()
                .map_err(|_| banzami_ledger::LedgerError::InsufficientEntries)?;
            self.post(reversal).await
        }
        async fn get_posting(
            &self,
            posting_id: LedgerPostingId,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            self.postings
                .lock()
                .unwrap()
                .iter()
                .find(|p| p.id == posting_id)
                .cloned()
                .ok_or(banzami_ledger::LedgerError::PostingNotFound(posting_id))
        }
        async fn balance(
            &self,
            account_id: AccountId,
        ) -> Result<Money, banzami_ledger::LedgerError> {
            let accounts = self.accounts.lock().unwrap();
            let account = accounts
                .iter()
                .find(|a| a.id == account_id)
                .ok_or(banzami_ledger::LedgerError::AccountNotFound(account_id))?;
            let entries = self.entries.lock().unwrap();
            let net: i64 = entries
                .iter()
                .filter(|e| e.account_id == account_id)
                .map(|e| e.signed_minor_units())
                .sum();
            Ok(Money::new(net, account.currency))
        }
        async fn entries_for_account(
            &self,
            account_id: AccountId,
        ) -> Result<Vec<LedgerEntry>, banzami_ledger::LedgerError> {
            Ok(self
                .entries
                .lock()
                .unwrap()
                .iter()
                .filter(|e| e.account_id == account_id)
                .cloned()
                .collect())
        }
    }

    struct MockWalletRepo {
        wallet: Wallet,
    }

    impl WalletRepository for MockWalletRepo {
        async fn create(&self, w: Wallet) -> Result<Wallet, WalletError> {
            Ok(w)
        }
        async fn get(&self, id: WalletId) -> Result<Wallet, WalletError> {
            if id == self.wallet.id {
                Ok(self.wallet.clone())
            } else {
                Err(WalletError::NotFound(id))
            }
        }
        async fn get_for_merchant(
            &self,
            _: MerchantId,
            _: Currency,
        ) -> Result<Wallet, WalletError> {
            Ok(self.wallet.clone())
        }
    }

    struct MockPayoutRepo {
        payouts: Mutex<Vec<Payout>>,
    }

    impl MockPayoutRepo {
        fn new() -> Self {
            Self {
                payouts: Mutex::new(vec![]),
            }
        }
    }

    impl PayoutRepository for MockPayoutRepo {
        // The unit tests build their own rules, unpinned, so no profile is
        // needed to match them. The real-DB suite exercises the lookup.
        async fn pricing_profile_for_merchant(
            &self,
            _merchant_id: banzami_types::MerchantId,
        ) -> Result<Option<String>, PayoutError> {
            Ok(None)
        }

        // The unit tests here assert the resolver's arithmetic and the ledger
        // legs; persistence is exercised by the real-DB suite. Recording is a
        // no-op rather than a panic so a test that does not care about the
        // snapshot is not forced to model it.
        async fn record_pricing(
            &self,
            _id: PayoutId,
            _pricing: &crate::WithdrawalPricing,
            _net_minor: i64,
        ) -> Result<(), PayoutError> {
            Ok(())
        }

        async fn create(&self, p: &Payout) -> Result<(), PayoutError> {
            let mut lock = self.payouts.lock().unwrap();
            if lock.iter().any(|x| x.idempotency_key == p.idempotency_key) {
                return Err(PayoutError::DuplicateIdempotencyKey(
                    p.idempotency_key.clone(),
                ));
            }
            lock.push(p.clone());
            Ok(())
        }
        async fn get(&self, id: PayoutId) -> Result<Payout, PayoutError> {
            self.payouts
                .lock()
                .unwrap()
                .iter()
                .find(|p| p.id == id)
                .cloned()
                .ok_or(PayoutError::NotFound(id))
        }
        async fn get_by_idempotency_key(&self, key: &str) -> Result<Option<Payout>, PayoutError> {
            Ok(self
                .payouts
                .lock()
                .unwrap()
                .iter()
                .find(|p| p.idempotency_key == key)
                .cloned())
        }
        async fn list_for_merchant(
            &self,
            merchant_id: MerchantId,
            _: i64,
        ) -> Result<Vec<Payout>, PayoutError> {
            Ok(self
                .payouts
                .lock()
                .unwrap()
                .iter()
                .filter(|p| p.merchant_id == merchant_id)
                .cloned()
                .collect())
        }
        async fn list_all(
            &self,
            _limit: i64,
            _status: Option<&str>,
        ) -> Result<Vec<Payout>, PayoutError> {
            Ok(self.payouts.lock().unwrap().clone())
        }
        async fn update_status(
            &self,
            id: PayoutId,
            status: PayoutStatus,
            posting_id: Option<banzami_types::LedgerPostingId>,
            failure_reason: Option<String>,
        ) -> Result<Payout, PayoutError> {
            let mut lock = self.payouts.lock().unwrap();
            let p = lock
                .iter_mut()
                .find(|p| p.id == id)
                .ok_or(PayoutError::NotFound(id))?;
            p.status = status;
            if let Some(pid) = posting_id {
                p.ledger_posting_id = Some(pid);
            }
            if let Some(r) = failure_reason {
                p.failure_reason = Some(r);
            }
            match status {
                PayoutStatus::Sent => {
                    p.sent_at = Some(Utc::now());
                }
                PayoutStatus::Confirmed => {
                    p.confirmed_at = Some(Utc::now());
                }
                PayoutStatus::Returned => {
                    p.returned_at = Some(Utc::now());
                }
                PayoutStatus::Failed => {
                    p.failed_at = Some(Utc::now());
                }
                _ => {}
            }
            Ok(p.clone())
        }
    }

    // -----------------------------------------------------------------------
    // Mock pricing provider (ADR-031)
    // -----------------------------------------------------------------------

    struct MockPricing {
        rules: Vec<PricingRule>,
    }

    impl PricingRuleProvider for MockPricing {
        async fn load_rules(&self, _environment: &str) -> Result<Vec<PricingRule>, PricingError> {
            Ok(self.rules.clone())
        }
    }

    /// A PAYOUT rule at `bps`, FLOOR rounding (matches the documented
    /// `floor(gross*bps/10000)`), AOA, effective since 2020.
    ///
    /// It names its operation. Under the V2 resolver an operation-less rule is
    /// not a wildcard — it applies to nothing — which is the behaviour that
    /// stops a future fee-bearing operation inheriting today's rate.
    fn withdrawal_rule(bps: u32) -> PricingRule {
        PricingRule {
            id: PricingRuleId::new(),
            key: "wallet-withdrawal-standard".into(),
            version: 1,
            business_category: None,
            pricing_profile: None,
            fee_policy_ref: None,
            currency: Some(Currency::AOA),
            country: None,
            transaction_type: Some("wallet_withdrawal".into()),
            operation: Some(banzami_pricing::PricingOperation::Payout),
            rate_bps: bps,
            flat_minor: 0,
            min_fee_minor: None,
            max_fee_minor: None,
            rounding: RoundingMode::Floor,
            priority: 0,
            effective_from: chrono::DateTime::from_timestamp(1_600_000_000, 0).unwrap(),
            effective_to: None,
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    fn kz(minor: i64) -> Money {
        Money::new(minor, Currency::AOA)
    }

    type PayoutEngineT =
        PostgresPayoutEngine<MockWalletRepo, MockLedger, MockPayoutRepo, MockPricing>;

    /// The merchant that owns the mock wallet.
    ///
    /// Fixed rather than random because ownership is now part of the contract:
    /// before RA-056 every test passed an unrelated `MerchantId::new()` and still
    /// expected a payout, which is precisely the defect written down as an
    /// expectation. Tests must now say whose wallet they are spending.
    fn owner() -> MerchantId {
        MerchantId::from_uuid(uuid::Uuid::from_u128(
            0x0000_0000_0000_0000_0000_0000_0000_00A1,
        ))
    }

    /// A merchant that owns nothing here.
    fn stranger() -> MerchantId {
        MerchantId::from_uuid(uuid::Uuid::from_u128(
            0x0000_0000_0000_0000_0000_0000_0000_00B2,
        ))
    }

    /// No-fee engine (empty rule set) — preserves the pre-ADR-031 behaviour used
    /// by the lifecycle tests.
    fn make_engine(available_balance_minor: i64) -> (PayoutEngineT, WalletId, AccountId) {
        let (e, w, a, _bank, _opfee) = make_engine_with(available_balance_minor, vec![]);
        (e, w, a)
    }

    /// Full engine with a configurable pricing rule set. Returns the extra
    /// account ids (bank, operator-fee) so fee tests can assert on the ledger.
    fn make_engine_with(
        available_balance_minor: i64,
        rules: Vec<PricingRule>,
    ) -> (PayoutEngineT, WalletId, AccountId, AccountId, AccountId) {
        let avail_id = AccountId::new();
        let bank_id = AccountId::new();
        let opfee_id = AccountId::new();

        let avail_account = Account {
            id: avail_id,
            account_type: AccountType::Liability,
            name: "Available".into(),
            currency: Currency::AOA,
            created_at: Utc::now(),
        };
        let bank_account = Account {
            id: bank_id,
            account_type: AccountType::Asset,
            name: "Bank".into(),
            currency: Currency::AOA,
            created_at: Utc::now(),
        };
        let opfee_account = Account {
            id: opfee_id,
            account_type: AccountType::Revenue,
            name: "Operator — Fee Revenue".into(),
            currency: Currency::AOA,
            created_at: Utc::now(),
        };

        let ledger = MockLedger::with_account(avail_account);
        ledger.accounts.lock().unwrap().push(bank_account);
        ledger.accounts.lock().unwrap().push(opfee_account);

        // Simulate available balance: LIABILITY account with credit balance = negative net.
        // Credit on LIABILITY → signed_minor_units() = -amount → balance().negate() = +amount.
        ledger.entries.lock().unwrap().push(LedgerEntry {
            id: LedgerEntryId::new(),
            posting_id: LedgerPostingId::new(),
            account_id: avail_id,
            entry_type: EntryType::Credit,
            amount: Money::new(available_balance_minor, Currency::AOA),
            created_at: Utc::now(),
        });

        let wallet_id = WalletId::new();
        let wallet = Wallet {
            id: wallet_id,
            merchant_id: owner(),
            currency: Currency::AOA,
            status: WalletStatus::Active,
            available_account_id: avail_id,
            reserved_account_id: AccountId::new(),
            created_at: Utc::now(),
        };

        let engine = PostgresPayoutEngine::new(
            MockWalletRepo { wallet },
            Arc::new(ledger),
            MockPayoutRepo::new(),
            bank_id,
            Arc::new(MockPricing { rules }),
            opfee_id,
            "SANDBOX",
        );
        (engine, wallet_id, avail_id, bank_id, opfee_id)
    }

    fn dest() -> BankDestination {
        BankDestination {
            account_number: "123456789".into(),
            bank_code: "BAI".into(),
            account_holder_name: "Merchant SARL".into(),
        }
    }

    // -----------------------------------------------------------------------
    // Tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn initiate_creates_pending_payout() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let merchant_id = owner();
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-001".into(),
                merchant_id,
                wallet_id,
                amount: kz(50_000),
                destination: dest(),
            })
            .await
            .unwrap();
        assert_eq!(payout.status, PayoutStatus::Pending);
        assert!(payout.ledger_posting_id.is_none());
    }

    #[tokio::test]
    async fn process_posts_ledger_and_moves_to_processing() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-002".into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(60_000),
                destination: dest(),
            })
            .await
            .unwrap();

        let processed = engine.process(payout.id).await.unwrap();
        assert_eq!(processed.status, PayoutStatus::Processing);
        assert!(
            processed.ledger_posting_id.is_some(),
            "ledger must be posted at process time"
        );
    }

    #[tokio::test]
    async fn full_happy_path_pending_to_confirmed() {
        let (engine, wallet_id, _) = make_engine(200_000);
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-003".into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(80_000),
                destination: dest(),
            })
            .await
            .unwrap();

        engine.process(payout.id).await.unwrap();
        engine.mark_sent(payout.id).await.unwrap();
        let confirmed = engine.confirm(payout.id).await.unwrap();
        assert_eq!(confirmed.status, PayoutStatus::Confirmed);
        assert!(confirmed.confirmed_at.is_some());
    }

    #[tokio::test]
    async fn fail_from_pending_requires_no_reversal() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-004".into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(10_000),
                destination: dest(),
            })
            .await
            .unwrap();

        let failed = engine
            .fail(payout.id, "cancelled by operator".into())
            .await
            .unwrap();
        assert_eq!(failed.status, PayoutStatus::Failed);
        // No ledger posting was made, so no reversal — ledger entries should be just the initial balance.
    }

    #[tokio::test]
    async fn fail_from_processing_reverses_ledger() {
        let (engine, wallet_id, avail_id) = make_engine(100_000);
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-005".into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(40_000),
                destination: dest(),
            })
            .await
            .unwrap();

        engine.process(payout.id).await.unwrap();

        // After process: available should be 60_000 (100_000 - 40_000).
        let avail_after_process = engine.ledger.balance(avail_id).await.unwrap().negate();
        assert_eq!(avail_after_process.amount_minor(), 60_000);

        engine
            .fail(payout.id, "bank rejected".into())
            .await
            .unwrap();

        // After fail reversal: available should be back to 100_000.
        let avail_after_fail = engine.ledger.balance(avail_id).await.unwrap().negate();
        assert_eq!(
            avail_after_fail.amount_minor(),
            100_000,
            "ledger must be reversed on fail"
        );
    }

    #[tokio::test]
    async fn mark_returned_reverses_ledger() {
        let (engine, wallet_id, avail_id) = make_engine(100_000);
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-006".into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(30_000),
                destination: dest(),
            })
            .await
            .unwrap();

        engine.process(payout.id).await.unwrap();
        engine.mark_sent(payout.id).await.unwrap();
        engine.mark_returned(payout.id).await.unwrap();

        let avail = engine.ledger.balance(avail_id).await.unwrap().negate();
        assert_eq!(
            avail.amount_minor(),
            100_000,
            "returned funds must be credited back"
        );
    }

    #[tokio::test]
    async fn insufficient_balance_is_rejected() {
        let (engine, wallet_id, _) = make_engine(10_000);
        let result = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-007".into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(50_000), // more than the 10_000 available
                destination: dest(),
            })
            .await;
        assert!(matches!(
            result,
            Err(PayoutError::InsufficientBalance { .. })
        ));
    }

    #[tokio::test]
    async fn idempotency_returns_existing_payout() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let req1 = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-008".into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(5_000),
                destination: dest(),
            })
            .await
            .unwrap();

        let req2 = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-008".into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(5_000),
                destination: dest(),
            })
            .await
            .unwrap();

        assert_eq!(
            req1.id, req2.id,
            "same idempotency key must return same payout"
        );
    }

    #[tokio::test]
    async fn invalid_transition_is_rejected() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "pay-009".into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(1_000),
                destination: dest(),
            })
            .await
            .unwrap();

        // Cannot confirm directly from Pending — must go Pending → Processing → Sent → Confirmed.
        let result = engine.confirm(payout.id).await;
        assert!(matches!(
            result,
            Err(PayoutError::InvalidStatusTransition { .. })
        ));
    }

    // -----------------------------------------------------------------------
    // Withdrawal fee — ADR-031 (0,75%)
    // -----------------------------------------------------------------------

    /// Signed net of an account from the mock ledger (credits +, debits −).
    async fn net_of(engine: &PayoutEngineT, id: AccountId) -> i64 {
        engine
            .ledger
            .entries_for_account(id)
            .await
            .unwrap()
            .iter()
            .map(|e| match e.entry_type {
                EntryType::Credit => e.amount.amount_minor(),
                EntryType::Debit => -e.amount.amount_minor(),
            })
            .sum()
    }

    async fn init_process(
        engine: &PayoutEngineT,
        wallet_id: WalletId,
        key: &str,
        amount: i64,
    ) -> Payout {
        let p = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: key.into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(amount),
                destination: dest(),
            })
            .await
            .unwrap();
        engine.process(p.id).await.unwrap()
    }

    #[tokio::test]
    async fn payout_without_rule_is_free() {
        let (engine, wallet_id, avail_id, bank_id, opfee_id) = make_engine_with(200_000, vec![]);
        init_process(&engine, wallet_id, "w-free", 100_000).await;
        // No rule → fee 0: bank gets the full gross, operator fee untouched.
        assert_eq!(net_of(&engine, opfee_id).await, 0);
        assert_eq!(net_of(&engine, bank_id).await, 100_000); // ASSET credited full gross
        assert_eq!(net_of(&engine, avail_id).await, 100_000); // LIABILITY: 200k cr − 100k dr
    }

    #[tokio::test]
    async fn withdrawal_charges_075_percent() {
        let (engine, wallet_id, avail_id, bank_id, opfee_id) =
            make_engine_with(200_000, vec![withdrawal_rule(75)]);
        init_process(&engine, wallet_id, "w-fee", 100_000).await;
        // gross 100000 → fee 750 → net 99250
        assert_eq!(net_of(&engine, opfee_id).await, 750, "operator fee = 0,75%");
        assert_eq!(net_of(&engine, bank_id).await, 99_250, "bank receives net");
        // merchant available reduced by the full gross (200k − 100k)
        assert_eq!(net_of(&engine, avail_id).await, 100_000);
    }

    #[tokio::test]
    async fn ledger_balanced_gross_equals_net_plus_fee() {
        let (engine, wallet_id, _avail, bank_id, opfee_id) =
            make_engine_with(200_000, vec![withdrawal_rule(75)]);
        init_process(&engine, wallet_id, "w-bal", 100_000).await;
        // Balanced posting: DR available gross == CR bank net + CR operator_fee fee.
        assert_eq!(
            net_of(&engine, bank_id).await + net_of(&engine, opfee_id).await,
            100_000
        );
    }

    #[tokio::test]
    async fn failed_payout_reverses_gross_and_fee() {
        let (engine, wallet_id, avail_id, bank_id, opfee_id) =
            make_engine_with(200_000, vec![withdrawal_rule(75)]);
        let p = init_process(&engine, wallet_id, "w-fail", 100_000).await;
        engine.fail(p.id, "bank rejected".into()).await.unwrap();
        // Everything back to square one — nothing stranded on the fee account.
        assert_eq!(net_of(&engine, opfee_id).await, 0, "fee reversed");
        assert_eq!(net_of(&engine, bank_id).await, 0, "bank reversed");
        assert_eq!(
            net_of(&engine, avail_id).await,
            200_000,
            "merchant restored"
        );
    }

    #[tokio::test]
    async fn returned_payout_reverses_gross_and_fee() {
        let (engine, wallet_id, avail_id, _bank, opfee_id) =
            make_engine_with(200_000, vec![withdrawal_rule(75)]);
        let p = init_process(&engine, wallet_id, "w-ret", 100_000).await;
        engine.mark_sent(p.id).await.unwrap();
        engine.mark_returned(p.id).await.unwrap();
        assert_eq!(net_of(&engine, opfee_id).await, 0);
        assert_eq!(net_of(&engine, avail_id).await, 200_000);
    }

    #[tokio::test]
    async fn double_reversal_is_prevented() {
        let (engine, wallet_id, avail_id, _bank, opfee_id) =
            make_engine_with(200_000, vec![withdrawal_rule(75)]);
        let p = init_process(&engine, wallet_id, "w-dbl", 100_000).await;
        engine.fail(p.id, "x".into()).await.unwrap();
        // A second terminal transition is refused → no second reversal.
        assert!(matches!(
            engine.fail(p.id, "again".into()).await,
            Err(PayoutError::InvalidStatusTransition { .. })
        ));
        assert_eq!(net_of(&engine, opfee_id).await, 0);
        assert_eq!(net_of(&engine, avail_id).await, 200_000);
    }

    #[tokio::test]
    async fn zero_amount_is_rejected() {
        let (engine, wallet_id, ..) = make_engine_with(200_000, vec![withdrawal_rule(75)]);
        let r = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "w-zero".into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(0),
                destination: dest(),
            })
            .await;
        assert!(matches!(r, Err(PayoutError::InvalidAmount)));
    }

    #[tokio::test]
    async fn fee_uses_floor_rounding() {
        // 13333 * 75 / 10000 = 99.9975 → floor = 99, net = 13234.
        let (engine, wallet_id, _avail, bank_id, opfee_id) =
            make_engine_with(200_000, vec![withdrawal_rule(75)]);
        init_process(&engine, wallet_id, "w-floor", 13_333).await;
        assert_eq!(net_of(&engine, opfee_id).await, 99);
        assert_eq!(net_of(&engine, bank_id).await, 13_234);
    }

    #[tokio::test]
    async fn fee_exceeding_gross_is_rejected() {
        // A pathological 200% rule (2000000... > gross) must fail loudly, never
        // produce a negative net.
        let (engine, wallet_id, ..) = make_engine_with(500_000, vec![withdrawal_rule(20_000)]);
        let p = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "w-exceed".into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(100_000),
                destination: dest(),
            })
            .await
            .unwrap();
        assert!(matches!(
            engine.process(p.id).await,
            Err(PayoutError::FeeExceedsGross { .. })
        ));
    }

    #[tokio::test]
    async fn future_dated_rule_is_not_applied() {
        // A rule effective only in the future must not price today → free.
        let mut future = withdrawal_rule(75);
        future.effective_from = Utc::now() + chrono::Duration::days(365);
        let (engine, wallet_id, _avail, _bank, opfee_id) = make_engine_with(200_000, vec![future]);
        init_process(&engine, wallet_id, "w-future", 100_000).await;
        assert_eq!(net_of(&engine, opfee_id).await, 0);
    }

    // -----------------------------------------------------------------------
    // RA-056 — wallet authority
    //
    // Naming a wallet is not authority over it. These assert the invariant at the
    // engine, because that is where the ledger becomes reachable: an API-edge
    // check alone would leave the financial boundary open to any future caller.
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn initiate_refuses_a_wallet_the_merchant_does_not_own() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let err = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "ra056-foreign".into(),
                merchant_id: stranger(),
                wallet_id,
                amount: kz(10_000),
                destination: dest(),
            })
            .await
            .expect_err("a payout from a wallet the caller does not own must be refused");

        match err {
            PayoutError::WalletNotOwned {
                wallet_id: w,
                merchant_id: m,
            } => {
                assert_eq!(w, wallet_id);
                assert_eq!(m, stranger());
            }
            other => panic!("expected WalletNotOwned, got {other:?}"),
        }
    }

    /// The ownership check must run BEFORE the balance check. Otherwise the
    /// endpoint stays a balance oracle: an attacker learns whether a stranger's
    /// wallet holds a given amount from which error comes back.
    #[tokio::test]
    async fn foreign_wallet_is_refused_without_revealing_its_balance() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let err = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "ra056-oracle".into(),
                merchant_id: stranger(),
                // Far beyond the wallet's balance: if the balance check ran first
                // this would surface as InsufficientBalance and leak the balance.
                amount: kz(999_000_000),
                wallet_id,
                destination: dest(),
            })
            .await
            .expect_err("must be refused");

        assert!(
            matches!(err, PayoutError::WalletNotOwned { .. }),
            "ownership must be decided before the balance is consulted, got {err:?}"
        );
    }

    /// The fix must not break the legitimate path.
    #[tokio::test]
    async fn owner_can_still_initiate_a_payout() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "ra056-owner".into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(50_000),
                destination: dest(),
            })
            .await
            .expect("the wallet's owner must still be able to withdraw");
        assert_eq!(payout.status, PayoutStatus::Pending);
        assert_eq!(payout.merchant_id, owner());
    }

    /// A refused attempt must leave no trace — no payout record, so the victim's
    /// payout list is unchanged and no downstream job can pick it up.
    #[tokio::test]
    async fn refused_attempt_creates_no_payout_record() {
        let (engine, wallet_id, _) = make_engine(100_000);
        let _ = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "ra056-notrace".into(),
                merchant_id: stranger(),
                wallet_id,
                amount: kz(10_000),
                destination: dest(),
            })
            .await;

        let victim_payouts = engine.list_for_merchant(owner(), 100).await.unwrap();
        assert!(
            victim_payouts.is_empty(),
            "a refused cross-tenant payout must not appear against the wallet owner"
        );
        let attacker_payouts = engine.list_for_merchant(stranger(), 100).await.unwrap();
        assert!(
            attacker_payouts.is_empty(),
            "a refused cross-tenant payout must not be recorded at all"
        );
    }

    // -----------------------------------------------------------------------
    // RA-056 — wallet authority
    // -----------------------------------------------------------------------

    /// Confirmed on the deployed Sandbox before this check existed: a merchant
    /// named another merchant's wallet_id and got HTTP 201 — its own merchant_id
    /// on a payout drawing from the victim's wallet, destined for its own bank
    /// account. Naming a wallet is not authority over it.
    #[tokio::test]
    async fn payout_from_a_foreign_wallet_is_refused() {
        let (engine, wallet_id, _avail) = make_engine(50_000);
        let stranger = MerchantId::new();

        let err = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "ra056-foreign".into(),
                merchant_id: stranger,
                wallet_id,
                amount: kz(10_000),
                destination: dest(),
            })
            .await
            .expect_err("a merchant must not withdraw from a wallet it does not own");

        match err {
            PayoutError::WalletNotOwned {
                wallet_id: w,
                merchant_id: m,
            } => {
                assert_eq!(w, wallet_id);
                assert_eq!(m, stranger);
            }
            other => panic!("expected WalletNotOwned, got {other:?}"),
        }

        // Refusing is not enough: no payout may exist against the victim's wallet.
        assert!(
            engine
                .list_for_merchant(stranger, 10)
                .await
                .unwrap()
                .is_empty(),
            "a refused payout must leave no record behind"
        );
    }

    /// The ownership check must run BEFORE the balance check. Otherwise a
    /// refusal still discloses whether a stranger's wallet holds the amount —
    /// which is exactly what the deployed system did, answering
    /// INSUFFICIENT_FUNDS about a wallet the caller had no relation to.
    #[tokio::test]
    async fn payout_does_not_disclose_a_foreign_wallet_balance() {
        let (engine, wallet_id, _avail) = make_engine(50_000);

        let err = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "ra056-oracle".into(),
                merchant_id: MerchantId::new(),
                wallet_id,
                // Far beyond the balance: a balance-first implementation would
                // answer InsufficientBalance and leak the funding state.
                amount: kz(999_000_000),
                destination: dest(),
            })
            .await
            .expect_err("must be refused");

        assert!(
            matches!(err, PayoutError::WalletNotOwned { .. }),
            "ownership must be decided before the balance is consulted, got {err:?}"
        );
    }

    /// The owner is still served. A fix that breaks the legitimate path is not a fix.
    #[tokio::test]
    async fn payout_from_an_owned_wallet_still_succeeds() {
        let (engine, wallet_id, _avail) = make_engine(50_000);

        let payout = engine
            .initiate(CreatePayoutRequest {
                idempotency_key: "ra056-owned".into(),
                merchant_id: owner(),
                wallet_id,
                amount: kz(10_000),
                destination: dest(),
            })
            .await
            .expect("the wallet owner must still be able to request a payout");

        assert_eq!(payout.status, PayoutStatus::Pending);
        assert_eq!(payout.merchant_id, owner());
    }
}
