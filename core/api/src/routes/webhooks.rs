//! Core-side webhook event emission (transactional outbox).
//!
//! The core records merchant-facing lifecycle events (refund.completed,
//! dispute.opened, dispute.resolved) by writing a row to `webhook_events` next
//! to the financial operation. The Go gateway worker fans these rows out into
//! per-endpoint `webhook_deliveries` and delivers them signed with
//! Banza-Signature (with retry). Emission here is idempotent: a stable
//! `idempotency_key` (e.g. `refund.completed:<id>`) means a replay of the source
//! operation never creates a duplicate event, and `dispatched_at` is left NULL
//! so the gateway picks the row up for fan-out.
//!
//! Emission is best-effort and must never fail the financial operation: a
//! replay re-emits the same (idempotent) event, so an event is not lost.

use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

/// Writes one merchant webhook event to the outbox. Idempotent on
/// `idempotency_key`. `data` is the event-specific body; it is wrapped in the
/// standard `{id,type,created_at,data}` envelope the delivery worker sends.
pub async fn emit(
    pool: &PgPool,
    merchant_id: Uuid,
    event_type: &str,
    idempotency_key: &str,
    data: serde_json::Value,
) -> Result<(), sqlx::Error> {
    let event_id = Uuid::new_v4();
    let now = Utc::now();
    let envelope = serde_json::json!({
        "id": event_id,
        "type": event_type,
        "created_at": now,
        "data": data,
    });

    sqlx::query(
        "INSERT INTO webhook_events
            (id, merchant_id, event_type, payload, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING",
    )
    .bind(event_id)
    .bind(merchant_id)
    .bind(event_type)
    .bind(envelope)
    .bind(idempotency_key)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Row;

    #[sqlx::test(migrations = "../../db/migrations")]
    async fn emit_is_idempotent_on_key(pool: PgPool) {
        let merchant = Uuid::new_v4();
        let key = "refund.completed:abc";
        for _ in 0..2 {
            emit(
                &pool,
                merchant,
                "refund.completed",
                key,
                serde_json::json!({ "refund_id": "abc" }),
            )
            .await
            .unwrap();
        }
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)::BIGINT FROM webhook_events WHERE idempotency_key = $1",
        )
        .bind(key)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1, "replay must not duplicate the event");

        // The row is left undispatched (NULL) for the gateway fan-out worker.
        let undispatched = sqlx::query(
            "SELECT merchant_id, event_type FROM webhook_events
             WHERE idempotency_key = $1 AND dispatched_at IS NULL",
        )
        .bind(key)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(undispatched.get::<Uuid, _>("merchant_id"), merchant);
        assert_eq!(
            undispatched.get::<String, _>("event_type"),
            "refund.completed"
        );
    }
}
