use axum::{extract::{Query, State}, Json};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{error::{ApiError, ApiResult}, state::AppState};

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ActivityQuery {
    pub consumer_id: String,
    pub limit:       Option<i64>,
    pub cursor:      Option<String>,
    /// Optional filter: P2P_SENT | P2P_RECEIVED | WALLET_FUNDED | WALLET_REVERSED
    pub r#type:      Option<String>,
    /// Optional filter: OUTGOING | INCOMING | SYSTEM
    pub direction:   Option<String>,
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/// One row from the UNION ALL activity query.
#[derive(Debug, Serialize, FromRow)]
pub struct ActivityItem {
    pub activity_id:               String,
    pub item_type:                 String,
    pub direction:                 String,
    pub amount_minor:              i64,
    pub currency:                  String,
    pub status:                    String,
    pub created_at:                DateTime<Utc>,
    pub completed_at:              Option<DateTime<Utc>>,
    pub counterparty_handle:       Option<String>,
    pub counterparty_display_name: Option<String>,
    pub note:                      Option<String>,
    pub transfer_id:               Option<String>,
    pub funding_id:                Option<String>,
}

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

struct Cursor {
    created_at:  DateTime<Utc>,
    activity_id: String,
}

fn decode_cursor(raw: &str) -> Option<Cursor> {
    let bytes = URL_SAFE_NO_PAD.decode(raw).ok()?;
    let s = String::from_utf8(bytes).ok()?;
    let (ts_str, id_str) = s.split_once('|')?;
    let created_at = ts_str.parse::<DateTime<Utc>>().ok()?;
    let _ = id_str.parse::<Uuid>().ok()?; // validate UUID format
    Some(Cursor { created_at, activity_id: id_str.to_owned() })
}

fn encode_cursor(created_at: DateTime<Utc>, activity_id: &str) -> String {
    let raw = format!("{}|{}", created_at.to_rfc3339_opts(chrono::SecondsFormat::Micros, true), activity_id);
    URL_SAFE_NO_PAD.encode(raw.as_bytes())
}

// ---------------------------------------------------------------------------
// Core query — tested independently from the axum handler
// ---------------------------------------------------------------------------

const ACTIVITY_UNION_SQL: &str = r#"
WITH activity AS (
    -- P2P_SENT: this consumer is the sender
    SELECT
        t.id::text               AS activity_id,
        'P2P_SENT'::text         AS item_type,
        'OUTGOING'::text         AS direction,
        t.amount_minor,
        t.currency,
        'COMPLETED'::text        AS status,
        t.created_at,
        t.created_at             AS completed_at,
        ('@' || c_r.handle)      AS counterparty_handle,
        c_r.display_name         AS counterparty_display_name,
        t.description            AS note,
        t.id::text               AS transfer_id,
        NULL::text               AS funding_id
    FROM transfers t
    LEFT JOIN consumers c_r ON c_r.id = t.recipient_id
    WHERE t.sender_id = $1 AND t.status = 'COMPLETED'

    UNION ALL

    -- P2P_RECEIVED: this consumer is the recipient
    SELECT
        t.id::text               AS activity_id,
        'P2P_RECEIVED'::text     AS item_type,
        'INCOMING'::text         AS direction,
        t.amount_minor,
        t.currency,
        'COMPLETED'::text        AS status,
        t.created_at,
        t.created_at             AS completed_at,
        ('@' || c_s.handle)      AS counterparty_handle,
        c_s.display_name         AS counterparty_display_name,
        t.description            AS note,
        t.id::text               AS transfer_id,
        NULL::text               AS funding_id
    FROM transfers t
    JOIN consumers c_s ON c_s.id = t.sender_id
    WHERE t.recipient_id = $1 AND t.status = 'COMPLETED'

    UNION ALL

    -- WALLET_FUNDED / WALLET_REVERSED: consumer top-ups
    SELECT
        d.id::text               AS activity_id,
        (CASE d.status WHEN 'REVERSED' THEN 'WALLET_REVERSED' ELSE 'WALLET_FUNDED' END)::text
                                 AS item_type,
        (CASE d.status WHEN 'REVERSED' THEN 'OUTGOING' ELSE 'INCOMING' END)::text
                                 AS direction,
        d.amount_minor,
        d.currency,
        (CASE d.status WHEN 'SETTLED' THEN 'COMPLETED' ELSE d.status END)::text
                                 AS status,
        d.created_at,
        COALESCE(d.confirmed_at, d.created_at) AS completed_at,
        NULL::text               AS counterparty_handle,
        NULL::text               AS counterparty_display_name,
        NULL::text               AS note,
        NULL::text               AS transfer_id,
        d.id::text               AS funding_id
    FROM consumer_deposits d
    WHERE d.consumer_id = $1 AND d.status IN ('SETTLED', 'REVERSED')
)
SELECT * FROM activity
WHERE (
    $2::timestamptz IS NULL
    OR created_at < $2
    OR (created_at = $2 AND activity_id < $3)
)
AND ($5::text IS NULL OR item_type = $5)
AND ($6::text IS NULL OR direction = $6)
ORDER BY created_at DESC, activity_id DESC
LIMIT $4
"#;

pub async fn fetch_activity(
    pool:             &PgPool,
    consumer_id:      Uuid,
    limit:            i64,
    cursor:           Option<&str>,
    type_filter:      Option<&str>,
    direction_filter: Option<&str>,
) -> Result<(Vec<ActivityItem>, Option<String>, bool), sqlx::Error> {
    let (cursor_ts, cursor_id): (Option<DateTime<Utc>>, Option<String>) =
        cursor.and_then(decode_cursor)
            .map(|c| (Some(c.created_at), Some(c.activity_id)))
            .unwrap_or((None, None));

    let mut items: Vec<ActivityItem> = sqlx::query_as::<_, ActivityItem>(ACTIVITY_UNION_SQL)
        .bind(consumer_id)
        .bind(cursor_ts)
        .bind(&cursor_id)
        .bind(limit + 1)
        .bind(type_filter)
        .bind(direction_filter)
        .fetch_all(pool)
        .await?;

    let has_more = items.len() as i64 > limit;
    items.truncate(limit as usize);

    let next_cursor = if has_more {
        items.last().map(|item| encode_cursor(item.created_at, &item.activity_id))
    } else {
        None
    };

    Ok((items, next_cursor, has_more))
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

/// GET /internal/v1/consumer/activity
///
/// Returns the consumer-visible activity feed: a merged, time-ordered projection
/// of P2P transfers (sent + received) and wallet fundings/reversals.
pub async fn list(
    State(state): State<AppState>,
    Query(q):     Query<ActivityQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let consumer_id: Uuid = q.consumer_id.parse()
        .map_err(|_| ApiError::bad_request("invalid consumer_id"))?;

    if let Some(raw) = &q.cursor {
        if decode_cursor(raw).is_none() {
            return Err(ApiError::bad_request("invalid cursor"));
        }
    }

    let limit = q.limit.unwrap_or(20).clamp(1, 100);

    let (items, next_cursor, has_more) = fetch_activity(
        &state.pool,
        consumer_id,
        limit,
        q.cursor.as_deref(),
        q.r#type.as_deref(),
        q.direction.as_deref(),
    )
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "items":       items,
        "next_cursor": next_cursor,
        "has_more":    has_more,
    })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_roundtrip() {
        let ts: DateTime<Utc> = "2026-05-21T14:00:00.123456Z".parse().unwrap();
        let id = "550e8400-e29b-41d4-a716-446655440000";
        let encoded = encode_cursor(ts, id);
        let decoded = decode_cursor(&encoded).expect("should decode");
        assert_eq!(decoded.created_at, ts);
        assert_eq!(decoded.activity_id, id);
    }

    #[test]
    fn cursor_rejects_garbage() {
        assert!(decode_cursor("not-base64!@#").is_none());
        assert!(decode_cursor("").is_none());
        // valid base64 but wrong content
        let bad = URL_SAFE_NO_PAD.encode("no-pipe-separator");
        assert!(decode_cursor(&bad).is_none());
    }

    #[test]
    fn cursor_rejects_invalid_uuid() {
        let bad = URL_SAFE_NO_PAD.encode("2026-05-21T14:00:00Z|not-a-uuid");
        assert!(decode_cursor(&bad).is_none());
    }
}
