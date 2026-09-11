use banzami_types::{AccountId, LedgerPostingId, Money};

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
/// - `reverse()` creates a new balanced posting that offsets the original entry-for-entry.
/// - Ledger entries are immutable after commit — no UPDATE or DELETE is permitted.
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
    ///
    /// Validates that each entry's currency matches the declared currency of
    /// its target account. Returns `AccountCurrencyMismatch` otherwise.
    async fn post(&self, posting: LedgerPosting) -> Result<LedgerPosting, LedgerError>;

    /// Create a reversal posting that exactly offsets `original`.
    ///
    /// Every DEBIT in the original becomes a CREDIT in the reversal, and vice
    /// versa. The reversal is a new balanced posting with its own
    /// `new_idempotency_key`. The original posting is not mutated.
    ///
    /// Idempotent: re-submitting the same `new_idempotency_key` returns the
    /// existing reversal posting without creating a duplicate.
    async fn reverse(
        &self,
        original: &LedgerPosting,
        description: impl Into<String> + Send,
        new_idempotency_key: impl Into<String> + Send,
    ) -> Result<LedgerPosting, LedgerError>;

    /// Fetch a posting and all its entries by ID.
    async fn get_posting(&self, posting_id: LedgerPostingId) -> Result<LedgerPosting, LedgerError>;

    /// The posting written under `idempotency_key`, if one was. A caller that
    /// posts under fixed keys can find what actually moved even when it never
    /// recorded the posting's id — the only way to reverse a partial operation
    /// exactly (never by re-deriving amounts, which can reverse money that did
    /// not move).
    async fn find_posting_by_key(
        &self,
        idempotency_key: &str,
    ) -> Result<Option<LedgerPosting>, LedgerError>;

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
