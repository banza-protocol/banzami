use std::time::Duration;

use sqlx::PgPool;
use tokio::time::MissedTickBehavior;

use crate::{PostgresPaymentLinkRepository, PaymentLinkRepository};

/// Background worker that marks overdue payment links as EXPIRED.
///
/// Runs on `interval` cadence. Missed ticks are skipped (never pile up)
/// so a slow database round-trip does not cause cascading work.
pub async fn run_expiry_worker(pool: PgPool, interval: Duration) {
    let repo = PostgresPaymentLinkRepository::new(pool);
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        ticker.tick().await;
        match repo.expire_overdue().await {
            Ok(n) if n > 0 => tracing::info!(expired = n, "payment links expired"),
            Ok(_)          => {}
            Err(e)         => tracing::error!(error = %e, "payment link expiry worker error"),
        }
    }
}
