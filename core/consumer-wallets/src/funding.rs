use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_ledger::LedgerEngine;
use banzami_types::{AccountId, ConsumerId, ConsumerWalletId, Currency, LedgerPostingId, Money};

// ---------------------------------------------------------------------------
// FundingStatus — state machine
// ---------------------------------------------------------------------------

/// State machine for an external wallet funding session.
///
/// Valid transitions:
///
/// ```text
/// PendingPayment ──────────────────────────► PendingProviderConfirmation
/// PendingPayment ──────────────────────────► Expired
/// PendingPayment ──────────────────────────► Failed
/// PendingProviderConfirmation ─────────────► Reconciling
/// PendingProviderConfirmation ─────────────► Expired
/// Reconciling ─────────────────────────────► Settled
/// Reconciling ─────────────────────────────► Failed
/// Reconciling ─────────────────────────────► PendingProviderConfirmation  (retry)
/// Settled ─────────────────────────────────► Reversed
/// ```
///
/// All other transitions are rejected by [`FundingStatus::validate_transition`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FundingStatus {
    PendingPayment,
    PendingProviderConfirmation,
    Reconciling,
    Settled,
    Failed,
    Expired,
    Reversed,
}

impl FundingStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::PendingPayment              => "PENDING_PAYMENT",
            Self::PendingProviderConfirmation => "PENDING_PROVIDER_CONFIRMATION",
            Self::Reconciling                 => "RECONCILING",
            Self::Settled                     => "SETTLED",
            Self::Failed                      => "FAILED",
            Self::Expired                     => "EXPIRED",
            Self::Reversed                    => "REVERSED",
        }
    }

    /// Maps both legacy ('PENDING', 'COMPLETED') and new status strings.
    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "PENDING_PAYMENT" | "PENDING" => Some(Self::PendingPayment),
            "PENDING_PROVIDER_CONFIRMATION" => Some(Self::PendingProviderConfirmation),
            "RECONCILING"          => Some(Self::Reconciling),
            "SETTLED" | "COMPLETED" => Some(Self::Settled),
            "FAILED"               => Some(Self::Failed),
            "EXPIRED"              => Some(Self::Expired),
            "REVERSED"             => Some(Self::Reversed),
            _                      => None,
        }
    }

    /// Returns `Ok(())` if transitioning from `self` to `next` is permitted.
    pub fn validate_transition(self, next: FundingStatus) -> Result<(), FundingError> {
        let allowed = matches!(
            (self, next),
            (Self::PendingPayment,              Self::PendingProviderConfirmation)
            | (Self::PendingPayment,            Self::Expired)
            | (Self::PendingPayment,            Self::Failed)
            | (Self::PendingProviderConfirmation, Self::Reconciling)
            | (Self::PendingProviderConfirmation, Self::Expired)
            | (Self::Reconciling,               Self::Settled)
            | (Self::Reconciling,               Self::Failed)
            | (Self::Reconciling,               Self::PendingProviderConfirmation)
            | (Self::Settled,                   Self::Reversed)
        );
        if allowed {
            Ok(())
        } else {
            Err(FundingError::InvalidTransition { from: self, to: next })
        }
    }
}

// ---------------------------------------------------------------------------
// FundingProvider
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FundingProvider {
    Emis,
    Simulated,
}

