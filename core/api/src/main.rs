mod error;
mod routes;
mod state;

use std::env;

use axum::{
    routing::{get, post},
    Router,
};
use tower_http::trace::TraceLayer;

use state::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_env("RUST_LOG")
                .add_directive("core_api=debug".parse().unwrap()),
        )
        .init();

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let port = env::var("CORE_API_PORT")
        .unwrap_or_else(|_| "8081".into())
        .parse::<u16>()
        .expect("CORE_API_PORT must be a valid port number");

    let transit_account_id = env::var("TRANSIT_ACCOUNT_ID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(banzami_types::AccountId::new);

    let bank_account_id = env::var("BANK_ACCOUNT_ID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(banzami_types::AccountId::new);

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(20)
        .connect(&database_url)
        .await
        .expect("failed to connect to PostgreSQL");

    let state = AppState::new(pool, transit_account_id, bank_account_id);

    let app = Router::new()
        // Health
        .route("/health", get(health))

        // Merchants
        .route("/internal/v1/merchants",                      post(routes::merchants::create_merchant))
        .route("/internal/v1/merchants/:id",                  get(routes::merchants::get_merchant))
        .route("/internal/v1/merchants/:id/suspend",          post(routes::merchants::suspend_merchant))
        .route("/internal/v1/merchants/:id/api-keys",         post(routes::merchants::create_api_key))
        .route("/internal/v1/merchants/:id/api-keys",         get(routes::merchants::list_api_keys))
        .route("/internal/v1/merchants/:id/api-keys/:key_id", axum::routing::delete(routes::merchants::revoke_api_key))
        .route("/internal/v1/auth/verify-key",                post(routes::merchants::verify_api_key))

        // Wallets
        .route("/internal/v1/wallets",             post(routes::wallets::create))
        .route("/internal/v1/wallets",             get(routes::wallets::get_for_merchant))
        .route("/internal/v1/wallets/:id",         get(routes::wallets::get))
        .route("/internal/v1/wallets/:id/balance", get(routes::wallets::balance))

        // Transactions
        .route("/internal/v1/transactions",                  post(routes::transactions::create))
        .route("/internal/v1/transactions/:id",              get(routes::transactions::get))
        .route("/internal/v1/transactions/:id/authorize",    post(routes::transactions::authorize))
        .route("/internal/v1/transactions/:id/capture",      post(routes::transactions::capture))
        .route("/internal/v1/transactions/:id/reverse",      post(routes::transactions::reverse))
        .route("/internal/v1/transactions/:id/fail",         post(routes::transactions::fail))

        // Settlements
        .route("/internal/v1/settlements",              post(routes::settlements::create_batch))
        .route("/internal/v1/settlements",              get(routes::settlements::list_for_merchant))
        .route("/internal/v1/settlements/:id",          get(routes::settlements::get))
        .route("/internal/v1/settlements/:id/submit",   post(routes::settlements::submit))
        .route("/internal/v1/settlements/:id/confirm",  post(routes::settlements::confirm))
        .route("/internal/v1/settlements/:id/fail",     post(routes::settlements::fail))

        // Payouts
        .route("/internal/v1/payouts",                  post(routes::payouts::initiate))
        .route("/internal/v1/payouts",                  get(routes::payouts::list_for_merchant))
        .route("/internal/v1/payouts/:id",              get(routes::payouts::get))
        .route("/internal/v1/payouts/:id/process",      post(routes::payouts::process))
        .route("/internal/v1/payouts/:id/sent",         post(routes::payouts::mark_sent))
        .route("/internal/v1/payouts/:id/confirm",      post(routes::payouts::confirm))
        .route("/internal/v1/payouts/:id/fail",         post(routes::payouts::fail))
        .route("/internal/v1/payouts/:id/returned",     post(routes::payouts::mark_returned))

        // Compliance
        .route("/internal/v1/compliance/merchants/:id",           get(routes::compliance::get_merchant))
        .route("/internal/v1/compliance/merchants/:id/approve",   post(routes::compliance::approve_merchant))
        .route("/internal/v1/compliance/merchants/:id/reject",    post(routes::compliance::reject_merchant))
        .route("/internal/v1/compliance/merchants/:id/suspend",   post(routes::compliance::suspend_merchant))
        .route("/internal/v1/compliance/merchants/:id/flag-aml",  post(routes::compliance::flag_aml))

        // Reconciliation
        .route("/internal/v1/reconciliation/run", post(routes::reconciliation::run))

        .with_state(state)
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
