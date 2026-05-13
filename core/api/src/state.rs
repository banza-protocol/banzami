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

// ---------------------------------------------------------------------------
// Concrete engine types wired to PostgreSQL
// ---------------------------------------------------------------------------

pub type LedgerRepo = PostgresLedgerRepository;
pub type WalletEng  = PostgresWalletEngine<LedgerRepo, PostgresWalletRepository>;
pub type TxEng      = PostgresTransactionEngine<WalletEng, PostgresTransactionRepository>;
pub type MerchantEng = PostgresMerchantEngine<PostgresMerchantRepository, PostgresApiKeyRepository>;
pub type SettlementEng = PostgresSettlementEngine<LedgerRepo, PostgresSettlementRepository>;

// ---------------------------------------------------------------------------
// Shared application state — cloned into every handler via axum State extractor
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct AppState {
    #[allow(dead_code)] pub pool:       PgPool,
    pub tx_engine:  Arc<TxEng>,
    pub merchant:   Arc<MerchantEng>,
    // Reserved for settlement, routing, and risk endpoints (not yet wired as routes)
    #[allow(dead_code)] pub settlement: Arc<SettlementEng>,
    #[allow(dead_code)] pub routing:    Arc<StaticRoutingEngine>,
    #[allow(dead_code)] pub risk:       Arc<StaticRiskEngine>,
}

impl AppState {
    pub fn new(
        pool: PgPool,
        transit_account_id: AccountId,
        bank_account_id: AccountId,
    ) -> Self {
        let wallet_ledger = PostgresLedgerRepository::new(pool.clone());
        let wallet_repo   = PostgresWalletRepository::new(pool.clone());
        let wallet_engine = Arc::new(PostgresWalletEngine::new(
            Arc::new(wallet_ledger),
            wallet_repo,
        ));

        let tx_repo = PostgresTransactionRepository::new(pool.clone());
        let tx_engine = Arc::new(PostgresTransactionEngine::new(
            wallet_engine,
            tx_repo,
            transit_account_id,
        ));

        let merchant_repo = PostgresMerchantRepository::new(pool.clone());
        let api_key_repo  = PostgresApiKeyRepository::new(pool.clone());
        let merchant = Arc::new(PostgresMerchantEngine::new(merchant_repo, api_key_repo));

        let settlement_ledger = PostgresLedgerRepository::new(pool.clone());
        let settlement_repo   = PostgresSettlementRepository::new(pool.clone());
        let settlement = Arc::new(PostgresSettlementEngine::new(
            Arc::new(settlement_ledger),
            settlement_repo,
            bank_account_id,
            transit_account_id,
        ));

        let routing = Arc::new(StaticRoutingEngine::angola_defaults());
        let risk    = Arc::new(StaticRiskEngine::conservative());

        Self { pool, tx_engine, merchant, settlement, routing, risk }
    }
}
