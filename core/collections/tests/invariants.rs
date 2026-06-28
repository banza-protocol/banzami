//! Invariant tests for Collections (BANZA ADR-036) using an in-memory repository
//! — no database required, deterministic, runs in CI without setup.
//!
//! Proves: INV-COLLECTION-002 (closed-rule sum == total), INV-COLLECTION-003
//! (EXACT divisibility — no silent rounding), sum-mismatch rejection, rule
//! validation, ownership/environment scoping (404), share surfacing + terminal
//! status, and that no money/ledger field is ever populated by the model.
//!
//! Run: cargo test -p banzami-collections --test invariants

use std::collections::HashMap;
use std::sync::Mutex;

use chrono::{DateTime, Utc};

use banzami_collections::{
    Collection, CollectionEngine, CollectionError, CollectionRule, CollectionShare,
    CollectionStatus, CreateCollectionRequest, CreateShareRequest, Divisibility, FixedShare,
    IntentStatus, PaymentIntent, PostgresCollectionEngine, ShareStatus, Surface,
};
use banzami_collections::repository::CollectionRepository;
use banzami_types::{
    CollectionId, CollectionShareId, MerchantId, PaymentIntentId, WalletId,
};

// ─── In-memory repository ────────────────────────────────────────────────────

#[derive(Default)]
struct MemRepo {
    collections: Mutex<HashMap<uuid::Uuid, Collection>>,
    shares: Mutex<HashMap<uuid::Uuid, CollectionShare>>,
    intents: Mutex<HashMap<uuid::Uuid, PaymentIntent>>,
}

