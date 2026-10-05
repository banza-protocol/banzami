//! Account deletion executor — core-owned truth for "Supressão de conta".
//!
//! The authenticated in-app flow calls this after a fresh PIN re-auth; the
//! calling service (public-api) derives the identity from the session and never
//! trusts a client-supplied id. It is Sandbox-only, idempotent and ledger-safe:
//!
//!   - the fictitious balance is swept back to transit through balanced postings
//!     (`retire_in_tx` — never a ledger mutation);
//!   - the consumer is CLOSED: a tombstone, so the row and all financial history
//!     stay exactly where they are;
//!   - the declared name (PII) on the row is scrubbed;
//!   - the @banza handle is retired from circulation — non-resolvable AND
//!     non-reusable, so it can never be grabbed by someone else;
//!   - device risk/PII signals are removed;
//!   - a CONSUMER_DELETED audit row records the outcome.
//!
//! Credentials and sessions live in public-api's own tables; that service revokes
//! them after this returns. A CLOSED consumer already fails handle resolution and
//! session validation, so access ends regardless.

use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    routes::sandbox_funds::retire_in_tx,
    state::AppState,
};

/// POST /internal/v1/consumers/:id/delete
pub async fn delete_consumer(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    if state.environment.is_live() {
        return Err(ApiError::forbidden(
            "account deletion runs only in the Sandbox",
        ));
    }
    let consumer =
        Uuid::parse_str(&id).map_err(|_| ApiError::bad_request("invalid consumer id"))?;
    let db = |e: sqlx::Error| ApiError::internal(e.to_string());
    let subject = format!("consumer:{consumer}");
    let key = format!("consumer-delete:{consumer}");
    let reason = "Account deletion requested by the account holder";
    let by = format!("CONSUMER:{consumer}");

    let mut tx = state.pool.begin().await.map_err(db)?;
    // One deletion at a time per consumer; a concurrent call waits here.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('account-delete:' || $1::text))")
        .bind(consumer)
        .execute(&mut *tx)
        .await
        .map_err(db)?;

    // Idempotent: a replay returns exactly what the first deletion did.
    if let Some(prev) = sqlx::query_scalar::<_, serde_json::Value>(
        "SELECT metadata FROM audit_log WHERE action = 'CONSUMER_DELETED' AND subject = $1 LIMIT 1",
    )
    .bind(&subject)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db)?
    {
        return Ok(Json(
            serde_json::json!({ "replayed": true, "result": prev }),
        ));
    }

    // Must exist (lock the row for the duration of the tx).
    let status: Option<String> =
        sqlx::query_scalar("SELECT status FROM consumers WHERE id = $1 FOR UPDATE")
            .bind(consumer)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db)?;
    if status.is_none() {
        return Err(ApiError::not_found("consumer not found"));
    }

    // Sweep the fictitious Sandbox balance back to transit (balanced postings).
    // Only when an AOA consumer wallet exists; a wallet-less consumer has nothing
    // to retire and must still be deletable.
    let has_wallet: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM consumer_wallets WHERE consumer_id = $1 AND currency = 'AOA'",
    )
    .bind(consumer)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db)?;
    let retired_minor = if has_wallet.is_some() {
        let (amount, _) = retire_in_tx(
            &mut tx,
            state.transit_account_id.as_uuid(),
            "CONSUMER",
            consumer,
            reason,
            &by,
            &key,
        )
        .await?;
        amount
    } else {
        0
    };

    // Close (tombstone) + scrub the declared name (PII). The declared-name CHECK
    // is ACTIVE-scoped (migration 0152), so a CLOSED consumer may have a null name.
    sqlx::query(
        "UPDATE consumers SET status = 'CLOSED', display_name = NULL, updated_at = now() WHERE id = $1",
    )
    .bind(consumer)
    .execute(&mut *tx)
    .await
    .map_err(db)?;

    // Retire the @banza handle from circulation.
    let handle_retired = sqlx::query(
        "UPDATE handle_registry
            SET owner_type = 'SYSTEM', owner_id = NULL, reserved_reason = 'ACCOUNT_DELETED'
          WHERE owner_type = 'CONSUMER' AND owner_id = $1",
    )
    .bind(consumer)
    .execute(&mut *tx)
    .await
    .map_err(db)?
    .rows_affected();

    // Remove device risk/PII signals.
    let devices_removed = sqlx::query("DELETE FROM consumer_devices WHERE consumer_id = $1")
        .bind(consumer)
        .execute(&mut *tx)
        .await
        .map_err(db)?
        .rows_affected();

    let result = serde_json::json!({
        "retired_minor": retired_minor,
        "handle_retired": handle_retired,
        "devices_removed": devices_removed,
    });
    sqlx::query(
        "INSERT INTO audit_log (actor, action, subject, metadata) VALUES ($1, 'CONSUMER_DELETED', $2, $3)",
    )
    .bind(&by)
    .bind(&subject)
    .bind(&result)
    .execute(&mut *tx)
    .await
    .map_err(db)?;

    tx.commit().await.map_err(db)?;

    Ok(Json(
        serde_json::json!({ "replayed": false, "result": result }),
    ))
}

