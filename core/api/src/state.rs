use std::sync::Arc;

use sqlx::PgPool;

use banzami_types::AccountId;

// ---------------------------------------------------------------------------
// Runtime environment
//
// This was a second, independent definition of the same idea: its own enum, its
// own reading of ENVIRONMENT, its own as_str(). It happened to agree with the
// canonical one — but "happened to agree" is not a property, and the environment
// column is a filter on proof lookup, payment listing and KYC, so two answers
// that drift by one letter are two universes that cannot see each other.
//
// There is now exactly one definition, in the shared types crate, and this name
// is kept as an alias so the ~40 existing call sites keep reading naturally.
// ---------------------------------------------------------------------------

pub type CoreEnvironment = banzami_types::Environment;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::CoreEnvironment;

    // These tests share one process-wide variable. Run in parallel, one set
    // ENVIRONMENT=sandbox while another asserted it was unset, and the suite
    // failed at random.
    static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn sandbox_env_var_accepted() {
        let _env = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // Temporarily set ENVIRONMENT=SANDBOX, then restore
        std::env::set_var("ENVIRONMENT", "SANDBOX");
        assert!(!CoreEnvironment::from_env().is_live());
        std::env::remove_var("ENVIRONMENT");
    }

    #[test]
    fn sandbox_case_insensitive() {
        let _env = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var("ENVIRONMENT", "sandbox");
        assert!(!CoreEnvironment::from_env().is_live());
        std::env::remove_var("ENVIRONMENT");
    }

    #[test]
    fn unknown_env_defaults_to_live() {
        let _env = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var("ENVIRONMENT", "UNKNOWN_VALUE");
        assert!(CoreEnvironment::from_env().is_live());
        std::env::remove_var("ENVIRONMENT");
    }

    #[test]
    fn missing_env_defaults_to_live() {
        let _env = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::remove_var("ENVIRONMENT");
        assert!(CoreEnvironment::from_env().is_live());
    }

    #[test]
    fn live_variant_is_live() {
        assert!(CoreEnvironment::Live.is_live());
        assert!(!CoreEnvironment::Sandbox.is_live());
    }
}

use banzami_acquiring::{
    AcquirerKind, EMISProvider, PostgresAcquiringEngine, PostgresAcquiringRepository,
    SimulatedProvider,
};
use banzami_app_settlement::{
    PostgresApplicationSettlementEngine, PostgresApplicationSettlementRepository,
};
use banzami_collections::{PostgresCollectionEngine, PostgresCollectionRepository};
use banzami_compliance::{KycProviderKind, PostgresComplianceEngine, PostgresComplianceRepository};
use banzami_consumer_wallets::{
    PostgresConsumerWalletEngine, PostgresConsumerWalletRepository, PostgresOnboardingRepository,
};
use banzami_identity::{PostgresIdentityEngine, PostgresIdentityRepository};
use banzami_ledger::PostgresLedgerRepository;
use banzami_merchants::{
    PostgresApiKeyRepository, PostgresMerchantEngine, PostgresMerchantRepository,
};
use banzami_payment_links::{PostgresPaymentLinkEngine, PostgresPaymentLinkRepository};
use banzami_payouts::{PostgresPayoutEngine, PostgresPayoutRepository};
use banzami_pricing::PostgresPricingRuleProvider;
use banzami_pricing::{PostgresCatalogRepository, PostgresPricingRuleAdminRepository};
use banzami_qr::{PostgresQrEngine, PostgresQrRepository};
use banzami_reconciliation::{PostgresReconciliationRepository, StaticReconciliationEngine};
use banzami_risk::StaticRiskEngine;
use banzami_routing::StaticRoutingEngine;
use banzami_settlement::{PostgresSettlementEngine, PostgresSettlementRepository};
use banzami_transactions::{
    PostgresOperatorFeeReadRepository, PostgresTransactionEngine, PostgresTransactionRepository,
};
use banzami_transfers::{PostgresTransferEngine, PostgresTransferRepository};
use banzami_wallets::{PostgresWalletEngine, PostgresWalletRepository};

