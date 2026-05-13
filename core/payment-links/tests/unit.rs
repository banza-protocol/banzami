// Unit tests for the banzami-payment-links engine.
//
// Uses an in-memory repository so no database is required.
// Tests verify domain invariants: creation validation, status transitions,
// idempotency, and expiry logic.
//
// Run: cargo test -p banzami-payment-links --test unit

use std::collections::HashMap;
use std::sync::Mutex;

use chrono::{Duration, Utc};

use banzami_payment_links::{
    CreatePaymentLinkRequest, PaymentLink, PaymentLinkEngine, PaymentLinkError,
    PaymentLinkRepository, PaymentLinkStatus, PostgresPaymentLinkEngine,
};
use banzami_types::{MerchantId, PaymentLinkId, WalletId};

// ─── In-memory mock repository ───────────────────────────────────────────────

#[derive(Default)]
struct MemRepo {
    store: Mutex<HashMap<String, PaymentLink>>,
}

impl PaymentLinkRepository for MemRepo {
    async fn insert(&self, link: &PaymentLink) -> Result<(), PaymentLinkError> {
        self.store
            .lock()
            .unwrap()
            .insert(link.id.to_string(), link.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: PaymentLinkId) -> Result<Option<PaymentLink>, PaymentLinkError> {
        Ok(self
            .store
            .lock()
            .unwrap()
            .get(&id.to_string())
            .cloned())
    }

    async fn find_by_slug(&self, slug: &str) -> Result<Option<PaymentLink>, PaymentLinkError> {
        Ok(self
            .store
            .lock()
            .unwrap()
            .values()
            .find(|l| l.slug == slug)
            .cloned())
    }

    async fn list_for_merchant(
        &self,
        merchant_id: MerchantId,
        limit: i64,
        _cursor: Option<PaymentLinkId>,
    ) -> Result<Vec<PaymentLink>, PaymentLinkError> {
        let guard = self.store.lock().unwrap();
        let mut links: Vec<_> = guard
            .values()
            .filter(|l| l.merchant_id == merchant_id)
            .cloned()
            .collect();
        links.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        links.truncate(limit as usize);
        Ok(links)
    }

    async fn update_status(
        &self,
        id: PaymentLinkId,
        status: PaymentLinkStatus,
        paid_at: Option<chrono::DateTime<Utc>>,
    ) -> Result<PaymentLink, PaymentLinkError> {
        let mut guard = self.store.lock().unwrap();
        let link = guard
            .get_mut(&id.to_string())
            .ok_or(PaymentLinkError::NotFound(id))?;
        link.status  = status;
        link.paid_at = paid_at;
        link.updated_at = Utc::now();
        Ok(link.clone())
    }

    async fn expire_overdue(&self) -> Result<u64, PaymentLinkError> {
        let mut guard = self.store.lock().unwrap();
        let now = Utc::now();
        let mut expired = 0u64;
        for link in guard.values_mut() {
            if matches!(link.status, PaymentLinkStatus::Active) {
                if let Some(exp) = link.expires_at {
                    if exp <= now {
                        link.status = PaymentLinkStatus::Expired;
                        expired += 1;
                    }
                }
            }
        }
        Ok(expired)
    }
}

fn engine() -> impl PaymentLinkEngine {
    PostgresPaymentLinkEngine::new(MemRepo::default())
}

fn base_request() -> CreatePaymentLinkRequest {
    CreatePaymentLinkRequest {
        merchant_id:  MerchantId::new(),
        wallet_id:    WalletId::new(),
        amount_minor: Some(50_000),
        currency:     "AOA".to_string(),
        description:  Some("Test payment".to_string()),
        expires_at:   Some(Utc::now() + Duration::hours(1)),
    }
}

// ─── Creation ────────────────────────────────────────────────────────────────

#[tokio::test]
async fn create_with_valid_amount_succeeds() {
    let eng  = engine();
    let link = eng.create(base_request()).await.unwrap();

    assert_eq!(link.status, PaymentLinkStatus::Active);
    assert_eq!(link.amount_minor, Some(50_000));
    assert_eq!(link.currency, "AOA");
    assert!(!link.slug.is_empty(), "slug must be generated");
    assert_eq!(link.slug.len(), 12, "slug must be 12 hex chars");
}

#[tokio::test]
async fn create_without_amount_succeeds_for_open_links() {
    let eng = engine();
    let mut req = base_request();
    req.amount_minor = None;

    let link = eng.create(req).await.unwrap();
    assert!(link.amount_minor.is_none());
    assert_eq!(link.status, PaymentLinkStatus::Active);
}

#[tokio::test]
async fn create_with_zero_amount_is_rejected() {
    let eng = engine();
    let mut req = base_request();
    req.amount_minor = Some(0);

    assert!(
        matches!(eng.create(req).await, Err(PaymentLinkError::InvalidAmount)),
        "zero amount must be rejected"
    );
}

#[tokio::test]
async fn create_with_negative_amount_is_rejected() {
    let eng = engine();
    let mut req = base_request();
    req.amount_minor = Some(-100);

    assert!(
        matches!(eng.create(req).await, Err(PaymentLinkError::InvalidAmount)),
        "negative amount must be rejected"
    );
}

#[tokio::test]
async fn create_with_past_expiry_is_rejected() {
    let eng = engine();
    let mut req = base_request();
    req.expires_at = Some(Utc::now() - Duration::seconds(1));

    assert!(
        matches!(eng.create(req).await, Err(PaymentLinkError::ExpiryInPast)),
        "past expiry must be rejected"
    );
}

#[tokio::test]
async fn create_without_expiry_succeeds() {
    let eng = engine();
    let mut req = base_request();
    req.expires_at = None;

    let link = eng.create(req).await.unwrap();
    assert!(link.expires_at.is_none());
}

// ─── Get ─────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn get_returns_created_link() {
    let eng  = engine();
    let link = eng.create(base_request()).await.unwrap();
    let fetched = eng.get(link.id).await.unwrap();
    assert_eq!(fetched.id, link.id);
}

