use std::sync::Arc;

use sqlx::PgPool;

use banzami_types::AccountId;
use banzami_ledger::PostgresLedgerRepository;
use banzami_wallets::{PostgresWalletEngine, PostgresWalletRepository};
use banzami_transactions::{PostgresTransactionEngine, PostgresTransactionRepository};
use banzami_merchants::{
    PostgresApiKeyRepository, PostgresMerchantEngine, PostgresMerchantRepository,
};
use banzami_settlement::{PostgresSettlementEngine, PostgresSettlementRepository};
use banzami_routing::StaticRoutingEngine;
use banzami_risk::StaticRiskEngine;
use banzami_payouts::{PostgresPayoutEngine, PostgresPayoutRepository};
use banzami_compliance::{PostgresComplianceEngine, PostgresComplianceRepository};
use banzami_reconciliation::{PostgresReconciliationRepository, StaticReconciliationEngine};
use banzami_identity::{PostgresIdentityEngine, PostgresIdentityRepository};
use banzami_consumer_wallets::{
    PostgresConsumerWalletEngine, PostgresConsumerWalletRepository,
};
use banzami_transfers::{PostgresTransferEngine, PostgresTransferRepository};
use banzami_qr::{PostgresQrEngine, PostgresQrRepository};

// ---------------------------------------------------------------------------
// Concrete engine types wired to PostgreSQL
// ---------------------------------------------------------------------------

pub type LedgerRepo       = PostgresLedgerRepository;
pub type WalletEng        = PostgresWalletEngine<LedgerRepo, PostgresWalletRepository>;
pub type TxEng            = PostgresTransactionEngine<WalletEng, PostgresTransactionRepository>;
pub type MerchantEng      = PostgresMerchantEngine<PostgresMerchantRepository, PostgresApiKeyRepository>;
pub type SettlementEng    = PostgresSettlementEngine<LedgerRepo, PostgresSettlementRepository>;
pub type PayoutEng        = PostgresPayoutEngine<PostgresWalletRepository, LedgerRepo, PostgresPayoutRepository>;
pub type ComplianceEng    = PostgresComplianceEngine<PostgresComplianceRepository>;
pub type ReconEng         = StaticReconciliationEngine<PostgresReconciliationRepository>;
pub type IdentityEng      = PostgresIdentityEngine<PostgresIdentityRepository>;
pub type ConsumerWalletEng = PostgresConsumerWalletEngine<LedgerRepo, PostgresConsumerWalletRepository>;
pub type TransferEng      = PostgresTransferEngine<PostgresTransferRepository>;
pub type QrEng            = PostgresQrEngine<PostgresQrRepository>;

// ---------------------------------------------------------------------------
// Shared application state — cloned into every handler via axum State extractor
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct AppState {
    #[allow(dead_code)]
    pub pool:            PgPool,
    pub wallet:          Arc<WalletEng>,
    pub tx_engine:       Arc<TxEng>,
    pub merchant:        Arc<MerchantEng>,
    pub settlement:      Arc<SettlementEng>,
    pub payout:          Arc<PayoutEng>,
    pub compliance:      Arc<ComplianceEng>,
    pub reconciliation:  Arc<ReconEng>,
    #[allow(dead_code)]
    pub routing:         Arc<StaticRoutingEngine>,
    #[allow(dead_code)]
    pub risk:            Arc<StaticRiskEngine>,
    pub identity:        Arc<IdentityEng>,
    pub consumer_wallet: Arc<ConsumerWalletEng>,
    pub transfer:        Arc<TransferEng>,
    pub qr:              Arc<QrEng>,
}