// ---------------------------------------------------------------------------
// Concrete engine types wired to PostgreSQL
// ---------------------------------------------------------------------------

pub type LedgerRepo = PostgresLedgerRepository;
pub type WalletEng = PostgresWalletEngine<LedgerRepo, PostgresWalletRepository>;
// Two parameters, not three. The transaction engine no longer takes a Pricing
// Engine provider: capture is not a fee-bearing operation, so it resolves
// nothing and the crate does not depend on banzami-pricing at all.
pub type TxEng = PostgresTransactionEngine<WalletEng, PostgresTransactionRepository>;
pub type MerchantEng = PostgresMerchantEngine<PostgresMerchantRepository, PostgresApiKeyRepository>;
pub type SettlementEng = PostgresSettlementEngine<LedgerRepo, PostgresSettlementRepository>;
pub type PayoutEng = PostgresPayoutEngine<
    PostgresWalletRepository,
    LedgerRepo,
    PostgresPayoutRepository,
    PostgresPricingRuleProvider,
>;
pub type ComplianceEng = PostgresComplianceEngine<PostgresComplianceRepository>;
pub type ReconEng = StaticReconciliationEngine<PostgresReconciliationRepository>;
pub type IdentityEng = PostgresIdentityEngine<PostgresIdentityRepository>;
pub type ConsumerWalletEng = PostgresConsumerWalletEngine<
    LedgerRepo,
    PostgresOnboardingRepository,
    PostgresConsumerWalletRepository,
>;
pub type TransferEng = PostgresTransferEngine<PostgresTransferRepository>;
pub type QrEng = PostgresQrEngine<PostgresQrRepository>;
pub type PaymentLinksEng = PostgresPaymentLinkEngine<PostgresPaymentLinkRepository>;
pub type AcquiringEng = PostgresAcquiringEngine;
pub type CollectionsEng = PostgresCollectionEngine<PostgresCollectionRepository>;
pub type AppSettlementEng = PostgresApplicationSettlementEngine<
    PostgresLedgerRepository,
    PostgresPricingRuleProvider,
    PostgresApplicationSettlementRepository,
>;

// ---------------------------------------------------------------------------
// Shared application state — cloned into every handler via axum State extractor
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct AppState {
    #[allow(dead_code)]
    pub pool: PgPool,
    pub transit_account_id: AccountId,
    pub environment: CoreEnvironment,
    pub wallet: Arc<WalletEng>,
    pub tx_engine: Arc<TxEng>,
    pub merchant: Arc<MerchantEng>,
    pub settlement: Arc<SettlementEng>,
    pub payout: Arc<PayoutEng>,
    pub compliance: Arc<ComplianceEng>,
    pub kyc_provider: Arc<KycProviderKind>,
    pub reconciliation: Arc<ReconEng>,
    #[allow(dead_code)]
    pub routing: Arc<StaticRoutingEngine>,
    #[allow(dead_code)]
    pub risk: Arc<StaticRiskEngine>,
    pub identity: Arc<IdentityEng>,
    pub consumer_wallet: Arc<ConsumerWalletEng>,
    pub transfer: Arc<TransferEng>,
    pub qr: Arc<QrEng>,
    pub payment_links: Arc<PaymentLinksEng>,
    pub acquiring: Arc<AcquiringEng>,
    pub collections: Arc<CollectionsEng>,
    pub app_settlement: Arc<AppSettlementEng>,
    pub pricing_admin: Arc<PostgresPricingRuleAdminRepository>,
    pub operator_fee_read: Arc<PostgresOperatorFeeReadRepository>,
    pub catalog: Arc<PostgresCatalogRepository>,
}

