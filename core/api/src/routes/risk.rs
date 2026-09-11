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

/// The freeze of whoever owns a ledger account — a Business (its wallet or one
/// of its wallet accounts) or a consumer. An account nobody owns (an operator
/// account) has no freeze.
pub async fn ensure_account_owner_not_frozen(
    pool: &PgPool,
    ledger_account_id: uuid::Uuid,
) -> crate::error::ApiResult<()> {
    let owner: Option<(String, uuid::Uuid)> = sqlx::query_as(
        "SELECT 'MERCHANT', merchant_id FROM wallets WHERE available_account_id = $1
         UNION ALL SELECT 'MERCHANT', merchant_id FROM wallet_accounts WHERE account_id = $1
         UNION ALL SELECT 'CONSUMER', consumer_id FROM consumer_wallets WHERE available_account_id = $1
         LIMIT 1",
    )
    .bind(ledger_account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| crate::error::ApiError::internal(format!("freeze check failed: {e}")))?;
    match owner {
        Some((entity_type, id)) => ensure_not_frozen(pool, &entity_type, id).await,
        None => Ok(()),
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
    // "ADMIN" names a role, not a person. When admin-api said which operator is
    // acting, the record says that instead (A5-13).
    let actor = match (actor, crate::middleware::current_operator()) {
        ("ADMIN", Some(op)) => format!("ADMIN:{op}"), // the column's own convention (0025)
        _ => actor.to_string(),
    };
    // Still fire-and-forget — an audit write must not fail the action — but a
    // refused write is said out loud. It was discarded: two actions missing from
    // the log's CHECK list lost every such record, unnoticed (0134).
    if let Err(e) = sqlx::query(
        "INSERT INTO audit_log (actor, action, subject, metadata, request_id)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(&actor)
    .bind(action)
    .bind(subject)
    .bind(metadata)
    .bind(request_id)
    .execute(pool)
    .await
    {
        tracing::error!(action, subject, error = %e, "audit record refused — the action is not recorded");
    }
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

#[cfg(test)]
mod attribution_tests {
    use sqlx::PgPool;

    // A5-13: an operator action is recorded under the operator admin-api named,
    // not under the role "ADMIN"; without one it stays "ADMIN".
    #[sqlx::test(migrations = "../../db/migrations")]
    async fn an_operator_action_names_the_operator(pool: PgPool) {
        let op = "5f0e1d2c-2222-4b3a-8c9d-0e1f2a3b4c5d".to_string();
        crate::middleware::with_operator(Some(op.clone()), async {
            super::audit(&pool, "ADMIN", "ACCOUNT_FROZEN", "merchant:x", serde_json::json!({}), None).await;
        })
        .await;
        super::audit(&pool, "ADMIN", "ACCOUNT_FROZEN", "merchant:y", serde_json::json!({}), None).await;
        let rows: Vec<(String, String)> =
            sqlx::query_as("SELECT subject, actor FROM audit_log WHERE action = 'ACCOUNT_FROZEN' ORDER BY subject")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(rows, vec![("merchant:x".into(), format!("ADMIN:{op}")), ("merchant:y".into(), "ADMIN".into())]);
    }
}

#[cfg(test)]
mod action_list_tests {
    // Every action literal core passes to `audit` is one the log's CHECK accepts
    // (the latest migration that redefines it). Two were missing and every such
    // record was refused, silently (0134).
    #[test]
    fn every_audited_action_is_accepted_by_the_log() {
        let migrations = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../db/migrations");
        let mut files: Vec<_> = std::fs::read_dir(&migrations).unwrap().map(|e| e.unwrap().path()).collect();
        files.sort();
        let latest = files
            .iter()
            .rev()
            .map(|p| std::fs::read_to_string(p).unwrap())
            .find(|s| s.contains("ADD CONSTRAINT audit_log_action_check"))
            .expect("no migration defines audit_log_action_check");
        let list = &latest[latest.find("ADD CONSTRAINT audit_log_action_check").unwrap()..];
        let list = &list[..list.find(';').unwrap()];
        let src_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/routes");
        let mut missing = Vec::new();
        for entry in std::fs::read_dir(src_dir).unwrap() {
            let src = std::fs::read_to_string(entry.unwrap().path()).unwrap();
            for (i, _) in src.match_indices("audit(") {
                // The action is the third argument: the second string literal.
                let tail = &src[i..(i + 400).min(src.len())];
                let lits: Vec<&str> = tail.split('"').skip(1).step_by(2).take(2).collect();
                if let [_, action] = lits[..] {
                    // The actor vocabulary is not an action (a call whose actor is
                    // a variable shifts the literals by one).
                    let actor = ["ADMIN", "SYSTEM", "CONSUMER", "MERCHANT", "ACQUIRING"].contains(&action);
                    if !actor
                        && action.chars().all(|c| c.is_ascii_uppercase() || c == '_')
                        && action.len() > 3
                        && !list.contains(&format!("'{action}'"))
                    {
                        missing.push(action.to_string());
                    }
                }
            }
        }
        missing.sort();
        missing.dedup();
        assert!(missing.is_empty(), "audited actions the log refuses: {missing:?}");
    }
}

