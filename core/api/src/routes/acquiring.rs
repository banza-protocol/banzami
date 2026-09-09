use axum::{
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Timelike, Utc};
use serde::{Deserialize, Serialize};

use banzami_acquiring::{AcquiringEngine, AcquiringError, AcquiringPayment};
use banzami_types::{LedgerEntryId, LedgerPostingId, PaymentLinkId, WalletId};

use crate::{
    error::{ApiError, ApiResult},
    routes::risk,
    state::AppState,
};

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct PaymentInstructionsResponse {
    pub method: String,
    pub entity: String,
    pub reference: String,
}

#[derive(Serialize)]
pub struct AcquiringPaymentResponse {
    pub id: String,
    pub payment_link_id: String,
    pub provider: String,
    pub external_ref: String,
    pub status: String,
    pub amount_minor: i64,
    pub currency: String,
    pub instructions: PaymentInstructionsResponse,
    pub confirmed_at: Option<DateTime<Utc>>,
    pub failed_at: Option<DateTime<Utc>>,
    pub failure_reason: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

impl From<AcquiringPayment> for AcquiringPaymentResponse {
    fn from(p: AcquiringPayment) -> Self {
        Self {
            id: p.id.to_string(),
            payment_link_id: p.payment_link_id.to_string(),
            provider: p.provider,
            external_ref: p.external_ref,
            status: p.status.as_str().to_string(),
            amount_minor: p.amount.amount_minor(),
            currency: p.amount.currency.code().to_string(),
            instructions: PaymentInstructionsResponse {
                method: p.instructions.method,
                entity: p.instructions.entity,
                reference: p.instructions.reference,
            },
            confirmed_at: p.confirmed_at,
            failed_at: p.failed_at,
            failure_reason: p.failure_reason,
            expires_at: p.expires_at,
            created_at: p.created_at,
        }
    }
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

fn map_err(e: AcquiringError) -> ApiError {
    match e {
        AcquiringError::NotFound(_) | AcquiringError::ExternalRefNotFound(_) => {
            ApiError::not_found(e.to_string())
        }
        AcquiringError::Provider(p) => ApiError::unprocessable("PROVIDER_ERROR", p.to_string()),
        AcquiringError::Database(db) => ApiError::internal(db.to_string()),
        AcquiringError::UnknownStatus(s) => {
            ApiError::internal(format!("unknown acquiring status: {s}"))
        }
        AcquiringError::Internal(msg) => ApiError::internal(msg),
    }
}

// ---------------------------------------------------------------------------
// POST /internal/v1/acquiring/payments
// Initiates a new Multicaixa Express payment for a payment link.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct InitiateBody {
    pub payment_link_id: String,
    pub amount_minor: i64,
    pub currency: String,
}

pub async fn initiate_payment(
    State(state): State<AppState>,
    Json(body): Json<InitiateBody>,
) -> ApiResult<(StatusCode, Json<AcquiringPaymentResponse>)> {
    let payment_link_id = body
        .payment_link_id
        .parse::<PaymentLinkId>()
        .map_err(|_| ApiError::bad_request("invalid payment_link_id"))?;

    let currency = banzami_types::Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unknown currency: {}", body.currency)))?;

    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
    }

    let amount = banzami_types::Money::new(body.amount_minor, currency);

    let payment = state
        .acquiring
        .initiate_payment(payment_link_id, amount)
        .await
        .map_err(map_err)?;

    Ok((StatusCode::CREATED, Json(payment.into())))
}

// ---------------------------------------------------------------------------
// POST /internal/v1/acquiring/callbacks/emis
// Receives and processes a raw EMIS / simulated provider callback.
// The raw body and Banza-Signature header are forwarded verbatim.
// ---------------------------------------------------------------------------