impl AppState {
    pub fn new(
        pool: PgPool,
        transit_account_id: AccountId,
        bank_account_id: AccountId,
        operator_fee_account_id: AccountId,
        environment: CoreEnvironment,
    ) -> Self {
        // --- Wallet engine (for wallet routes) ---
        let wallet_ledger = PostgresLedgerRepository::new(pool.clone());
        let wallet_repo = PostgresWalletRepository::new(pool.clone());
        let wallet = Arc::new(PostgresWalletEngine::new(
            Arc::new(wallet_ledger),
            wallet_repo,
        ));

        // --- Wallet engine (for transaction engine — separate instance, same DB) ---
        let tx_wallet_ledger = PostgresLedgerRepository::new(pool.clone());
        let tx_wallet_repo = PostgresWalletRepository::new(pool.clone());
        let tx_wallet_engine =
            PostgresWalletEngine::new(Arc::new(tx_wallet_ledger), tx_wallet_repo);

        // --- Transaction engine ---
        // No Pricing Engine here.
        //
        // This comment used to say the Pricing Engine "resolves the per-payment
        // operator fee at capture; it is the only place fees are computed".
        // Neither half survives: a payment credits the merchant wallet GROSS,
        // and fees are computed at settlement and payout, which are the two
        // fee-bearing operations under the confirmed economic model.
        let tx_repo = PostgresTransactionRepository::new(pool.clone());
        let tx_engine = Arc::new(PostgresTransactionEngine::new(
            Arc::new(tx_wallet_engine),
            tx_repo,
            transit_account_id,
        ));

        // --- Merchant engine ---
        let merchant_repo = PostgresMerchantRepository::new(pool.clone());
        let api_key_repo = PostgresApiKeyRepository::new(pool.clone());
        let merchant = Arc::new(PostgresMerchantEngine::new(merchant_repo, api_key_repo));

        // --- Settlement engine ---
        let settlement_ledger = PostgresLedgerRepository::new(pool.clone());
        let settlement_repo = PostgresSettlementRepository::new(pool.clone());
        let settlement = Arc::new(PostgresSettlementEngine::new(
            Arc::new(settlement_ledger),
            settlement_repo,
            bank_account_id,
            transit_account_id,
        ));

        // --- Payout engine ---
        let payout_wallet_repo = PostgresWalletRepository::new(pool.clone());
        let payout_ledger = PostgresLedgerRepository::new(pool.clone());
        let payout_repo = PostgresPayoutRepository::new(pool.clone());
        let payout = Arc::new(PostgresPayoutEngine::new(
            payout_wallet_repo,
            Arc::new(payout_ledger),
            payout_repo,
            bank_account_id,
            Arc::new(PostgresPricingRuleProvider::new(pool.clone())),
            operator_fee_account_id,
            environment.as_str(),
        ));

        // --- Compliance engine ---
        let compliance_repo = PostgresComplianceRepository::new(pool.clone());
        let compliance = Arc::new(PostgresComplianceEngine::new(compliance_repo));

        // --- KYC/KYB identity-verification provider ---
        // Selected by KYC_PROVIDER env var (default: SIMULATED).
        // For production, set KYC_PROVIDER=EXTERNAL and the KYC_* env vars.
        let kyc_provider = Arc::new(KycProviderKind::from_env());

        // --- Reconciliation engine ---
        let recon_repo = PostgresReconciliationRepository::new(pool.clone());
        let reconciliation = Arc::new(StaticReconciliationEngine::new(recon_repo));

        // --- Routing + Risk ---
        let routing = Arc::new(StaticRoutingEngine::angola_defaults());
        let risk = Arc::new(StaticRiskEngine::conservative());

        // --- Identity engine ---
        let identity_repo = PostgresIdentityRepository::new(pool.clone());
        let identity = Arc::new(PostgresIdentityEngine::new(identity_repo));

        // --- Consumer wallet engine ---
        let cw_ledger = PostgresLedgerRepository::new(pool.clone());
        let cw_onboard_repo = PostgresOnboardingRepository::new(pool.clone());
        let cw_repo = PostgresConsumerWalletRepository::new(pool.clone());
        let consumer_wallet = Arc::new(PostgresConsumerWalletEngine::with_pool(
            pool.clone(),
            Arc::new(cw_ledger),
            cw_onboard_repo,
            cw_repo,
        ));

        // --- Transfer engine ---
        let transfer_repo = PostgresTransferRepository::new(pool.clone());
        let transfer = Arc::new(PostgresTransferEngine::new(pool.clone(), transfer_repo));

        // --- QR engine ---
        // LIVE: configured, or the process does not start — a default in the
        // source is a key everyone has. Non-LIVE keeps its stable development
        // key: a dynamic QR is verified against its DATABASE record (owner,
        // amount, currency, expiry), so a payload signed with a known key can
        // only pay an existing QR its real amount to its real owner, and
        // changing the key would void every unexpired Sandbox QR (111 today).
        let qr_signing_key =
            qr_signing_key(std::env::var("QR_SIGNING_KEY").ok(), environment.is_live());
        let qr_repo = PostgresQrRepository::new(pool.clone());
        let qr = Arc::new(PostgresQrEngine::new(qr_repo, qr_signing_key));

        // --- Payment links engine ---
        let pl_repo = PostgresPaymentLinkRepository::new(pool.clone());
        let payment_links = Arc::new(PostgresPaymentLinkEngine::new(pl_repo));

        // --- Acquiring engine ---
        // Selects provider based on ACQUIRING_PROVIDER env var (default: SIMULATED).
        // For production, set ACQUIRING_PROVIDER=EMIS and the EMIS_* env vars.
        // The acquiring callback secret. It defaulted to the public string
        // "change-in-production", and the Sandbox never set it: anyone could
        // sign a callback to the public POST /v1/callbacks/emis and confirm any
        // pending payment — crediting the merchant, marking the link paid and
        // emitting payment_link.paid to its integration.
        //
        // LIVE: configured, or the process does not start. Non-LIVE without
        // one: a random secret for this process. The simulated rail signs and
        // verifies its callbacks inside core, in one request (test_confirm), so
        // nothing outside ever needs it — and nothing outside can forge it.
        let webhook_secret = acquiring_callback_secret(
            std::env::var("ACQUIRING_WEBHOOK_SECRET").ok(),
            environment.is_live(),
        );
        let provider = match std::env::var("ACQUIRING_PROVIDER").as_deref() {
            Ok("EMIS") => AcquirerKind::Emis(
                EMISProvider::from_env()
                    .expect("ACQUIRING_PROVIDER=EMIS but EMIS_* env vars are missing"),
            ),
            _ => AcquirerKind::Simulated(SimulatedProvider::new(webhook_secret)),
        };
        let acquiring_repo = PostgresAcquiringRepository::new(pool.clone());
        let acquiring = Arc::new(PostgresAcquiringEngine::new(provider, acquiring_repo));

        // --- Collections engine (BANZA ADR-036/037) ---
        let collections_repo = PostgresCollectionRepository::new(pool.clone());
        let collections = Arc::new(PostgresCollectionEngine::new(collections_repo));

        // --- Application Settlement engine (Banzami ADR-021 / BANZA ADR-039) ---
        // Deferred app->beneficiary settlement; the application fee is resolved by
        // the same Pricing Engine. Operator-internal surface only.
        let app_settlement = Arc::new(PostgresApplicationSettlementEngine::new(
            Arc::new(PostgresLedgerRepository::new(pool.clone())),
            Arc::new(PostgresPricingRuleProvider::new(pool.clone())),
            PostgresApplicationSettlementRepository::new(pool.clone()),
            environment.as_str(),
        ));

        // --- Pricing rules admin (operator-only write path; ADR-021) ---
        let pricing_admin = Arc::new(PostgresPricingRuleAdminRepository::new(pool.clone()));

        // --- Operator fees (read-only audit; ADR-021) ---
        let operator_fee_read = Arc::new(PostgresOperatorFeeReadRepository::new(pool.clone()));

        // --- Pricing catalogs: profiles + fee policies (ADR-021) ---
        let catalog = Arc::new(PostgresCatalogRepository::new(pool.clone()));

        Self {
            pool,
            transit_account_id,
            environment,
            wallet,
            tx_engine,
            merchant,
            settlement,
            payout,
            compliance,
            kyc_provider,
            reconciliation,
            routing,
            risk,
            identity,
            consumer_wallet,
            transfer,
            qr,
            payment_links,
            acquiring,
            collections,
            app_settlement,
            pricing_admin,
            operator_fee_read,
            catalog,
        }
    }
}