#[tokio::test]
async fn get_nonexistent_link_returns_not_found() {
    let eng = engine();
    let err = eng.get(PaymentLinkId::new()).await.unwrap_err();
    assert!(matches!(err, PaymentLinkError::NotFound(_)));
}

#[tokio::test]
async fn get_by_slug_returns_correct_link() {
    let eng  = engine();
    let link = eng.create(base_request()).await.unwrap();
    let fetched = eng.get_by_slug(&link.slug).await.unwrap();
    assert_eq!(fetched.id, link.id);
    assert_eq!(fetched.slug, link.slug);
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

#[tokio::test]
async fn cancel_active_link_succeeds() {
    let eng  = engine();
    let link = eng.create(base_request()).await.unwrap();
    let cancelled = eng.cancel(link.id).await.unwrap();
    assert_eq!(cancelled.status, PaymentLinkStatus::Cancelled);
}

#[tokio::test]
async fn cancel_already_cancelled_link_is_rejected() {
    let eng  = engine();
    let link = eng.create(base_request()).await.unwrap();
    eng.cancel(link.id).await.unwrap();

    let err = eng.cancel(link.id).await.unwrap_err();
    assert!(
        matches!(err, PaymentLinkError::NotActive(_)),
        "cancelling a cancelled link must fail"
    );
}

// ─── Mark used ───────────────────────────────────────────────────────────────

#[tokio::test]
async fn mark_used_active_link_succeeds() {
    let eng  = engine();
    let link = eng.create(base_request()).await.unwrap();
    let used = eng.mark_used(link.id).await.unwrap();
    assert_eq!(used.status, PaymentLinkStatus::Used);
    assert!(used.paid_at.is_some(), "paid_at must be set when marking as used");
}

#[tokio::test]
async fn mark_used_cancelled_link_is_rejected() {
    let eng  = engine();
    let link = eng.create(base_request()).await.unwrap();
    eng.cancel(link.id).await.unwrap();

    let err = eng.mark_used(link.id).await.unwrap_err();
    assert!(matches!(err, PaymentLinkError::NotActive(_)));
}

#[tokio::test]
async fn mark_used_already_used_link_is_rejected() {
    let eng  = engine();
    let link = eng.create(base_request()).await.unwrap();
    eng.mark_used(link.id).await.unwrap();

    let err = eng.mark_used(link.id).await.unwrap_err();
    assert!(matches!(err, PaymentLinkError::NotActive(_)));
}

#[tokio::test]
async fn mark_used_expired_link_is_rejected() {
    // Build an engine with a pre-expired link inserted directly into the repo.
    let repo = MemRepo::default();
    let merchant = MerchantId::new();
    let wallet   = WalletId::new();
    let id       = PaymentLinkId::new();
    let now      = Utc::now();

    let expired_link = PaymentLink {
        id,
        slug:         "expiredslug01".to_string(),
        merchant_id:  merchant,
        wallet_id:    wallet,
        amount_minor: Some(1000),
        currency:     "AOA".to_string(),
        description:  None,
        status:       PaymentLinkStatus::Expired,
        expires_at:   Some(now - Duration::seconds(60)),
        paid_at:      None,
        created_at:   now - Duration::hours(1),
        updated_at:   now,
    };
    repo.insert(&expired_link).await.unwrap();

    let eng = PostgresPaymentLinkEngine::new(repo);
    let err = eng.mark_used(id).await.unwrap_err();
    assert!(
        matches!(err, PaymentLinkError::NotActive(_)),
        "expired link must not be markable as used"
    );
}

// ─── List ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn list_returns_only_merchant_links() {
    let eng         = engine();
    let merchant_a  = MerchantId::new();
    let merchant_b  = MerchantId::new();
    let wallet      = WalletId::new();

    for _ in 0..3 {
        eng.create(CreatePaymentLinkRequest {
            merchant_id:  merchant_a,
            wallet_id:    wallet,
            amount_minor: Some(1000),
            currency:     "AOA".to_string(),
            description:  None,
            expires_at:   None,
        }).await.unwrap();
    }

    eng.create(CreatePaymentLinkRequest {
        merchant_id:  merchant_b,
        wallet_id:    wallet,
        amount_minor: Some(2000),
        currency:     "AOA".to_string(),
        description:  None,
        expires_at:   None,
    }).await.unwrap();

    let links = eng.list_for_merchant(merchant_a, 20, None).await.unwrap();
    assert_eq!(links.len(), 3, "must return exactly 3 links for merchant A");
    assert!(
        links.iter().all(|l| l.merchant_id == merchant_a),
        "all returned links must belong to merchant A"
    );
}

