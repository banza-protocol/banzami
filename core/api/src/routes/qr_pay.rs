//! Paying a structured Banzami QR (CAP-PAY-003).
//!
//! # Why this route is shaped the way it is
//!
//! There used to be `POST /v1/qr/pay` on the MERCHANT surface, and it took the
//! payer as a free-text field on a merchant credential. Anyone holding a
//! merchant API key could name any consumer and take their money. It was
//! withdrawn (RA-053) and `/internal/v1/qr/pay` went onto the withdrawn-routes
//! list, where it remains: that path is the broken contract's name and must stay
//! unmounted.
//!
//! This is the rebuilt contract, at a different path that says what changed.
//! The payer is **not a field**. It is the consumer the public API authenticated,
//! forwarded here by a service that has no way to speak for anyone else. There
//! is nothing in the request body to forge, which is the only durable form of
//! the guarantee the old route failed to make (docs/security/
//! QR-PAY-AUTHORITY-CONTRACT.md).
//!
//! # Order of checks
//!
//! 1. The payer is the caller, by construction — no authority question to ask.
//! 2. Freeze: a frozen payer pays nothing and a frozen recipient is paid nothing.
//! 3. QR validity: decode, fetch the record, verify the HMAC **against the
//!    record**, check ACTIVE and not expired. `resolve_for_payment` does all of
//!    this and is the single entry point the payment path may use — a payload
//!    validated on its own contents proves nothing (INV-QR-SIGN-001).
//! 4. Amount: a dynamic QR's amount is the record's. A client-supplied amount is
//!    ignored, never merged — the whole point of a fixed-amount code is that the
//!    payer cannot choose. A static QR has no amount and requires one.
//! 5. Balance, then the posting.
//!
//! # Atomicity
//!
//! The single-use claim is a conditional UPDATE inside the same transaction as
//! the ledger posting — `WHERE status = 'ACTIVE'`, and a row count of zero
//! aborts the whole thing. Two payers scanning the same dynamic code race on
//! that statement and exactly one wins; the loser's ledger entries never commit.
//!
//! That is why the engine's `mark_used` + `release_claim` pair is not used here.
//! Claiming on one connection and posting on another leaves a window where the
//! code is spent and the money has not moved, and `release_claim` is a
//! compensation for a window that does not need to exist (INV-QR-004,
//! INV-LEDGER-004).

use axum::{extract::State, Json};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;
use uuid::Uuid;

use banzami_qr::{QrCodeType, QrEngine, QrError, QrOwnerType};

use crate::{
    error::{ApiError, ApiResult},
    routes::risk,
    state::AppState,
};

#[derive(Deserialize)]
pub struct PayQrBody {
    /// The paying consumer. Supplied by the public API from the session it
    /// authenticated — never by the person scanning, and never by a merchant.
    pub payer_consumer_id: String,
    /// The scanned payload, exactly as read from the code.
    pub payload: String,
    /// Only meaningful for a static (open-amount) QR. Ignored for a dynamic one.
    pub amount_minor: Option<i64>,
    pub idempotency_key: String,
}

/// Where the money is going, resolved from the QR's owner.
struct Recipient {
    /// The consumer credited, for a consumer-owned QR. `None` for a merchant.
    consumer_id: Option<Uuid>,
    /// The ledger account credited.
    account_id: Uuid,
}

