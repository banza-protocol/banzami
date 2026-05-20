use std::sync::Arc;

use chrono::{Duration, Utc};
use sqlx::PgPool;

use banzami_ledger::{Account, AccountType, LedgerEngine};
use banzami_types::{ConsumerId, ConsumerWalletId, Currency, LedgerEntryId, LedgerPostingId, Money};

use banzami_identity::ConsumerStatus;

use crate::{
    onboarding::{CompletedOnboarding, OnboardingSession},
    repository::{ConsumerWalletRepository, OnboardingRepository},
    routing::{routing_status_from_wallet, WalletRoutingDestination},
    wallet::{
        ChangePinRequest, CommitReservedRequest, CompleteOnboardingRequest, ConsumerWallet,
        ConsumerWalletBalance, ConsumerWalletStatus, CreateConsumerWalletRequest, KycStatus,
        ReleaseRequest, ReservationStatus, ReserveRequest, StartOnboardingRequest,
        VerifyOtpRequest, VerifyPinRequest, WalletReservation,
    },
    ConsumerWalletError,
};

// ---------------------------------------------------------------------------
// PIN failure threshold — ADR-017 §7
// ---------------------------------------------------------------------------

const PIN_LOCK_THRESHOLD: i32 = 5;

/// Default OTP session lifetime in minutes.
const OTP_TTL_MINUTES: i64 = 5;

/// Default PENDING_PIN session lifetime in minutes.
const ONBOARDING_PIN_TTL_MINUTES: i64 = 30;

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

/// Orchestrates the consumer wallet onboarding lifecycle and PIN operations.
///
/// Lifecycle (ADR-017 §1):
///   phone → PENDING_OTP → OTP verified → PENDING_PIN → handle + PIN → ACTIVE
///   ACTIVE → LOCKED (5 PIN failures) → ACTIVE (SMS unlock)
///   ACTIVE → SUSPENDED → ACTIVE | CLOSED
///
/// Balance invariant (ADR-017 §4):
///   Balances are always derived from the ledger — never from stored columns.
#[allow(async_fn_in_trait)]
pub trait ConsumerWalletEngine: Send + Sync {
    // ── Onboarding flow ────────────────────────────────────────────────────

    /// Step 1: Submit phone number. Creates PENDING_OTP onboarding session.
    async fn start_onboarding(
        &self,
        req: StartOnboardingRequest,
    ) -> Result<OnboardingSession, ConsumerWalletError>;

    /// Step 2: Verify OTP. Advances session to PENDING_PIN and provisions
    /// two LIABILITY ledger accounts.
    async fn verify_otp(
        &self,
        req: VerifyOtpRequest,
    ) -> Result<OnboardingSession, ConsumerWalletError>;

    /// Step 3: Choose @banza handle and set PIN. Atomically creates the
    /// `consumers` row and `consumer_wallets` row, and deletes the session.
    async fn complete_onboarding(
        &self,
        req: CompleteOnboardingRequest,
    ) -> Result<ConsumerWallet, ConsumerWalletError>;

    // ── PIN operations ─────────────────────────────────────────────────────

    async fn verify_pin(
        &self,
        req: VerifyPinRequest,
    ) -> Result<(), ConsumerWalletError>;

    async fn change_pin(
        &self,
        req: ChangePinRequest,
    ) -> Result<(), ConsumerWalletError>;

    // ── Reads ──────────────────────────────────────────────────────────────

    async fn get(&self, wallet_id: ConsumerWalletId)
        -> Result<ConsumerWallet, ConsumerWalletError>;