#[tokio::test]
async fn list_respects_limit() {
    let eng = engine();
    let merchant = MerchantId::new();
    let wallet   = WalletId::new();

    for _ in 0..5 {
        eng.create(CreatePaymentLinkRequest {
            merchant_id:  merchant,
            wallet_id:    wallet,
            amount_minor: Some(500),
            currency:     "AOA".to_string(),
            description:  None,
            expires_at:   None,
        }).await.unwrap();
    }

    let page = eng.list_for_merchant(merchant, 3, None).await.unwrap();
    assert_eq!(page.len(), 3);
}

// ─── Slug uniqueness ─────────────────────────────────────────────────────────

#[tokio::test]
async fn each_link_gets_a_unique_slug() {
    let eng = engine();
    let merchant = MerchantId::new();
    let wallet   = WalletId::new();

    let mut slugs = std::collections::HashSet::new();
    for _ in 0..20 {
        let link = eng.create(CreatePaymentLinkRequest {
            merchant_id:  merchant,
            wallet_id:    wallet,
            amount_minor: Some(1000),
            currency:     "AOA".to_string(),
            description:  None,
            expires_at:   None,
        }).await.unwrap();
        slugs.insert(link.slug);
    }

    assert_eq!(slugs.len(), 20, "each of 20 links must have a unique slug");
}