impl AppState {
    pub fn new(
        pool: PgPool,
        transit_account_id: AccountId,
        bank_account_id: AccountId,
    ) -> Self {
        // --- Wallet engine (for wallet routes) ---
        let wallet_ledger = PostgresLedgerRepository::new(pool.clone());
        let wallet_repo   = PostgresWalletRepository::new(pool.clone());
        let wallet = Arc::new(PostgresWalletEngine::new(
            Arc::new(wallet_ledger),
            wallet_repo,
        ));

        // --- Wallet engine (for transaction engine — separate instance, same DB) ---
        let tx_wallet_ledger = PostgresLedgerRepository::new(pool.clone());
        let tx_wallet_repo   = PostgresWalletRepository::new(pool.clone());
        let tx_wallet_engine = PostgresWalletEngine::new(
            Arc::new(tx_wallet_ledger),
            tx_wallet_repo,
        );

        // --- Transaction engine ---
        let tx_repo   = PostgresTransactionRepository::new(pool.clone());
        let tx_engine = Arc::new(PostgresTransactionEngine::new(
            Arc::new(tx_wallet_engine),
            tx_repo,
            transit_account_id,
        ));

        // --- Merchant engine ---
        let merchant_repo = PostgresMerchantRepository::new(pool.clone());
        let api_key_repo  = PostgresApiKeyRepository::new(pool.clone());
        let merchant = Arc::new(PostgresMerchantEngine::new(merchant_repo, api_key_repo));

        // --- Settlement engine ---
        let settlement_ledger = PostgresLedgerRepository::new(pool.clone());
        let settlement_repo   = PostgresSettlementRepository::new(pool.clone());
        let settlement = Arc::new(PostgresSettlementEngine::new(
            Arc::new(settlement_ledger),
            settlement_repo,
            bank_account_id,
            transit_account_id,
        ));

        // --- Payout engine ---
        let payout_wallet_repo = PostgresWalletRepository::new(pool.clone());
        let payout_ledger      = PostgresLedgerRepository::new(pool.clone());
        let payout_repo        = PostgresPayoutRepository::new(pool.clone());
        let payout = Arc::new(PostgresPayoutEngine::new(
            payout_wallet_repo,
            Arc::new(payout_ledger),
            payout_repo,
            bank_account_id,
        ));

        // --- Compliance engine ---
        let compliance_repo = PostgresComplianceRepository::new(pool.clone());
        let compliance = Arc::new(PostgresComplianceEngine::new(compliance_repo));

        // --- Reconciliation engine ---
        let recon_repo = PostgresReconciliationRepository::new(pool.clone());
        let reconciliation = Arc::new(StaticReconciliationEngine::new(recon_repo));

        // --- Routing + Risk ---
        let routing = Arc::new(StaticRoutingEngine::angola_defaults());
        let risk    = Arc::new(StaticRiskEngine::conservative());

        // --- Identity engine ---
        let identity_repo = PostgresIdentityRepository::new(pool.clone());
        let identity      = Arc::new(PostgresIdentityEngine::new(identity_repo));

        // --- Consumer wallet engine ---
        let cw_ledger = PostgresLedgerRepository::new(pool.clone());
        let cw_repo   = PostgresConsumerWalletRepository::new(pool.clone());
        let consumer_wallet = Arc::new(PostgresConsumerWalletEngine::new(
            Arc::new(cw_ledger),
            cw_repo,
        ));

        // --- Transfer engine ---
        let transfer_repo = PostgresTransferRepository::new(pool.clone());
        let transfer      = Arc::new(PostgresTransferEngine::new(pool.clone(), transfer_repo));

        // --- QR engine ---
        let qr_signing_key = std::env::var("QR_SIGNING_KEY")
            .map(|s| s.into_bytes())
            .unwrap_or_else(|_| b"banzami-dev-qr-key-change-in-production".to_vec());
        let qr_repo = PostgresQrRepository::new(pool.clone());
        let qr      = Arc::new(PostgresQrEngine::new(qr_repo, qr_signing_key));

        Self {
            pool,
            wallet,
            tx_engine,
            merchant,
            settlement,
            payout,
            compliance,
            reconciliation,
            routing,
            risk,
            identity,
            consumer_wallet,
            transfer,
            qr,
        }
    }
}
