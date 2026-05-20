use std::sync::Arc;

use chrono::Utc;

use banzami_ledger::{Account, AccountType, LedgerEngine};
use banzami_types::{ConsumerId, ConsumerWalletId, Currency};

use crate::{
    repository::ConsumerWalletRepository,
    wallet::{
        ChangePinRequest, CompleteOnboardingRequest, ConsumerWallet, ConsumerWalletBalance,
        ConsumerWalletStatus, CreateConsumerWalletRequest, KycStatus, StartOnboardingRequest,
        VerifyOtpRequest, VerifyPinRequest,
    },
    ConsumerWalletError,
};

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

/// High-level operations on consumer wallets.
///
/// Balances are always derived from the ledger — never from stored columns.
/// All money movement happens through balanced ledger postings. (CLAUDE.md §2.1)
/// Lifecycle transitions are enforced by this engine per ADR-017.
#[allow(async_fn_in_trait)]
pub trait ConsumerWalletEngine: Send + Sync {
    // ── Onboarding flow (ADR-017 §1) ──────────────────────────────────────

    /// Step 1: Submit phone number → create PENDING_OTP wallet, dispatch OTP.
    async fn start_onboarding(
        &self,
        req: StartOnboardingRequest,
    ) -> Result<ConsumerWallet, ConsumerWalletError>;

    /// Step 2: Verify OTP → PENDING_PIN, provision ledger accounts.
    async fn verify_otp(
        &self,
        req: VerifyOtpRequest,
    ) -> Result<ConsumerWallet, ConsumerWalletError>;

    /// Step 3: Choose handle + set PIN → ACTIVE.
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

    // ── Legacy ─────────────────────────────────────────────────────────────

    /// Direct wallet creation for internal/test use only.
    /// Production onboarding uses `start_onboarding` → `verify_otp` → `complete_onboarding`.
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

pub struct PostgresConsumerWalletEngine<L: LedgerEngine, R: ConsumerWalletRepository> {
    ledger: Arc<L>,
    repo:   R,
}

impl<L: LedgerEngine, R: ConsumerWalletRepository> PostgresConsumerWalletEngine<L, R> {
    pub fn new(ledger: Arc<L>, repo: R) -> Self {
        Self { ledger, repo }
    }

