//! Shared source-scoped restitution primitive (Banzami ADR-034).
//!
//! `apply_restitution` is the SINGLE authoritative Core path that returns value to
//! a payer. Refunds and dispute-won restitution both route through it, so the
//! combined ceiling (BANZA disputes.md §52: total restitution ≤ captured) is
//! enforced atomically for one typed source across refund + dispute + future
//! reversal.
//!
//! Invariants:
//!   * source-scoped `pg_advisory_xact_lock` serializes all restitution for a
//!     source (refund+refund, refund+dispute, dispute+dispute, concurrent
//!     idempotent retries) — check-and-insert are one transaction, no TOCTOU;
//!   * the typed source is resolved + verified eligible; TRANSFER/unknown rejected;
//!   * the authoritative currency is the source's; a differing supplied currency
//!     is rejected (CURRENCY_MISMATCH);
//!   * the original source is never mutated;
//!   * balanced double-entry: DR merchant.available, CR transit (acquiring) or the
//!     payer's wallet (wallet-native);
//!   * synchronous SUCCEEDED-only: a committed row IS the success; a rejection
//!     rolls back completely (no allocation, no posting);
//!   * source-aware idempotency: a matching replay returns the original;
//!     an incompatible key reuse is a conflict.
//!
//! All queries are runtime `sqlx::query` (no compile-time DB needed).

use chrono::Utc;
use sqlx::{PgConnection, Row};
use uuid::Uuid;

// ---------------------------------------------------------------------------

pub enum Origin {
    Refund,
    Dispute,
    Reversal,
}

impl Origin {
    pub fn as_str(&self) -> &'static str {
        match self {
            Origin::Refund => "REFUND",
            Origin::Dispute => "DISPUTE",
            Origin::Reversal => "REVERSAL",
        }
    }
}

/// What to do when the requested amount exceeds the remaining ceiling.
pub enum OverCeiling {
    /// Refund semantics — reject an over-refund.
    Reject,
    /// Dispute semantics — restitute only the remaining amount (may be 0).
    CapToRemaining,
}

pub struct ApplyParams {
    /// "TRANSACTION" | "ACQUIRING_PAYMENT" (alias) | "WALLET_PAYMENT".
    pub source_type: String,
    pub source_id: Uuid,
    pub merchant_id: Uuid,
    pub amount_minor: i64,
    /// Validation assertion only; authoritative currency comes from the source.
    /// Empty ⇒ not supplied ⇒ no mismatch check.
    pub supplied_currency: String,
    pub origin: Origin,
    pub origin_id: Uuid,
    pub idempotency_key: String,
    pub over_ceiling: OverCeiling,
    /// Ledger posting idempotency key, e.g. "refund-{id}" / "dispute-refund-{id}".
    pub posting_key: String,
    pub posting_description: String,
    pub transit_account_id: Uuid,
}

pub struct RestitutionResult {
    pub replayed: bool,
    /// 0 when a dispute cap left nothing to restitute (already made whole).
    pub effective_amount: i64,
    pub allocation_id: Option<Uuid>,
    pub posting_id: Option<Uuid>,
    /// The origin object id (the ORIGINAL id on an idempotent replay).
    pub origin_id: Uuid,
    pub currency: String,
    pub merchant_wallet_id: Uuid,
    pub merchant_account_id: Uuid,
    pub credit_account_id: Uuid,
    pub consumer_id: Option<Uuid>,
    pub transaction_id: Option<Uuid>,
    pub captured_amount: i64,
    pub already_before: i64,
    pub cumulative_after: i64,
    /// Cumulative restitution now equals the captured amount.
    pub fully_reversed: bool,
}

#[derive(Debug)]
pub enum RestitutionError {
    InvalidSourceType,
    SourceNotFound,
    InvalidTransactionStatus(String),
    InvalidPaymentStatus(String),
    AccountFrozen,
    CurrencyMismatch { supplied: String, source: String },
    ExceedsCaptured { remaining: i64, requested: i64, captured: i64 },
    IdempotencyKeyConflict,
    WalletNotFound,
    ConsumerWalletNotFound,
    Db(String),
}

fn db<E: std::fmt::Display>(e: E) -> RestitutionError {
    RestitutionError::Db(e.to_string())
}

