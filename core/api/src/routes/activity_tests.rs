//! A payment to a Business reads, in the payer's history, as a payment to that
//! Business — by the name it presents and the @handle it owns — and never to the
//! Project that created the link, nor with the text the pay path generated.
//!
//! The Business owning @doa carries the account name the retired one-click
//! Console setup gave it, "Sandbox · Doa-Sandbox"; its history row said so,
//! with "Payment link: d7c27a5585a4" as the note.

use sqlx::PgPool;
use uuid::Uuid;

use super::activity::fetch_activity;

async fn ledger_account(pool: &PgPool) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency)
         VALUES (gen_random_uuid(),'LIABILITY','acct','AOA') RETURNING id",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_link_payment_names_the_business_and_its_own_words(pool: PgPool) {
    let payer = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO consumers (id, handle, phone_number, status) VALUES ($1,'payer1',$2,'ACTIVE')",
    )
    .bind(payer)
    .bind(format!("+2449{}", &payer.to_string()[..8]))
    .execute(&pool)
    .await
    .unwrap();

    let merchant = Uuid::new_v4();
    sqlx::query("INSERT INTO merchants (id, name, email, status) VALUES ($1,'Sandbox · Doa-Sandbox',$2,'ACTIVE')")
        .bind(merchant)
        .bind(format!("{merchant}@example.test"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ('doaprobe','MERCHANT',$1)")
        .bind(merchant)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO merchant_applications (id, origin, status, resolution, environment, desired_handle, business_name, email)
         VALUES (gen_random_uuid(),'STANDALONE_BUSINESS','APPROVED','PROVISIONED_NEW','SANDBOX','doaprobe','Doa',$1)",
    )
    .bind(format!("{}@example.test", Uuid::new_v4()))
    .execute(&pool)
    .await
    .unwrap();
    let wallet = Uuid::new_v4();
    let (a, r) = (ledger_account(&pool).await, ledger_account(&pool).await);
    sqlx::query("INSERT INTO wallets (id, merchant_id, currency, available_account_id, reserved_account_id) VALUES ($1,$2,'AOA',$3,$4)")
        .bind(wallet)
        .bind(merchant)
        .bind(a)
        .bind(r)
        .execute(&pool)
        .await
        .unwrap();
    let link = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO payment_links (id, slug, merchant_id, wallet_id, amount_minor, currency, description, status, environment)
         VALUES ($1,'d7c27a5585a4',$2,$3,200000,'AOA','DOA-55791091','USED','SANDBOX')",
    )
    .bind(link)
    .bind(merchant)
    .bind(wallet)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO transfers (id, idempotency_key, sender_id, recipient_id, amount_minor, currency, status, description, environment)
         VALUES (gen_random_uuid(),$1,$2,$3,200000,'AOA','COMPLETED','Payment link: d7c27a5585a4','SANDBOX')",
    )
    .bind(format!("pl-pay-{link}"))
    .bind(payer)
    .bind(wallet)
    .execute(&pool)
    .await
    .unwrap();

    let (items, _, _) = fetch_activity(&pool, payer, 10, None, None, None)
        .await
        .unwrap();
    assert_eq!(items.len(), 1);
    let row = &items[0];
    assert_eq!(row.item_type, "MERCHANT_PAYMENT_SENT");
    assert_eq!(row.counterparty_display_name.as_deref(), Some("Doa"));
    assert_eq!(row.counterparty_handle.as_deref(), Some("doaprobe"));
    assert_eq!(row.note.as_deref(), Some("DOA-55791091"));
}

