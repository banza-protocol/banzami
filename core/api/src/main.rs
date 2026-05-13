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

    // Transit and bank account IDs are bootstrapped from env or created at startup.
    // In production these are seeded by the DB migration / platform init script.
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
        .route("/internal/v1/merchants",        post(routes::merchants::create_merchant))
        .route("/internal/v1/merchants/:id",    get(routes::merchants::get_merchant))
        .route("/internal/v1/auth/verify-key",  post(routes::merchants::verify_api_key))
        // Transactions
        .route("/internal/v1/transactions",              post(routes::transactions::create))
        .route("/internal/v1/transactions/:id",          get(routes::transactions::get))
        .route("/internal/v1/transactions/:id/authorize", post(routes::transactions::authorize))
        .route("/internal/v1/transactions/:id/capture",   post(routes::transactions::capture))
        .route("/internal/v1/transactions/:id/reverse",   post(routes::transactions::reverse))
        .route("/internal/v1/transactions/:id/fail",      post(routes::transactions::fail))
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
