mod error;
mod middleware;
mod routes;
mod state;

use std::{env, time::Duration};

use axum::{
    middleware as axum_middleware,
    routing::{any, get, post},
    Router,
};
use tower_http::trace::TraceLayer;

use banzami_ledger::{Account, AccountType, LedgerEngine, PostgresLedgerRepository};
use banzami_payment_links::run_expiry_worker as run_pl_expiry_worker;
use banzami_qr::run_expiry_worker;
use banzami_reconciliation::run_balance_checker;
use banzami_settlement::run_settlement_scheduler;
use banzami_types::Currency;
use state::{AppState, CoreEnvironment};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_env("RUST_LOG")
                .add_directive("core_api=debug".parse().unwrap()),
        )
        .init();

    // The universe this core serves is declared, never inferred (A2-15). An
    // unset or unrecognised ENVIRONMENT used to read as LIVE; it now stops the
    // boot, so every guard below is keyed on a fact rather than a default.
    let Some(declared_env) = env::var("ENVIRONMENT")
        .ok()
        .and_then(|v| CoreEnvironment::parse(&v))
    else {
        eprintln!("FATAL: ENVIRONMENT must be SANDBOX or LIVE.");
        std::process::exit(1);
    };
    let app_env = env::var("APP_ENV").unwrap_or_default();
    let acquiring_prov = env::var("ACQUIRING_PROVIDER").unwrap_or_default();
    let kyc_prov = env::var("KYC_PROVIDER").unwrap_or_default();
    // Safety guards: a Live core never runs a simulated acquirer or approves
    // identities with a simulated KYC provider. These were keyed on
    // APP_ENV=production, which nothing in infra/ sets — a Live core booted
    // with both simulators and approved KYC up to Enhanced (A2-04).
    if let Err(fatal) = live_provider_guard(declared_env, &acquiring_prov, &kyc_prov) {
        eprintln!("FATAL: {fatal}");
        std::process::exit(1);
    }
    tracing::info!(
        app_env = %app_env,
        acquiring_provider = %acquiring_prov,
        kyc_provider = %kyc_prov,
        "boot: environment validated"
    );

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let port = env::var("CORE_API_PORT")
        .unwrap_or_else(|_| "8081".into())
        .parse::<u16>()
        .expect("CORE_API_PORT must be a valid port number");

    // The system ledger accounts. Required and exact: a missing or malformed id
    // used to fall back to AccountId::default() — a NEW random account on every
    // boot — so the counterpart of every wallet movement silently moved to a
    // fresh account per restart.
    let transit_account_id =
        system_account("TRANSIT_ACCOUNT_ID", env::var("TRANSIT_ACCOUNT_ID").ok());
    let bank_account_id = system_account("BANK_ACCOUNT_ID", env::var("BANK_ACCOUNT_ID").ok());
    // Operator-fee REVENUE account (Banzami ADR-021). Internal operator account
    // the per-payment operator fee is credited to — never a merchant wallet.
    let operator_fee_account_id = system_account(
        "OPERATOR_FEE_REVENUE_ACCOUNT_ID",
        env::var("OPERATOR_FEE_REVENUE_ACCOUNT_ID").ok(),
    );
    assert!(
        transit_account_id != bank_account_id
            && transit_account_id != operator_fee_account_id
            && bank_account_id != operator_fee_account_id,
        "TRANSIT_ACCOUNT_ID, BANK_ACCOUNT_ID and OPERATOR_FEE_REVENUE_ACCOUNT_ID must be three different accounts"
    );

    // Connect with a short bounded retry rather than panicking on the first
    // attempt. A freshly created container can run its first instruction before
    // Docker's embedded resolver is serving for it, and the lookup fails with
    // "Temporary failure in name resolution" for a hostname that resolves
    // correctly seconds later. Observed during Stage E0: this process aborted at
    // boot (exit 101) on a deploy, while `docker restart` of the same container
    // succeeded immediately afterwards.
    //
    // The failure mode is worse than a slow start: the deploy marks the service
    // unhealthy and rolls back, and the rolled-back container boots through the
    // same window, so the financial core stays down until restarted by hand.
    //
    // It still panics once the attempts are exhausted — a database that is truly
    // unreachable must stop the process rather than let the core serve without
    // its ledger.
    let pool = connect_with_retry(&database_url).await;

    // Ensure the two system ledger accounts exist. These are ASSET accounts
    // used as the DR/CR counterpart for all wallet movements. The IDs are fixed
    // in .env so they survive restarts; ON CONFLICT DO NOTHING makes this safe
    // to call every boot.
    let ledger = PostgresLedgerRepository::new(pool.clone());
    ledger
        .create_account(Account {
            id: transit_account_id,
            account_type: AccountType::Asset,
            name: "System — Acquiring Transit".into(),
            currency: Currency::AOA,
            created_at: chrono::Utc::now(),
        })
        .await
        .expect("failed to ensure transit ledger account");
    ledger
        .create_account(Account {
            id: bank_account_id,
            account_type: AccountType::Asset,
            name: "System — Bank Settlement".into(),
            currency: Currency::AOA,
            created_at: chrono::Utc::now(),
        })
        .await
        .expect("failed to ensure bank ledger account");
    // Operator-fee revenue account (ADR-021). REVENUE type (normal credit
    // balance): the per-payment operator fee is credited here. Fixed id in .env.
    ledger
        .create_account(Account {
            id: operator_fee_account_id,
            account_type: AccountType::Revenue,
            name: "Operator — Fee Revenue".into(),
            currency: Currency::AOA,
            created_at: chrono::Utc::now(),
        })
        .await
        .expect("failed to ensure operator fee revenue ledger account");

    let environment = CoreEnvironment::from_env();
    tracing::info!(environment = ?environment, "boot: runtime environment");
    if environment.is_live() {
        tracing::warn!("LIVE environment — all sandbox/test funding endpoints are DISABLED");
    }

    let state = AppState::new(
        pool.clone(),
        transit_account_id,
        bank_account_id,
        operator_fee_account_id,
        environment,
    );

    // Spawn the QR expiry background worker.
    // Interval is configurable via QR_EXPIRY_INTERVAL_SECS (default: 60 s).
    let qr_expiry_secs = env::var("QR_EXPIRY_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(60);
    tokio::spawn(run_expiry_worker(
        pool.clone(),
        Duration::from_secs(qr_expiry_secs),
    ));

    // Spawn the payment link expiry worker (shares the QR interval setting).
    tokio::spawn(run_pl_expiry_worker(
        pool.clone(),
        Duration::from_secs(qr_expiry_secs),
    ));

    // Spawn the settlement batch scheduler.
    // Runs daily by default (86 400 s); override with SETTLEMENT_SCHEDULER_INTERVAL_SECS.
    let settlement_interval_secs = env::var("SETTLEMENT_SCHEDULER_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(86_400);
    tokio::spawn(run_settlement_scheduler(
        pool.clone(),
        Duration::from_secs(settlement_interval_secs),
    ));

    // Spawn the ledger balance consistency checker.
    // Runs hourly by default; override with BALANCE_CHECKER_INTERVAL_SECS.
    // Logs errors for any invariant violations (unbalanced postings, negative
    // consumer balances, orphaned completed transfers).
    let balance_check_secs = env::var("BALANCE_CHECKER_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(3_600);
    tokio::spawn(run_balance_checker(
        pool,
        Duration::from_secs(balance_check_secs),
    ));

    // Refund routes are the first Core `/internal` group to require an
    // authenticated service caller (Banzami D0/F4). The Gateway sends the shared
    // `X-Internal-Key`; Core verifies it against CORE_INTERNAL_KEY, constant-time,
    // fail-closed, BEFORE any handler/source/merchant/ledger lookup. Scoped to the
    // refund group only via a nested router + route_layer — no other internal
    // route group is gated in this stage.
    let core_internal_key = env::var("CORE_INTERNAL_KEY").ok();
    let refund_key = core_internal_key.clone();
    let refund_service_auth = axum_middleware::from_fn(
        move |req: axum::extract::Request, next: axum_middleware::Next| {
            let key = refund_key.clone();
            async move { middleware::internal_service_auth(key, req, next).await }
        },
    );
    let refund_routes = Router::new()
        .route(
            "/internal/v1/refunds",
            post(routes::refunds::create).get(routes::refunds::list),
        )
        .route("/internal/v1/refunds/:id", get(routes::refunds::get))
        .route_layer(refund_service_auth);

    // Payee validation (ADR-047 / RT04C §3) — least-privilege, service-bound
    // credential. Guarded by a DEDICATED key (CORE_PAYEE_VALIDATION_KEY), NOT the
    // broad CORE_INTERNAL_KEY: only the Developer API's payee-validation identity
    // holds it; it authorizes ONLY this path (no settle/refund/transfer/wallet
    // mutation/other internal route); a caller holding merely the generic internal
    // key is rejected here. Unset → 503 fail-closed (boundary disabled until the
    // credential is provisioned). The header is never logged.
    let payee_validation_key = env::var("CORE_PAYEE_VALIDATION_KEY").ok();
    let payee_service_auth = axum_middleware::from_fn(
        move |req: axum::extract::Request, next: axum_middleware::Next| {
            let key = payee_validation_key.clone();
            async move { middleware::internal_service_auth(key, req, next).await }
        },
    );
    let payee_routes = Router::new()
        .route(
            "/internal/v1/wallet-accounts/validate-payee",
            post(routes::wallet_accounts::validate_payee),
        )
        .route_layer(payee_service_auth);

    // Every other /internal route: CORE_INTERNAL_KEY (loopback excepted — see
    // internal_service_auth_or_loopback). Applied as a route_layer to this group
    // only; /health stays open, and the refund and payee groups keep their own
    // narrower credentials. A route added below the route_layer call would be
    // ungated — tests/ops/core-internal-routes-gated.test.mjs fails on that.
    let general_key = core_internal_key.clone();
    let general_service_auth = axum_middleware::from_fn(
        move |req: axum::extract::Request, next: axum_middleware::Next| {
            let key = general_key.clone();
            async move { middleware::internal_service_auth_or_loopback(key, req, next).await }
        },
    );
    let internal_routes = Router::new()
        // Merchants
        .route(
            "/internal/v1/merchants",
            get(routes::merchants::list_merchants).post(routes::merchants::create_merchant),
        )
        .route(
            "/internal/v1/merchants/:id",
            get(routes::merchants::get_merchant),
        )
        // Operator-governed pricing assignment. The rate follows this, not a
        // substring of the merchant's own description.
        .route(
            "/internal/v1/merchants/:id/pricing-profile",
            axum::routing::put(routes::merchants::assign_pricing_profile),
        )
        .route(
            "/internal/v1/merchants/:id",
            axum::routing::delete(routes::merchants::delete_merchant),
        )
        .route(
            "/internal/v1/merchants/:id/suspend",
            post(routes::merchants::suspend_merchant),
        )
        .route(
            "/internal/v1/merchants/:id/api-keys",
            post(routes::merchants::create_api_key),
        )
        .route(
            "/internal/v1/merchants/:id/api-keys",
            get(routes::merchants::list_api_keys),
        )
        .route(
            "/internal/v1/merchants/:id/api-keys/:key_id",
            axum::routing::delete(routes::merchants::revoke_api_key),
        )
        .route(
            "/internal/v1/merchants/:id/business-account-type",
            axum::routing::patch(routes::merchants::set_business_account_type),
        )
        .route(
            "/internal/v1/auth/verify-key",
            post(routes::merchants::verify_api_key),
        )
        // Wallets
        .route("/internal/v1/wallets", post(routes::wallets::create))
        .route(
            "/internal/v1/wallets",
            get(routes::wallets::get_for_merchant),
        )
        .route("/internal/v1/wallets/:id", get(routes::wallets::get))
        .route(
            "/internal/v1/wallets/:id/balance",
            get(routes::wallets::balance),
        )
        .route(
            "/internal/v1/wallets/:id/analytics",
            get(routes::analytics::merchant_analytics),
        )
        .route(
            "/internal/v1/wallets/:id/sandbox-credit",
            post(routes::wallets::sandbox_credit),
        )
        .route(
            "/internal/v1/wallets/:id/admin-credit",
            post(routes::wallets::admin_credit),
        )
        // Transactions
        .route(
            "/internal/v1/transactions",
            post(routes::transactions::create),
        )
        .route("/internal/v1/transactions", get(routes::transactions::list))
        .route(
            "/internal/v1/transactions/:id",
            get(routes::transactions::get),
        )
        .route(
            "/internal/v1/transactions/:id/authorize",
            post(routes::transactions::authorize),
        )
        .route(
            "/internal/v1/transactions/:id/capture",
            post(routes::transactions::capture),
        )
        .route(
            "/internal/v1/transactions/:id/reverse",
            post(routes::transactions::reverse),
        )
        .route(
            "/internal/v1/transactions/:id/fail",
            post(routes::transactions::fail),
        )
        // Settlements
        .route(
            "/internal/v1/settlements",
            post(routes::settlements::create_batch),
        )
        .route(
            "/internal/v1/settlements",
            get(routes::settlements::list_for_merchant),
        )
        .route(
            "/internal/v1/settlements/all",
            get(routes::settlements::list_all),
        )
        .route(
            "/internal/v1/settlements/:id",
            get(routes::settlements::get),
        )
        .route(
            "/internal/v1/settlements/:id/submit",
            post(routes::settlements::submit),
        )
        .route(
            "/internal/v1/settlements/:id/confirm",
            post(routes::settlements::confirm),
        )
        .route(
            "/internal/v1/settlements/:id/fail",
            post(routes::settlements::fail),
        )
        // Pricing catalogs (Banzami ADR-021) — operator-only; reference catalogs
        // (no percentages). Pricing profiles + fee policies.
        .route(
            "/internal/v1/pricing-profiles",
            post(routes::finance_catalogs::profiles_create),
        )
        .route(
            "/internal/v1/pricing-profiles",
            get(routes::finance_catalogs::profiles_list),
        )
        .route(
            "/internal/v1/pricing-profiles/:id",
            get(routes::finance_catalogs::profiles_get),
        )
        .route(
            "/internal/v1/pricing-profiles/:id",
            axum::routing::patch(routes::finance_catalogs::profiles_update),
        )
        .route(
            "/internal/v1/pricing-profiles/:id/disable",
            post(routes::finance_catalogs::profiles_disable),
        )
        .route(
            "/internal/v1/pricing-profiles/:id/enable",
            post(routes::finance_catalogs::profiles_enable),
        )
        .route(
            "/internal/v1/fee-policies",
            post(routes::finance_catalogs::policies_create),
        )
        .route(
            "/internal/v1/fee-policies",
            get(routes::finance_catalogs::policies_list),
        )
        .route(
            "/internal/v1/fee-policies/:id",
            get(routes::finance_catalogs::policies_get),
        )
        .route(
            "/internal/v1/fee-policies/:id",
            axum::routing::patch(routes::finance_catalogs::policies_update),
        )
        .route(
            "/internal/v1/fee-policies/:id/disable",
            post(routes::finance_catalogs::policies_disable),
        )
        .route(
            "/internal/v1/fee-policies/:id/enable",
            post(routes::finance_catalogs::policies_enable),
        )
        // Finance dashboard (Banzami ADR-021) — operator-only read-only aggregates
        .route(
            "/internal/v1/finance/dashboard",
            get(routes::finance_dashboard::get),
        )
        // Operator Fees (Banzami ADR-021) — operator-only read-only audit
        .route(
            "/internal/v1/operator-fees",
            get(routes::operator_fees::list),
        )
        .route(
            "/internal/v1/operator-fees/:id",
            get(routes::operator_fees::get),
        )
        // Pricing Rules (Banzami ADR-021) — operator-only admin write path
        .route(
            "/internal/v1/pricing-rules",
            post(routes::pricing_rules::create),
        )
        .route(
            "/internal/v1/pricing-rules",
            get(routes::pricing_rules::list),
        )
        .route(
            "/internal/v1/pricing-rules/:id",
            get(routes::pricing_rules::get),
        )
        .route(
            "/internal/v1/pricing-rules/:id",
            axum::routing::patch(routes::pricing_rules::update),
        )
        .route(
            "/internal/v1/pricing-rules/:id/versions",
            get(routes::pricing_rules::versions),
        )
        .route(
            "/internal/v1/pricing-rules/:id/disable",
            post(routes::pricing_rules::disable),
        )
        .route(
            "/internal/v1/pricing-rules/:id/enable",
            post(routes::pricing_rules::enable),
        )
        .route(
            "/internal/v1/pricing-rules/:id/duplicate",
            post(routes::pricing_rules::duplicate),
        )
        // Application Settlements (Banzami ADR-021 / BANZA ADR-039) — operator-only
        .route(
            "/internal/v1/application-settlements",
            post(routes::application_settlements::create),
        )
        .route(
            "/internal/v1/application-settlements",
            get(routes::application_settlements::list),
        )
        .route(
            "/internal/v1/application-settlements/by-idempotency-key/:key",
            get(routes::application_settlements::get_by_idempotency_key),
        )
        .route(
            "/internal/v1/application-settlements/:id",
            get(routes::application_settlements::get),
        )
        .route(
            "/internal/v1/application-settlements/:id/complete",
            post(routes::application_settlements::complete),
        )
        .route(
            "/internal/v1/application-settlements/:id/cancel",
            post(routes::application_settlements::cancel),
        )
        .route(
            "/internal/v1/application-settlements/:id/fail",
            post(routes::application_settlements::fail),
        )
        // Wallet Accounts (BANZA ADR-042) — segregated accounts within a wallet
        .route(
            "/internal/v1/wallet-accounts",
            post(routes::wallet_accounts::create),
        )
        .route(
            "/internal/v1/wallet-accounts/resolve",
            get(routes::wallet_accounts::resolve),
        )
        .route(
            "/internal/v1/wallet-accounts/:id",
            get(routes::wallet_accounts::get),
        )
        .route(
            "/internal/v1/wallet-accounts/:id/close",
            post(routes::wallet_accounts::close),
        )
        .route(
            "/internal/v1/sandbox/retire-funds",
            post(routes::sandbox_funds::retire),
        )
        .route(
            "/internal/v1/wallets/:wallet_id/accounts",
            get(routes::wallet_accounts::list_for_wallet),
        )
        // Party resolver (ADR-029) — @banza handle → settlement account
        .route(
            "/internal/v1/parties/resolve/:handle",
            get(routes::parties::resolve),
        )
        // Payment Sessions (BANZA ADR-043) — link + QR interfaces, one wallet_account
        .route(
            "/internal/v1/payment-sessions",
            post(routes::payment_sessions::create),
        )
        .route(
            "/internal/v1/payment-sessions",
            get(routes::payment_sessions::list),
        )
        .route(
            "/internal/v1/payment-sessions/:id",
            get(routes::payment_sessions::get),
        )
        .route(
            "/internal/v1/payment-sessions/:id/cancel",
            post(routes::payment_sessions::cancel),
        )
        .route(
            "/internal/v1/payment-sessions/by-interface/:kind/:ref_id",
            get(routes::payment_sessions::get_by_interface),
        )
        // Payouts
        .route("/internal/v1/payouts", post(routes::payouts::initiate))
        .route(
            "/internal/v1/payouts",
            get(routes::payouts::list_for_merchant),
        )
        .route("/internal/v1/payouts/all", get(routes::payouts::list_all))
        .route("/internal/v1/payouts/:id", get(routes::payouts::get))
        .route(
            "/internal/v1/payouts/:id/process",
            post(routes::payouts::process),
        )
        .route(
            "/internal/v1/payouts/:id/sent",
            post(routes::payouts::mark_sent),
        )
        .route(
            "/internal/v1/payouts/:id/confirm",
            post(routes::payouts::confirm),
        )
        .route("/internal/v1/payouts/:id/fail", post(routes::payouts::fail))
        .route(
            "/internal/v1/payouts/:id/returned",
            post(routes::payouts::mark_returned),
        )
        // Compliance
        .route(
            "/internal/v1/compliance/merchants/:id",
            get(routes::compliance::get_merchant),
        )
        .route(
            "/internal/v1/compliance/merchants/:id/approve",
            post(routes::compliance::approve_merchant),
        )
        .route(
            "/internal/v1/compliance/merchants/:id/reject",
            post(routes::compliance::reject_merchant),
        )
        .route(
            "/internal/v1/compliance/merchants/:id/suspend",
            post(routes::compliance::suspend_merchant),
        )
        .route(
            "/internal/v1/compliance/merchants/:id/flag-aml",
            post(routes::compliance::flag_aml),
        )
        .route(
            "/internal/v1/compliance/merchants/:id/verify",
            post(routes::compliance::verify_merchant),
        )
        .route(
            "/internal/v1/compliance/customers/:id/verify",
            post(routes::compliance::verify_customer),
        )
        .route(
            "/internal/v1/compliance/customers/:id",
            get(routes::compliance::get_customer_status),
        )
        .route(
            "/internal/v1/compliance/customers/:id/authorize",
            post(routes::compliance::authorize_customer),
        )
        // Reconciliation
        .route(
            "/internal/v1/reconciliation/run",
            post(routes::reconciliation::run),
        )
        .route(
            "/internal/v1/reconciliation/runs/:id",
            get(routes::reconciliation::get_report),
        )
        // Consumers (identity)
        .route(
            "/internal/v1/consumers",
            get(routes::consumers::list).post(routes::consumers::create),
        )
        .route("/internal/v1/consumers/:id", get(routes::consumers::get))
        .route(
            "/internal/v1/consumers/:id/badge",
            axum::routing::patch(routes::consumers::set_badge),
        )
        .route(
            "/internal/v1/consumers/:id/suspend",
            post(routes::consumers::suspend),
        )
        .route(
            "/internal/v1/consumers/:id/close",
            post(routes::consumers::close),
        )
        .route(
            "/internal/v1/consumers/handle/:handle",
            get(routes::consumers::get_by_handle),
        )
        // Handle routing — deterministic @banza → active wallet resolution (HDL-002)
        // Consumer wallets
        .route(
            "/internal/v1/consumer-wallets",
            post(routes::consumer_wallets::create),
        )
        .route(
            "/internal/v1/consumer-wallets",
            get(routes::consumer_wallets::get_for_consumer),
        )
        .route(
            "/internal/v1/consumer-wallets/test-credit",
            post(routes::consumer_wallets::test_credit),
        )
        .route(
            "/internal/v1/consumer-wallets/:id",
            get(routes::consumer_wallets::get),
        )
        .route(
            "/internal/v1/consumer-wallets/:id/balance",
            get(routes::consumer_wallets::balance),
        )
        // Consumer onboarding (phone → OTP → PIN → ACTIVE wallet)
        .route(
            "/internal/v1/consumer/onboarding/start",
            post(routes::onboarding::start),
        )
        .route(
            "/internal/v1/consumer/onboarding/verify-otp",
            post(routes::onboarding::verify_otp),
        )
        .route(
            "/internal/v1/consumer/onboarding/complete",
            post(routes::onboarding::complete),
        )
        // Transfers — internal UUID-based
        .route(
            "/internal/v1/wallet-account-transfers",
            post(routes::wallet_account_transfers::create),
        )
        .route("/internal/v1/transfers", post(routes::transfers::send))
        .route("/internal/v1/transfers", get(routes::transfers::list))
        .route("/internal/v1/transfers/:id", get(routes::transfers::get))
        // Transfers — consumer @handle-to-@handle P2P (P2P-001)
        .route(
            "/internal/v1/consumer/transfers",
            post(routes::transfers::send_p2p),
        )
        // Activity feed — consumer-visible transaction history (WAL-003)
        .route(
            "/internal/v1/consumer/activity",
            get(routes::activity::list),
        )
        // QR codes
        .route("/internal/v1/qr/static", post(routes::qr::create_static))
        .route("/internal/v1/qr/dynamic", post(routes::qr::create_dynamic))
        .route("/internal/v1/qr/decode", post(routes::qr::decode))
        // Split Sessions is SUPERSEDED by Collections (ADR-036). The legacy
        // routes are retired: every method + nested path under /internal/v1/splits
        // returns a deliberate 410 SPLIT_SESSIONS_SUPERSEDED without touching the
        // (intentionally unapplied 0042) tables — removing the missing-table 500.
        .route("/internal/v1/splits", any(routes::splits::superseded))
        .route("/internal/v1/splits/*rest", any(routes::splits::superseded))
        .route("/internal/v1/qr/:id", get(routes::qr::get))
        .route("/internal/v1/qr/:id/use", post(routes::qr::mark_used))
        // Payment links
        .route(
            "/internal/v1/payment-links",
            post(routes::payment_links::create),
        )
        .route(
            "/internal/v1/payment-links",
            get(routes::payment_links::list),
        )
        .route(
            "/internal/v1/payment-links/by-slug/:slug",
            get(routes::payment_links::get_by_slug),
        )
        .route(
            "/internal/v1/payment-links/:id",
            get(routes::payment_links::get),
        )
        .route(
            "/internal/v1/payment-links/:id/cancel",
            post(routes::payment_links::cancel),
        )
        .route(
            "/internal/v1/payment-links/:id/mark-used",
            post(routes::payment_links::mark_used),
        )
        // Collections (BANZA ADR-036) + PaymentIntent (ADR-037)
        .route(
            "/internal/v1/collections",
            post(routes::collections::create).get(routes::collections::list),
        )
        .route(
            "/internal/v1/collections/:id",
            get(routes::collections::get).patch(routes::collections::update),
        )
        .route(
            "/internal/v1/collections/:id/shares",
            post(routes::collections::create_share).get(routes::collections::list_shares),
        )
        .route(
            "/internal/v1/collections/:id/close",
            post(routes::collections::close),
        )
        .route(
            "/internal/v1/collections/:id/cancel",
            post(routes::collections::cancel),
        )
        .route(
            "/internal/v1/collections/:id/events",
            get(routes::collections::events),
        )
        .route(
            "/internal/v1/collection-shares/:id/surface",
            post(routes::collections::surface_share),
        )
        .route(
            "/internal/v1/collections/settle-surface",
            post(routes::collections::settle_surface),
        )
        // Acquiring — payment initiation, callbacks, and simulation helper
        .route(
            "/internal/v1/acquiring/payments",
            post(routes::acquiring::initiate_payment),
        )
        .route(
            "/internal/v1/acquiring/callbacks/emis",
            post(routes::acquiring::emis_callback),
        )
        .route(
            // Sandbox Business readiness — the @banza handle and test KYB that
            // public Financial Setup could not create, without which no ordinary
            // Developer Project could complete an application settlement.
            // Refuses in LIVE on its own reading of the environment.
            "/internal/v1/sandbox/business-readiness",
            post(routes::sandbox_business::business_readiness),
        )
        .route(
            // Whether a financial owner can settle, answered by the code that
            // settles: the same pricing resolver and the same ADR-028 evaluation.
            // Read-only; carries no internal identifier in its response.
            "/internal/v1/settlement-readiness",
            post(routes::settlement_readiness::settlement_readiness),
        )
        .route(
            "/internal/v1/acquiring/test/confirm",
            post(routes::acquiring::test_confirm),
        )
        // Admin — operational control: freeze/unfreeze, risk flags, audit log, reconciliation
        .route(
            "/internal/v1/admin/freeze",
            post(routes::admin::freeze_account),
        )
        .route(
            "/internal/v1/admin/freeze/:entity_type/:entity_id",
            axum::routing::delete(routes::admin::unfreeze_account),
        )
        .route(
            "/internal/v1/admin/risk-flags",
            get(routes::admin::list_risk_flags),
        )
        .route(
            "/internal/v1/admin/risk-flags/:id/resolve",
            post(routes::admin::resolve_risk_flag),
        )
        .route(
            "/internal/v1/admin/audit-log",
            get(routes::admin::query_audit_log),
        )
        .route(
            "/internal/v1/admin/acquiring-recon",
            post(routes::admin::run_acquiring_reconciliation)
                .get(routes::admin::list_acquiring_reconciliation_runs),
        )
        .route(
            "/internal/v1/admin/acquiring-recon/:run_id",
            get(routes::admin::get_acquiring_reconciliation_run),
        )
        // Refunds are registered separately (refund_routes, service-authed) and
        // merged below — see the CORE_INTERNAL_KEY gate above.
        // Disputes — consumer-initiated chargebacks with evidence and admin resolution
        .route(
            "/internal/v1/disputes",
            post(routes::disputes::open).get(routes::disputes::list),
        )
        .route("/internal/v1/disputes/:id", get(routes::disputes::get))
        .route(
            "/internal/v1/disputes/:id/evidence",
            post(routes::disputes::submit_evidence).get(routes::disputes::list_evidence),
        )
        .route(
            "/internal/v1/disputes/:id/resolve",
            post(routes::disputes::resolve),
        )
        // Merchant profiles — public network identity and storefront
        .route(
            "/internal/v1/merchant-profiles",
            post(routes::merchant_profiles::create).get(routes::merchant_profiles::list),
        )
        .route(
            "/internal/v1/merchant-profiles/by-handle/:handle",
            get(routes::merchant_profiles::get_by_handle),
        )
        .route(
            "/internal/v1/merchant-profiles/:id",
            get(routes::merchant_profiles::get).patch(routes::merchant_profiles::update),
        )
        // Withdrawn features have no route here: payment requests (RA-057),
        // consumer deposits, paying a structured QR (RA-053), the verified flag
        // (RA-122) and wallet reserve/commit. Nothing called them, and each took
        // its authority from the request body (A4-13). See withdrawn_routes_tests.
        // Consumer pay links — open shareable payment links (receiver unknown payer)
        .route(
            "/internal/v1/consumer-pay-links",
            post(routes::consumer_pay_links::create),
        )
        .route(
            "/internal/v1/consumer-pay-links/by-code/:code",
            get(routes::consumer_pay_links::get_by_code),
        )
        .route(
            "/internal/v1/consumer-pay-links/:code/pay",
            post(routes::consumer_pay_links::pay),
        )
        .route_layer(general_service_auth);

    let app = Router::new()
        // Health — open: the container healthcheck and the gateway's readiness.
        .route("/health", get(health))
        .merge(internal_routes)
        // Service-authenticated refund route group (CORE_INTERNAL_KEY, F4).
        .merge(refund_routes)
        .merge(payee_routes)
        .with_state(state)
        .layer(axum_middleware::from_fn(middleware::request_id))
        .layer(axum_middleware::from_fn(middleware::operator))
        // Outermost: enter the correlation span first so request_id + handlers log
        // under it and Go↔Rust logs join on correlation_id.
        .layer(axum_middleware::from_fn(middleware::correlation_id))
        .layer(TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{port}");
    tracing::info!("core-api listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind");

    // With the peer address, so the /internal gate can tell this container's
    // loopback from another container.
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .expect("server error");
}

async fn health() -> &'static str {
    "ok"
}

/// Connects to PostgreSQL, tolerating the brief window after container creation in
/// which DNS for a linked service is not yet resolvable.
///
/// Deliberately bounded: an absent database must still abort startup, so a
/// misconfigured deployment fails loudly instead of running without a ledger.
async fn connect_with_retry(database_url: &str) -> sqlx::Pool<sqlx::Postgres> {
    const ATTEMPTS: u32 = 6;
    let mut last_err = None;
    for attempt in 1..=ATTEMPTS {
        match sqlx::postgres::PgPoolOptions::new()
            .max_connections(20)
            .acquire_timeout(std::time::Duration::from_secs(5))
            .connect(database_url)
            .await
        {
            Ok(pool) => {
                if attempt > 1 {
                    tracing::info!(attempt, "database reachable after retry");
                }
                return pool;
            }
            Err(e) => {
                if attempt < ATTEMPTS {
                    tracing::warn!(
                        attempt,
                        of = ATTEMPTS,
                        "database not reachable yet, retrying"
                    );
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
                last_err = Some(e);
            }
        }
    }
    panic!(
        "failed to connect to PostgreSQL after {ATTEMPTS} attempts: {}",
        last_err.expect("at least one attempt was made")
    );
}

/// A system ledger account id from the environment: set, and a UUID — or the
/// process does not start.
fn system_account(name: &str, value: Option<String>) -> banzami_types::AccountId {
    let raw =
        value.unwrap_or_else(|| panic!("{name} must be set (a fixed system ledger account id)"));
    raw.trim()
        .parse()
        .unwrap_or_else(|_| panic!("{name} is not a UUID"))
}

#[cfg(test)]
mod system_account_tests {
    use super::system_account;

    #[test]
    fn a_set_uuid_is_used_as_is() {
        let id = "80a1a416-0000-4000-8000-000000000001";
        assert_eq!(system_account("X", Some(id.into())).to_string(), id);
    }

    #[test]
    #[should_panic(expected = "X must be set")]
    fn an_unset_id_stops_the_process() {
        system_account("X", None);
    }

    #[test]
    #[should_panic(expected = "X is not a UUID")]
    fn a_malformed_id_stops_the_process() {
        system_account("X", Some("80a1a416-typo".into()));
    }
}

/// The providers a core may run with in its environment. A Live core needs the
/// real acquirer and the real KYC provider; a Sandbox core may simulate both.
fn live_provider_guard(
    environment: CoreEnvironment,
    acquiring_provider: &str,
    kyc_provider: &str,
) -> Result<(), String> {
    if !environment.is_live() {
        return Ok(());
    }
    if !acquiring_provider.trim().eq_ignore_ascii_case("EMIS") {
        return Err("a LIVE core requires ACQUIRING_PROVIDER=EMIS; refusing to boot with a simulated acquirer".into());
    }
    if !kyc_provider.trim().eq_ignore_ascii_case("EXTERNAL") {
        return Err(
            "a LIVE core requires KYC_PROVIDER=EXTERNAL; refusing to boot with simulated KYC"
                .into(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod boot_guard_tests {
    use super::*;

    #[test]
    fn a_live_core_refuses_simulated_providers() {
        assert!(live_provider_guard(CoreEnvironment::Live, "", "").is_err());
        assert!(live_provider_guard(CoreEnvironment::Live, "EMIS", "SIMULATED").is_err());
        assert!(live_provider_guard(CoreEnvironment::Live, "SIMULATED", "EXTERNAL").is_err());
        assert!(live_provider_guard(CoreEnvironment::Live, "EMIS", "EXTERNAL").is_ok());
    }

    #[test]
    fn a_sandbox_core_may_simulate() {
        assert!(live_provider_guard(CoreEnvironment::Sandbox, "", "").is_ok());
    }
}