/// POST /internal/v1/consumer/qr/pay
pub async fn pay(
    State(state): State<AppState>,
    Json(body): Json<PayQrBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let payer_id: Uuid = body
        .payer_consumer_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid payer_consumer_id"))?;
    if body.idempotency_key.trim().is_empty() {
        return Err(ApiError::bad_request("idempotency_key is required"));
    }

    // A freeze is total: neither side of a frozen pair moves money.
    risk::ensure_not_frozen(&state.pool, "CONSUMER", payer_id).await?;

    // ── QR validity ────────────────────────────────────────────────────────
    let target = state
        .qr
        .resolve_for_payment(&body.payload)
        .await
        .map_err(map_qr_error)?;

    // ── Amount ─────────────────────────────────────────────────────────────
    //
    // A dynamic QR's amount comes from the signed record. A client value is
    // discarded rather than compared, because "compared" invites a future patch
    // that tolerates a difference.
    let amount = match target.amount_minor {
        Some(fixed) => fixed,
        None => body.amount_minor.filter(|&a| a > 0).ok_or_else(|| {
            ApiError::unprocessable("AMOUNT_REQUIRED", "amount_minor is required")
        })?,
    };
    if amount <= 0 {
        return Err(ApiError::unprocessable(
            "AMOUNT_NEGATIVE",
            "amount_minor must be positive",
        ));
    }

    let currency = target.currency.code().to_string();
    let recipient = resolve_recipient(&state, &target, &currency).await?;

    if let Some(rid) = recipient.consumer_id {
        risk::ensure_not_frozen(&state.pool, "CONSUMER", rid).await?;
        if rid == payer_id {
            return Err(ApiError::bad_request("cannot pay your own QR code"));
        }
    }

    let payer_wallet = sqlx::query!(
        "SELECT id, available_account_id FROM consumer_wallets
          WHERE consumer_id = $1 AND currency = $2 AND status = 'ACTIVE'",
        payer_id,
        currency,
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::unprocessable("WALLET_NOT_FOUND", "payer has no active wallet"))?;

    // ── Posting ────────────────────────────────────────────────────────────
    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    // Claim the code first, under the transaction. A dynamic QR is single-use,
    // and this conditional UPDATE is the claim: whoever's statement takes the
    // row from ACTIVE wins, and everyone else sees zero rows and is refused
    // before a single ledger entry exists.
    if target.qr_type == QrCodeType::Dynamic {
        let qr_id = target
            .qr_code_id
            .ok_or_else(|| ApiError::internal("resolved dynamic QR has no id"))?;
        let claimed = sqlx::query(
            "UPDATE qr_codes SET status = 'USED', used_at = now()
              WHERE id = $1 AND status = 'ACTIVE'",
        )
        .bind(qr_id.as_uuid())
        .execute(&mut *tx)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
        if claimed.rows_affected() != 1 {
            return Err(ApiError::unprocessable(
                "QR_ALREADY_USED",
                "QR code has already been used",
            ));
        }
    }

    let payer_balance: i64 = sqlx::query_scalar!(
        r#"
        SELECT COALESCE(
            (SELECT SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor ELSE -amount_minor END)
               FROM ledger_entries WHERE account_id = $1),
            0
        )::BIGINT
        "#,
        payer_wallet.available_account_id,
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .unwrap_or(0);

    if payer_balance < amount {
        return Err(ApiError::unprocessable(
            "INSUFFICIENT_FUNDS",
            format!("available {payer_balance}, requested {amount}"),
        ));
    }

    let now = Utc::now();
    let transfer_id = Uuid::new_v4();
    // The ledger key is the caller's idempotency key, so a retried scan reuses
    // the same posting instead of moving the money twice.
    let ledger_key = format!("qr-pay-{}", body.idempotency_key);

    sqlx::query!(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4) ON CONFLICT (idempotency_key) DO NOTHING",
        Uuid::new_v4(),
        format!("qr-pay:{}", transfer_id),
        ledger_key,
        now,
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let posting_id: Uuid = sqlx::query_scalar!(
        "SELECT id FROM ledger_postings WHERE idempotency_key = $1",
        ledger_key,
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // uq_ledger_entry_posting_type (migration 0040) allows at most one DEBIT and
    // one CREDIT per posting, so a replay lands on the conflict and adds nothing.
    sqlx::query!(
        "INSERT INTO ledger_entries
             (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
         VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6) ON CONFLICT DO NOTHING",
        Uuid::new_v4(),
        posting_id,
        payer_wallet.available_account_id,
        amount,
        currency,
        now,
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    sqlx::query!(
        "INSERT INTO ledger_entries
             (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
         VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6) ON CONFLICT DO NOTHING",
        Uuid::new_v4(),
        posting_id,
        recipient.account_id,
        amount,
        currency,
        now,
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // `recipient_id` is the consumer for a P2P QR and the merchant for a
    // business one — the same column the rest of the product reads as "who was
    // paid". Runtime query so the nullable-recipient shape needs no new offline
    // cache entry.
    let recipient_id = recipient.consumer_id.unwrap_or(target.owner_id);
    sqlx::query(
        // `initiated_via = 'QR'` is recorded, not inferred. The receipt's channel
        // used to be derived from the row's shape — joined to a payment link or
        // not — and a QR payment joins none, so it would have been signed as
        // "paid by @banza": a proof asserting the payer did something they did
        // not do.
        "INSERT INTO transfers
             (id, idempotency_key, sender_id, recipient_id, amount_minor, currency,
              status, ledger_posting_id, environment, initiated_via, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7, $8, 'QR', $9, $9)
         ON CONFLICT (idempotency_key) DO NOTHING",
    )
    .bind(transfer_id)
    .bind(&body.idempotency_key)
    .bind(payer_id)
    .bind(recipient_id)
    .bind(amount)
    .bind(&currency)
    .bind(posting_id)
    // From the process, never the caller: the column default is 'LIVE', and
    // omitting it recorded Sandbox money as real.
    .bind(state.environment.as_str())
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    // A replayed idempotency key hits the ON CONFLICT above and inserts nothing,
    // so the transfer that exists is the first one — return it rather than the
    // id this attempt generated, which belongs to no row.
    let settled_transfer_id: Uuid =
        sqlx::query_scalar("SELECT id FROM transfers WHERE idempotency_key = $1")
            .bind(&body.idempotency_key)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?;

    tx.commit()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    // ── After the money moved ──────────────────────────────────────────────
    //
    // A merchant QR payment is recorded as a wallet payment: the typed,
    // refundable object a refund names. A consumer-owned QR is a P2P transfer
    // and is never recorded here.
    let wallet_payment_id = super::wallet_payments::record_merchant_qr_payment(
        &state.pool,
        target.owner_type,
        target.owner_id,
        settled_transfer_id,
        payer_id,
        target.qr_code_id.map(|id| id.as_uuid()),
        amount,
        &currency,
        &body.idempotency_key,
        state.environment.as_str(),
    )
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    risk::audit(
        &state.pool,
        "CONSUMER",
        "QR_PAYMENT_COMPLETED",
        &format!("consumer:{payer_id}"),
        json!({
            "qr_type":      format!("{:?}", target.qr_type),
            "owner_type":   format!("{:?}", target.owner_type),
            "amount_minor": amount,
            "transfer_id":  settled_transfer_id,
        }),
        None,
    )
    .await;

    Ok(Json(json!({
        "transfer_id":       settled_transfer_id,
        "wallet_payment_id": wallet_payment_id,
        "amount_minor":      amount,
        "currency":          currency,
        "qr_type":           match target.qr_type {
            QrCodeType::Static => "STATIC",
            QrCodeType::Dynamic => "DYNAMIC",
        },
        "paid_at":           now,
    })))
}

/// Resolves the QR's owner into the account that gets credited.
///
/// A consumer owner is paid into their own wallet. A merchant owner is paid into
/// the wallet account the QR names when it names one (ADR-042 — a campaign or
/// segregated account), and into the merchant's default account otherwise. The
/// wallet account comes from the signed DB record, never from the payload, so it
/// cannot be redirected by whoever prints the code.
async fn resolve_recipient(
    state: &AppState,
    target: &banzami_qr::ResolvedQrTarget,
    currency: &str,
) -> Result<Recipient, ApiError> {
    let owner_id = target.owner_id;
    match target.owner_type {
        QrOwnerType::Consumer => {
            let w = sqlx::query!(
                "SELECT consumer_id, available_account_id FROM consumer_wallets
                  WHERE consumer_id = $1 AND currency = $2 AND status = 'ACTIVE'",
                owner_id,
                currency,
            )
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?
            .ok_or_else(|| {
                ApiError::unprocessable("WALLET_NOT_FOUND", "recipient has no active wallet")
            })?;
            Ok(Recipient {
                consumer_id: Some(w.consumer_id),
                account_id: w.available_account_id,
            })
        }
        QrOwnerType::Merchant => {
            if let Some(account_id) = target.wallet_account_id {
                // Re-validated at pay time (ADR-027): the account must still be
                // the owner's, still active, and still in this currency.
                let row = sqlx::query(
                    "SELECT wa.id FROM wallet_accounts wa
                       JOIN wallets w ON w.id = wa.wallet_id
                      WHERE wa.id = $1 AND wa.status = 'ACTIVE'
                        AND w.currency = $2 AND (w.id = $3 OR w.merchant_id = $3)",
                )
                .bind(account_id)
                .bind(currency)
                .bind(owner_id)
                .fetch_optional(&state.pool)
                .await
                .map_err(|e| ApiError::internal(e.to_string()))?;
                let row = row.ok_or_else(|| {
                    ApiError::unprocessable(
                        "INVALID_WALLET_ACCOUNT",
                        "the account this QR routes to is no longer available",
                    )
                })?;
                return Ok(Recipient {
                    consumer_id: None,
                    account_id: row
                        .try_get("id")
                        .map_err(|e| ApiError::internal(e.to_string()))?,
                });
            }
            // The merchant's own wallet, addressed either by merchant id or by
            // wallet id — both conventions exist in the product.
            let row = sqlx::query(
                "SELECT available_account_id FROM wallets
                  WHERE (id = $1 OR merchant_id = $1) AND currency = $2 AND status = 'ACTIVE'
                  LIMIT 1",
            )
            .bind(owner_id)
            .bind(currency)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?
            .ok_or_else(|| {
                ApiError::unprocessable("WALLET_NOT_FOUND", "recipient has no active wallet")
            })?;
            Ok(Recipient {
                consumer_id: None,
                account_id: row
                    .try_get("available_account_id")
                    .map_err(|e| ApiError::internal(e.to_string()))?,
            })
        }
    }
}

/// The protocol's error contract, so the consumer surface can pass it through
/// rather than inventing its own words for the same situations.
fn map_qr_error(e: QrError) -> ApiError {
    match e {
        QrError::InvalidPayload(msg) => ApiError::bad_request(format!("INVALID_PAYLOAD: {msg}")),
        QrError::NotFound(_) => ApiError::not_found("QR code not found"),
        QrError::InvalidSignature => ApiError::unprocessable(
            "INVALID_SIGNATURE",
            "this QR code's signature does not match",
        ),
        QrError::AlreadyExpired => ApiError::unprocessable("QR_EXPIRED", "QR code has expired"),
        QrError::AlreadyUsedOrExpired => {
            ApiError::unprocessable("QR_ALREADY_USED", "QR code has already been used")
        }
        other => ApiError::internal(other.to_string()),
    }
}