impl CollectionRepository for MemRepo {
    async fn insert_collection(&self, c: &Collection) -> Result<(), CollectionError> {
        self.collections.lock().unwrap().insert(c.id.as_uuid(), c.clone());
        Ok(())
    }
    async fn find_collection(
        &self,
        id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Option<Collection>, CollectionError> {
        Ok(self
            .collections
            .lock()
            .unwrap()
            .get(&id.as_uuid())
            .filter(|c| c.merchant_id.as_uuid() == merchant_id.as_uuid() && c.environment == environment)
            .cloned())
    }
    async fn list_collections(
        &self,
        merchant_id: MerchantId,
        environment: &str,
        _limit: i64,
        _cursor: Option<CollectionId>,
    ) -> Result<Vec<Collection>, CollectionError> {
        Ok(self
            .collections
            .lock()
            .unwrap()
            .values()
            .filter(|c| c.merchant_id.as_uuid() == merchant_id.as_uuid() && c.environment == environment)
            .cloned()
            .collect())
    }
    async fn update_collection_mutable(
        &self,
        id: CollectionId,
        title: Option<String>,
        description: Option<String>,
        expires_at: Option<DateTime<Utc>>,
        metadata: serde_json::Value,
    ) -> Result<Collection, CollectionError> {
        let mut g = self.collections.lock().unwrap();
        let c = g.get_mut(&id.as_uuid()).ok_or(CollectionError::NotFound(id))?;
        c.title = title;
        c.description = description;
        c.expires_at = expires_at;
        c.metadata = metadata;
        c.version += 1;
        Ok(c.clone())
    }
    async fn update_collection_status(
        &self,
        id: CollectionId,
        status: CollectionStatus,
        closed_at: Option<DateTime<Utc>>,
    ) -> Result<Collection, CollectionError> {
        let mut g = self.collections.lock().unwrap();
        let c = g.get_mut(&id.as_uuid()).ok_or(CollectionError::NotFound(id))?;
        c.status = status;
        if closed_at.is_some() {
            c.closed_at = closed_at;
        }
        c.version += 1;
        Ok(c.clone())
    }
    async fn insert_share(&self, s: &CollectionShare) -> Result<(), CollectionError> {
        self.shares.lock().unwrap().insert(s.id.as_uuid(), s.clone());
        Ok(())
    }
    async fn find_share(
        &self,
        id: CollectionShareId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Option<CollectionShare>, CollectionError> {
        Ok(self
            .shares
            .lock()
            .unwrap()
            .get(&id.as_uuid())
            .filter(|s| s.merchant_id.as_uuid() == merchant_id.as_uuid() && s.environment == environment)
            .cloned())
    }
    async fn list_shares(
        &self,
        collection_id: CollectionId,
        _limit: i64,
        _cursor: Option<CollectionShareId>,
    ) -> Result<Vec<CollectionShare>, CollectionError> {
        Ok(self
            .shares
            .lock()
            .unwrap()
            .values()
            .filter(|s| s.collection_id.as_uuid() == collection_id.as_uuid())
            .cloned()
            .collect())
    }
    async fn set_share_intent(
        &self,
        id: CollectionShareId,
        payment_intent_id: PaymentIntentId,
        status: ShareStatus,
    ) -> Result<CollectionShare, CollectionError> {
        let mut g = self.shares.lock().unwrap();
        let s = g.get_mut(&id.as_uuid()).ok_or(CollectionError::ShareNotFound(id))?;
        s.payment_intent_id = Some(payment_intent_id);
        s.status = status;
        Ok(s.clone())
    }
    async fn collected_amount(&self, collection_id: CollectionId) -> Result<i64, CollectionError> {
        Ok(self
            .shares
            .lock()
            .unwrap()
            .values()
            .filter(|s| {
                s.collection_id.as_uuid() == collection_id.as_uuid()
                    && matches!(s.status, ShareStatus::Paid)
            })
            .map(|s| s.amount_minor)
            .sum())
    }
    async fn insert_payment_intent(&self, p: &PaymentIntent) -> Result<(), CollectionError> {
        self.intents.lock().unwrap().insert(p.id.as_uuid(), p.clone());
        Ok(())
    }
    async fn find_payment_intent(
        &self,
        id: PaymentIntentId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Option<PaymentIntent>, CollectionError> {
        Ok(self
            .intents
            .lock()
            .unwrap()
            .get(&id.as_uuid())
            .filter(|p| p.merchant_id.as_uuid() == merchant_id.as_uuid() && p.environment == environment)
            .cloned())
    }

    async fn find_intent_by_surface(
        &self,
        surface: Surface,
        surface_ref: &str,
        environment: &str,
    ) -> Result<Option<PaymentIntent>, CollectionError> {
        Ok(self
            .intents
            .lock()
            .unwrap()
            .values()
            .find(|p| {
                p.surface.as_str() == surface.as_str()
                    && p.surface_ref.as_deref() == Some(surface_ref)
                    && p.environment == environment
            })
            .cloned())
    }
    async fn mark_intent_paid(
        &self,
        id: PaymentIntentId,
        transfer_id: banzami_types::TransferId,
    ) -> Result<bool, CollectionError> {
        let mut g = self.intents.lock().unwrap();
        let p = g.get_mut(&id.as_uuid()).ok_or(CollectionError::IntentNotFound(id))?;
        if matches!(p.status, IntentStatus::Paid) {
            return Ok(false);
        }
        p.status = IntentStatus::Paid;
        p.transfer_id = Some(transfer_id);
        Ok(true)
    }
    async fn find_share_by_intent(
        &self,
        intent_id: PaymentIntentId,
    ) -> Result<Option<CollectionShare>, CollectionError> {
        Ok(self
            .shares
            .lock()
            .unwrap()
            .values()
            .find(|s| s.payment_intent_id.map(|p| p.as_uuid()) == Some(intent_id.as_uuid()))
            .cloned())
    }
    async fn mark_share_paid(
        &self,
        id: CollectionShareId,
        transfer_id: banzami_types::TransferId,
    ) -> Result<bool, CollectionError> {
        let mut g = self.shares.lock().unwrap();
        let s = g.get_mut(&id.as_uuid()).ok_or(CollectionError::ShareNotFound(id))?;
        if matches!(s.status, ShareStatus::Paid) {
            return Ok(false);
        }
        s.status = ShareStatus::Paid;
        s.transfer_id = Some(transfer_id);
        Ok(true)
    }
    async fn share_counts(
        &self,
        collection_id: CollectionId,
    ) -> Result<(i64, i64), CollectionError> {
        let g = self.shares.lock().unwrap();
        let mut total = 0i64;
        let mut paid = 0i64;
        for s in g.values().filter(|s| s.collection_id.as_uuid() == collection_id.as_uuid()) {
            total += 1;
            if matches!(s.status, ShareStatus::Paid) {
                paid += 1;
            }
        }
        Ok((total, paid))
    }
    async fn find_collection_unscoped(
        &self,
        id: CollectionId,
    ) -> Result<Option<Collection>, CollectionError> {
        Ok(self.collections.lock().unwrap().get(&id.as_uuid()).cloned())
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn engine() -> PostgresCollectionEngine<MemRepo> {
    PostgresCollectionEngine::new(MemRepo::default())
}

fn req(total: i64, rule: CollectionRule) -> CreateCollectionRequest {
    let m = MerchantId::new();
    CreateCollectionRequest {
        operator_id: "banzami".into(),
        creator: m.to_string(),
        owner: m.to_string(),
        merchant_id: m,
        wallet_id: WalletId::new(),
        title: Some("Test".into()),
        description: None,
        currency: "AOA".into(),
        total_amount_minor: total,
        rule,
        environment: "SANDBOX".into(),
        idempotency_key: None,
        expires_at: None,
        open_immediately: true,
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn equal_split_exact_creates_balanced_shares() {
    // COL-001: 30 000 / 3 = 10 000, sum == total, status OPEN.
    let e = engine();
    let (c, shares) = e
        .create_collection(req(
            3_000_000,
            CollectionRule::EqualSplit { participants_count: 3, divisibility: Divisibility::Exact },
        ))
        .await
        .unwrap();
    assert_eq!(c.status, CollectionStatus::Open);
    assert_eq!(shares.len(), 3);
    assert!(shares.iter().all(|s| s.amount_minor == 1_000_000));
    let sum: i64 = shares.iter().map(|s| s.amount_minor).sum();
    assert_eq!(sum, c.total_amount_minor, "INV-COLLECTION-002: sum == total");
    // INV-COLLECTION-001: no money/ledger field on a share.
    assert!(shares.iter().all(|s| s.transfer_id.is_none() && s.status == ShareStatus::Pending));
}

#[tokio::test]
async fn equal_split_indivisible_rejected_no_rounding() {
    // COL-002 / INV-COLLECTION-003: 10 000 / 3 has a remainder; EXACT must reject.
    let e = engine();
    let err = e
        .create_collection(req(
            1_000_000,
            CollectionRule::EqualSplit { participants_count: 3, divisibility: Divisibility::Exact },
        ))
        .await
        .unwrap_err();
    assert!(matches!(err, CollectionError::Indivisible), "no silent rounding");
}

#[tokio::test]
async fn equal_split_remainder_to_first_is_explicit_and_balanced() {
    let e = engine();
    let (c, shares) = e
        .create_collection(req(
            1_000_000,
            CollectionRule::EqualSplit {
                participants_count: 3,
                divisibility: Divisibility::RemainderToFirst,
            },
        ))
        .await
        .unwrap();
    let sum: i64 = shares.iter().map(|s| s.amount_minor).sum();
    assert_eq!(sum, c.total_amount_minor, "remainder distributed, exact sum");
    assert_eq!(shares[0].amount_minor, 333_334); // 333333 + remainder 1
    assert_eq!(shares[1].amount_minor, 333_333);
}

#[tokio::test]
async fn fixed_amounts_must_sum_to_total() {
    let e = engine();
    // ok
    let (_c, shares) = e
        .create_collection(req(
            2_500_000,
            CollectionRule::FixedAmounts {
                shares: vec![
                    FixedShare { amount_minor: 1_000_000, participant: None },
                    FixedShare { amount_minor: 1_500_000, participant: None },
                ],
            },
        ))
        .await
        .unwrap();
    assert_eq!(shares.len(), 2);
    // mismatch rejected
    let err = e
        .create_collection(req(
            3_000_000,
            CollectionRule::FixedAmounts {
                shares: vec![
                    FixedShare { amount_minor: 1_000_000, participant: None },
                    FixedShare { amount_minor: 1_500_000, participant: None },
                ],
            },
        ))
        .await
        .unwrap_err();
    assert!(matches!(err, CollectionError::SumMismatch { .. }));
}

#[tokio::test]
async fn ownership_and_environment_scoping_returns_not_found() {
    let e = engine();
    let (c, _) = e
        .create_collection(req(
            2_000_000,
            CollectionRule::EqualSplit { participants_count: 2, divisibility: Divisibility::Exact },
        ))
        .await
        .unwrap();
    // wrong merchant -> NotFound (never 403 existence leak)
    let other = MerchantId::new();
    assert!(matches!(
        e.get_collection(c.id, other, "SANDBOX").await.unwrap_err(),
        CollectionError::NotFound(_)
    ));
    // wrong environment -> NotFound
    assert!(matches!(
        e.get_collection(c.id, c.merchant_id, "LIVE").await.unwrap_err(),
        CollectionError::NotFound(_)
    ));
    // correct scope -> ok
    assert!(e.get_collection(c.id, c.merchant_id, "SANDBOX").await.is_ok());
}

#[tokio::test]
async fn closed_rule_rejects_ad_hoc_shares_open_rule_enforces_minimum() {
    let e = engine();
    // closed rule: no dynamic shares
    let (c, _) = e
        .create_collection(req(
            2_000_000,
            CollectionRule::EqualSplit { participants_count: 2, divisibility: Divisibility::Exact },
        ))
        .await
        .unwrap();
    let err = e
        .create_share(
            c.id,
            c.merchant_id,
            "SANDBOX",
            CreateShareRequest { amount_minor: 500_000, participant: None, expires_at: None, idempotency_key: None },
        )
        .await
        .unwrap_err();
    assert!(matches!(err, CollectionError::ClosedRuleNoDynamicShares));

    // minimum contribution: below floor rejected, at/above accepted
    let (mc, _) = e
        .create_collection(req(
            0,
            CollectionRule::MinimumContribution { min_minor: 500_000, target_minor: None },
        ))
        .await
        .unwrap();
    assert!(matches!(
        e.create_share(mc.id, mc.merchant_id, "SANDBOX", CreateShareRequest { amount_minor: 100_000, participant: None, expires_at: None, idempotency_key: None }).await.unwrap_err(),
        CollectionError::BelowMinimum { .. }
    ));
    let s = e
        .create_share(mc.id, mc.merchant_id, "SANDBOX", CreateShareRequest { amount_minor: 500_000, participant: None, expires_at: None, idempotency_key: None })
        .await
        .unwrap();
    assert_eq!(s.status, ShareStatus::Pending);
}

#[tokio::test]
async fn surface_share_creates_intent_and_is_not_repeatable() {
    let e = engine();
    let (c, shares) = e
        .create_collection(req(
            2_000_000,
            CollectionRule::EqualSplit { participants_count: 2, divisibility: Divisibility::Exact },
        ))
        .await
        .unwrap();
    let share_id = shares[0].id;
    let (intent, updated) = e
        .surface_share(share_id, c.merchant_id, "SANDBOX", Surface::Qr, Some("qr-123".into()))
        .await
        .unwrap();
    assert_eq!(intent.status, IntentStatus::Requested);
    assert_eq!(intent.amount_minor, Some(1_000_000));
    assert_eq!(updated.status, ShareStatus::LinkCreated);
    assert_eq!(updated.payment_intent_id, Some(intent.id));
    // surfacing a non-PENDING share is rejected
    assert!(matches!(
        e.surface_share(share_id, c.merchant_id, "SANDBOX", Surface::Qr, None).await.unwrap_err(),
        CollectionError::InvalidStatus(_)
    ));
}

// ─── Increment 2: settlement (eventual, idempotent) ──────────────────────────

use banzami_types::TransferId;

async fn surface(e: &PostgresCollectionEngine<MemRepo>, share: &CollectionShare, merchant: MerchantId, sref: &str) {
    e.surface_share(share.id, merchant, "SANDBOX", Surface::Qr, Some(sref.into())).await.unwrap();
}

#[tokio::test]
async fn settlement_first_payment_marks_paid_and_rolls_up_partial() {
    let e = engine();
    let (c, shares) = e
        .create_collection(req(2_000_000, CollectionRule::EqualSplit { participants_count: 2, divisibility: Divisibility::Exact }))
        .await
        .unwrap();
    surface(&e, &shares[0], c.merchant_id, "qr-1").await;

    let tid = TransferId::new();
    let out = e.settle_from_surface(Surface::Qr, "qr-1", tid, "SANDBOX").await.unwrap().unwrap();
    assert!(out.newly_paid, "real transfer -> share PAID");
    assert_eq!(out.transition, Some(CollectionStatus::PartiallyCompleted));
    let share = out.share.unwrap();
    assert_eq!(share.status, ShareStatus::Paid);
    assert_eq!(share.transfer_id, Some(tid), "INV-COLLECTION-005: real transfer recorded");
    assert_eq!(out.collection.unwrap().status, CollectionStatus::PartiallyCompleted);
}

#[tokio::test]
async fn settlement_is_idempotent_no_double_pay_no_double_event() {
    let e = engine();
    let (c, shares) = e
        .create_collection(req(2_000_000, CollectionRule::EqualSplit { participants_count: 2, divisibility: Divisibility::Exact }))
        .await
        .unwrap();
    surface(&e, &shares[0], c.merchant_id, "qr-1").await;
    let tid = TransferId::new();
    let first = e.settle_from_surface(Surface::Qr, "qr-1", tid, "SANDBOX").await.unwrap().unwrap();
    assert!(first.newly_paid);

    // Replay the SAME settlement -> no second PAID, no transition (no event).
    let again = e.settle_from_surface(Surface::Qr, "qr-1", tid, "SANDBOX").await.unwrap().unwrap();
    assert!(!again.newly_paid, "idempotent: already paid");
    assert_eq!(again.transition, None);

    // A *different* transfer on an already-PAID share also does not double-pay.
    let other = e.settle_from_surface(Surface::Qr, "qr-1", TransferId::new(), "SANDBOX").await.unwrap().unwrap();
    assert!(!other.newly_paid, "INV-COLLECTION-006: PAID is terminal, no double payment");
}

#[tokio::test]
async fn settlement_last_share_completes_collection() {
    let e = engine();
    let (c, shares) = e
        .create_collection(req(2_000_000, CollectionRule::EqualSplit { participants_count: 2, divisibility: Divisibility::Exact }))
        .await
        .unwrap();
    surface(&e, &shares[0], c.merchant_id, "qr-1").await;
    surface(&e, &shares[1], c.merchant_id, "qr-2").await;

    let p1 = e.settle_from_surface(Surface::Qr, "qr-1", TransferId::new(), "SANDBOX").await.unwrap().unwrap();
    assert_eq!(p1.transition, Some(CollectionStatus::PartiallyCompleted));

    let p2 = e.settle_from_surface(Surface::Qr, "qr-2", TransferId::new(), "SANDBOX").await.unwrap().unwrap();
    assert_eq!(p2.transition, Some(CollectionStatus::Completed), "all shares paid -> COMPLETED");
    assert_eq!(p2.collection.unwrap().status, CollectionStatus::Completed);
}

#[tokio::test]
async fn settlement_of_non_collection_surface_is_a_noop() {
    let e = engine();
    // No intent exists for this surface_ref -> not a collection payment.
    let out = e.settle_from_surface(Surface::Qr, "unrelated-qr", TransferId::new(), "SANDBOX").await.unwrap();
    assert!(out.is_none(), "plain QR/link payments are not affected");
}