/// Normalize the public/alias source token to the persisted token.
/// `ACQUIRING_PAYMENT` is a bounded input alias for `TRANSACTION`. Anything else
/// (including `TRANSFER`) is rejected.
fn normalize_source_type(raw: &str) -> Option<&'static str> {
    match raw.to_uppercase().as_str() {
        "TRANSACTION" | "ACQUIRING_PAYMENT" => Some("TRANSACTION"),
        "WALLET_PAYMENT" => Some("WALLET_PAYMENT"),
        _ => None,
    }
}

/// Mark an acquiring transaction's public proof REVERSED — ONLY on full cumulative
/// reversal (Banzami ADR-034 proof correction). A partial refund/restitution leaves
/// the proof CONFIRMED; there is no PARTIALLY_REVERSED state in the protocol proof
/// model (ADR-040). Idempotent, never deletes, no-op if no proof row exists yet.
pub async fn mark_proof_fully_reversed(pool: &sqlx::PgPool, transaction_id: Uuid, environment: &str) {
    let _ = sqlx::query(
        "UPDATE transaction_proofs
            SET status = 'REVERSED', reversed_at = COALESCE(reversed_at, now()), updated_at = now()
          WHERE transaction_id = $1 AND environment = $2 AND status <> 'REVERSED'",
    )
    .bind(transaction_id.to_string())
    .bind(environment)
    .execute(pool)
    .await;
}

struct Resolved {
    merchant_wallet_id: Uuid,
    merchant_account_id: Uuid,
    credit_account_id: Uuid,
    currency: String,
    consumer_id: Option<Uuid>,
    transaction_id: Option<Uuid>,
    captured_amount: i64,
}

