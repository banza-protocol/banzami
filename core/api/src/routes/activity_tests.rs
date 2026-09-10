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