/// POST /internal/v1/merchants/:id/delete
///
/// Business account deletion ("Suprimir conta Business"). Reuses the canonical
/// `retire_business` primitive (refuses while a settlement is in flight, cancels
/// open sessions/links, sweeps fictitious balances to transit via balanced
/// postings and closes segregated accounts), then closes the merchant to a
/// tombstone, retires its @banza handle, and scrubs the public profile PII.
/// Business/financial/KYB history (merchants row, ledger, settlements, audit,
/// KYB) is RETAINED. Sandbox-only, idempotent, fail-closed. The service layer
/// (api-gateway) revokes sessions/API keys and cleans up developer bindings
/// afterwards; `merchants.status = CLOSED` is already sufficient to block any new
/// business sign-in regardless of that cleanup.
pub async fn delete_business(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    if state.environment.is_live() {
        return Err(ApiError::forbidden(
            "account deletion runs only in the Sandbox",
        ));
    }
    let merchant =
        Uuid::parse_str(&id).map_err(|_| ApiError::bad_request("invalid merchant id"))?;
    let db = |e: sqlx::Error| ApiError::internal(e.to_string());
    let subject = format!("merchant:{merchant}");
    let key = format!("business-delete:{merchant}");
    let reason = "Business account deletion requested by the account holder";
    let by = format!("MERCHANT:{merchant}");

    let mut tx = state.pool.begin().await.map_err(db)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('account-delete:' || $1::text))")
        .bind(merchant)
        .execute(&mut *tx)
        .await
        .map_err(db)?;

    // Idempotent: a replay returns exactly what the first deletion did.
    if let Some(prev) = sqlx::query_scalar::<_, serde_json::Value>(
        "SELECT metadata FROM audit_log WHERE action = 'BUSINESS_DELETED' AND subject = $1 LIMIT 1",
    )
    .bind(&subject)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db)?
    {
        return Ok(Json(
            serde_json::json!({ "replayed": true, "result": prev }),
        ));
    }

    // Must exist (lock the row).
    let exists: Option<String> =
        sqlx::query_scalar("SELECT status FROM merchants WHERE id = $1 FOR UPDATE")
            .bind(merchant)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db)?;
    if exists.is_none() {
        return Err(ApiError::not_found("merchant not found"));
    }

    // Retire the Business (money-safe, refuses in-flight settlement).
    let retired = crate::routes::sandbox_reset::retire_business(
        &mut tx,
        &state,
        merchant,
        &by,
        reason,
        &format!("delete:{key}"),
        "account_deletion",
    )
    .await?;

    // Close the merchant (tombstone) — business/financial/KYB history stays.
    sqlx::query("UPDATE merchants SET status = 'CLOSED', updated_at = now() WHERE id = $1")
        .bind(merchant)
        .execute(&mut *tx)
        .await
        .map_err(db)?;

    // Revoke every live API key (core-owned; atomic with the close).
    let keys_revoked = sqlx::query(
        "UPDATE api_keys SET revoked_at = now() WHERE merchant_id = $1 AND revoked_at IS NULL",
    )
    .bind(merchant)
    .execute(&mut *tx)
    .await
    .map_err(db)?
    .rows_affected();

    // Retire the @banza handle from circulation.
    let handle_retired = sqlx::query(
        "UPDATE handle_registry
            SET owner_type = 'SYSTEM', owner_id = NULL, reserved_reason = 'ACCOUNT_DELETED'
          WHERE owner_type = 'MERCHANT' AND owner_id = $1",
    )
    .bind(merchant)
    .execute(&mut *tx)
    .await
    .map_err(db)?
    .rows_affected();

    // Scrub the public profile PII and take it out of discovery. The display name
    // is NOT NULL, so it becomes a neutral placeholder; the rest is nulled.
    let social_removed = sqlx::query(
        "DELETE FROM merchant_social_links
          WHERE profile_id IN (SELECT id FROM merchant_profiles WHERE merchant_id = $1)",
    )
    .bind(merchant)
    .execute(&mut *tx)
    .await
    .map_err(db)?
    .rows_affected();
    sqlx::query(
        "UPDATE merchant_profiles
            SET display_name = 'Conta eliminada', tagline = NULL, description = NULL,
                logo_url = NULL, cover_url = NULL, public = false, updated_at = now()
          WHERE merchant_id = $1",
    )
    .bind(merchant)
    .execute(&mut *tx)
    .await
    .map_err(db)?;

    let result = serde_json::json!({
        "retired_minor": retired.retired_minor,
        "sessions_cancelled": retired.sessions_cancelled,
        "links_cancelled": retired.links_cancelled,
        "accounts_closed": retired.accounts_closed,
        "api_keys_revoked": keys_revoked,
        "handle_retired": handle_retired,
        "social_links_removed": social_removed,
    });
    sqlx::query(
        "INSERT INTO audit_log (actor, action, subject, metadata) VALUES ($1, 'BUSINESS_DELETED', $2, $3)",
    )
    .bind(&by)
    .bind(&subject)
    .bind(&result)
    .execute(&mut *tx)
    .await
    .map_err(db)?;

    tx.commit().await.map_err(db)?;

    Ok(Json(
        serde_json::json!({ "replayed": false, "result": result }),
    ))
}
