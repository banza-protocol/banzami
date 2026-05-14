use std::time::Duration;

use chrono::{Duration as ChronoDuration, Utc};
use sqlx::PgPool;
use tokio::time::{interval, MissedTickBehavior};

use banzami_types::{Currency, Money, SettlementId};

use crate::SettlementStatus;

/// Background task that auto-creates daily settlement batches.
///
/// On each tick (configurable via `SETTLEMENT_SCHEDULER_INTERVAL_SECS`, default 86 400 s):
///  1. Aggregates all CAPTURED transactions from the previous UTC day,
///     grouped by (merchant_id, wallet_id, currency).
///  2. For each group that has no existing settlement batch for the same period,
///     inserts a new PENDING batch.
///
/// Idempotency: a batch is skipped when one already exists with the same
/// merchant + wallet + period_start, so the worker is safe to restart.
pub async fn run_settlement_scheduler(pool: PgPool, tick_interval: Duration) {
    let mut ticker = interval(tick_interval);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
    ticker.tick().await; // consume the immediate first tick; don't run at t=0

    loop {
        ticker.tick().await;

        match create_daily_batches(&pool).await {
            Ok(0) => {}
            Ok(n) => tracing::info!(batches = n, "settlement_scheduler: batches created"),
            Err(e) => tracing::error!(error = %e, "settlement_scheduler: batch creation failed"),
        }
    }
}

async fn create_daily_batches(pool: &PgPool) -> Result<u64, sqlx::Error> {
    let now         = Utc::now();
    let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap().and_utc();
    let yesterday_start = today_start - ChronoDuration::days(1);

    // Aggregate CAPTURED transactions from yesterday per merchant+wallet+currency.
    let rows = sqlx::query!(
        r#"
        SELECT
            merchant_id,
            wallet_id,
            currency,
            SUM(amount_minor) AS "gross_minor!: i64",
            SUM(fee_minor)    AS "fee_minor!: i64",
            COUNT(*)::INTEGER AS "tx_count!: i32"
        FROM   transactions
        WHERE  status     = 'CAPTURED'
          AND  created_at >= $1
          AND  created_at <  $2
        GROUP  BY merchant_id, wallet_id, currency
        "#,
        yesterday_start,
        today_start,
    )
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(0);
    }

    let mut created = 0u64;

    for row in rows {
        // Skip if a settlement batch already covers this merchant+wallet+period.
        let already_exists: bool = sqlx::query_scalar!(
            r#"
            SELECT EXISTS (
                SELECT 1 FROM settlements
                WHERE  merchant_id  = $1
                  AND  wallet_id    = $2
                  AND  period_start = $3
            ) AS "exists!"
            "#,
            row.merchant_id,
            row.wallet_id,
            yesterday_start,
        )
        .fetch_one(pool)
        .await?;

        if already_exists {
            continue;
        }

        let currency = match Currency::from_code(&row.currency) {
            Some(c) => c,
            None => {
                tracing::warn!(
                    currency    = %row.currency,
                    merchant_id = %row.merchant_id,
                    "settlement_scheduler: unknown currency — skipping batch"
                );
                continue;
            }
        };

        let gross = Money::new(row.gross_minor, currency);
        let fee   = Money::new(row.fee_minor, currency);
        let net   = match gross.checked_sub(fee) {
            Ok(n)  => n,
            Err(_) => {
                tracing::warn!(
                    merchant_id = %row.merchant_id,
                    gross_minor = row.gross_minor,
                    fee_minor   = row.fee_minor,
                    "settlement_scheduler: fee exceeds gross — skipping batch"
                );
                continue;
            }
        };

        let batch_id   = SettlementId::new();
        let insert_now = Utc::now();

        sqlx::query!(
            r#"
            INSERT INTO settlements (
                id, merchant_id, wallet_id, currency, status,
                gross_amount_minor, fee_amount_minor, net_amount_minor,
                transaction_count, period_start, period_end,
                created_at, updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            "#,
            batch_id.as_uuid(),
            row.merchant_id,
            row.wallet_id,
            currency.code(),
            SettlementStatus::Pending.as_str(),
            gross.amount_minor(),
            fee.amount_minor(),
            net.amount_minor(),
            row.tx_count,
            yesterday_start,
            today_start,
            insert_now,
            insert_now,
        )
        .execute(pool)
        .await?;

        tracing::info!(
            settlement_id = %batch_id,
            merchant_id   = %row.merchant_id,
            currency      = %row.currency,
            gross_minor   = gross.amount_minor(),
            fee_minor     = fee.amount_minor(),
            net_minor     = net.amount_minor(),
            tx_count      = row.tx_count,
            period_start  = %yesterday_start,
            "settlement_scheduler: batch created"
        );
        created += 1;
    }

    Ok(created)
}