/// Apply a restitution for a typed source, atomically, under a source-scoped lock.
pub async fn apply_restitution(
    conn: &mut PgConnection,
    p: ApplyParams,
) -> Result<RestitutionResult, RestitutionError> {
    if p.amount_minor <= 0 {
        return Err(RestitutionError::ExceedsCaptured {
            remaining: 0,
            requested: p.amount_minor,
            captured: 0,
        });
    }
    let source_type = normalize_source_type(&p.source_type).ok_or(RestitutionError::InvalidSourceType)?;

    // 1. Source-scoped serialization (released at commit/rollback).
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))")
        .bind(source_type)
        .bind(p.source_id.to_string())
        .execute(&mut *conn)
        .await
        .map_err(db)?;

    // 2. Idempotency (source-scoped). A matching replay returns the original;
    //    an incompatible key reuse is a conflict.
    if let Some(row) = sqlx::query(
        "SELECT id, origin_id, amount_minor, currency, posting_id
         FROM restitution_allocations
         WHERE source_type = $1 AND source_id = $2 AND origin = $3 AND idempotency_key = $4",
    )
    .bind(source_type)
    .bind(p.source_id)
    .bind(p.origin.as_str())
    .bind(&p.idempotency_key)
    .fetch_optional(&mut *conn)
    .await
    .map_err(db)?
    {
        let prior_amount: i64 = row.get("amount_minor");
        let prior_currency: String = row.get("currency");
        if prior_amount != p.amount_minor
            || (!p.supplied_currency.is_empty()
                && !prior_currency.eq_ignore_ascii_case(&p.supplied_currency))
        {
            return Err(RestitutionError::IdempotencyKeyConflict);
        }
        return Ok(RestitutionResult {
            replayed: true,
            effective_amount: prior_amount,
            allocation_id: Some(row.get("id")),
            posting_id: Some(row.get("posting_id")),
            origin_id: row.get("origin_id"),
            currency: prior_currency,
            merchant_wallet_id: Uuid::nil(),
            merchant_account_id: Uuid::nil(),
            credit_account_id: Uuid::nil(),
            consumer_id: None,
            transaction_id: None,
            captured_amount: 0,
            already_before: 0,
            cumulative_after: 0,
            fully_reversed: false,
        });
    }

    // 3. Account freeze blocks restitution.
    let frozen: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM account_freezes
          WHERE entity_type = 'MERCHANT' AND entity_id = $1 AND lifted_at IS NULL)",
    )
    .bind(p.merchant_id)
    .fetch_one(&mut *conn)
    .await
    .map_err(db)?;
    if frozen {
        return Err(RestitutionError::AccountFrozen);
    }

    // 4. Resolve + verify the typed source; capture the authoritative currency.
    let r = match source_type {
        "TRANSACTION" => resolve_transaction(conn, p.merchant_id, p.source_id, p.transit_account_id).await?,
        "WALLET_PAYMENT" => resolve_wallet_payment(conn, p.merchant_id, p.source_id).await?,
        _ => return Err(RestitutionError::InvalidSourceType),
    };

    // 5. Currency: reject a supplied currency that differs from the source.
    if !p.supplied_currency.is_empty() && !p.supplied_currency.eq_ignore_ascii_case(&r.currency) {
        return Err(RestitutionError::CurrencyMismatch {
            supplied: p.supplied_currency,
            source: r.currency,
        });
    }

    // 6. Shared ceiling — sum ALL restitution (refunds + disputes + reversals).
    let already: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_minor), 0)::BIGINT FROM restitution_allocations
         WHERE source_type = $1 AND source_id = $2",
    )
    .bind(source_type)
    .bind(p.source_id)
    .fetch_one(&mut *conn)
    .await
    .map_err(db)?;

    let remaining = (r.captured_amount - already).max(0);
    let effective = if p.amount_minor <= remaining {
        p.amount_minor
    } else {
        match p.over_ceiling {
            OverCeiling::Reject => {
                return Err(RestitutionError::ExceedsCaptured {
                    remaining,
                    requested: p.amount_minor,
                    captured: r.captured_amount,
                })
            }
            OverCeiling::CapToRemaining => remaining,
        }
    };

    // 6a. Dispute cap left nothing to restitute — success with zero movement.
    if effective == 0 {
        return Ok(RestitutionResult {
            replayed: false,
            effective_amount: 0,
            allocation_id: None,
            posting_id: None,
            origin_id: p.origin_id,
            currency: r.currency,
            merchant_wallet_id: r.merchant_wallet_id,
            merchant_account_id: r.merchant_account_id,
            credit_account_id: r.credit_account_id,
            consumer_id: r.consumer_id,
            transaction_id: r.transaction_id,
            captured_amount: r.captured_amount,
            already_before: already,
            cumulative_after: already,
            fully_reversed: already >= r.captured_amount,
        });
    }

    // 7. Balanced double-entry posting (idempotent on the posting key).
    let now = Utc::now();
    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4) ON CONFLICT (idempotency_key) DO NOTHING",
    )
    .bind(Uuid::new_v4())
    .bind(&p.posting_description)
    .bind(&p.posting_key)
    .bind(now)
    .execute(&mut *conn)
    .await
    .map_err(db)?;
    let posting_id: Uuid = sqlx::query_scalar("SELECT id FROM ledger_postings WHERE idempotency_key = $1")
        .bind(&p.posting_key)
        .fetch_one(&mut *conn)
        .await
        .map_err(db)?;

    sqlx::query(
        "INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
         VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6) ON CONFLICT DO NOTHING",
    )
    .bind(Uuid::new_v4())
    .bind(posting_id)
    .bind(r.merchant_account_id)
    .bind(effective)
    .bind(&r.currency)
    .bind(now)
    .execute(&mut *conn)
    .await
    .map_err(db)?;

    sqlx::query(
        "INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
         VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6) ON CONFLICT DO NOTHING",
    )
    .bind(Uuid::new_v4())
    .bind(posting_id)
    .bind(r.credit_account_id)
    .bind(effective)
    .bind(&r.currency)
    .bind(now)
    .execute(&mut *conn)
    .await
    .map_err(db)?;

    // 8. The allocation — the authoritative ceiling entry.
    let allocation_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO restitution_allocations
            (id, source_type, source_id, origin, origin_id, amount_minor, currency, idempotency_key, posting_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(allocation_id)
    .bind(source_type)
    .bind(p.source_id)
    .bind(p.origin.as_str())
    .bind(p.origin_id)
    .bind(effective)
    .bind(&r.currency)
    .bind(&p.idempotency_key)
    .bind(posting_id)
    .execute(&mut *conn)
    .await
    .map_err(db)?;

    let cumulative_after = already + effective;
    Ok(RestitutionResult {
        replayed: false,
        effective_amount: effective,
        allocation_id: Some(allocation_id),
        posting_id: Some(posting_id),
        origin_id: p.origin_id,
        currency: r.currency,
        merchant_wallet_id: r.merchant_wallet_id,
        merchant_account_id: r.merchant_account_id,
        credit_account_id: r.credit_account_id,
        consumer_id: r.consumer_id,
        transaction_id: r.transaction_id,
        captured_amount: r.captured_amount,
        already_before: already,
        cumulative_after,
        fully_reversed: cumulative_after == r.captured_amount,
    })
}

