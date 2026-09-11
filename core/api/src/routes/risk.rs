/// Shared risk helpers used by acquiring and consumer-deposit routes.
///
/// These are thin wrappers over direct SQL so they stay lightweight and
/// can be called from any route handler without pulling in an engine trait.
use chrono::Timelike;
use sqlx::PgPool;

/// Whether the entity has an active account freeze. An error is an error, not
/// "not frozen": the query used to fall back to `false`, so a database hiccup
/// let a frozen account move money.
pub async fn is_frozen(
    pool: &PgPool,
    entity_type: &str,
    entity_id: uuid::Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(
            SELECT 1 FROM account_freezes
            WHERE entity_type = $1
              AND entity_id   = $2
              AND lifted_at  IS NULL
         )",
    )
    .bind(entity_type)
    .bind(entity_id)
    .fetch_one(pool)
    .await
}

/// Refuses (403 ACCOUNT_FROZEN) when the entity is frozen, and fails closed
/// when the freeze cannot be read. Every route where a party's money leaves
/// its wallet calls this for that party — a freeze that only some routes read
/// is not a freeze.
pub async fn ensure_not_frozen(
    pool: &PgPool,
    entity_type: &str,
    entity_id: uuid::Uuid,
) -> crate::error::ApiResult<()> {
    match is_frozen(pool, entity_type, entity_id).await {
        Ok(false) => Ok(()),
        Ok(true) => Err(crate::error::ApiError::unprocessable(
            "ACCOUNT_FROZEN",
            "the account is frozen",
        )),
        Err(e) => Err(crate::error::ApiError::internal(format!(
            "freeze check failed: {e}"
        ))),
    }
}

/// Records an entry in the immutable audit_log.
/// Fire-and-forget — logging failures do not propagate to the caller.
pub async fn audit(
    pool: &PgPool,
    actor: &str,
    action: &str,
    subject: &str,
    metadata: serde_json::Value,
    request_id: Option<&str>,
) {
    let _ = sqlx::query(
        "INSERT INTO audit_log (actor, action, subject, metadata, request_id)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(actor)
    .bind(action)
    .bind(subject)
    .bind(metadata)
    .bind(request_id)
    .execute(pool)
    .await;
}

/// Logs a suspicious activity event (also fire-and-forget).
pub async fn flag_suspicious(
    pool: &PgPool,
    entity_type: &str,
    entity_id: uuid::Uuid,
    event_type: &str,
    description: &str,
    metadata: serde_json::Value,
) {
    let _ = sqlx::query(
        "INSERT INTO suspicious_activity_events
         (entity_type, entity_id, event_type, description, metadata)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(entity_type)
    .bind(entity_id)
    .bind(event_type)
    .bind(description)
    .bind(metadata)
    .execute(pool)
    .await;
}

/// Opens a risk flag in the operator review queue (`risk_flags`).
/// Fire-and-forget — flagging failures must never block the caller's response.
pub async fn flag_risk(
    pool: &PgPool,
    entity_type: &str,
    entity_id: uuid::Uuid,
    flag_type: &str,
    severity: &str,
    description: &str,
) {
    let _ = sqlx::query(
        "INSERT INTO risk_flags (entity_type, entity_id, flag_type, severity, description)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(entity_type)
    .bind(entity_id)
    .bind(flag_type)
    .bind(severity)
    .bind(description)
    .execute(pool)
    .await;
}

/// Upserts a velocity counter row for the given entity and time window.
/// `window_start` should be truncated to the start of the relevant window
/// (beginning of the current hour for HOURLY, beginning of the day for DAILY).
pub async fn increment_velocity(
    pool: &PgPool,
    entity_type: &str,
    entity_id: uuid::Uuid,
    time_window: &str,
    window_start: chrono::DateTime<chrono::Utc>,
    amount_minor: i64,
) {
    let _ = sqlx::query(
        "INSERT INTO velocity_counters
             (entity_type, entity_id, time_window, window_start, tx_count, amount_minor_total, updated_at)
         VALUES ($1, $2, $3, $4, 1, $5, now())
         ON CONFLICT (entity_type, entity_id, time_window, window_start)
         DO UPDATE SET
             tx_count           = velocity_counters.tx_count + 1,
             amount_minor_total = velocity_counters.amount_minor_total + $5,
             updated_at         = now()",
    )
    .bind(entity_type)
    .bind(entity_id)
    .bind(time_window)
    .bind(window_start)
    .bind(amount_minor)
    .execute(pool)
    .await;
}

/// Returns the current hourly and daily velocity counters for the entity.
/// Returns (hourly_count, hourly_amount, daily_count, daily_amount).
pub async fn get_velocity(
    pool: &PgPool,
    entity_type: &str,
    entity_id: uuid::Uuid,
) -> (i64, i64, i64, i64) {
    let now = chrono::Utc::now();
    let hour_start = now
        .date_naive()
        .and_hms_opt(now.time().hour(), 0, 0)
        .map(|dt| dt.and_utc())
        .unwrap_or(now);
    let day_start = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .map(|dt| dt.and_utc())
        .unwrap_or(now);

    let hourly = sqlx::query_as::<_, (i64, i64)>(
        "SELECT COALESCE(tx_count, 0), COALESCE(amount_minor_total, 0)
         FROM velocity_counters
         WHERE entity_type = $1 AND entity_id = $2
           AND time_window = 'HOURLY' AND window_start = $3",
    )
    .bind(entity_type)
    .bind(entity_id)
    .bind(hour_start)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .unwrap_or((0, 0));

    let daily = sqlx::query_as::<_, (i64, i64)>(
        "SELECT COALESCE(tx_count, 0), COALESCE(amount_minor_total, 0)
         FROM velocity_counters
         WHERE entity_type = $1 AND entity_id = $2
           AND time_window = 'DAILY' AND window_start = $3",
    )
    .bind(entity_type)
    .bind(entity_id)
    .bind(day_start)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .unwrap_or((0, 0));

    (hourly.0, hourly.1, daily.0, daily.1)
}