impl FundingProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Emis      => "EMIS",
            Self::Simulated => "SIMULATED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "EMIS"      => Some(Self::Emis),
            "SIMULATED" => Some(Self::Simulated),
            _           => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct FundingSession {
    pub id:                   Uuid,
    pub consumer_id:          ConsumerId,
    pub wallet_id:            ConsumerWalletId,
    pub provider:             FundingProvider,
    pub amount:               Money,
    pub external_ref:         String,
    pub idempotency_key:      String,
    pub status:               FundingStatus,
    pub ledger_posting_id:    Option<LedgerPostingId>,
    pub reconciliation_count: i32,
    pub expires_at:           DateTime<Utc>,
    pub confirmed_at:         Option<DateTime<Utc>>,
    pub reversed_at:          Option<DateTime<Utc>>,
    pub failed_at:            Option<DateTime<Utc>>,
    pub failure_reason:       Option<String>,
    pub created_at:           DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

pub struct CreateFundingSessionRequest {
    pub consumer_id:     ConsumerId,
    pub wallet_id:       ConsumerWalletId,
    pub provider:        FundingProvider,
    pub amount:          Money,
    pub external_ref:    String,
    pub idempotency_key: String,
    pub expires_at:      DateTime<Utc>,
}

pub struct ReceiveCallbackRequest {
    pub session_id:        Uuid,
    pub provider_event_id: String,
    pub payload:           serde_json::Value,
    pub hmac_valid:        bool,
}

pub struct ReconcileRequest {
    pub session_id:      Uuid,
    pub transit_account: AccountId,
}

// ---------------------------------------------------------------------------
// FundingError
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum FundingError {
    #[error("funding session {0} not found")]
    SessionNotFound(Uuid),

    #[error("invalid status transition: {from:?} → {to:?}")]
    InvalidTransition {
        from: FundingStatus,
        to:   FundingStatus,
    },

    #[error("duplicate callback: provider '{provider}' event '{event_id}' already recorded")]
    DuplicateCallback {
        provider: String,
        event_id: String,
    },

    #[error("HMAC signature is invalid")]
    HmacInvalid,

    #[error("session {0} is already settled — create a reversal instead")]
    AlreadySettled(Uuid),

    #[error("wallet {0} not found or not active")]
    WalletNotActive(ConsumerWalletId),

    #[error("ledger error: {0}")]
    Ledger(#[from] banzami_ledger::LedgerError),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

// ---------------------------------------------------------------------------
// FundingEngine trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait FundingEngine: Send + Sync {
    /// Create a new funding session in `PendingPayment` state.
    ///
    /// Idempotent on `idempotency_key` — re-submitting the same key returns
    /// the existing session unchanged.
    async fn create_session(
        &self,
        req: CreateFundingSessionRequest,
    ) -> Result<FundingSession, FundingError>;

    /// Advance `PendingPayment → PendingProviderConfirmation`.
    ///
    /// Called when the provider reports the consumer has initiated the payment
    /// action (e.g. Multicaixa Express authorisation started).
    async fn mark_payment_received(
        &self,
        session_id: Uuid,
    ) -> Result<FundingSession, FundingError>;

    /// Record a raw provider callback and advance the session to `Reconciling`.
    ///
    /// Idempotent on `(provider, provider_event_id)` — a second callback with
    /// the same event ID returns [`FundingError::DuplicateCallback`] and does
    /// not mutate the session.
    async fn receive_callback(
        &self,
        req: ReceiveCallbackRequest,
    ) -> Result<FundingSession, FundingError>;

    /// Validate the provider confirmation and create the double-entry ledger posting.
    ///
    /// Advances the session to `Settled` and links `ledger_posting_id`.
    ///
    /// Idempotent — if the session is already `Settled`, returns it unchanged.
    async fn reconcile(
        &self,
        req: ReconcileRequest,
    ) -> Result<FundingSession, FundingError>;

    /// Permanently fail a session with an operator-supplied reason.
    async fn fail_session(
        &self,
        session_id:     Uuid,
        failure_reason: String,
    ) -> Result<FundingSession, FundingError>;

    /// Reverse a `Settled` session.
    ///
    /// Creates a reversal ledger posting that exactly offsets the original credit,
    /// then advances the session to `Reversed`. The original posting is immutable —
    /// both are preserved in the audit log.
    async fn reverse_session(
        &self,
        session_id: Uuid,
        reason:     String,
    ) -> Result<FundingSession, FundingError>;

    /// Expire sessions whose TTL has passed and are still awaiting payment.
    ///
    /// Returns the number of sessions expired.
    async fn expire_stale_sessions(&self) -> Result<u64, FundingError>;

    /// Fetch a single session by ID.
    async fn get_session(&self, session_id: Uuid) -> Result<FundingSession, FundingError>;
}

// ---------------------------------------------------------------------------
// sqlx row type
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct FundingSessionRow {
    id:                      Uuid,
    consumer_id:             Uuid,
    wallet_id:               Uuid,
    provider:                String,
    amount_minor:            i64,
    currency:                String,
    external_ref:            String,
    idempotency_key:         String,
    status:                  String,
    ledger_posting_id:       Option<Uuid>,
    reconciliation_attempts: i32,
    expires_at:              DateTime<Utc>,
    confirmed_at:            Option<DateTime<Utc>>,
    reversed_at:             Option<DateTime<Utc>>,
    failed_at:               Option<DateTime<Utc>>,
    failure_reason:          Option<String>,
    created_at:              DateTime<Utc>,
}

fn session_from_row(row: FundingSessionRow) -> Result<FundingSession, FundingError> {
    let provider = FundingProvider::try_from_str(&row.provider)
        .unwrap_or(FundingProvider::Simulated);
    let status = FundingStatus::try_from_str(&row.status)
        .unwrap_or(FundingStatus::PendingPayment);
    let currency = Currency::from_code(&row.currency)
        .ok_or(FundingError::Database(sqlx::Error::RowNotFound))?;

    Ok(FundingSession {
        id:                   row.id,
        consumer_id:          ConsumerId::from_uuid(row.consumer_id),
        wallet_id:            ConsumerWalletId::from_uuid(row.wallet_id),
        provider,
        amount:               Money::new(row.amount_minor, currency),
        external_ref:         row.external_ref,
        idempotency_key:      row.idempotency_key,
        status,
        ledger_posting_id:    row.ledger_posting_id.map(LedgerPostingId::from_uuid),
        reconciliation_count: row.reconciliation_attempts,
        expires_at:           row.expires_at,
        confirmed_at:         row.confirmed_at,
        reversed_at:          row.reversed_at,
        failed_at:            row.failed_at,
        failure_reason:       row.failure_reason,
        created_at:           row.created_at,
    })
}

// Columns selected by every RETURNING / SELECT query in this module.
const SESSION_COLS: &str = "
    id, consumer_id, wallet_id, provider, amount_minor, currency,
    external_ref, idempotency_key, status,
    ledger_posting_id, reconciliation_attempts,
    expires_at, confirmed_at, reversed_at, failed_at, failure_reason, created_at";

// ---------------------------------------------------------------------------
// PostgresFundingEngine
// ---------------------------------------------------------------------------

pub struct PostgresFundingEngine<L> {
    pool:   PgPool,
    ledger: Arc<L>,
}

impl<L> PostgresFundingEngine<L> {
    pub fn new(pool: PgPool, ledger: Arc<L>) -> Self {
        Self { pool, ledger }
    }
}

impl<L: LedgerEngine + 'static> FundingEngine for PostgresFundingEngine<L> {
    async fn create_session(
        &self,
        req: CreateFundingSessionRequest,
    ) -> Result<FundingSession, FundingError> {
        let sql = format!(
            "INSERT INTO consumer_deposits
                 (consumer_id, wallet_id, provider, external_ref, idempotency_key,
                  status, amount_minor, currency, instructions, expires_at)
             VALUES ($1, $2, $3, $4, $5, 'PENDING_PAYMENT', $6, $7, '{{}}', $8)
             ON CONFLICT (idempotency_key) DO UPDATE
                 SET idempotency_key = EXCLUDED.idempotency_key
             RETURNING {SESSION_COLS}"
        );

        let row = sqlx::query_as::<_, FundingSessionRow>(&sql)
            .bind(req.consumer_id.as_uuid())
            .bind(req.wallet_id.as_uuid())
            .bind(req.provider.as_str())
            .bind(&req.external_ref)
            .bind(&req.idempotency_key)
            .bind(req.amount.amount_minor())
            .bind(req.amount.currency.code())
            .bind(req.expires_at)
            .fetch_one(&self.pool)
            .await?;

        tracing::info!(
            session_id   = %row.id,
            consumer_id  = %req.consumer_id,
            provider     = req.provider.as_str(),
            amount_minor = req.amount.amount_minor(),
            "funding session created"
        );

        session_from_row(row)
    }

    async fn mark_payment_received(
        &self,
        session_id: Uuid,
    ) -> Result<FundingSession, FundingError> {
        let current = self.get_session(session_id).await?;
        current.status.validate_transition(FundingStatus::PendingProviderConfirmation)?;

        let sql = format!(
            "UPDATE consumer_deposits
             SET status = 'PENDING_PROVIDER_CONFIRMATION'
             WHERE id = $1
             RETURNING {SESSION_COLS}"
        );
        let row = sqlx::query_as::<_, FundingSessionRow>(&sql)
            .bind(session_id)
            .fetch_one(&self.pool)
            .await?;

        tracing::info!(session_id = %session_id, "funding: payment initiated by consumer");
        session_from_row(row)
    }

    async fn receive_callback(
        &self,
        req: ReceiveCallbackRequest,
    ) -> Result<FundingSession, FundingError> {
        let current = self.get_session(req.session_id).await?;
        current.status.validate_transition(FundingStatus::Reconciling)?;

        // Attempt to record the raw callback.
        // The UNIQUE(provider, provider_event_id) constraint is the idempotency gate.
        let insert = sqlx::query(
            "INSERT INTO provider_callbacks
                 (funding_session_id, provider, provider_event_id, payload, hmac_valid, status)
             VALUES ($1, $2, $3, $4, $5, 'RECEIVED')",
        )
        .bind(req.session_id)
        .bind(current.provider.as_str())
        .bind(&req.provider_event_id)
        .bind(&req.payload)
        .bind(req.hmac_valid)
        .execute(&self.pool)
        .await;

        match insert {
            Err(sqlx::Error::Database(ref db_err))
                if db_err.constraint() == Some("provider_callbacks_event_unique") =>
            {
                return Err(FundingError::DuplicateCallback {
                    provider: current.provider.as_str().to_string(),
                    event_id: req.provider_event_id,
                });
            }
            Err(e) => return Err(FundingError::Database(e)),
            Ok(_)  => {}
        }

        // Advance to RECONCILING and increment the attempt counter.
        let sql = format!(
            "UPDATE consumer_deposits
             SET status = 'RECONCILING',
                 reconciliation_attempts = reconciliation_attempts + 1
             WHERE id = $1
             RETURNING {SESSION_COLS}"
        );
        let row = sqlx::query_as::<_, FundingSessionRow>(&sql)
            .bind(req.session_id)
            .fetch_one(&self.pool)
            .await?;

        tracing::info!(
            session_id        = %req.session_id,
            provider_event_id = %req.provider_event_id,
            hmac_valid        = req.hmac_valid,
            "funding callback received — RECONCILING"
        );

        session_from_row(row)
    }

    async fn reconcile(
        &self,
        req: ReconcileRequest,
    ) -> Result<FundingSession, FundingError> {
        let session = self.get_session(req.session_id).await?;

        // Idempotent: already settled → return as-is.
        if session.status == FundingStatus::Settled {
            return Ok(session);
        }
        session.status.validate_transition(FundingStatus::Settled)?;

        // Resolve the consumer wallet's available ledger account.
        let available_account_id: Uuid = sqlx::query_scalar(
            "SELECT available_account_id
             FROM consumer_wallets
             WHERE id = $1 AND status = 'ACTIVE'",
        )
        .bind(session.wallet_id.as_uuid())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(FundingError::WalletNotActive(session.wallet_id))?;

        // Build the balanced double-entry posting:
        //   DR transit account     (ASSET — external funds received by Banzami)
        //   CR consumer available  (LIABILITY — we now owe the consumer)
        let idem_key = format!("funding-settle-{}", session.id);
        let posting  = banzami_ledger::PostingBuilder::new(
            format!("Wallet funding — session {}", session.id),
            idem_key,
        )
        .debit(req.transit_account, session.amount)
        .credit(AccountId::from_uuid(available_account_id), session.amount)
        .build()
        .map_err(|_| banzami_ledger::LedgerError::InsufficientEntries)?;

        let posting = self.ledger.post(posting).await?;
        let now     = Utc::now();

        // Append an immutable reconciliation attempt record.
        sqlx::query(
            "INSERT INTO reconciliation_attempts
                 (funding_session_id, attempt_number, outcome, detail, ledger_posting_id)
             VALUES ($1, $2, 'SUCCESS', 'Ledger posting created', $3)",
        )
        .bind(session.id)
        .bind(session.reconciliation_count)
        .bind(posting.id.as_uuid())
        .execute(&self.pool)
        .await?;

        // Advance to SETTLED, link the posting.
        let sql = format!(
            "UPDATE consumer_deposits
             SET status             = 'SETTLED',
                 confirmed_at       = $2,
                 ledger_posting_id  = $3
             WHERE id = $1
             RETURNING {SESSION_COLS}"
        );
        let row = sqlx::query_as::<_, FundingSessionRow>(&sql)
            .bind(session.id)
            .bind(now)
            .bind(posting.id.as_uuid())
            .fetch_one(&self.pool)
            .await?;

        tracing::info!(
            session_id   = %session.id,
            posting_id   = %posting.id,
            amount_minor = session.amount.amount_minor(),
            "funding session SETTLED — wallet credited"
        );

        session_from_row(row)
    }

    async fn fail_session(
        &self,
        session_id:     Uuid,
        failure_reason: String,
    ) -> Result<FundingSession, FundingError> {
        let current = self.get_session(session_id).await?;
        current.status.validate_transition(FundingStatus::Failed)?;

        let now = Utc::now();
        let sql = format!(
            "UPDATE consumer_deposits
             SET status = 'FAILED', failed_at = $2, failure_reason = $3
             WHERE id = $1
             RETURNING {SESSION_COLS}"
        );
        let row = sqlx::query_as::<_, FundingSessionRow>(&sql)
            .bind(session_id)
            .bind(now)
            .bind(&failure_reason)
            .fetch_one(&self.pool)
            .await?;

        tracing::info!(
            session_id = %session_id,
            reason     = %failure_reason,
            "funding session FAILED"
        );
        session_from_row(row)
    }

    async fn reverse_session(
        &self,
        session_id: Uuid,
        reason:     String,
    ) -> Result<FundingSession, FundingError> {
        let session = self.get_session(session_id).await?;
        session.status.validate_transition(FundingStatus::Reversed)?;

        let original_posting_id = session
            .ledger_posting_id
            .ok_or(FundingError::AlreadySettled(session_id))?;

        // Fetch original posting then create the reversal via the ledger engine.
        let original = self.ledger.get_posting(original_posting_id).await?;
        let reversal = self.ledger
            .reverse(
                &original,
                format!("Reversal — funding session {session_id}: {reason}"),
                format!("funding-reversal-{session_id}"),
            )
            .await?;

        let now = Utc::now();
        let sql = format!(
            "UPDATE consumer_deposits
             SET status               = 'REVERSED',
                 reversed_at          = $2,
                 reversal_posting_id  = $3,
                 failure_reason       = $4
             WHERE id = $1
             RETURNING {SESSION_COLS}"
        );
        let row = sqlx::query_as::<_, FundingSessionRow>(&sql)
            .bind(session_id)
            .bind(now)
            .bind(reversal.id.as_uuid())
            .bind(&reason)
            .fetch_one(&self.pool)
            .await?;

        tracing::info!(
            session_id  = %session_id,
            reversal_id = %reversal.id,
            reason      = %reason,
            "funding session REVERSED — ledger reversal created"
        );

        session_from_row(row)
    }

    async fn expire_stale_sessions(&self) -> Result<u64, FundingError> {
        let result = sqlx::query(
            "UPDATE consumer_deposits
             SET status = 'EXPIRED'
             WHERE status IN ('PENDING_PAYMENT', 'PENDING_PROVIDER_CONFIRMATION', 'PENDING')
               AND expires_at < NOW()",
        )
        .execute(&self.pool)
        .await?;

        let count = result.rows_affected();
        if count > 0 {
            tracing::info!(count = count, "expired stale funding sessions");
        }
        Ok(count)
    }

    async fn get_session(&self, session_id: Uuid) -> Result<FundingSession, FundingError> {
        let sql = format!(
            "SELECT {SESSION_COLS}
             FROM consumer_deposits
             WHERE id = $1"
        );
        let row = sqlx::query_as::<_, FundingSessionRow>(&sql)
            .bind(session_id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(FundingError::SessionNotFound(session_id))?;

        session_from_row(row)
    }
}