    async fn get_for_consumer(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError>;

    async fn balance(
        &self,
        wallet_id: ConsumerWalletId,
    ) -> Result<ConsumerWalletBalance, ConsumerWalletError>;

    // ── Balance engine (WAL-002) ───────────────────────────────────────────

    /// Move `amount` from available to reserved.
    ///
    /// Atomically: checks available balance, posts DR available / CR reserved,
    /// records the reservation. Idempotent on `req.idempotency_key`.
    /// Returns `InsufficientFunds` if available < amount.
    async fn reserve(
        &self,
        req: ReserveRequest,
    ) -> Result<WalletReservation, ConsumerWalletError>;

    /// Reverse a reservation — moves funds back from reserved to available.
    ///
    /// Posts DR reserved / CR available. Marks the reservation RELEASED.
    /// Only ACTIVE reservations can be released.
    async fn release(
        &self,
        req: ReleaseRequest,
    ) -> Result<(), ConsumerWalletError>;

    /// Commit a reservation to a target account — consumes the reservation.
    ///
    /// Posts DR reserved / CR target_account_id. Marks the reservation COMMITTED.
    /// Only ACTIVE reservations can be committed.
    async fn commit_reserved(
        &self,
        req: CommitReservedRequest,
    ) -> Result<(), ConsumerWalletError>;

    // ── Routing (HDL-002) ──────────────────────────────────────────────────

    /// Resolve a @banza handle to its active, routable wallet.
    ///
    /// Full resolution pipeline:
    ///   1. normalize handle (strip @, lowercase)
    ///   2. validate format (rejects malformed handles before DB hit)
    ///   3. currency-aware wallet lookup (deterministic — ORDER BY created_at ASC)
    ///   4. verify consumer identity is ACTIVE
    ///   5. verify wallet routing status (ROUTABLE or LOCKED permitted)
    ///   6. return canonical `WalletRoutingDestination`
    ///
    /// Errors: `HandleNotFound`, `InvalidHandle`, `SuspendedIdentity`,
    ///         `ClosedIdentity`, `WalletCannotReceive`, `RoutingUnavailable`.
    async fn resolve_to_wallet(
        &self,
        handle:   &str,
        currency: Currency,
    ) -> Result<WalletRoutingDestination, ConsumerWalletError>;

    /// Resolve a batch of handles to their routable wallets.
    ///
    /// Returns a Vec of (handle, Result) pairs — one per input, in order.
    /// Errors per handle are independent; one failure does not abort the batch.
    async fn resolve_many(
        &self,
        handles:  &[&str],
        currency: Currency,
    ) -> Vec<(String, Result<WalletRoutingDestination, ConsumerWalletError>)>;

    /// Check if a wallet (by ID) can currently receive inbound transfers.
    async fn can_receive(
        &self,
        wallet_id: ConsumerWalletId,
    ) -> Result<bool, ConsumerWalletError>;

    // ── Legacy / internal ──────────────────────────────────────────────────

    /// Direct wallet creation for internal/test use only.
    /// Production onboarding uses the three-step flow above.
    async fn create(
        &self,
        req: CreateConsumerWalletRequest,
    ) -> Result<ConsumerWallet, ConsumerWalletError>;

    async fn get_or_create(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError>;
}

// ---------------------------------------------------------------------------
// Production implementation
// ---------------------------------------------------------------------------

pub struct PostgresConsumerWalletEngine<L, OR, WR>
where
    L:  LedgerEngine,
    OR: OnboardingRepository,
    WR: ConsumerWalletRepository,
{
    /// Present only in production wiring. None in unit-test mocks.
    pool:    Option<PgPool>,
    ledger:  Arc<L>,
    onboard: OR,
    wallets: WR,
}

impl<L, OR, WR> PostgresConsumerWalletEngine<L, OR, WR>
where
    L:  LedgerEngine,
    OR: OnboardingRepository,
    WR: ConsumerWalletRepository,
{
    /// Unit-test constructor — no pool; reserve/release/commit will return an error.
    pub fn new(ledger: Arc<L>, onboard: OR, wallets: WR) -> Self {
        Self { pool: None, ledger, onboard, wallets }
    }

    /// Production constructor — includes pool for transactional reserve/release/commit.
    pub fn with_pool(pool: PgPool, ledger: Arc<L>, onboard: OR, wallets: WR) -> Self {
        Self { pool: Some(pool), ledger, onboard, wallets }
    }

    fn require_pool(&self) -> Result<&PgPool, ConsumerWalletError> {
        self.pool.as_ref().ok_or_else(|| {
            ConsumerWalletError::Posting("pool not configured for transactional operations".into())
        })
    }

    async fn fetch_reservation(
        &self,
        pool:           &PgPool,
        reservation_id: uuid::Uuid,
    ) -> Result<WalletReservation, ConsumerWalletError> {
        let row: ReservationFetchRow = sqlx::query_as(
            "SELECT id, wallet_id, amount_minor, currency, reason, status,
                    reserve_posting_id, idempotency_key,
                    created_at, released_at, committed_at
             FROM wallet_reservations WHERE id = $1",
        )
        .bind(reservation_id)
        .fetch_one(pool)
        .await
        .map_err(ConsumerWalletError::Database)?;

        let currency = Currency::from_code(&row.currency)
            .ok_or_else(|| ConsumerWalletError::UnknownCurrency(row.currency.clone()))?;
        let status = ReservationStatus::try_from_str(&row.status)
            .ok_or_else(|| ConsumerWalletError::UnknownStatus(row.status.clone()))?;

        Ok(WalletReservation {
            id:                 row.id,
            wallet_id:          ConsumerWalletId::from_uuid(row.wallet_id),
            amount:             Money::new(row.amount_minor, currency),
            reason:             row.reason,
            status,
            reserve_posting_id: LedgerPostingId::from_uuid(row.reserve_posting_id),
            idempotency_key:    row.idempotency_key,
            created_at:         row.created_at,
            released_at:        row.released_at,
            committed_at:       row.committed_at,
        })
    }

    async fn provision_ledger_accounts(
        &self,
        label_prefix: &str,
        currency:     Currency,
    ) -> Result<(banzami_types::AccountId, banzami_types::AccountId), ConsumerWalletError> {
        let available = self
            .ledger
            .create_account(Account::new(
                AccountType::Liability,
                format!("{label_prefix} — {} Available", currency.code()),
                currency,
            ))
            .await
            .map_err(ConsumerWalletError::Ledger)?;

        let reserved = self
            .ledger
            .create_account(Account::new(
                AccountType::Liability,
                format!("{label_prefix} — {} Reserved", currency.code()),
                currency,
            ))
            .await
            .map_err(ConsumerWalletError::Ledger)?;

        Ok((available.id, reserved.id))
    }
}

impl<L, OR, WR> ConsumerWalletEngine for PostgresConsumerWalletEngine<L, OR, WR>
where
    L:  LedgerEngine + 'static,
    OR: OnboardingRepository,
    WR: ConsumerWalletRepository,
{
    async fn start_onboarding(
        &self,
        req: StartOnboardingRequest,
    ) -> Result<OnboardingSession, ConsumerWalletError> {
        // Idempotency: return any non-expired session for this phone number.
        if let Some(existing) = self.onboard.find_session_by_phone(&req.phone_number).await? {
            if !existing.is_expired() {
                return Ok(existing);
            }
            // Expired session: delete it and create a fresh one.
            let _ = self.onboard.delete_session(existing.id).await;
        }

        let now         = Utc::now();
        let otp_expires = now + Duration::minutes(OTP_TTL_MINUTES);
        let session_exp = now + Duration::minutes(OTP_TTL_MINUTES + 1);

        // OTP generation and dispatch happens outside the domain layer (SMS service).
        // Here we store the SHA-256 hash of the plaintext. In production the SMS layer
        // generates the OTP and passes only the hash to the engine.
        let otp_plaintext = req.otp_plaintext_for_test.unwrap_or_default();
        let otp_hash = sha256_hex(&otp_plaintext);

        self.onboard
            .create_session(
                req.phone_number,
                otp_hash,
                otp_expires,
                req.currency,
                session_exp,
            )
            .await
    }

    async fn verify_otp(
        &self,
        req: VerifyOtpRequest,
    ) -> Result<OnboardingSession, ConsumerWalletError> {
        let session = self
            .onboard
            .find_session_by_id(req.session_id)
            .await?
            .ok_or(ConsumerWalletError::OnboardingNotFound(req.session_id))?;

        if session.is_expired() {
            return Err(ConsumerWalletError::OnboardingExpiredSession(req.session_id));
        }
        if session.otp_is_expired() {
            return Err(ConsumerWalletError::OtpInvalid);
        }

        // Verify OTP: compare SHA-256(submitted) against stored hash.
        let submitted_hash = sha256_hex(&req.otp_code);
        let stored_hash = session.otp_code_hash.as_deref().unwrap_or("");
        if submitted_hash != stored_hash {
            return Err(ConsumerWalletError::OtpInvalid);
        }

        // Provision ledger accounts now that identity is confirmed.
        let (avail_id, res_id) = self
            .provision_ledger_accounts(
                &format!("Consumer onboarding {}", session.id),
                session.currency,
            )
            .await?;

        let new_exp = Utc::now() + Duration::minutes(ONBOARDING_PIN_TTL_MINUTES);
        self.onboard
            .advance_to_pending_pin(session.id, avail_id, res_id, new_exp)
            .await
    }

    async fn complete_onboarding(
        &self,
        req: CompleteOnboardingRequest,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        let session = self
            .onboard
            .find_session_by_id(req.session_id)
            .await?
            .ok_or(ConsumerWalletError::OnboardingNotFound(req.session_id))?;

        if session.is_expired() {
            return Err(ConsumerWalletError::OnboardingExpiredSession(req.session_id));
        }

        // Handle validation: ^[a-z][a-z0-9_]{2,19}$
        validate_handle_format(&req.banza_handle)?;

        // Ledger accounts must be provisioned (session must be PENDING_PIN).
        let avail_id = session
            .provisional_available_account_id
            .ok_or(ConsumerWalletError::OtpInvalid)?; // OTP not yet verified
        let res_id = session
            .provisional_reserved_account_id
            .ok_or(ConsumerWalletError::OtpInvalid)?;

        // Hash the PIN with Argon2id before any persistence.
        // Plaintext PIN is dropped immediately after this call.
        let pin_hash = argon2id_hash(&req.pin)?;

        self.wallets
            .activate(CompletedOnboarding {
                session_id:          session.id,
                phone_number:        session.phone_number,
                banza_handle:        req.banza_handle,
                pin_hash,
                currency:            session.currency,
                available_account_id: avail_id,
                reserved_account_id:  res_id,
            })
            .await
    }

    // ── PIN operations ─────────────────────────────────────────────────────

    async fn verify_pin(
        &self,
        req: VerifyPinRequest,
    ) -> Result<(), ConsumerWalletError> {
        let wallet = self.wallets.get(req.wallet_id).await?;

        if wallet.status == ConsumerWalletStatus::Locked {
            return Err(ConsumerWalletError::WalletLocked(wallet.id));
        }
        if wallet.status != ConsumerWalletStatus::Active {
            return Err(ConsumerWalletError::NotActive(wallet.id));
        }

        let hash = wallet.pin_hash.as_deref()
            .ok_or(ConsumerWalletError::PinNotSet(wallet.id))?;

        if argon2id_verify(&req.pin, hash)? {
            // Success — reset failure counter if it was non-zero.
            if wallet.failed_pin_attempts > 0 {
                self.wallets.reset_pin_failures(req.wallet_id).await?;
            }
            return Ok(());
        }

        // Failed attempt — increment counter and check lockout threshold.
        let new_count = self.wallets.increment_pin_failures(req.wallet_id).await?;
        if new_count >= PIN_LOCK_THRESHOLD {
            self.wallets.lock_wallet(req.wallet_id).await?;
            return Err(ConsumerWalletError::WalletLocked(req.wallet_id));
        }

        Err(ConsumerWalletError::PinInvalid)
    }

    async fn change_pin(
        &self,
        req: ChangePinRequest,
    ) -> Result<(), ConsumerWalletError> {
        // Verify current PIN (also enforces lockout check).
        self.verify_pin(VerifyPinRequest {
            wallet_id: req.wallet_id,
            pin:       req.current_pin,
        })
        .await?;

        let mut wallet    = self.wallets.get(req.wallet_id).await?;
        wallet.pin_hash   = Some(argon2id_hash(&req.new_pin)?);
        wallet.updated_at = Utc::now();
        self.wallets.update(wallet).await?;
        Ok(())
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    async fn get(
        &self,
        wallet_id: ConsumerWalletId,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        self.wallets.get(wallet_id).await
    }

    async fn get_for_consumer(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        self.wallets.get_for_consumer(consumer_id, currency).await
    }

    async fn balance(
        &self,
        wallet_id: ConsumerWalletId,
    ) -> Result<ConsumerWalletBalance, ConsumerWalletError> {
        let wallet = self.wallets.get(wallet_id).await?;

        let avail_id = wallet.available_account_id
            .ok_or(ConsumerWalletError::NotActive(wallet.id))?;
        let res_id = wallet.reserved_account_id
            .ok_or(ConsumerWalletError::NotActive(wallet.id))?;

        // LIABILITY accounts: negate to get consumer-facing positive balance.
        let available = self
            .ledger
            .balance(avail_id)
            .await
            .map_err(ConsumerWalletError::Ledger)?
            .negate();

        let reserved = self
            .ledger
            .balance(res_id)
            .await
            .map_err(ConsumerWalletError::Ledger)?
            .negate();

        let total = available.checked_add(reserved).map_err(ConsumerWalletError::Money)?;

        Ok(ConsumerWalletBalance {
            wallet_id:   wallet.id,
            consumer_id: wallet.consumer_id,
            currency:    wallet.currency,
            available,
            reserved,
            total,
            computed_at: Utc::now(),
        })
    }

    // ── Balance engine (WAL-002) ───────────────────────────────────────────

    async fn reserve(
        &self,
        req: ReserveRequest,
    ) -> Result<WalletReservation, ConsumerWalletError> {
        let pool = self.require_pool()?;

        if !req.amount.is_positive() {
            return Err(ConsumerWalletError::Posting(
                "reserve amount must be positive".into(),
            ));
        }

        let mut tx = pool.begin().await.map_err(ConsumerWalletError::Database)?;

        // Idempotency check: return existing reservation if key already processed.
        let existing: Option<uuid::Uuid> = sqlx::query_scalar(
            "SELECT id FROM wallet_reservations WHERE idempotency_key = $1",
        )
        .bind(&req.idempotency_key)
        .fetch_optional(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        if let Some(id) = existing {
            tx.rollback().await.ok();
            return self.fetch_reservation(pool, id).await;
        }

        // Lock the wallet row to serialize concurrent reserves on the same wallet.
        let locked = sqlx::query_as::<_, WalletLockRow>(
            "SELECT available_account_id, reserved_account_id, currency, status
             FROM consumer_wallets WHERE id = $1 FOR UPDATE",
        )
        .bind(req.wallet_id.as_uuid())
        .fetch_optional(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?
        .ok_or(ConsumerWalletError::NotFound(req.wallet_id))?;

        if locked.status != "ACTIVE" {
            tx.rollback().await.ok();
            return Err(ConsumerWalletError::NotActive(req.wallet_id));
        }

        let currency = Currency::from_code(&locked.currency)
            .ok_or_else(|| ConsumerWalletError::UnknownCurrency(locked.currency.clone()))?;

        if req.amount.currency != currency {
            tx.rollback().await.ok();
            return Err(ConsumerWalletError::CurrencyMismatch {
                wallet_currency:    currency,
                operation_currency: req.amount.currency,
            });
        }

        // Compute available balance within the same TX (consistent read under lock).
        // LIABILITY account: net = SUM(DEBIT) - SUM(CREDIT); available = -net.
        let net_minor: i64 = sqlx::query_scalar(
            "SELECT COALESCE(
                 SUM(CASE WHEN entry_type = 'DEBIT' THEN amount_minor ELSE -amount_minor END),
                 0
             )::BIGINT
             FROM ledger_entries WHERE account_id = $1",
        )
        .bind(locked.available_account_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        let available_minor = -net_minor; // negate: LIABILITY normal balance is CREDIT

        if req.amount.amount_minor() > available_minor {
            tx.rollback().await.ok();
            return Err(ConsumerWalletError::InsufficientFunds {
                available: Money::new(available_minor, currency),
                requested: req.amount,
            });
        }

        // Post the ledger entry: DR available / CR reserved (balanced).
        let posting_id = LedgerPostingId::new();
        let now        = Utc::now();

        sqlx::query(
            "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(posting_id.as_uuid())
        .bind(format!("Reserve: {}", req.reason))
        .bind(format!("reserve-{}", req.idempotency_key))
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        // DR available_account — decreases the LIABILITY (consumer spends availability).
        sqlx::query(
            "INSERT INTO ledger_entries
             (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
             VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6)",
        )
        .bind(LedgerEntryId::new().as_uuid())
        .bind(posting_id.as_uuid())
        .bind(locked.available_account_id)
        .bind(req.amount.amount_minor())
        .bind(currency.code())
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        // CR reserved_account — increases the LIABILITY (funds now held in reserve).
        sqlx::query(
            "INSERT INTO ledger_entries
             (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
             VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6)",
        )
        .bind(LedgerEntryId::new().as_uuid())
        .bind(posting_id.as_uuid())
        .bind(locked.reserved_account_id)
        .bind(req.amount.amount_minor())
        .bind(currency.code())
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        // Record the reservation.
        let reservation_id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO wallet_reservations
             (wallet_id, amount_minor, currency, reason, status,
              reserve_posting_id, idempotency_key, created_at)
             VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7)
             RETURNING id",
        )
        .bind(req.wallet_id.as_uuid())
        .bind(req.amount.amount_minor())
        .bind(currency.code())
        .bind(&req.reason)
        .bind(posting_id.as_uuid())
        .bind(&req.idempotency_key)
        .bind(now)
        .fetch_one(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        tx.commit().await.map_err(ConsumerWalletError::Database)?;

        tracing::info!(
            wallet_id       = %req.wallet_id,
            reservation_id  = %reservation_id,
            amount_minor    = req.amount.amount_minor(),
            currency        = currency.code(),
            "wallet reservation created"
        );

        Ok(WalletReservation {
            id:                 reservation_id,
            wallet_id:          req.wallet_id,
            amount:             req.amount,
            reason:             req.reason,
            status:             ReservationStatus::Active,
            reserve_posting_id: posting_id,
            idempotency_key:    req.idempotency_key,
            created_at:         now,
            released_at:        None,
            committed_at:       None,
        })
    }

    async fn release(
        &self,
        req: ReleaseRequest,
    ) -> Result<(), ConsumerWalletError> {
        let pool = self.require_pool()?;
        let mut tx = pool.begin().await.map_err(ConsumerWalletError::Database)?;

        // Fetch and lock the reservation.
        let res = sqlx::query_as::<_, ReservationRow>(
            "SELECT r.id, r.wallet_id, r.amount_minor, r.currency, r.status,
                    w.available_account_id, w.reserved_account_id
             FROM wallet_reservations r
             JOIN consumer_wallets    w ON w.id = r.wallet_id
             WHERE r.id = $1 AND r.wallet_id = $2
             FOR UPDATE",
        )
        .bind(req.reserve_id)
        .bind(req.wallet_id.as_uuid())
        .fetch_optional(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?
        .ok_or(ConsumerWalletError::ReservationNotFound(req.reserve_id))?;

        if res.status != "ACTIVE" {
            tx.rollback().await.ok();
            return Err(ConsumerWalletError::ReservationNotActive(req.reserve_id));
        }

        let currency = Currency::from_code(&res.currency)
            .ok_or_else(|| ConsumerWalletError::UnknownCurrency(res.currency.clone()))?;

        // Post the reversal: DR reserved / CR available.
        let posting_id = LedgerPostingId::new();
        let now        = Utc::now();

        sqlx::query(
            "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(posting_id.as_uuid())
        .bind(format!("Release reservation {}", req.reserve_id))
        .bind(format!("release-{}", req.reserve_id))
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        // DR reserved_account — decreases the LIABILITY (funds leaving reserve).
        sqlx::query(
            "INSERT INTO ledger_entries
             (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
             VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6)",
        )
        .bind(LedgerEntryId::new().as_uuid())
        .bind(posting_id.as_uuid())
        .bind(res.reserved_account_id)
        .bind(res.amount_minor)
        .bind(currency.code())
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        // CR available_account — increases the LIABILITY (funds back to available).
        sqlx::query(
            "INSERT INTO ledger_entries
             (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
             VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6)",
        )
        .bind(LedgerEntryId::new().as_uuid())
        .bind(posting_id.as_uuid())
        .bind(res.available_account_id)
        .bind(res.amount_minor)
        .bind(currency.code())
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        // Mark the reservation as RELEASED.
        sqlx::query(
            "UPDATE wallet_reservations
             SET status = 'RELEASED', released_at = $2
             WHERE id = $1",
        )
        .bind(req.reserve_id)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        tx.commit().await.map_err(ConsumerWalletError::Database)?;

        tracing::info!(
            wallet_id      = %req.wallet_id,
            reservation_id = %req.reserve_id,
            amount_minor   = res.amount_minor,
            "wallet reservation released"
        );

        Ok(())
    }

    async fn commit_reserved(
        &self,
        req: CommitReservedRequest,
    ) -> Result<(), ConsumerWalletError> {
        let pool = self.require_pool()?;
        let mut tx = pool.begin().await.map_err(ConsumerWalletError::Database)?;

        // Fetch and lock the reservation.
        let res = sqlx::query_as::<_, ReservationRow>(
            "SELECT r.id, r.wallet_id, r.amount_minor, r.currency, r.status,
                    w.available_account_id, w.reserved_account_id
             FROM wallet_reservations r
             JOIN consumer_wallets    w ON w.id = r.wallet_id
             WHERE r.id = $1 AND r.wallet_id = $2
             FOR UPDATE",
        )
        .bind(req.reserve_id)
        .bind(req.wallet_id.as_uuid())
        .fetch_optional(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?
        .ok_or(ConsumerWalletError::ReservationNotFound(req.reserve_id))?;

        if res.status != "ACTIVE" {
            tx.rollback().await.ok();
            return Err(ConsumerWalletError::ReservationNotActive(req.reserve_id));
        }

        let currency = Currency::from_code(&res.currency)
            .ok_or_else(|| ConsumerWalletError::UnknownCurrency(res.currency.clone()))?;

        // Post the commit: DR reserved / CR target_account (balanced).
        let posting_id = LedgerPostingId::new();
        let now        = Utc::now();

        sqlx::query(
            "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(posting_id.as_uuid())
        .bind(format!("Commit reservation {}", req.reserve_id))
        .bind(format!("commit-{}", req.reserve_id))
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        // DR reserved_account — decreases the LIABILITY (funds leaving reserve permanently).
        sqlx::query(
            "INSERT INTO ledger_entries
             (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
             VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6)",
        )
        .bind(LedgerEntryId::new().as_uuid())
        .bind(posting_id.as_uuid())
        .bind(res.reserved_account_id)
        .bind(res.amount_minor)
        .bind(currency.code())
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        // CR target_account — credit the destination (merchant wallet, transit, etc.).
        sqlx::query(
            "INSERT INTO ledger_entries
             (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
             VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6)",
        )
        .bind(LedgerEntryId::new().as_uuid())
        .bind(posting_id.as_uuid())
        .bind(req.target_account_id.as_uuid())
        .bind(res.amount_minor)
        .bind(currency.code())
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        // Mark the reservation as COMMITTED.
        sqlx::query(
            "UPDATE wallet_reservations
             SET status = 'COMMITTED', committed_at = $2
             WHERE id = $1",
        )
        .bind(req.reserve_id)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        tx.commit().await.map_err(ConsumerWalletError::Database)?;

        tracing::info!(
            wallet_id         = %req.wallet_id,
            reservation_id    = %req.reserve_id,
            target_account_id = %req.target_account_id,
            amount_minor      = res.amount_minor,
            "wallet reservation committed"
        );

        Ok(())
    }

    // ── Legacy / internal ──────────────────────────────────────────────────

    async fn create(
        &self,
        req: CreateConsumerWalletRequest,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        let (avail_id, res_id) = self
            .provision_ledger_accounts(
                &format!("Consumer {}", req.consumer_id),
                req.currency,
            )
            .await?;

        let now = Utc::now();
        let w = ConsumerWallet {
            id:                   ConsumerWalletId::new(),
            consumer_id:          req.consumer_id,
            phone_number:         String::new(),
            banza_handle:         None,
            currency:             req.currency,
            status:               ConsumerWalletStatus::Active,
            available_account_id: Some(avail_id),
            reserved_account_id:  Some(res_id),
            kyc_status:           KycStatus::None,
            pin_hash:             None,
            failed_pin_attempts:  0,
            locked_at:            None,
            activated_at:         Some(now),
            closed_at:            None,
            created_at:           now,
            updated_at:           now,
        };
        self.wallets.create(w).await
    }

    async fn get_or_create(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        if let Some(w) = self.wallets.find_for_consumer(consumer_id, currency).await? {
            return Ok(w);
        }
        self.create(CreateConsumerWalletRequest { consumer_id, currency }).await
    }

    async fn resolve_to_wallet(
        &self,
        handle:   &str,
        currency: Currency,
    ) -> Result<WalletRoutingDestination, ConsumerWalletError> {
        let normalized = banzami_identity::normalize_handle(handle);

        // Syntax gate — rejects malformed handles before any DB round-trip.
        banzami_identity::validate_handle(&normalized)
            .map_err(ConsumerWalletError::InvalidHandle)?;

        let lookup = self.wallets
            .find_by_handle_for_routing(&normalized, currency)
            .await?
            .ok_or_else(|| ConsumerWalletError::HandleNotFound(normalized.clone()))?;

        // Identity status gate.
        match lookup.consumer_status {
            ConsumerStatus::Active    => {}
            ConsumerStatus::Suspended => {
                return Err(ConsumerWalletError::SuspendedIdentity(normalized));
            }
            ConsumerStatus::Closed => {
                return Err(ConsumerWalletError::ClosedIdentity(normalized));
            }
        }

        let wallet         = lookup.wallet;
        let routing_status = routing_status_from_wallet(wallet.status);

        // Wallet status gate — only ROUTABLE and LOCKED may receive.
        if !routing_status.can_receive() {
            return Err(ConsumerWalletError::WalletCannotReceive(wallet.id));
        }

        tracing::debug!(
            handle       = %normalized,
            wallet_id    = %wallet.id,
            routing      = %routing_status.as_str(),
            "handle resolved to routable wallet"
        );

        Ok(WalletRoutingDestination {
            consumer_id:       wallet.consumer_id,
            wallet_id:         wallet.id,
            normalized_handle: normalized,
            display_name:      lookup.display_name,
            currency:          wallet.currency,
            wallet_status:     wallet.status,
            routing_status,
            activated_at:      wallet.activated_at,
        })
    }

    async fn resolve_many(
        &self,
        handles:  &[&str],
        currency: Currency,
    ) -> Vec<(String, Result<WalletRoutingDestination, ConsumerWalletError>)> {
        let mut results = Vec::with_capacity(handles.len());
        for &handle in handles {
            let result = self.resolve_to_wallet(handle, currency).await;
            results.push((handle.to_string(), result));
        }
        results
    }

    async fn can_receive(
        &self,
        wallet_id: ConsumerWalletId,
    ) -> Result<bool, ConsumerWalletError> {
        let wallet = self.wallets.get(wallet_id).await?;
        Ok(wallet.status.can_receive())
    }
}

// ---------------------------------------------------------------------------
// Row structs used by transactional reserve/release/commit operations
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct WalletLockRow {
    available_account_id: uuid::Uuid,
    reserved_account_id:  uuid::Uuid,
    currency:             String,
    status:               String,
}

#[derive(sqlx::FromRow)]
struct ReservationRow {
    #[allow(dead_code)]
    id:                   uuid::Uuid,
    #[allow(dead_code)]
    wallet_id:            uuid::Uuid,
    amount_minor:         i64,
    currency:             String,
    status:               String,
    available_account_id: uuid::Uuid,
    reserved_account_id:  uuid::Uuid,
}

#[derive(sqlx::FromRow)]
struct ReservationFetchRow {
    id:                  uuid::Uuid,
    wallet_id:           uuid::Uuid,
    amount_minor:        i64,
    currency:            String,
    reason:              String,
    status:              String,
    reserve_posting_id:  uuid::Uuid,
    idempotency_key:     String,
    created_at:          chrono::DateTime<Utc>,
    released_at:         Option<chrono::DateTime<Utc>>,
    committed_at:        Option<chrono::DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Handle validation — delegates to banzami-identity as single source of truth
// ---------------------------------------------------------------------------

fn validate_handle_format(handle: &str) -> Result<(), ConsumerWalletError> {
    banzami_identity::validate_handle(handle)
        .map_err(ConsumerWalletError::InvalidHandle)
}

// ---------------------------------------------------------------------------
// Argon2id — PIN hashing (ADR-017 §7)
// ---------------------------------------------------------------------------
//
// Parameters: m=65536 KiB, t=3 iterations, p=4 threads.
// Plaintext PIN is NEVER stored, logged, or returned after this call.

fn argon2id_hash(pin: &str) -> Result<String, ConsumerWalletError> {
    use argon2::{
        password_hash::{PasswordHasher, SaltString},
        Argon2, Params, Algorithm, Version,
    };
    use rand::rngs::OsRng;

    let params = Params::new(65536, 3, 4, None)
        .map_err(|e| ConsumerWalletError::Posting(format!("argon2 params: {e}")))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let salt   = SaltString::generate(&mut OsRng);

    argon2
        .hash_password(pin.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| ConsumerWalletError::Posting(format!("argon2 hash: {e}")))
}

fn argon2id_verify(pin: &str, hash: &str) -> Result<bool, ConsumerWalletError> {
    use argon2::{
        password_hash::{PasswordHash, PasswordVerifier},
        Argon2,
    };

    let parsed = PasswordHash::new(hash)
        .map_err(|e| ConsumerWalletError::Posting(format!("argon2 parse: {e}")))?;

    Ok(Argon2::default().verify_password(pin.as_bytes(), &parsed).is_ok())
}

// ---------------------------------------------------------------------------
// SHA-256 — OTP hashing
// ---------------------------------------------------------------------------

fn sha256_hex(input: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

// ---------------------------------------------------------------------------
// Tests — financial invariant verification (CLAUDE.md §8.2)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};
    use std::collections::HashMap;

    use banzami_ledger::{Account, LedgerEngine, LedgerEntry, LedgerPosting};
    use banzami_types::{AccountId, ConsumerId, ConsumerWalletId, Currency, Money};
    use chrono::Utc;
    use uuid::Uuid;

    use super::*;
    use crate::{
        onboarding::{CompletedOnboarding, OnboardingSession, OnboardingStatus},
        wallet::{
            ConsumerWallet, ConsumerWalletStatus,
            CreateConsumerWalletRequest, KycStatus, StartOnboardingRequest, VerifyOtpRequest,
            VerifyPinRequest,
        },
        ConsumerWalletError,
    };

    // ── Mock ledger ─────────────────────────────────────────────────────────

    struct MockLedger {
        accounts: Mutex<Vec<Account>>,
        entries:  Mutex<Vec<LedgerEntry>>,
    }

    impl MockLedger {
        fn new() -> Self {
            Self { accounts: Mutex::new(vec![]), entries: Mutex::new(vec![]) }
        }
    }

    impl LedgerEngine for MockLedger {
        async fn create_account(
            &self,
            account: Account,
        ) -> Result<Account, banzami_ledger::LedgerError> {
            self.accounts.lock().unwrap().push(account.clone());
            Ok(account)
        }

        async fn post(
            &self,
            posting: LedgerPosting,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            self.entries.lock().unwrap().extend(posting.entries.clone());
            Ok(posting)
        }

        async fn balance(
            &self,
            account_id: AccountId,
        ) -> Result<Money, banzami_ledger::LedgerError> {
            let accounts = self.accounts.lock().unwrap();
            let account  = accounts.iter().find(|a| a.id == account_id)
                .ok_or(banzami_ledger::LedgerError::AccountNotFound(account_id))?;
            let entries  = self.entries.lock().unwrap();
            let net: i64 = entries.iter()
                .filter(|e| e.account_id == account_id)
                .map(|e| e.signed_minor_units())
                .sum();
            Ok(Money::new(net, account.currency))
        }

        async fn entries_for_account(
            &self,
            account_id: AccountId,
        ) -> Result<Vec<LedgerEntry>, banzami_ledger::LedgerError> {
            Ok(self.entries.lock().unwrap().iter()
                .filter(|e| e.account_id == account_id)
                .cloned()
                .collect())
        }

        async fn reverse(
            &self,
            original: &LedgerPosting,
            description: impl Into<String> + Send,
            new_idempotency_key: impl Into<String> + Send,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            use banzami_ledger::{EntryType, PostingBuilder};
            let mut builder = PostingBuilder::new(description.into(), new_idempotency_key.into());
            for entry in &original.entries {
                builder = match entry.entry_type {
                    EntryType::Debit  => builder.credit(entry.account_id, entry.amount),
                    EntryType::Credit => builder.debit(entry.account_id, entry.amount),
                };
            }
            let reversal = builder.build().map_err(|_| banzami_ledger::LedgerError::InsufficientEntries)?;
            self.post(reversal).await
        }

        async fn get_posting(
            &self,
            _posting_id: banzami_types::LedgerPostingId,
        ) -> Result<LedgerPosting, banzami_ledger::LedgerError> {
            unimplemented!("MockLedger::get_posting not needed for consumer-wallet unit tests")
        }
    }

    // ── Mock onboarding repository ──────────────────────────────────────────

    #[derive(Default)]
    struct MockOnboardingRepo {
        sessions: Mutex<HashMap<Uuid, OnboardingSession>>,
    }

    impl OnboardingRepository for MockOnboardingRepo {
        async fn create_session(
            &self,
            phone_number:   String,
            otp_code_hash:  String,
            otp_expires_at: chrono::DateTime<Utc>,
            currency:       Currency,
            expires_at:     chrono::DateTime<Utc>,
        ) -> Result<OnboardingSession, ConsumerWalletError> {
            let session = OnboardingSession {
                id:           Uuid::new_v4(),
                phone_number,
                otp_code_hash:   Some(otp_code_hash),
                otp_expires_at:  Some(otp_expires_at),
                desired_handle:  None,
                currency,
                status:          OnboardingStatus::PendingOtp,
                provisional_available_account_id: None,
                provisional_reserved_account_id:  None,
                created_at: Utc::now(),
                expires_at,
            };
            self.sessions.lock().unwrap().insert(session.id, session.clone());
            Ok(session)
        }

        async fn find_session_by_phone(
            &self,
            phone_number: &str,
        ) -> Result<Option<OnboardingSession>, ConsumerWalletError> {
            Ok(self.sessions.lock().unwrap().values()
                .find(|s| s.phone_number == phone_number)
                .cloned())
        }

        async fn find_session_by_id(
            &self,
            id: Uuid,
        ) -> Result<Option<OnboardingSession>, ConsumerWalletError> {
            Ok(self.sessions.lock().unwrap().get(&id).cloned())
        }

        async fn advance_to_pending_pin(
            &self,
            session_id:          Uuid,
            available_account_id: AccountId,
            reserved_account_id:  AccountId,
            new_expires_at:      chrono::DateTime<Utc>,
        ) -> Result<OnboardingSession, ConsumerWalletError> {
            let mut sessions = self.sessions.lock().unwrap();
            let s = sessions.get_mut(&session_id)
                .ok_or(ConsumerWalletError::OnboardingNotFound(session_id))?;
            s.status        = OnboardingStatus::PendingPin;
            s.otp_code_hash = None;
            s.provisional_available_account_id = Some(available_account_id);
            s.provisional_reserved_account_id  = Some(reserved_account_id);
            s.expires_at    = new_expires_at;
            Ok(s.clone())
        }

        async fn set_desired_handle(
            &self,
            session_id:     Uuid,
            desired_handle: String,
        ) -> Result<(), ConsumerWalletError> {
            let mut sessions = self.sessions.lock().unwrap();
            let s = sessions.get_mut(&session_id)
                .ok_or(ConsumerWalletError::OnboardingNotFound(session_id))?;
            s.desired_handle = Some(desired_handle);
            Ok(())
        }

        async fn delete_session(&self, session_id: Uuid)
            -> Result<(), ConsumerWalletError>
        {
            self.sessions.lock().unwrap().remove(&session_id);
            Ok(())
        }

        async fn delete_expired_sessions(&self) -> Result<u64, ConsumerWalletError> {
            let now = Utc::now();
            let mut sessions = self.sessions.lock().unwrap();
            let before = sessions.len();
            sessions.retain(|_, s| s.expires_at > now);
            Ok((before - sessions.len()) as u64)
        }
    }

    // ── Mock wallet repository ──────────────────────────────────────────────

    #[derive(Default)]
    struct MockWalletRepo {
        wallets: Mutex<HashMap<ConsumerWalletId, ConsumerWallet>>,
    }

    impl ConsumerWalletRepository for MockWalletRepo {
        async fn create(&self, w: ConsumerWallet) -> Result<ConsumerWallet, ConsumerWalletError> {
            // INV-WALLET-004: reject duplicate (consumer_id, currency) where not CLOSED
            let dup = self.wallets.lock().unwrap().values()
                .any(|x| x.consumer_id == w.consumer_id
                    && x.currency == w.currency
                    && x.status != ConsumerWalletStatus::Closed);
            if dup {
                return Err(ConsumerWalletError::DuplicateWallet);
            }
            self.wallets.lock().unwrap().insert(w.id, w.clone());
            Ok(w)
        }

        async fn update(&self, w: ConsumerWallet) -> Result<ConsumerWallet, ConsumerWalletError> {
            let mut wallets = self.wallets.lock().unwrap();
            if wallets.contains_key(&w.id) {
                wallets.insert(w.id, w.clone());
                Ok(w)
            } else {
                Err(ConsumerWalletError::NotFound(w.id))
            }
        }

        async fn get(&self, id: ConsumerWalletId) -> Result<ConsumerWallet, ConsumerWalletError> {
            self.wallets.lock().unwrap().get(&id).cloned()
                .ok_or(ConsumerWalletError::NotFound(id))
        }

        async fn get_for_consumer(
            &self,
            consumer_id: ConsumerId,
            currency:    Currency,
        ) -> Result<ConsumerWallet, ConsumerWalletError> {
            self.find_for_consumer(consumer_id, currency).await?
                .ok_or(ConsumerWalletError::NoWalletForConsumer { consumer_id, currency })
        }

        async fn find_for_consumer(
            &self,
            consumer_id: ConsumerId,
            currency:    Currency,
        ) -> Result<Option<ConsumerWallet>, ConsumerWalletError> {
            Ok(self.wallets.lock().unwrap().values()
                .find(|w| w.consumer_id == consumer_id
                    && w.currency == currency
                    && w.status != ConsumerWalletStatus::Closed)
                .cloned())
        }

        async fn find_by_handle(&self, handle: &str)
            -> Result<Option<ConsumerWallet>, ConsumerWalletError>
        {
            Ok(self.wallets.lock().unwrap().values()
                .find(|w| w.banza_handle.as_deref() == Some(handle))
                .cloned())
        }

        async fn find_by_handle_for_routing(
            &self,
            handle:   &str,
            currency: Currency,
        ) -> Result<Option<crate::repository::RoutingLookup>, ConsumerWalletError> {
            let wallet = self.wallets.lock().unwrap().values()
                .find(|w| {
                    w.banza_handle.as_deref() == Some(handle)
                        && w.currency == currency
                        && w.status != ConsumerWalletStatus::Closed
                })
                .cloned();
            Ok(wallet.map(|w| crate::repository::RoutingLookup {
                display_name: None,
                consumer_status: ConsumerStatus::Active,
                wallet: w,
            }))
        }

        async fn find_by_phone(&self, phone: &str)
            -> Result<Option<ConsumerWallet>, ConsumerWalletError>
        {
            Ok(self.wallets.lock().unwrap().values()
                .find(|w| w.phone_number == phone)
                .cloned())
        }

        async fn activate(
            &self,
            c: CompletedOnboarding,
        ) -> Result<ConsumerWallet, ConsumerWalletError> {
            // INV-WALLET-008: reject duplicate handles
            let dup_handle = self.wallets.lock().unwrap().values()
                .any(|w| w.banza_handle.as_deref() == Some(&c.banza_handle));
            if dup_handle {
                return Err(ConsumerWalletError::HandleTaken(c.banza_handle));
            }
            let now    = Utc::now();
            let wallet = ConsumerWallet {
                id:                   ConsumerWalletId::new(),
                consumer_id:          ConsumerId::new(),
                phone_number:         c.phone_number,
                banza_handle:         Some(c.banza_handle),
                status:               ConsumerWalletStatus::Active,
                currency:             c.currency,
                available_account_id: Some(c.available_account_id),
                reserved_account_id:  Some(c.reserved_account_id),
                kyc_status:           KycStatus::None,
                pin_hash:             Some(c.pin_hash),
                failed_pin_attempts:  0,
                locked_at:            None,
                activated_at:         Some(now),
                closed_at:            None,
                created_at:           now,
                updated_at:           now,
            };
            self.wallets.lock().unwrap().insert(wallet.id, wallet.clone());
            Ok(wallet)
        }

        async fn increment_pin_failures(
            &self,
            id: ConsumerWalletId,
        ) -> Result<i32, ConsumerWalletError> {
            let mut wallets = self.wallets.lock().unwrap();
            let w = wallets.get_mut(&id).ok_or(ConsumerWalletError::NotFound(id))?;
            w.failed_pin_attempts += 1;
            Ok(w.failed_pin_attempts)
        }

        async fn reset_pin_failures(
            &self,
            id: ConsumerWalletId,
        ) -> Result<(), ConsumerWalletError> {
            let mut wallets = self.wallets.lock().unwrap();
            if let Some(w) = wallets.get_mut(&id) { w.failed_pin_attempts = 0; }
            Ok(())
        }

        async fn lock_wallet(&self, id: ConsumerWalletId) -> Result<(), ConsumerWalletError> {
            let mut wallets = self.wallets.lock().unwrap();
            let w = wallets.get_mut(&id).ok_or(ConsumerWalletError::NotFound(id))?;
            if w.status != ConsumerWalletStatus::Active {
                return Err(ConsumerWalletError::NotActive(id));
            }
            w.status    = ConsumerWalletStatus::Locked;
            w.locked_at = Some(Utc::now());
            Ok(())
        }

        async fn unlock_wallet(&self, id: ConsumerWalletId) -> Result<(), ConsumerWalletError> {
            let mut wallets = self.wallets.lock().unwrap();
            let w = wallets.get_mut(&id).ok_or(ConsumerWalletError::NotFound(id))?;
            w.status              = ConsumerWalletStatus::Active;
            w.locked_at           = None;
            w.failed_pin_attempts = 0;
            Ok(())
        }

        async fn update_status(
            &self,
            id:         ConsumerWalletId,
            new_status: ConsumerWalletStatus,
            closed_at:  Option<chrono::DateTime<Utc>>,
        ) -> Result<(), ConsumerWalletError> {
            let mut wallets = self.wallets.lock().unwrap();
            let w = wallets.get_mut(&id).ok_or(ConsumerWalletError::NotFound(id))?;
            // INV-WALLET-006: enforce state machine
            if !w.status.can_transition_to(new_status) {
                return Err(ConsumerWalletError::InvalidStatusTransition {
                    from: w.status,
                    to:   new_status,
                });
            }
            w.status    = new_status;
            w.closed_at = closed_at;
            Ok(())
        }
    }

    // ── Test factory ────────────────────────────────────────────────────────

    fn make_engine() -> PostgresConsumerWalletEngine<MockLedger, MockOnboardingRepo, MockWalletRepo>
    {
        PostgresConsumerWalletEngine::new(
            Arc::new(MockLedger::new()),
            MockOnboardingRepo::default(),
            MockWalletRepo::default(),
        )
    }

    /// Creates and activates a wallet in one call — convenience for balance tests.
    async fn activated_wallet(
        eng: &PostgresConsumerWalletEngine<MockLedger, MockOnboardingRepo, MockWalletRepo>,
    ) -> ConsumerWallet {
        eng.create(CreateConsumerWalletRequest {
            consumer_id: ConsumerId::new(),
            currency:    Currency::AOA,
        })
        .await
        .unwrap()
    }

    // ── INV-WALLET-001: No negative available balance ──────────────────────

    #[tokio::test]
    async fn fresh_wallet_has_zero_balance() {
        let eng    = make_engine();
        let wallet = activated_wallet(&eng).await;
        let bal    = eng.balance(wallet.id).await.unwrap();
        assert!(bal.available.is_zero());
        assert!(bal.reserved.is_zero());
        assert!(bal.total.is_zero());
    }

    // ── INV-WALLET-004: Wallet-owner uniqueness ────────────────────────────

    #[tokio::test]
    async fn duplicate_wallet_for_same_consumer_rejected() {
        let eng = make_engine();
        let cid = ConsumerId::new();
        eng.create(CreateConsumerWalletRequest { consumer_id: cid, currency: Currency::AOA })
            .await
            .unwrap();

        let err = eng.create(CreateConsumerWalletRequest { consumer_id: cid, currency: Currency::AOA })
            .await
            .unwrap_err();

        assert!(
            matches!(err, ConsumerWalletError::DuplicateWallet),
            "expected DuplicateWallet, got {err:?}"
        );
    }

    #[tokio::test]
    async fn get_or_create_returns_existing_wallet() {
        let eng   = make_engine();
        let cid   = ConsumerId::new();
        let first = eng.get_or_create(cid, Currency::AOA).await.unwrap();
        let second= eng.get_or_create(cid, Currency::AOA).await.unwrap();
        assert_eq!(first.id, second.id);
    }

    // ── INV-WALLET-005: Currency immutability ─────────────────────────────

    #[tokio::test]
    async fn currency_field_unchanged_after_creation() {
        let eng    = make_engine();
        let wallet = activated_wallet(&eng).await;
        assert_eq!(wallet.currency, Currency::AOA);
        // Verify: re-fetch does not change currency
        let refetched = eng.get(wallet.id).await.unwrap();
        assert_eq!(refetched.currency, Currency::AOA);
    }

    // ── INV-WALLET-006: Lifecycle state machine ────────────────────────────

    #[tokio::test]
    async fn illegal_transition_closed_to_active_rejected() {
        let eng    = make_engine();
        let wallet = activated_wallet(&eng).await;

        eng.wallets
            .update_status(wallet.id, ConsumerWalletStatus::Closed, Some(Utc::now()))
            .await
            .unwrap();

        let err = eng.wallets
            .update_status(wallet.id, ConsumerWalletStatus::Active, None)
            .await
            .unwrap_err();

        assert!(
            matches!(err, ConsumerWalletError::InvalidStatusTransition { .. }),
            "CLOSED → ACTIVE must be rejected"
        );
    }

    #[tokio::test]
    async fn active_wallet_locks_after_five_failed_pins() {
        let eng    = make_engine();
        let wallet = activated_wallet(&eng).await;

        // Inject a PIN hash directly.
        {
            let mut wallets = eng.wallets.wallets.lock().unwrap();
            wallets.get_mut(&wallet.id).unwrap().pin_hash = Some(argon2id_hash("1234").unwrap());
        }

        for _ in 0..4 {
            let _ = eng.verify_pin(VerifyPinRequest { wallet_id: wallet.id, pin: "wrong".into() })
                .await;
        }
        let w = eng.get(wallet.id).await.unwrap();
        assert_eq!(w.status, ConsumerWalletStatus::Active, "still active after 4 failures");
        assert_eq!(w.failed_pin_attempts, 4);

        let _ = eng.verify_pin(VerifyPinRequest { wallet_id: wallet.id, pin: "wrong".into() })
            .await;
        let w = eng.get(wallet.id).await.unwrap();
        assert_eq!(w.status, ConsumerWalletStatus::Locked, "locked after 5 failures");
        assert!(w.locked_at.is_some());
    }

    #[tokio::test]
    async fn pin_counter_resets_on_successful_verification() {
        let eng    = make_engine();
        let wallet = activated_wallet(&eng).await;

        {
            let mut wallets = eng.wallets.wallets.lock().unwrap();
            wallets.get_mut(&wallet.id).unwrap().pin_hash = Some(argon2id_hash("1234").unwrap());
        }

        // Two failures then one success.
        for _ in 0..2 {
            let _ = eng.verify_pin(VerifyPinRequest { wallet_id: wallet.id, pin: "wrong".into() })
                .await;
        }
        eng.verify_pin(VerifyPinRequest { wallet_id: wallet.id, pin: "1234".into() })
            .await
            .unwrap();

        let w = eng.get(wallet.id).await.unwrap();
        assert_eq!(w.failed_pin_attempts, 0, "counter must reset after success");
        assert_eq!(w.status, ConsumerWalletStatus::Active);
    }

    // ── INV-WALLET-007: ACTIVE wallet has both ledger accounts ────────────

    #[tokio::test]
    async fn active_wallet_has_both_ledger_accounts() {
        let eng    = make_engine();
        let wallet = activated_wallet(&eng).await;
        assert!(wallet.available_account_id.is_some(), "missing available account");
        assert!(wallet.reserved_account_id.is_some(),  "missing reserved account");
    }

    // ── INV-WALLET-008: @banza uniqueness ─────────────────────────────────

    #[tokio::test]
    async fn duplicate_handle_rejected() {
        let eng = make_engine();

        // Activate two wallets manually sharing the same handle.
        let avail  = AccountId::new();
        let res    = AccountId::new();
        eng.wallets.activate(CompletedOnboarding {
            session_id:          Uuid::new_v4(),
            phone_number:        "+244923000001".into(),
            banza_handle:        "alice".into(),
            pin_hash:            argon2id_hash("1234").unwrap(),
            currency:            Currency::AOA,
            available_account_id: avail,
            reserved_account_id:  res,
        }).await.unwrap();

        let avail2 = AccountId::new();
        let res2   = AccountId::new();
        let err = eng.wallets.activate(CompletedOnboarding {
            session_id:          Uuid::new_v4(),
            phone_number:        "+244923000002".into(),
            banza_handle:        "alice".into(),  // same handle
            pin_hash:            argon2id_hash("5678").unwrap(),
            currency:            Currency::AOA,
            available_account_id: avail2,
            reserved_account_id:  res2,
        }).await.unwrap_err();

        assert!(
            matches!(err, ConsumerWalletError::HandleTaken(_)),
            "duplicate handle must be rejected: {err:?}"
        );
    }

    // ── Handle validation ──────────────────────────────────────────────────

    #[tokio::test]
    async fn handle_too_short_rejected() {
        let err = validate_handle_format("ab").unwrap_err();
        assert!(matches!(err, ConsumerWalletError::InvalidHandle(_)));
    }

    #[tokio::test]
    async fn handle_starts_with_digit_rejected() {
        let err = validate_handle_format("1foo").unwrap_err();
        assert!(matches!(err, ConsumerWalletError::InvalidHandle(_)));
    }

    #[tokio::test]
    async fn handle_trailing_underscore_rejected() {
        let err = validate_handle_format("foo_").unwrap_err();
        assert!(matches!(err, ConsumerWalletError::InvalidHandle(_)));
    }

    #[tokio::test]
    async fn valid_handle_accepted() {
        validate_handle_format("alice").unwrap();
        validate_handle_format("banza_user").unwrap();
        validate_handle_format("a12").unwrap();
    }

    // ── Onboarding session lifecycle ───────────────────────────────────────

    #[tokio::test]
    async fn onboarding_session_starts_as_pending_otp() {
        let eng = make_engine();
        let session = eng.start_onboarding(StartOnboardingRequest {
            phone_number:           "+244923000001".into(),
            currency:               Currency::AOA,
            otp_plaintext_for_test: Some("123456".into()),
        }).await.unwrap();

        assert_eq!(session.status, OnboardingStatus::PendingOtp);
        assert!(session.provisional_available_account_id.is_none());
        assert!(session.provisional_reserved_account_id.is_none());
    }

    #[tokio::test]
    async fn otp_verification_provisions_ledger_accounts() {
        let eng = make_engine();
        let session = eng.start_onboarding(StartOnboardingRequest {
            phone_number:           "+244923000002".into(),
            currency:               Currency::AOA,
            otp_plaintext_for_test: Some("654321".into()),
        }).await.unwrap();

        let session = eng.verify_otp(VerifyOtpRequest {
            session_id: session.id,
            otp_code:   "654321".into(),  // correct OTP
        }).await.unwrap();

        assert_eq!(session.status, OnboardingStatus::PendingPin);
        assert!(session.provisional_available_account_id.is_some(), "available account must be provisioned");
        assert!(session.provisional_reserved_account_id.is_some(),  "reserved account must be provisioned");
    }

    #[tokio::test]
    async fn wrong_otp_returns_otp_invalid() {
        let eng = make_engine();
        let session = eng.start_onboarding(StartOnboardingRequest {
            phone_number:           "+244923000003".into(),
            currency:               Currency::AOA,
            otp_plaintext_for_test: Some("111111".into()),
        }).await.unwrap();

        let err = eng.verify_otp(VerifyOtpRequest {
            session_id: session.id,
            otp_code:   "999999".into(),  // wrong OTP
        }).await.unwrap_err();

        assert!(matches!(err, ConsumerWalletError::OtpInvalid), "{err:?}");
    }
}