    async fn provision_ledger_accounts(
        &self,
        consumer_id: ConsumerId,
        currency: Currency,
    ) -> Result<(banzami_types::AccountId, banzami_types::AccountId), ConsumerWalletError> {
        let available = self
            .ledger
            .create_account(Account::new(
                AccountType::Liability,
                format!("Consumer {} — {} Available", consumer_id, currency.code()),
                currency,
            ))
            .await
            .map_err(ConsumerWalletError::Ledger)?;

        let reserved = self
            .ledger
            .create_account(Account::new(
                AccountType::Liability,
                format!("Consumer {} — {} Reserved", consumer_id, currency.code()),
                currency,
            ))
            .await
            .map_err(ConsumerWalletError::Ledger)?;

        Ok((available.id, reserved.id))
    }
}

impl<L: LedgerEngine + 'static, R: ConsumerWalletRepository> ConsumerWalletEngine
    for PostgresConsumerWalletEngine<L, R>
{
    // ── Onboarding ─────────────────────────────────────────────────────────

    async fn start_onboarding(
        &self,
        req: StartOnboardingRequest,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        // PENDING_OTP: no ledger accounts yet.
        let now = Utc::now();
        let wallet = ConsumerWallet {
            id:                   ConsumerWalletId::new(),
            consumer_id:          ConsumerId::new(), // identity created upstream
            phone_number:         req.phone_number,
            banza_handle:         None,
            status:               ConsumerWalletStatus::PendingOtp,
            currency:             req.currency,
            available_account_id: None,
            reserved_account_id:  None,
            kyc_status:           KycStatus::None,
            pin_hash:             None,
            failed_pin_attempts:  0,
            locked_at:            None,
            created_at:           now,
            updated_at:           now,
        };
        self.repo.create(wallet).await
    }

    async fn verify_otp(
        &self,
        req: VerifyOtpRequest,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        let mut wallet = self.repo.get(req.wallet_id).await?;

        if wallet.status != ConsumerWalletStatus::PendingOtp {
            return Err(ConsumerWalletError::InvalidStatusTransition {
                from: wallet.status,
                to:   ConsumerWalletStatus::PendingPin,
            });
        }

        // OTP verification logic: compare req.otp_code against stored hash.
        // Stubbed here — implementation detail of the onboarding service.
        let _ = req.otp_code;

        // Provision ledger accounts now that identity is verified.
        let (avail_id, res_id) = self
            .provision_ledger_accounts(wallet.consumer_id, wallet.currency)
            .await?;

        wallet.status               = ConsumerWalletStatus::PendingPin;
        wallet.available_account_id = Some(avail_id);
        wallet.reserved_account_id  = Some(res_id);
        wallet.updated_at           = Utc::now();

        self.repo.update(wallet).await
    }

    async fn complete_onboarding(
        &self,
        req: CompleteOnboardingRequest,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        let mut wallet = self.repo.get(req.wallet_id).await?;

        if wallet.status != ConsumerWalletStatus::PendingPin {
            return Err(ConsumerWalletError::InvalidStatusTransition {
                from: wallet.status,
                to:   ConsumerWalletStatus::Active,
            });
        }

        // Validate handle format: ^[a-z][a-z0-9_]{2,19}$
        validate_handle_format(&req.banza_handle)
            .map_err(ConsumerWalletError::InvalidHandle)?;

        // Hash PIN with Argon2id (stubbed — full implementation in onboarding service).
        // Plaintext PIN must never be stored. The hash replaces the PIN immediately.
        let pin_hash = argon2id_hash_stub(&req.pin);

        wallet.status        = ConsumerWalletStatus::Active;
        wallet.banza_handle  = Some(req.banza_handle);
        wallet.pin_hash      = Some(pin_hash);
        wallet.updated_at    = Utc::now();

        self.repo.update(wallet).await
    }

    // ── PIN operations ─────────────────────────────────────────────────────

    async fn verify_pin(
        &self,
        req: VerifyPinRequest,
    ) -> Result<(), ConsumerWalletError> {
        let mut wallet = self.repo.get(req.wallet_id).await?;

        if wallet.status == ConsumerWalletStatus::Locked {
            return Err(ConsumerWalletError::WalletLocked(wallet.id));
        }
        if wallet.status != ConsumerWalletStatus::Active {
            return Err(ConsumerWalletError::NotActive(wallet.id));
        }

        let hash = wallet.pin_hash.as_ref()
            .ok_or(ConsumerWalletError::PinNotSet(wallet.id))?;

        let ok = argon2id_verify_stub(&req.pin, hash);

        if ok {
            if wallet.failed_pin_attempts > 0 {
                wallet.failed_pin_attempts = 0;
                wallet.updated_at          = Utc::now();
                self.repo.update(wallet).await?;
            }
            return Ok(());
        }

        // Failed attempt.
        wallet.failed_pin_attempts += 1;
        wallet.updated_at           = Utc::now();
        if wallet.failed_pin_attempts >= 5 {
            wallet.status    = ConsumerWalletStatus::Locked;
            wallet.locked_at = Some(Utc::now());
        }
        self.repo.update(wallet).await?;

        Err(ConsumerWalletError::PinInvalid)
    }

    async fn change_pin(
        &self,
        req: ChangePinRequest,
    ) -> Result<(), ConsumerWalletError> {
        // Verify current PIN first.
        self.verify_pin(VerifyPinRequest {
            wallet_id: req.wallet_id,
            pin:       req.current_pin,
        })
        .await?;

        let mut wallet     = self.repo.get(req.wallet_id).await?;
        wallet.pin_hash    = Some(argon2id_hash_stub(&req.new_pin));
        wallet.updated_at  = Utc::now();
        self.repo.update(wallet).await?;
        Ok(())
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    async fn get(
        &self,
        wallet_id: ConsumerWalletId,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        self.repo.get(wallet_id).await
    }

    async fn get_for_consumer(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        self.repo.get_for_consumer(consumer_id, currency).await
    }

    async fn balance(
        &self,
        wallet_id: ConsumerWalletId,
    ) -> Result<ConsumerWalletBalance, ConsumerWalletError> {
        let wallet = self.repo.get(wallet_id).await?;

        let avail_id = wallet.available_account_id
            .ok_or(ConsumerWalletError::NotActive(wallet.id))?;
        let res_id = wallet.reserved_account_id
            .ok_or(ConsumerWalletError::NotActive(wallet.id))?;

        // LIABILITY accounts: ledger balance is negative when funds are held.
        // Negate to get the consumer-facing positive balance.
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

    // ── Legacy ─────────────────────────────────────────────────────────────

    async fn create(
        &self,
        req: CreateConsumerWalletRequest,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        let (avail_id, res_id) = self
            .provision_ledger_accounts(req.consumer_id, req.currency)
            .await?;

        let now = Utc::now();
        self.repo
            .create(ConsumerWallet {
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
                created_at:           now,
                updated_at:           now,
            })
            .await
    }

    async fn get_or_create(
        &self,
        consumer_id: ConsumerId,
        currency:    Currency,
    ) -> Result<ConsumerWallet, ConsumerWalletError> {
        if let Some(wallet) = self.repo.find_for_consumer(consumer_id, currency).await? {
            return Ok(wallet);
        }
        self.create(CreateConsumerWalletRequest { consumer_id, currency }).await
    }
}

// ---------------------------------------------------------------------------
// Handle validation (mirrors core/identity::validate_handle — ADR-017 §6)
// ---------------------------------------------------------------------------

fn validate_handle_format(handle: &str) -> Result<(), &'static str> {
    let h = handle.trim();
    if h.len() < 3 || h.len() > 20 {
        return Err("handle must be 3–20 characters");
    }
    let mut chars = h.chars();
    let first = chars.next().unwrap();
    if !first.is_ascii_lowercase() {
        return Err("handle must start with a lowercase letter");
    }
    for c in chars {
        if !matches!(c, 'a'..='z' | '0'..='9' | '_') {
            return Err("handle may only contain lowercase letters, digits, and underscores");
        }
    }
    if h.contains("__") {
        return Err("handle may not contain consecutive underscores");
    }
    if h.ends_with('_') {
        return Err("handle may not end with an underscore");
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Stub helpers (replace with real argon2 crate calls in production)
// ---------------------------------------------------------------------------

fn argon2id_hash_stub(pin: &str) -> String {
    // Placeholder: real implementation uses the `argon2` crate with ADR-017 params.
    // m=65536, t=3, p=4, salt=random 16 bytes.
    format!("$argon2id$v=19$m=65536,t=3,p=4$STUB${}", pin.len())
}

fn argon2id_verify_stub(pin: &str, hash: &str) -> bool {
    // Placeholder: real implementation uses argon2::verify_encoded.
    hash.ends_with(&format!("${}", pin.len()))
}

// ---------------------------------------------------------------------------
// Tests — financial invariant tests (CLAUDE.md §8.2)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use banzami_ledger::{Account, AccountType, LedgerEngine, LedgerEntry, LedgerPosting};
    use banzami_types::{AccountId, ConsumerId, ConsumerWalletId, Currency, Money};

    use super::*;
    use crate::{ConsumerWallet, ConsumerWalletError, ConsumerWalletStatus};

    // -----------------------------------------------------------------------
    // Minimal mock ledger
    // -----------------------------------------------------------------------

    struct MockLedger {
        accounts: Mutex<Vec<Account>>,
        entries:  Mutex<Vec<LedgerEntry>>,
    }

    impl MockLedger {
        fn new() -> Self {
            Self {
                accounts: Mutex::new(vec![]),
                entries:  Mutex::new(vec![]),
            }
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

    // -----------------------------------------------------------------------
    // Minimal mock repository
    // -----------------------------------------------------------------------

    struct MockRepo {
        wallets: Mutex<Vec<ConsumerWallet>>,
    }

    impl MockRepo {
        fn new() -> Self {
            Self { wallets: Mutex::new(vec![]) }
        }
    }

    impl ConsumerWalletRepository for MockRepo {
        async fn create(
            &self,
            wallet: ConsumerWallet,
        ) -> Result<ConsumerWallet, ConsumerWalletError> {
            self.wallets.lock().unwrap().push(wallet.clone());
            Ok(wallet)
        }

        async fn update(
            &self,
            wallet: ConsumerWallet,
        ) -> Result<ConsumerWallet, ConsumerWalletError> {
            let mut wallets = self.wallets.lock().unwrap();
            if let Some(w) = wallets.iter_mut().find(|w| w.id == wallet.id) {
                *w = wallet.clone();
                Ok(wallet)
            } else {
                Err(ConsumerWalletError::NotFound(wallet.id))
            }
        }

        async fn get(
            &self,
            id: ConsumerWalletId,
        ) -> Result<ConsumerWallet, ConsumerWalletError> {
            self.wallets
                .lock()
                .unwrap()
                .iter()
                .find(|w| w.id == id)
                .cloned()
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
            Ok(self
                .wallets
                .lock()
                .unwrap()
                .iter()
                .find(|w| {
                    w.consumer_id == consumer_id
                        && w.currency == currency
                        && w.status != ConsumerWalletStatus::Closed
                })
                .cloned())
        }

        async fn find_by_handle(
            &self,
            handle: &str,
        ) -> Result<Option<ConsumerWallet>, ConsumerWalletError> {
            Ok(self
                .wallets
                .lock()
                .unwrap()
                .iter()
                .find(|w| w.banza_handle.as_deref() == Some(handle))
                .cloned())
        }
    }

    fn make_engine() -> PostgresConsumerWalletEngine<MockLedger, MockRepo> {
        PostgresConsumerWalletEngine::new(Arc::new(MockLedger::new()), MockRepo::new())
    }

    // ── INV-WALLET-001: No negative available balance ─────────────────────

    #[tokio::test]
    async fn fresh_wallet_has_zero_balance() {
        let eng = make_engine();
        let wallet = eng
            .create(CreateConsumerWalletRequest {
                consumer_id: ConsumerId::new(),
                currency:    Currency::AOA,
            })
            .await
            .unwrap();

        let balance = eng.balance(wallet.id).await.unwrap();
        assert!(balance.available.is_zero());
        assert!(balance.reserved.is_zero());
        assert!(balance.total.is_zero());
    }

    // ── INV-WALLET-004: Wallet-owner uniqueness ────────────────────────────

    #[tokio::test]
    async fn get_or_create_returns_existing_wallet() {
        let eng    = make_engine();
        let cid    = ConsumerId::new();
        let first  = eng.get_or_create(cid, Currency::AOA).await.unwrap();
        let second = eng.get_or_create(cid, Currency::AOA).await.unwrap();
        assert_eq!(first.id, second.id, "get_or_create must not create duplicates");
    }

    // ── INV-WALLET-006: Lifecycle state machine ────────────────────────────

    #[tokio::test]
    async fn active_wallet_locks_after_five_failed_pins() {
        let eng = make_engine();
        let wallet = eng
            .create(CreateConsumerWalletRequest {
                consumer_id: ConsumerId::new(),
                currency:    Currency::AOA,
            })
            .await
            .unwrap();
        let wallet_id = wallet.id;

        // Set a PIN directly on the wallet via the engine.
        let mut w = eng.get(wallet_id).await.unwrap();
        w.pin_hash    = Some(argon2id_hash_stub("1234"));
        w.updated_at  = chrono::Utc::now();
        eng.repo.update(w).await.unwrap();

        for _ in 0..4 {
            let _ = eng.verify_pin(VerifyPinRequest { wallet_id, pin: "wrong".into() }).await;
        }
        let w = eng.get(wallet_id).await.unwrap();
        assert_eq!(w.status, ConsumerWalletStatus::Active, "still active after 4 failures");

        let _ = eng.verify_pin(VerifyPinRequest { wallet_id, pin: "wrong".into() }).await;
        let w = eng.get(wallet_id).await.unwrap();
        assert_eq!(w.status, ConsumerWalletStatus::Locked, "locked after 5 failures");
    }
}