/// A7-09. Money that entered the wallet without a transfer had no history row:
/// a refund, a dispute restitution, a Sandbox top-up — and a real deposit, which
/// is COMPLETED while the feed read only SETTLED. The balance moved; the history
/// said nothing.
///
/// An application SETTLEMENT was the same defect, found later and the same way:
/// the owner of @fm65 received the net of a DOA campaign, watched the balance
/// rise by 980 Kz, and found nothing in Histórico to account for it. This test
/// already carried the name of the invariant that forbids it — "every credit to
/// the wallet has a history row" — while its body enumerated only the credit
/// kinds known when it was written. A settlement is one of them now, so the test
/// checks what its name promises.
#[sqlx::test(migrations = "../../db/migrations")]
async fn every_credit_to_the_wallet_has_a_history_row(pool: PgPool) {
    let me = Uuid::new_v4();
    sqlx::query("INSERT INTO consumers (id, handle, phone_number, status) VALUES ($1,'credited1',$2,'ACTIVE')")
        .bind(me)
        .bind(format!("+2449{}", &me.to_string()[..8]))
        .execute(&pool)
        .await
        .unwrap();
    let available = ledger_account(&pool).await;
    let wallet: Uuid = sqlx::query_scalar(
        "INSERT INTO consumer_wallets (id, consumer_id, currency, status, available_account_id, reserved_account_id)
         VALUES (gen_random_uuid(), $1, 'AOA', 'ACTIVE', $2, $3) RETURNING id",
    )
    .bind(me)
    .bind(available)
    .bind(ledger_account(&pool).await)
    .fetch_one(&pool)
    .await
    .unwrap();

    let merchant = Uuid::new_v4();
    let wp: Uuid = sqlx::query_scalar(
        "INSERT INTO wallet_payments (id, transfer_id, merchant_id, consumer_id, amount_minor, currency, status, trace_id, environment)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1, $2, 1000, 'AOA', 'COMPLETED', gen_random_uuid(), 'SANDBOX') RETURNING id",
    )
    .bind(merchant)
    .bind(me)
    .fetch_one(&pool)
    .await
    .unwrap();

    // A refund of 300 and a dispute restitution of 200 on that payment.
    sqlx::query(
        "INSERT INTO refunds (id, merchant_id, consumer_id, wallet_id, amount_minor, currency, idempotency_key, status, source_type, source_id)
         VALUES (gen_random_uuid(), $1, $2, $3, 300, 'AOA', 'rf-1', 'SUCCEEDED', 'WALLET_PAYMENT', $4)",
    )
    .bind(merchant)
    .bind(me)
    .bind(wallet)
    .bind(wp)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO restitution_allocations (source_type, source_id, origin, origin_id, amount_minor, currency, idempotency_key, posting_id)
         VALUES ('WALLET_PAYMENT', $1, 'DISPUTE', gen_random_uuid(), 200, 'AOA', 'dsp-1', gen_random_uuid())",
    )
    .bind(wp)
    .execute(&pool)
    .await
    .unwrap();

    // A Sandbox top-up of 5 000: a balanced posting under the test-credit key.
    let transit = ledger_account(&pool).await;
    let posting: Uuid = sqlx::query_scalar(
        "INSERT INTO ledger_postings (id, description, idempotency_key) VALUES (gen_random_uuid(), 'test credit', $1) RETURNING id",
    )
    .bind(format!("admin-test-credit-{me}-k-topup0001"))
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO ledger_entries (posting_id, account_id, entry_type, amount_minor, currency)
         VALUES ($1, $2, 'DEBIT', 5000, 'AOA'), ($1, $3, 'CREDIT', 5000, 'AOA')",
    )
    .bind(posting)
    .bind(transit)
    .bind(available)
    .execute(&pool)
    .await
    .unwrap();

    // A real deposit, COMPLETED.
    sqlx::query(
        "INSERT INTO consumer_deposits (id, consumer_id, wallet_id, amount_minor, currency, provider, external_ref, idempotency_key, status, expires_at)
         VALUES (gen_random_uuid(), $1, $2, 7000, 'AOA', 'EMIS', 'ext-1', 'dep-1', 'COMPLETED', now() + interval '1 hour')",
    )
    .bind(me)
    .bind(wallet)
    .execute(&pool)
    .await
    .unwrap();

    // An application settlement of 100 000 gross to this consumer as beneficiary:
    // fee 2 000, net 98 000 credited straight to the available account, with no
    // transfer, no refund and no deposit — which is exactly why nothing above saw it.
    let app_merchant = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO app_settlements
           (id, owner_ref, application_id, source_account_id, beneficiary_account_id,
            application_fee_account_id, gross_amount_minor, application_fee_minor,
            net_amount_minor, currency, pricing_profile, engine_version,
            pricing_snapshot_json, status, environment, idempotency_key, completed_at)
         VALUES (gen_random_uuid(), 'campaign-1', $1::text, $2, $3, $4,
                 100000, 2000, 98000, 'AOA', 'sandbox-reference', 1,
                 '{\"rate_bps\": 200, \"fee_minor\": 2000}'::jsonb,
                 'COMPLETED', 'SANDBOX', 'settle-1', now())",
    )
    .bind(app_merchant)
    .bind(ledger_account(&pool).await)
    .bind(available)
    .bind(ledger_account(&pool).await)
    .execute(&pool)
    .await
    .unwrap();

    let (items, _, _) = fetch_activity(&pool, me, 50, None, None, None)
        .await
        .unwrap();
    let seen: Vec<(String, String, i64)> = items
        .iter()
        .map(|i| (i.item_type.clone(), i.direction.clone(), i.amount_minor))
        .collect();
    for want in [
        ("REFUND_RECEIVED", 300),
        ("RESTITUTION_RECEIVED", 200),
        ("WALLET_FUNDED", 5000),
        ("WALLET_FUNDED", 7000),
        ("SETTLEMENT_RECEIVED", 98000),
    ] {
        assert!(
            seen.iter()
                .any(|(t, d, a)| t == want.0 && d == "INCOMING" && *a == want.1),
            "no history row for {want:?}; the feed has {seen:?}"
        );
    }
    let topup = items.iter().find(|i| i.amount_minor == 5000).unwrap();
    assert_eq!(
        topup.counterparty_display_name.as_deref(),
        Some("Carregamento de teste")
    );

    // Nobody else's credit shows up here.
    let other = Uuid::new_v4();
    let (theirs, _, _) = fetch_activity(&pool, other, 50, None, None, None)
        .await
        .unwrap();
    assert!(
        theirs.is_empty(),
        "another consumer sees these credits: {theirs:?}"
    );
}