/// The QR signing key (see AppState::new): configured, or — outside LIVE only —
/// the stable development key.
fn qr_signing_key(configured: Option<String>, live: bool) -> Vec<u8> {
    match configured {
        Some(k) if !k.is_empty() => k.into_bytes(),
        _ if live => panic!("QR_SIGNING_KEY is required in LIVE"),
        _ => b"banzami-dev-qr-key-change-in-production".to_vec(),
    }
}

/// The acquiring callback secret (see AppState::new): configured, or — outside
/// LIVE only — random for this process. The old source default is never a
/// secret, whatever is configured.
fn acquiring_callback_secret(configured: Option<String>, live: bool) -> Vec<u8> {
    match configured {
        Some(s) if !s.is_empty() && s != "change-in-production" => s.into_bytes(),
        _ if live => panic!("ACQUIRING_WEBHOOK_SECRET is required in LIVE"),
        _ => [uuid::Uuid::new_v4().into_bytes(), uuid::Uuid::new_v4().into_bytes()].concat(),
    }
}

/// A LIVE AppState in a test needs the keys LIVE requires; the values are
/// test-only and the same for the whole test process.
#[cfg(test)]
pub(crate) fn configure_live_secrets_for_tests() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        std::env::set_var("ACQUIRING_WEBHOOK_SECRET", "test-only-acquiring-callback-secret");
        std::env::set_var("QR_SIGNING_KEY", "test-only-qr-signing-key");
    });
}