pub async fn emis_callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<AcquiringPaymentResponse>> {
    let signature = headers
        .get("Banza-Signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let payment = state
        .acquiring
        .process_callback(&body, signature)
        .await
        .map_err(|e| match e {
            AcquiringError::Provider(ref p) if p.to_string().contains("invalid callback") => {
                ApiError::unprocessable("INVALID_SIGNATURE", p.to_string())
            }
            other => map_err(other),
        })?;

    settle_confirmed_payment(&state, &payment).await?;

    Ok(Json(payment.into()))
}

/// Credit the destination wallet account for a CONFIRMED acquiring payment.
///
/// ONE RAIL, ONE BEHAVIOUR
///
/// This was the body of `emis_callback`, which meant the only confirmation path
/// that exists in Sandbox — `test_confirm`, driving the simulated provider — ran
/// `process_callback` and stopped. It flipped `acquiring_payments.status` to
/// CONFIRMED and moved no money whatsoever: the payer was shown a terminal
/// success, the merchant's balance never changed, and nothing was emitted. An
/// integration that passed in Sandbox would have behaved differently in Live,
/// which is the one thing a Sandbox may never do. Both callers now settle here.
///
/// THE DESTINATION IS THE ACCOUNT THE INTERFACE NAMED
///
/// The credit landed on `wallets.available_account_id` — the wallet default —
/// ignoring `payment_links.wallet_account_id`, whose own migration (0084) states
/// that a link carrying a destination account exists so that "when it is paid the
/// transfer credits THAT account — not the wallet's default available account".
/// Money paid to a segregated account (a DOA campaign, an escrow) therefore
/// landed in the merchant's general balance. The destination is now the account
/// the interface names; the wallet default applies only to a legacy link that
/// names none.
///
/// A named account that does not validate does NOT fall back to the default.
/// ADR-042 requires the account to belong to this wallet, be ACTIVE and match the
/// currency, and the transfer engine re-checks exactly that at pay time — a check
/// this path bypasses by posting directly, so it performs it itself. Crediting the
/// default because the named account failed validation is the same defect in a
/// quieter form, so the settlement is withheld for reconciliation instead.
///
/// THE POSTING IS ONE POSTING
///
/// The header and the two entries were three separate statements with no
/// enclosing transaction. A failure between them persists a posting with one leg
/// — a direct violation of BANZA INV-LEDGER-004 ("a posting is atomic: partial
/// postings never persist") and of the global zero-sum it underwrites. They now
/// commit together or not at all.
///
/// Idempotency is the UNIQUE insert itself, not a preceding existence check. The
/// old `SELECT EXISTS` left a window in which two concurrent callbacks for the
/// same payment could both find nothing and both post; `ON CONFLICT DO NOTHING
/// RETURNING id` lets exactly one of them win and tells the loser it lost.
///
/// Best-effort by intent: the money has already reached the provider, so a
/// failure here must never un-confirm the payment.
pub async fn settle_confirmed_payment(
    state: &AppState,
    payment: &AcquiringPayment,
) -> ApiResult<()> {
    // Double-entry: system:transit DR / destination wallet account CR.
    let idempotency_key = format!("acquiring-settle-{}", payment.id);

    // Resolve the owner and the destination. `wallet_accounts.account_id` is the
    // LEDGER account that holds the balance; `payment_links.wallet_account_id`
    // names the wallet_account, so the join is what turns a routing hint into a
    // postable account. The LEFT JOIN carries ADR-042's own conditions, so a
    // named account that fails any of them comes back NULL and is refused below
    // rather than silently becoming the wallet default.
    let row: Option<(uuid::Uuid, uuid::Uuid, Option<uuid::Uuid>, Option<uuid::Uuid>, Option<uuid::Uuid>)> =
        sqlx::query_as(
            "SELECT pl.wallet_id,
                    w.merchant_id,
                    pl.wallet_account_id        AS named_account,
                    wa.account_id               AS named_ledger_account,
                    w.available_account_id      AS default_ledger_account
               FROM acquiring_payments ap
               JOIN payment_links pl ON pl.id = ap.payment_link_id
               JOIN wallets w        ON w.id  = pl.wallet_id
               LEFT JOIN wallet_accounts wa
                      ON wa.id        = pl.wallet_account_id
                     AND wa.wallet_id = pl.wallet_id
                     AND wa.status    = 'ACTIVE'
                     AND wa.currency  = ap.currency
              WHERE ap.id = $1
                AND w.status = 'ACTIVE'",
        )
        .bind(payment.id.as_uuid())
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let Some((wallet_id_raw, merchant_id_raw, named_account, named_ledger, default_ledger)) = row
    else {
        tracing::warn!(
            payment_id = %payment.id,
            "acquiring: no active wallet for this payment link — skipping settlement credit"
        );
        return Ok(());
    };

    // Refuse to credit a frozen merchant's wallet.
    if risk::is_frozen(&state.pool, "MERCHANT", merchant_id_raw).await {
        risk::flag_suspicious(
            &state.pool,
            "MERCHANT",
            merchant_id_raw,
            "FROZEN_ACCOUNT_ATTEMPT",
            "acquiring callback received for a frozen merchant",
            serde_json::json!({ "payment_id": payment.id.to_string() }),
        )
        .await;
        tracing::warn!(
            payment_id   = %payment.id,
            merchant_id  = %merchant_id_raw,
            "acquiring: merchant is frozen — skipping settlement credit"
        );
        return Ok(());
    }

    let destination_account_id = match (named_account, named_ledger) {
        // A legacy link names no account: the wallet's default, exactly as before.
        (None, _) => default_ledger,
        // The named account validated — this is the account the payer paid into.
        (Some(_), Some(ledger)) => Some(ledger),
        // Named but not valid for this wallet/currency/status. Crediting the
        // default here would put segregated money in the general balance, which
        // is the defect this function exists to correct, so nothing is posted.
        (Some(named), None) => {
            risk::flag_suspicious(
                &state.pool,
                "MERCHANT",
                merchant_id_raw,
                "SETTLEMENT_DESTINATION_INVALID",
                "payment link names a wallet account that is not active/owned/matching currency",
                serde_json::json!({
                    "payment_id":        payment.id.to_string(),
                    "wallet_account_id": named.to_string(),
                    "wallet_id":         wallet_id_raw.to_string(),
                    "currency":          payment.amount.currency.code(),
                }),
            )
            .await;
            tracing::error!(
                payment_id        = %payment.id,
                wallet_account_id = %named,
                "acquiring: named destination account failed ADR-042 validation — \
                 withholding settlement rather than crediting the wallet default"
            );
            return Ok(());
        }
    };

    let Some(destination_account_id) = destination_account_id else {
        tracing::warn!(
            payment_id = %payment.id,
            wallet_id  = %wallet_id_raw,
            "acquiring: wallet has no available account — skipping settlement credit"
        );
        return Ok(());
    };

    let wallet_id: WalletId = wallet_id_raw
        .to_string()
        .parse()
        .map_err(|_| ApiError::internal("invalid wallet_id from payment link"))?;

    let now = Utc::now();
    let currency = payment.amount.currency.code();
    let amt = payment.amount.amount_minor();

    // One transaction: the header and both legs, or neither (INV-LEDGER-004).
    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    // The UNIQUE key IS the idempotency check. A replayed callback inserts
    // nothing and returns no row, so it posts nothing — and two concurrent
    // callbacks cannot both win.
    let posting_id: Option<uuid::Uuid> = sqlx::query_scalar(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id",
    )
    .bind(LedgerPostingId::new().as_uuid())
    .bind(format!("Acquiring settlement — {}", payment.id))
    .bind(&idempotency_key)
    .bind(now)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    let Some(posting_id) = posting_id else {
        // Already settled by an earlier callback. Nothing to add.
        let _ = tx.rollback().await;
        tracing::info!(
            payment_id = %payment.id,
            "acquiring: settlement already posted — replay credited nothing"
        );
        return Ok(());
    };

    for (entry_type, account_id) in [
        ("DEBIT", state.transit_account_id.as_uuid()),
        ("CREDIT", destination_account_id),
    ] {
        sqlx::query(
            "INSERT INTO ledger_entries
             (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(LedgerEntryId::new().as_uuid())
        .bind(posting_id)
        .bind(account_id)
        .bind(entry_type)
        .bind(amt)
        .bind(currency)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    }

    tx.commit()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    // Velocity counters (fire-and-forget).
    let hour_start = now
        .date_naive()
        .and_hms_opt(now.hour(), 0, 0)
        .map(|d| d.and_utc())
        .unwrap_or(now);
    let day_start = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .map(|d| d.and_utc())
        .unwrap_or(now);
    risk::increment_velocity(
        &state.pool,
        "MERCHANT",
        merchant_id_raw,
        "HOURLY",
        hour_start,
        amt,
    )
    .await;
    risk::increment_velocity(
        &state.pool,
        "MERCHANT",
        merchant_id_raw,
        "DAILY",
        day_start,
        amt,
    )
    .await;

    // Audit log (fire-and-forget).
    risk::audit(
        &state.pool,
        "SYSTEM",
        "ACQUIRING_SETTLED",
        &format!("WALLET:{wallet_id}"),
        serde_json::json!({
            "payment_id":        payment.id.to_string(),
            "merchant_id":       merchant_id_raw.to_string(),
            "amount_minor":      amt,
            "currency":          currency,
            "posting_id":        posting_id.to_string(),
            "destination_account_id": destination_account_id.to_string(),
        }),
        None,
    )
    .await;

    tracing::info!(
        payment_id   = %payment.id,
        wallet_id    = %wallet_id,
        destination  = %destination_account_id,
        amount_minor = amt,
        currency     = currency,
        "acquiring: wallet account credited after provider confirmation"
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// POST /internal/v1/acquiring/test/confirm
// Development helper: generates a signed callback for a simulated payment
// and runs it through the full callback processing pipeline.
// Returns 404 in production (provider returns None for generate_test_callback).
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct TestConfirmQuery {
    pub external_ref: String,
    pub currency: Option<String>,
}

pub async fn test_confirm(
    State(state): State<AppState>,
    Query(q): Query<TestConfirmQuery>,
) -> ApiResult<Json<AcquiringPaymentResponse>> {
    if state.environment.is_live() {
        tracing::error!("acquiring::test_confirm called in LIVE environment — rejected");
        return Err(ApiError::forbidden(
            "test-confirm is not available in LIVE environment",
        ));
    }

    let currency = q.currency.as_deref().unwrap_or("AOA");

    // Fetch the existing payment to get the correct amount for the callback payload.
    let existing = state
        .acquiring
        .get_payment_by_external_ref(&q.external_ref)
        .await
        .map_err(map_err)?;

    let amount_minor = existing.amount.amount_minor();

    let (body, signature) = state
        .acquiring
        .generate_test_callback(&q.external_ref, amount_minor, currency)
        .ok_or_else(|| {
            ApiError::not_found("test confirm is only available with ACQUIRING_PROVIDER=SIMULATED")
        })?;

    let payment = state
        .acquiring
        .process_callback(&body, &signature)
        .await
        .map_err(map_err)?;

    // The simulated rail settles through the SAME function the provider callback
    // uses. Without this the only confirmation available in Sandbox confirmed the
    // provider and moved no money, so a payer saw success against an unchanged
    // balance — and an integration verified here would have behaved differently
    // in Live.
    settle_confirmed_payment(&state, &payment).await?;

    Ok(Json(payment.into()))
}