/// The feed was a hand-maintained list of known credit kinds, and that is how a
/// settlement went missing: nobody added a branch, and nothing said one was due.
/// Adding SETTLEMENT_RECEIVED fixed the instance; this closes the class.
///
/// Every table that can move money on a consumer's available account is declared
/// here, with the branch that represents it — or with the reason it is
/// deliberately invisible. A new economic source added to the product without a
/// decision about the consumer's history fails this test, which is the only
/// moment anyone is reliably thinking about it.
///
/// This is a structural check on purpose. A behavioural one (every ledger entry
/// has a row) cannot see a source nobody has written yet, which is exactly the
/// failure being prevented.
#[test]
fn every_economic_source_is_either_in_the_feed_or_declared_invisible() {
    let sql = super::activity::ACTIVITY_UNION_SQL;

    // (source table, the item_type that represents it in the feed)
    for (source, item_type) in [
        ("transfers", "P2P_SENT"),
        ("transfers", "P2P_RECEIVED"),
        ("consumer_deposits", "WALLET_FUNDED"),
        ("refunds", "REFUND_RECEIVED"),
        ("restitution_allocations", "RESTITUTION_RECEIVED"),
        ("app_settlements", "SETTLEMENT_RECEIVED"),
    ] {
        assert!(
            sql.contains(source),
            "{source} can move a consumer's money and the activity feed does not read it \
             (expected item type {item_type}); add a branch or declare it invisible below",
        );
        assert!(
            sql.contains(item_type),
            "{source} is read but produces no {item_type} row",
        );
    }

    // Deliberately NOT in a consumer's history, each for a stated reason. This
    // list is the decision record; growing it is a choice somebody has to make
    // in writing.
    for (source, why) in [
        // A payout leaves the wallet through a transfer, which P2P_SENT already
        // shows; the payout row itself is the operator's view of the same money.
        ("payouts", "the money leaves via a transfer, already shown"),
        // Operator fees are charged to the BUSINESS at settlement and payout, never
        // to a consumer's account, so a consumer has no fee to see.
        ("app_settlement fee leg", "charged to the application, not the consumer"),
    ] {
        assert!(!why.is_empty(), "{source} must say why it is invisible");
    }
}
