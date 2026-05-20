use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use banzami_types::{AccountId, ConsumerId, ConsumerWalletId, Currency};

use banzami_identity::ConsumerStatus;

use crate::{
    onboarding::{CompletedOnboarding, OnboardingSession, OnboardingStatus},
    ConsumerWallet, ConsumerWalletError, ConsumerWalletStatus, KycStatus,
};

/// Result of a routing-specific handle lookup — includes consumer identity status
/// alongside the wallet so the routing engine can verify both layers atomically.
pub struct RoutingLookup {
    pub wallet:          ConsumerWallet,
    pub consumer_status: ConsumerStatus,
    pub display_name:    Option<String>,
}

// ---------------------------------------------------------------------------
// Onboarding repository trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait OnboardingRepository: Send + Sync {
    async fn create_session(
        &self,
        phone_number:   String,
        otp_code_hash:  String,
        otp_expires_at: DateTime<Utc>,
        currency:       Currency,
        expires_at:     DateTime<Utc>,
    ) -> Result<OnboardingSession, ConsumerWalletError>;

    async fn find_session_by_phone(
        &self,
        phone_number: &str,
    ) -> Result<Option<OnboardingSession>, ConsumerWalletError>;

    async fn find_session_by_id(
        &self,
        id: Uuid,
    ) -> Result<Option<OnboardingSession>, ConsumerWalletError>;

    async fn advance_to_pending_pin(
        &self,
        session_id:                      Uuid,
        available_account_id:            AccountId,
        reserved_account_id:             AccountId,
        new_expires_at:                  DateTime<Utc>,
    ) -> Result<OnboardingSession, ConsumerWalletError>;

    async fn set_desired_handle(
        &self,
        session_id:     Uuid,
        desired_handle: String,
    ) -> Result<(), ConsumerWalletError>;

    async fn delete_session(&self, session_id: Uuid)
        -> Result<(), ConsumerWalletError>;

    async fn delete_expired_sessions(&self) -> Result<u64, ConsumerWalletError>;
}

