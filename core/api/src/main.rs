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

    // Safety guard: refuse to boot with a simulated acquirer in production.
    let app_env = env::var("APP_ENV").unwrap_or_default();
    let acquiring_prov = env::var("ACQUIRING_PROVIDER").unwrap_or_default();
    if app_env.eq_ignore_ascii_case("production") && !acquiring_prov.eq_ignore_ascii_case("EMIS") {
        eprintln!(
            "FATAL: APP_ENV=production requires ACQUIRING_PROVIDER=EMIS. \
             Refusing to boot with simulated acquirer in production."
        );
        std::process::exit(1);
    }
    // Safety guard: refuse to boot approving identities with a simulated KYC
    // provider in production.
    let kyc_prov = env::var("KYC_PROVIDER").unwrap_or_default();
    if app_env.eq_ignore_ascii_case("production") && !kyc_prov.eq_ignore_ascii_case("EXTERNAL") {
        eprintln!(
            "FATAL: APP_ENV=production requires KYC_PROVIDER=EXTERNAL. \
             Refusing to boot with simulated KYC provider in production."
        );
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

    let transit_account_id = env::var("TRANSIT_ACCOUNT_ID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_default();

    let bank_account_id = env::var("BANK_ACCOUNT_ID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_default();

    // Operator-fee REVENUE account (Banzami ADR-021). Internal operator account
    // the per-payment operator fee is credited to — never a merchant wallet.
    let operator_fee_account_id = env::var("OPERATOR_FEE_REVENUE_ACCOUNT_ID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_default();

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(20)
        .connect(&database_url)
        .await
        .expect("failed to connect to PostgreSQL");

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
    let refund_service_auth = axum_middleware::from_fn(move |req: axum::extract::Request, next: axum_middleware::Next| {
        let key = refund_key.clone();
        async move { middleware::internal_service_auth(key, req, next).await }
    });
    let refund_routes = Router::new()
        .route(
            "/internal/v1/refunds",
            post(routes::refunds::create).get(routes::refunds::list),
        )
        .route("/internal/v1/refunds/:id", get(routes::refunds::get))
        .route_layer(refund_service_auth);

    // Payee validation (ADR-047 / RT04B §3) — the Developer API calls this over
    // the authenticated internal boundary before recording a Project→Merchant
    // binding. Same fail-closed X-Internal-Key guard as refunds.
    let payee_key = core_internal_key.clone();
    let payee_service_auth = axum_middleware::from_fn(move |req: axum::extract::Request, next: axum_middleware::Next| {
        let key = payee_key.clone();
        async move { middleware::internal_service_auth(key, req, next).await }
    });
    let payee_routes = Router::new()
        .route(
            "/internal/v1/wallet-accounts/validate-payee",
            post(routes::wallet_accounts::validate_payee),
        )
        .route_layer(payee_service_auth);

    let app = Router::new()
        // Health
        .route("/health", get(health))
        // Merchants
        .route(
            "/internal/v1/merchants",
            get(routes::merchants::list_merchants).post(routes::merchants::create_merchant),
        )
        .route(
            "/internal/v1/merchants/:id",
            get(routes::merchants::get_merchant),
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
            "/internal/v1/merchants/:id/verified",
            axum::routing::patch(routes::merchants::set_verified),
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
        .route("/internal/v1/pricing-profiles", post(routes::finance_catalogs::profiles_create))
        .route("/internal/v1/pricing-profiles", get(routes::finance_catalogs::profiles_list))
        .route("/internal/v1/pricing-profiles/:id", get(routes::finance_catalogs::profiles_get))
        .route("/internal/v1/pricing-profiles/:id", axum::routing::patch(routes::finance_catalogs::profiles_update))
        .route("/internal/v1/pricing-profiles/:id/disable", post(routes::finance_catalogs::profiles_disable))
        .route("/internal/v1/pricing-profiles/:id/enable", post(routes::finance_catalogs::profiles_enable))
        .route("/internal/v1/fee-policies", post(routes::finance_catalogs::policies_create))
        .route("/internal/v1/fee-policies", get(routes::finance_catalogs::policies_list))
        .route("/internal/v1/fee-policies/:id", get(routes::finance_catalogs::policies_get))
        .route("/internal/v1/fee-policies/:id", axum::routing::patch(routes::finance_catalogs::policies_update))
        .route("/internal/v1/fee-policies/:id/disable", post(routes::finance_catalogs::policies_disable))
        .route("/internal/v1/fee-policies/:id/enable", post(routes::finance_catalogs::policies_enable))
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
            "/internal/v1/payment-sessions/by-interface/:kind/:ref_id",
            get(routes::payment_sessions::get_by_interface),
        )
        .route(
            "/internal/v1/payment-sessions/settle-by-interface/:kind/:ref_id",
            post(routes::payment_sessions::settle_by_interface),
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
        .route(
            "/internal/v1/identity/resolve/:handle",
            get(routes::consumers::resolve_handle),
        )
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
        .route(
            "/internal/v1/consumer-wallets/:id/reserve",
            post(routes::consumer_wallets::reserve),
        )
        .route(
            "/internal/v1/consumer-wallets/:id/release",
            post(routes::consumer_wallets::release),
        )
        .route(
            "/internal/v1/consumer-wallets/:id/commit-reserved",
            post(routes::consumer_wallets::commit_reserved),
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
        .route("/internal/v1/qr/pay", post(routes::qr::pay))
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
        // Consumer deposits — top-up consumer wallets via acquiring provider
        .route(
            "/internal/v1/consumer-deposits",
            post(routes::consumer_deposits::initiate),
        )
        .route(
            "/internal/v1/consumer-deposits/:id",
            get(routes::consumer_deposits::get),
        )
        .route(
            "/internal/v1/consumer-deposits/callback",
            post(routes::consumer_deposits::callback),
        )
        .route(
            "/internal/v1/consumer-deposits/test-confirm",
            post(routes::consumer_deposits::test_confirm),
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
            "/internal/v1/merchant-profiles/by-merchant/:merchant_id",
            get(routes::merchant_profiles::get_by_merchant),
        )
        .route(
            "/internal/v1/merchant-profiles/:id",
            get(routes::merchant_profiles::get).patch(routes::merchant_profiles::update),
        )
        .route(
            "/internal/v1/merchant-profiles/:id/social-links",
            post(routes::merchant_profiles::add_social_link),
        )
        // Payment requests — receiver-initiated pull payments (P2P "request money")
        .route(
            "/internal/v1/payment-requests",
            post(routes::payment_requests::create).get(routes::payment_requests::list),
        )
        .route(
            "/internal/v1/payment-requests/:id",
            get(routes::payment_requests::get),
        )
        .route(
            "/internal/v1/payment-requests/:id/pay",
            post(routes::payment_requests::pay),
        )
        .route(
            "/internal/v1/payment-requests/:id/decline",
            post(routes::payment_requests::decline),
        )
        .route(
            "/internal/v1/payment-requests/:id/cancel",
            post(routes::payment_requests::cancel),
        )
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
        // Service-authenticated refund route group (CORE_INTERNAL_KEY, F4).
        .merge(refund_routes)
        .merge(payee_routes)
        .with_state(state)
        .layer(axum_middleware::from_fn(middleware::request_id))
        // Outermost: enter the correlation span first so request_id + handlers log
        // under it and Go↔Rust logs join on correlation_id.
        .layer(axum_middleware::from_fn(middleware::correlation_id))
        .layer(TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{port}");
    tracing::info!("core-api listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind");

    axum::serve(listener, app).await.expect("server error");
}

async fn health() -> &'static str {
    "ok"
}
