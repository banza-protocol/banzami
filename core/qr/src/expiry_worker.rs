use std::time::Duration;

use sqlx::PgPool;
use tokio::time::{interval, MissedTickBehavior};

/// Background task that transitions ACTIVE dynamic QR codes to EXPIRED
/// once their `expires_at` timestamp has passed.
///
/// Runs on a fixed `tick_interval` (default: 60 s via `QR_EXPIRY_INTERVAL_SECS`).
/// A missed tick is skipped rather than burst-replayed — if the DB is slow for
/// one cycle, the next fires at the next scheduled wall-clock tick.
///
/// This function loops forever; callers should `tokio::spawn` it alongside the
/// HTTP server and let it be dropped when the process exits.
pub async fn run_expiry_worker(pool: PgPool, tick_interval: Duration) {
    let mut ticker = interval(tick_interval);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
    ticker.tick().await; // consume the immediate first tick; don't run at t=0

    loop {
        ticker.tick().await;

        match expire_stale_codes(&pool).await {
            Ok(0) => {}
            Ok(n) => tracing::info!(expired = n, "qr_expiry_worker: codes expired"),
            Err(e) => tracing::error!(error = %e, "qr_expiry_worker: expiry query failed"),
        }
    }
}

pub(crate) async fn expire_stale_codes(pool: &PgPool) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE qr_codes
         SET    status = 'EXPIRED'
         WHERE  status     = 'ACTIVE'
           AND  expires_at IS NOT NULL
           AND  expires_at <= now()",
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::time::Duration;

    #[test]
    fn interval_duration_config() {
        // Ensure the default interval parses correctly.
        let secs: u64 = std::env::var("QR_EXPIRY_INTERVAL_SECS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(60);
        assert!(Duration::from_secs(secs) >= Duration::from_secs(10),
            "expiry interval should be at least 10 seconds");
    }
}