/// Acquiring source: refund/restitution credit goes to transit.
async fn resolve_transaction(
    conn: &mut PgConnection,
    merchant_id: Uuid,
    transaction_id: Uuid,
    transit_account_id: Uuid,
) -> Result<Resolved, RestitutionError> {
    let row = sqlx::query(
        "SELECT wallet_id, amount_minor, currency, status
         FROM transactions WHERE id = $1 AND merchant_id = $2",
    )
    .bind(transaction_id)
    .bind(merchant_id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(db)?
    .ok_or(RestitutionError::SourceNotFound)?;

    let status: String = row.get("status");
    if !["CAPTURED", "SETTLED"].contains(&status.as_str()) {
        return Err(RestitutionError::InvalidTransactionStatus(status));
    }
    let wallet_id: Uuid = row.get("wallet_id");
    let merchant_account_id: Uuid =
        sqlx::query_scalar("SELECT available_account_id FROM wallets WHERE id = $1")
            .bind(wallet_id)
            .fetch_optional(&mut *conn)
            .await
            .map_err(db)?
            .ok_or(RestitutionError::WalletNotFound)?;

    Ok(Resolved {
        merchant_wallet_id: wallet_id,
        merchant_account_id,
        credit_account_id: transit_account_id,
        currency: row.get("currency"),
        consumer_id: None,
        transaction_id: Some(transaction_id),
        captured_amount: row.get("amount_minor"),
    })
}

/// Wallet-native source: credit goes to the original payer's wallet.
async fn resolve_wallet_payment(
    conn: &mut PgConnection,
    merchant_id: Uuid,
    wallet_payment_id: Uuid,
) -> Result<Resolved, RestitutionError> {
    let row = sqlx::query(
        "SELECT merchant_id, consumer_id, amount_minor, currency, status
         FROM wallet_payments WHERE id = $1",
    )
    .bind(wallet_payment_id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(db)?
    .ok_or(RestitutionError::SourceNotFound)?;

    // Tenant isolation (F2): a wallet payment owned by another merchant is
    // treated as NOT FOUND — byte-identical public behaviour to an unknown
    // source. Never reveal existence or ownership on this merchant-facing path.
    let wp_merchant: Uuid = row.get("merchant_id");
    if wp_merchant != merchant_id {
        return Err(RestitutionError::SourceNotFound);
    }
    let status: String = row.get("status");
    if status != "COMPLETED" {
        return Err(RestitutionError::InvalidPaymentStatus(status));
    }
    let consumer_id: Uuid = row.get("consumer_id");
    let currency: String = row.get("currency");

    let merchant_wallet = sqlx::query(
        "SELECT id, available_account_id FROM wallets
         WHERE merchant_id = $1 AND currency = $2 AND status = 'ACTIVE' LIMIT 1",
    )
    .bind(merchant_id)
    .bind(&currency)
    .fetch_optional(&mut *conn)
    .await
    .map_err(db)?
    .ok_or(RestitutionError::WalletNotFound)?;

    let consumer_account_id: Uuid = sqlx::query_scalar(
        "SELECT available_account_id FROM consumer_wallets
         WHERE consumer_id = $1 AND currency = $2 AND status = 'ACTIVE'",
    )
    .bind(consumer_id)
    .bind(&currency)
    .fetch_optional(&mut *conn)
    .await
    .map_err(db)?
    .ok_or(RestitutionError::ConsumerWalletNotFound)?;

    Ok(Resolved {
        merchant_wallet_id: merchant_wallet.get("id"),
        merchant_account_id: merchant_wallet.get("available_account_id"),
        credit_account_id: consumer_account_id,
        currency,
        consumer_id: Some(consumer_id),
        transaction_id: None,
        captured_amount: row.get("amount_minor"),
    })
}
