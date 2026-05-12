use banzami_types::{AccountId, Money};

use crate::{Account, LedgerEntry, LedgerError, LedgerPosting};

/// The write/read contract for the ledger.
// async fn in pub trait is fine here — this trait is internal-only.
// dyn LedgerEngine is not needed yet; if it becomes necessary, convert to
// `fn foo() -> impl Future + Send` form or introduce async-trait.
#[allow(async_fn_in_trait)]
///
/// Implementations must guarantee:
/// - `post()` is atomic — either all entries are written or none are.
/// - `post()` is idempotent — re-posting the same `idempotency_key` returns the existing posting.
/// - `balance()` is derived from entries — never from a stored mutable value.
///
/// Callers build a [`LedgerPosting`] via [`crate::PostingBuilder`], which enforces
/// the balance invariant before calling `post()`. The engine re-validates before
/// writing to prevent any bypass.
pub trait LedgerEngine: Send + Sync {
    /// Persist a new ledger account to the chart of accounts.
    async fn create_account(&self, account: Account) -> Result<Account, LedgerError>;

    /// Atomically post a balanced journal entry.
    ///
    /// Re-posting an existing `idempotency_key` returns the original posting
    /// unchanged and does not create duplicate entries.
    async fn post(&self, posting: LedgerPosting) -> Result<LedgerPosting, LedgerError>;

    /// Derive the current balance of an account from its ledger entries.
    ///
    /// Returns `Money::zero(currency)` for accounts with no entries.
    async fn balance(&self, account_id: AccountId) -> Result<Money, LedgerError>;

    /// Return all entries for an account, ordered by `created_at` ascending.
    async fn entries_for_account(
        &self,
        account_id: AccountId,
    ) -> Result<Vec<LedgerEntry>, LedgerError>;
}