#[cfg(test)]
mod secret_tests {
    use super::*;

    #[test]
    fn a_configured_callback_secret_is_used() {
        assert_eq!(acquiring_callback_secret(Some("k".into()), true), b"k");
        assert_eq!(acquiring_callback_secret(Some("k".into()), false), b"k");
    }

    #[test]
    fn outside_live_an_unset_callback_secret_is_random_never_the_old_default() {
        for unset in [None, Some(String::new()), Some("change-in-production".into())] {
            let a = acquiring_callback_secret(unset.clone(), false);
            let b = acquiring_callback_secret(unset, false);
            assert_ne!(a, b"change-in-production");
            assert_eq!(a.len(), 32);
            assert_ne!(a, b, "each process draws its own");
        }
    }

    #[test]
    #[should_panic(expected = "ACQUIRING_WEBHOOK_SECRET is required in LIVE")]
    fn live_refuses_to_start_without_a_callback_secret() {
        acquiring_callback_secret(None, true);
    }

    #[test]
    #[should_panic(expected = "ACQUIRING_WEBHOOK_SECRET is required in LIVE")]
    fn live_refuses_the_old_default_callback_secret() {
        acquiring_callback_secret(Some("change-in-production".into()), true);
    }

    #[test]
    #[should_panic(expected = "QR_SIGNING_KEY is required in LIVE")]
    fn live_refuses_to_start_without_a_qr_key() {
        qr_signing_key(Some(String::new()), true);
    }

    #[test]
    fn outside_live_the_qr_key_stays_stable() {
        assert_eq!(qr_signing_key(None, false), qr_signing_key(None, false));
        assert_eq!(qr_signing_key(Some("q".into()), true), b"q");
    }
}