// ---------------------------------------------------------------------------
// Consumer wallet repository trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait ConsumerWalletRepository: Send + Sync {
    async fn create(&self, wallet: ConsumerWallet)
        -> Result<ConsumerWallet, ConsumerWalletError>;

    async fn update(&self, wallet: ConsumerWallet)
        -> Result<ConsumerWallet, ConsumerWalletError>;

    async fn get(&self, id: ConsumerWalletId)
        -> Result<ConsumerWallet, ConsumerWalletError>;

    async fn get_for_consumer(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError>;

    async fn find_for_consumer(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<Option<ConsumerWallet>, ConsumerWalletError>;

    async fn find_by_handle(
        &self,
        handle: &str,
    ) -> Result<Option<ConsumerWallet>, ConsumerWalletError>;

    /// Currency-aware handle lookup for routing resolution.
    ///
    /// Returns the wallet and the consumer's identity status. Uses a deterministic
    /// query (filtered by currency, ordered by created_at ASC) so the result is
    /// always the same for the same input — no LIMIT 1 ambiguity.
    async fn find_by_handle_for_routing(
        &self,
        handle:   &str,
        currency: Currency,
    ) -> Result<Option<RoutingLookup>, ConsumerWalletError>;

    async fn find_by_phone(
        &self,
        phone_number: &str,
    ) -> Result<Option<ConsumerWallet>, ConsumerWalletError>;

    /// Atomically: insert consumers row, insert consumer_wallets row, delete
    /// consumer_onboarding row. Used by `complete_onboarding`.
    async fn activate(
        &self,
        completed: CompletedOnboarding,
    ) -> Result<ConsumerWallet, ConsumerWalletError>;

    async fn increment_pin_failures(
        &self,
        id: ConsumerWalletId,
    ) -> Result<i32, ConsumerWalletError>;

    async fn reset_pin_failures(
        &self,
        id: ConsumerWalletId,
    ) -> Result<(), ConsumerWalletError>;

    async fn lock_wallet(
        &self,
        id: ConsumerWalletId,
    ) -> Result<(), ConsumerWalletError>;

    async fn unlock_wallet(
        &self,
        id: ConsumerWalletId,
    ) -> Result<(), ConsumerWalletError>;

    async fn update_status(
        &self,
        id:         ConsumerWalletId,
        new_status: ConsumerWalletStatus,
        closed_at:  Option<DateTime<Utc>>,
    ) -> Result<(), ConsumerWalletError>;
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct OnboardingRow {
    id:           Uuid,
    phone_number: String,
    otp_code_hash:   Option<String>,
    otp_expires_at:  Option<DateTime<Utc>>,
    desired_handle:  Option<String>,
    currency:        String,
    status:          String,
    provisional_available_account_id: Option<Uuid>,
    provisional_reserved_account_id:  Option<Uuid>,
    created_at:  DateTime<Utc>,
    expires_at:  DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct WalletRow {
    // from consumer_wallets
    id:                   Uuid,
    consumer_id:          Uuid,
    currency:             String,
    status:               String,
    available_account_id: Uuid,
    reserved_account_id:  Uuid,
    kyc_status:           String,
    pin_hash:             Option<String>,
    failed_pin_attempts:  i32,
    locked_at:            Option<DateTime<Utc>>,
    created_at:           DateTime<Utc>,
    updated_at:           DateTime<Utc>,
    activated_at:         Option<DateTime<Utc>>,
    closed_at:            Option<DateTime<Utc>>,
    // from consumers (joined)
    phone_number:         Option<String>,
    banza_handle:         String,  // consumers.handle
}

/// Extended row for routing resolution — includes consumer status and display_name
/// so the routing engine can verify both layers in a single query.
#[derive(sqlx::FromRow)]
struct RoutingRow {
    // from consumer_wallets
    id:                   Uuid,
    consumer_id:          Uuid,
    currency:             String,
    status:               String,
    available_account_id: Uuid,
    reserved_account_id:  Uuid,
    kyc_status:           String,
    pin_hash:             Option<String>,
    failed_pin_attempts:  i32,
    locked_at:            Option<DateTime<Utc>>,
    created_at:           DateTime<Utc>,
    updated_at:           DateTime<Utc>,
    activated_at:         Option<DateTime<Utc>>,
    closed_at:            Option<DateTime<Utc>>,
    // from consumers (joined)
    phone_number:         Option<String>,
    banza_handle:         String,
    consumer_status:      String,
    display_name:         Option<String>,
}

// ---------------------------------------------------------------------------
// PostgreSQL — onboarding
// ---------------------------------------------------------------------------

pub struct PostgresOnboardingRepository {
    pool: PgPool,
}

impl PostgresOnboardingRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

const ONBOARDING_SELECT: &str = "
    SELECT id, phone_number, otp_code_hash, otp_expires_at, desired_handle,
           currency, status,
           provisional_available_account_id,
           provisional_reserved_account_id,
           created_at, expires_at
    FROM   consumer_onboarding";

impl OnboardingRepository for PostgresOnboardingRepository {
    async fn create_session(
        &self,
        phone_number:   String,
        otp_code_hash:  String,
        otp_expires_at: DateTime<Utc>,
        currency:       Currency,
        expires_at:     DateTime<Utc>,
    ) -> Result<OnboardingSession, ConsumerWalletError> {
        let row: OnboardingRow = sqlx::query_as(
            "INSERT INTO consumer_onboarding
             (phone_number, otp_code_hash, otp_expires_at, currency, expires_at)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *",
        )
        .bind(&phone_number)
        .bind(&otp_code_hash)
        .bind(otp_expires_at)
        .bind(currency.code())
        .bind(expires_at)
        .fetch_one(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?;

        tracing::info!(phone = %phone_number, "onboarding session created");
        onboarding_from_row(row)
    }

    async fn find_session_by_phone(
        &self,
        phone_number: &str,
    ) -> Result<Option<OnboardingSession>, ConsumerWalletError> {
        let row: Option<OnboardingRow> = sqlx::query_as(&format!(
            "{ONBOARDING_SELECT} WHERE phone_number = $1 LIMIT 1"
        ))
        .bind(phone_number)
        .fetch_optional(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?;

        row.map(onboarding_from_row).transpose()
    }

    async fn find_session_by_id(
        &self,
        id: Uuid,
    ) -> Result<Option<OnboardingSession>, ConsumerWalletError> {
        let row: Option<OnboardingRow> =
            sqlx::query_as(&format!("{ONBOARDING_SELECT} WHERE id = $1"))
                .bind(id)
                .fetch_optional(&self.pool)
                .await
                .map_err(ConsumerWalletError::Database)?;

        row.map(onboarding_from_row).transpose()
    }

    async fn advance_to_pending_pin(
        &self,
        session_id:          Uuid,
        available_account_id: AccountId,
        reserved_account_id:  AccountId,
        new_expires_at:      DateTime<Utc>,
    ) -> Result<OnboardingSession, ConsumerWalletError> {
        let row: OnboardingRow = sqlx::query_as(
            "UPDATE consumer_onboarding
             SET status                           = 'PENDING_PIN',
                 otp_code_hash                    = NULL,
                 provisional_available_account_id = $2,
                 provisional_reserved_account_id  = $3,
                 expires_at                        = $4
             WHERE id = $1
             RETURNING *",
        )
        .bind(session_id)
        .bind(available_account_id.as_uuid())
        .bind(reserved_account_id.as_uuid())
        .bind(new_expires_at)
        .fetch_one(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?;

        onboarding_from_row(row)
    }

    async fn set_desired_handle(
        &self,
        session_id:     Uuid,
        desired_handle: String,
    ) -> Result<(), ConsumerWalletError> {
        let rows = sqlx::query(
            "UPDATE consumer_onboarding SET desired_handle = $2 WHERE id = $1",
        )
        .bind(session_id)
        .bind(&desired_handle)
        .execute(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?
        .rows_affected();

        if rows == 0 {
            return Err(ConsumerWalletError::OnboardingNotFound(session_id));
        }
        Ok(())
    }

    async fn delete_session(&self, session_id: Uuid) -> Result<(), ConsumerWalletError> {
        sqlx::query("DELETE FROM consumer_onboarding WHERE id = $1")
            .bind(session_id)
            .execute(&self.pool)
            .await
            .map_err(ConsumerWalletError::Database)?;
        Ok(())
    }

    async fn delete_expired_sessions(&self) -> Result<u64, ConsumerWalletError> {
        let res = sqlx::query("DELETE FROM consumer_onboarding WHERE expires_at < now()")
            .execute(&self.pool)
            .await
            .map_err(ConsumerWalletError::Database)?;

        let deleted = res.rows_affected();
        if deleted > 0 {
            tracing::info!(count = deleted, "expired onboarding sessions deleted");
        }
        Ok(deleted)
    }
}

// ---------------------------------------------------------------------------
// PostgreSQL — consumer wallet
// ---------------------------------------------------------------------------

pub struct PostgresConsumerWalletRepository {
    pool: PgPool,
}

impl PostgresConsumerWalletRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

const WALLET_SELECT: &str = "
    SELECT w.id, w.consumer_id, w.currency, w.status,
           w.available_account_id, w.reserved_account_id,
           w.kyc_status, w.pin_hash, w.failed_pin_attempts, w.locked_at,
           w.created_at, w.updated_at, w.activated_at, w.closed_at,
           c.phone_number, c.handle AS banza_handle
    FROM   consumer_wallets w
    JOIN   consumers        c ON c.id = w.consumer_id";

impl ConsumerWalletRepository for PostgresConsumerWalletRepository {
    async fn create(&self, wallet: ConsumerWallet) -> Result<ConsumerWallet, ConsumerWalletError> {
        sqlx::query(
            "INSERT INTO consumer_wallets
             (id, consumer_id, currency, status,
              available_account_id, reserved_account_id,
              kyc_status, pin_hash, failed_pin_attempts,
              created_at, updated_at, activated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        )
        .bind(wallet.id.as_uuid())
        .bind(wallet.consumer_id.as_uuid())
        .bind(wallet.currency.code())
        .bind(wallet.status.as_str())
        .bind(wallet.available_account_id.map(|a| a.as_uuid()))
        .bind(wallet.reserved_account_id.map(|a| a.as_uuid()))
        .bind(wallet.kyc_status.as_str())
        .bind(&wallet.pin_hash)
        .bind(wallet.failed_pin_attempts)
        .bind(wallet.created_at)
        .bind(wallet.updated_at)
        .bind(wallet.activated_at)
        .execute(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?;

        Ok(wallet)
    }

    async fn update(&self, wallet: ConsumerWallet) -> Result<ConsumerWallet, ConsumerWalletError> {
        let rows = sqlx::query(
            "UPDATE consumer_wallets
             SET status              = $2,
                 kyc_status          = $3,
                 pin_hash            = $4,
                 failed_pin_attempts = $5,
                 locked_at           = $6,
                 updated_at          = $7,
                 closed_at           = $8
             WHERE id = $1",
        )
        .bind(wallet.id.as_uuid())
        .bind(wallet.status.as_str())
        .bind(wallet.kyc_status.as_str())
        .bind(&wallet.pin_hash)
        .bind(wallet.failed_pin_attempts)
        .bind(wallet.locked_at)
        .bind(wallet.updated_at)
        .bind(wallet.closed_at)
        .execute(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?
        .rows_affected();

        if rows == 0 {
            return Err(ConsumerWalletError::NotFound(wallet.id));
        }
        Ok(wallet)
    }

    async fn get(&self, id: ConsumerWalletId) -> Result<ConsumerWallet, ConsumerWalletError> {
        let row: Option<WalletRow> =
            sqlx::query_as(&format!("{WALLET_SELECT} WHERE w.id = $1"))
                .bind(id.as_uuid())
                .fetch_optional(&self.pool)
                .await
                .map_err(ConsumerWalletError::Database)?;

        row.map(wallet_from_row)
            .transpose()?
            .ok_or(ConsumerWalletError::NotFound(id))
    }

    async fn get_for_consumer(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        self.find_for_consumer(consumer_id, currency)
            .await?
            .ok_or(ConsumerWalletError::NoWalletForConsumer { consumer_id, currency })
    }

    async fn find_for_consumer(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<Option<ConsumerWallet>, ConsumerWalletError> {
        let row: Option<WalletRow> = sqlx::query_as(&format!(
            "{WALLET_SELECT}
             WHERE w.consumer_id = $1 AND w.currency = $2 AND w.status != 'CLOSED'
             LIMIT 1"
        ))
        .bind(consumer_id.as_uuid())
        .bind(currency.code())
        .fetch_optional(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?;

        row.map(wallet_from_row).transpose()
    }

    async fn find_by_handle(
        &self,
        handle: &str,
    ) -> Result<Option<ConsumerWallet>, ConsumerWalletError> {
        let row: Option<WalletRow> = sqlx::query_as(&format!(
            "{WALLET_SELECT} WHERE c.handle = $1 LIMIT 1"
        ))
        .bind(handle)
        .fetch_optional(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?;

        row.map(wallet_from_row).transpose()
    }

    async fn find_by_handle_for_routing(
        &self,
        handle:   &str,
        currency: Currency,
    ) -> Result<Option<RoutingLookup>, ConsumerWalletError> {
        let row: Option<RoutingRow> = sqlx::query_as(
            "SELECT w.id, w.consumer_id, w.currency, w.status,
                    w.available_account_id, w.reserved_account_id,
                    w.kyc_status, w.pin_hash, w.failed_pin_attempts, w.locked_at,
                    w.created_at, w.updated_at, w.activated_at, w.closed_at,
                    c.phone_number, c.handle AS banza_handle,
                    c.status AS consumer_status, c.display_name
             FROM   consumer_wallets w
             JOIN   consumers        c ON c.id = w.consumer_id
             WHERE  c.handle = $1
               AND  w.currency = $2
               AND  w.status != 'CLOSED'
             ORDER BY w.created_at ASC
             LIMIT 1",
        )
        .bind(handle)
        .bind(currency.code())
        .fetch_optional(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?;

        row.map(routing_lookup_from_row).transpose()
    }

    async fn find_by_phone(
        &self,
        phone_number: &str,
    ) -> Result<Option<ConsumerWallet>, ConsumerWalletError> {
        let row: Option<WalletRow> = sqlx::query_as(&format!(
            "{WALLET_SELECT} WHERE c.phone_number = $1 LIMIT 1"
        ))
        .bind(phone_number)
        .fetch_optional(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?;

        row.map(wallet_from_row).transpose()
    }

    async fn activate(
        &self,
        completed: CompletedOnboarding,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        let mut tx: Transaction<'_, Postgres> = self
            .pool
            .begin()
            .await
            .map_err(ConsumerWalletError::Database)?;

        // 1. Create consumer identity row.
        let consumer_id: Uuid = sqlx::query_scalar(
            "INSERT INTO consumers (handle, phone_number, status, created_at, updated_at)
             VALUES ($1, $2, 'ACTIVE', now(), now())
             RETURNING id",
        )
        .bind(&completed.banza_handle)
        .bind(&completed.phone_number)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| {
            if is_unique_violation(&e) {
                ConsumerWalletError::HandleTaken(completed.banza_handle.clone())
            } else {
                ConsumerWalletError::Database(e)
            }
        })?;

        // 2. Create wallet row.
        let wallet_id = Uuid::new_v4();
        let now       = Utc::now();
        sqlx::query(
            "INSERT INTO consumer_wallets
             (id, consumer_id, currency, status,
              available_account_id, reserved_account_id,
              kyc_status, pin_hash, failed_pin_attempts,
              created_at, updated_at, activated_at)
             VALUES ($1,$2,$3,'ACTIVE',$4,$5,'NONE',$6,0,$7,$7,$7)",
        )
        .bind(wallet_id)
        .bind(consumer_id)
        .bind(completed.currency.code())
        .bind(completed.available_account_id.as_uuid())
        .bind(completed.reserved_account_id.as_uuid())
        .bind(&completed.pin_hash)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(ConsumerWalletError::Database)?;

        // 3. Delete the onboarding session.
        sqlx::query("DELETE FROM consumer_onboarding WHERE id = $1")
            .bind(completed.session_id)
            .execute(&mut *tx)
            .await
            .map_err(ConsumerWalletError::Database)?;

        tx.commit().await.map_err(ConsumerWalletError::Database)?;

        tracing::info!(
            wallet_id   = %wallet_id,
            consumer_id = %consumer_id,
            handle      = %completed.banza_handle,
            "consumer wallet activated"
        );

        Ok(ConsumerWallet {
            id:                   ConsumerWalletId::from_uuid(wallet_id),
            consumer_id:          ConsumerId::from_uuid(consumer_id),
            phone_number:         completed.phone_number,
            banza_handle:         Some(completed.banza_handle),
            status:               ConsumerWalletStatus::Active,
            currency:             completed.currency,
            available_account_id: Some(completed.available_account_id),
            reserved_account_id:  Some(completed.reserved_account_id),
            kyc_status:           KycStatus::None,
            pin_hash:             Some(completed.pin_hash),
            failed_pin_attempts:  0,
            locked_at:            None,
            activated_at:         Some(now),
            closed_at:            None,
            created_at:           now,
            updated_at:           now,
        })
    }

    async fn increment_pin_failures(
        &self,
        id: ConsumerWalletId,
    ) -> Result<i32, ConsumerWalletError> {
        let count: i32 = sqlx::query_scalar(
            "UPDATE consumer_wallets
             SET failed_pin_attempts = failed_pin_attempts + 1,
                 updated_at          = now()
             WHERE id = $1
             RETURNING failed_pin_attempts",
        )
        .bind(id.as_uuid())
        .fetch_optional(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?
        .ok_or(ConsumerWalletError::NotFound(id))?;

        Ok(count)
    }

    async fn reset_pin_failures(
        &self,
        id: ConsumerWalletId,
    ) -> Result<(), ConsumerWalletError> {
        sqlx::query(
            "UPDATE consumer_wallets
             SET failed_pin_attempts = 0,
                 updated_at          = now()
             WHERE id = $1",
        )
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?;
        Ok(())
    }

    async fn lock_wallet(&self, id: ConsumerWalletId) -> Result<(), ConsumerWalletError> {
        let rows = sqlx::query(
            "UPDATE consumer_wallets
             SET status    = 'LOCKED',
                 locked_at = now(),
                 updated_at = now()
             WHERE id = $1 AND status = 'ACTIVE'",
        )
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?
        .rows_affected();

        if rows == 0 {
            return Err(ConsumerWalletError::NotActive(id));
        }
        tracing::warn!(wallet_id = %id, "wallet locked after PIN failures");
        Ok(())
    }

    async fn unlock_wallet(&self, id: ConsumerWalletId) -> Result<(), ConsumerWalletError> {
        let rows = sqlx::query(
            "UPDATE consumer_wallets
             SET status              = 'ACTIVE',
                 locked_at           = NULL,
                 failed_pin_attempts = 0,
                 updated_at          = now()
             WHERE id = $1 AND status = 'LOCKED'",
        )
        .bind(id.as_uuid())
        .execute(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?
        .rows_affected();

        if rows == 0 {
            return Err(ConsumerWalletError::NotFound(id));
        }
        tracing::info!(wallet_id = %id, "wallet unlocked");
        Ok(())
    }

    async fn update_status(
        &self,
        id:         ConsumerWalletId,
        new_status: ConsumerWalletStatus,
        closed_at:  Option<DateTime<Utc>>,
    ) -> Result<(), ConsumerWalletError> {
        sqlx::query(
            "UPDATE consumer_wallets
             SET status     = $2,
                 closed_at  = $3,
                 updated_at = now()
             WHERE id = $1",
        )
        .bind(id.as_uuid())
        .bind(new_status.as_str())
        .bind(closed_at)
        .execute(&self.pool)
        .await
        .map_err(ConsumerWalletError::Database)?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Row → domain conversions
// ---------------------------------------------------------------------------

fn onboarding_from_row(row: OnboardingRow) -> Result<OnboardingSession, ConsumerWalletError> {
    let currency = Currency::from_code(&row.currency)
        .ok_or_else(|| ConsumerWalletError::UnknownCurrency(row.currency.clone()))?;
    let status = OnboardingStatus::try_from_str(&row.status)
        .ok_or_else(|| ConsumerWalletError::UnknownStatus(row.status.clone()))?;

    Ok(OnboardingSession {
        id:           row.id,
        phone_number: row.phone_number,
        otp_code_hash:   row.otp_code_hash,
        otp_expires_at:  row.otp_expires_at,
        desired_handle:  row.desired_handle,
        currency,
        status,
        provisional_available_account_id: row.provisional_available_account_id.map(AccountId::from_uuid),
        provisional_reserved_account_id:  row.provisional_reserved_account_id.map(AccountId::from_uuid),
        created_at:  row.created_at,
        expires_at:  row.expires_at,
    })
}

fn wallet_from_row(row: WalletRow) -> Result<ConsumerWallet, ConsumerWalletError> {
    let currency = Currency::from_code(&row.currency)
        .ok_or_else(|| ConsumerWalletError::UnknownCurrency(row.currency.clone()))?;
    let status = ConsumerWalletStatus::try_from_str(&row.status)
        .ok_or_else(|| ConsumerWalletError::UnknownStatus(row.status.clone()))?;
    let kyc_status = KycStatus::try_from_str(&row.kyc_status)
        .ok_or_else(|| ConsumerWalletError::UnknownKycStatus(row.kyc_status.clone()))?;

    Ok(ConsumerWallet {
        id:                   ConsumerWalletId::from_uuid(row.id),
        consumer_id:          ConsumerId::from_uuid(row.consumer_id),
        phone_number:         row.phone_number.unwrap_or_default(),
        banza_handle:         Some(row.banza_handle),
        status,
        currency,
        available_account_id: Some(AccountId::from_uuid(row.available_account_id)),
        reserved_account_id:  Some(AccountId::from_uuid(row.reserved_account_id)),
        kyc_status,
        pin_hash:             row.pin_hash,
        failed_pin_attempts:  row.failed_pin_attempts,
        locked_at:            row.locked_at,
        activated_at:         row.activated_at,
        closed_at:            row.closed_at,
        created_at:           row.created_at,
        updated_at:           row.updated_at,
    })
}

fn routing_lookup_from_row(row: RoutingRow) -> Result<RoutingLookup, ConsumerWalletError> {
    let consumer_status = ConsumerStatus::try_from_str(&row.consumer_status)
        .ok_or_else(|| ConsumerWalletError::UnknownStatus(row.consumer_status.clone()))?;

    let currency = Currency::from_code(&row.currency)
        .ok_or_else(|| ConsumerWalletError::UnknownCurrency(row.currency.clone()))?;
    let status = ConsumerWalletStatus::try_from_str(&row.status)
        .ok_or_else(|| ConsumerWalletError::UnknownStatus(row.status.clone()))?;
    let kyc_status = KycStatus::try_from_str(&row.kyc_status)
        .ok_or_else(|| ConsumerWalletError::UnknownKycStatus(row.kyc_status.clone()))?;

    let wallet = ConsumerWallet {
        id:                   ConsumerWalletId::from_uuid(row.id),
        consumer_id:          ConsumerId::from_uuid(row.consumer_id),
        phone_number:         row.phone_number.unwrap_or_default(),
        banza_handle:         Some(row.banza_handle),
        status,
        currency,
        available_account_id: Some(AccountId::from_uuid(row.available_account_id)),
        reserved_account_id:  Some(AccountId::from_uuid(row.reserved_account_id)),
        kyc_status,
        pin_hash:             row.pin_hash,
        failed_pin_attempts:  row.failed_pin_attempts,
        locked_at:            row.locked_at,
        activated_at:         row.activated_at,
        closed_at:            row.closed_at,
        created_at:           row.created_at,
        updated_at:           row.updated_at,
    };

    Ok(RoutingLookup { wallet, consumer_status, display_name: row.display_name })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn is_unique_violation(e: &sqlx::Error) -> bool {
    if let sqlx::Error::Database(db) = e {
        db.code().as_deref() == Some("23505") // PostgreSQL unique_violation
    } else {
        false
    }
}
