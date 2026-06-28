//! Collection / PaymentIntent lifecycle (BANZA ADR-036/037).
//!
//! Enforces the protocol invariants (INV-COLLECTION-*). This increment covers the
//! model + API + events; the live settlement hook (a real payment marking a share
//! PAID with its transfer_id) is a separate, reviewed increment and is NOT here.

use chrono::Utc;

use banzami_types::{
    CollectionId, CollectionShareId, MerchantId, PaymentIntentId, TransferId, WalletId,
};

use crate::domain::{
    Collection, CollectionShare, CollectionStatus, CreateCollectionRequest, CreateShareRequest,
    IntentStatus, PaymentIntent, SettlementOutcome, ShareStatus, Surface,
};
use crate::repository::CollectionRepository;
use crate::{rules, CollectionError};

#[allow(async_fn_in_trait)]
pub trait CollectionEngine: Send + Sync {
    async fn create_collection(
        &self,
        req: CreateCollectionRequest,
    ) -> Result<(Collection, Vec<CollectionShare>), CollectionError>;

    async fn get_collection(
        &self,
        id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Collection, CollectionError>;

    async fn list_collections(
        &self,
        merchant_id: MerchantId,
        environment: &str,
        limit: i64,
        cursor: Option<CollectionId>,
    ) -> Result<Vec<Collection>, CollectionError>;

    async fn update_collection(
        &self,
        id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
        title: Option<String>,
        description: Option<String>,
        expires_at: Option<chrono::DateTime<Utc>>,
        metadata: Option<serde_json::Value>,
    ) -> Result<Collection, CollectionError>;

    async fn close_collection(
        &self,
        id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Collection, CollectionError>;

    async fn cancel_collection(
        &self,
        id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Collection, CollectionError>;

    async fn create_share(
        &self,
        collection_id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
        req: CreateShareRequest,
    ) -> Result<CollectionShare, CollectionError>;

    async fn get_share(
        &self,
        share_id: CollectionShareId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<CollectionShare, CollectionError>;

    async fn list_shares(
        &self,
        collection_id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
        limit: i64,
        cursor: Option<CollectionShareId>,
    ) -> Result<Vec<CollectionShare>, CollectionError>;

    /// Surface a pending share for payment: create its PaymentIntent (the share's
    /// PaymentIntent, ADR-037) and transition PENDING -> LINK_CREATED. The concrete
    /// surface artifact (real QR/link) is bound via `surface_ref` by the caller.
    async fn surface_share(
        &self,
        share_id: CollectionShareId,
        merchant_id: MerchantId,
        environment: &str,
        surface: Surface,
        surface_ref: Option<String>,
    ) -> Result<(PaymentIntent, CollectionShare), CollectionError>;

    async fn collected_amount(
        &self,
        collection_id: CollectionId,
    ) -> Result<i64, CollectionError>;

    /// Settle a PaymentIntent from a real, confirmed surface payment (Increment 2).
    /// Resolves the intent by (surface, surface_ref); if it backs a collection
    /// share, marks the intent + share PAID with the real transfer_id and rolls up
    /// the collection. Idempotent: a replay (already PAID) returns newly_paid=false
    /// and changes nothing. Returns None when the surface is not a collection
    /// payment (a plain QR/link payment). NEVER marks PAID without a real transfer.
    async fn settle_from_surface(
        &self,
        surface: Surface,
        surface_ref: &str,
        transfer_id: TransferId,
        environment: &str,
    ) -> Result<Option<SettlementOutcome>, CollectionError>;
}

pub struct PostgresCollectionEngine<R: CollectionRepository> {
    repo: R,
}

impl<R: CollectionRepository> PostgresCollectionEngine<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }
}

impl<R: CollectionRepository> CollectionEngine for PostgresCollectionEngine<R> {
    async fn create_collection(
        &self,
        req: CreateCollectionRequest,
    ) -> Result<(Collection, Vec<CollectionShare>), CollectionError> {
        if req.total_amount_minor < 0 {
            return Err(CollectionError::InvalidAmount);
        }
        if let Some(exp) = req.expires_at {
            if exp <= Utc::now() {
                return Err(CollectionError::ExpiryInPast);
            }
        }
        // Resolve + validate the rule (INV-COLLECTION-002/003). Closed rules
        // pre-declare shares whose amounts MUST sum exactly to the total.
        let resolved = rules::resolve_closed_shares(&req.rule, req.total_amount_minor)?;

        let now = Utc::now();
        let status = if req.open_immediately {
            CollectionStatus::Open
        } else {
            CollectionStatus::Draft
        };
        let collection = Collection {
            id: CollectionId::new(),
            operator_id: req.operator_id,
            creator: req.creator,
            owner: req.owner,
            merchant_id: req.merchant_id,
            wallet_id: req.wallet_id,
            title: req.title,
            description: req.description,
            currency: req.currency.clone(),
            total_amount_minor: req.total_amount_minor,
            status,
            rule: req.rule,
            environment: req.environment.clone(),
            expires_at: req.expires_at,
            closed_at: None,
            metadata: serde_json::json!({}),
            version: 1,
            created_at: now,
            updated_at: now,
        };
        self.repo.insert_collection(&collection).await?;

        // Closed-rule shares are created PENDING. No money is moved.
        let mut shares = Vec::with_capacity(resolved.len());
        for r in resolved {
            let share = CollectionShare {
                id: CollectionShareId::new(),
                collection_id: collection.id,
                merchant_id: collection.merchant_id,
                participant: r.participant,
                amount_minor: r.amount_minor,
                currency: req.currency.clone(),
                status: ShareStatus::Pending,
                payment_intent_id: None,
                transfer_id: None,
                environment: req.environment.clone(),
                expires_at: req.expires_at,
                paid_at: None,
                metadata: serde_json::json!({}),
                created_at: now,
                updated_at: now,
            };
            self.repo.insert_share(&share).await?;
            shares.push(share);
        }

        tracing::info!(
            collection_id = %collection.id,
            merchant = %collection.merchant_id,
            shares = shares.len(),
            "collection created"
        );
        Ok((collection, shares))
    }

    async fn get_collection(
        &self,
        id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Collection, CollectionError> {
        self.repo
            .find_collection(id, merchant_id, environment)
            .await?
            .ok_or(CollectionError::NotFound(id))
    }

    async fn list_collections(
        &self,
        merchant_id: MerchantId,
        environment: &str,
        limit: i64,
        cursor: Option<CollectionId>,
    ) -> Result<Vec<Collection>, CollectionError> {
        let limit = limit.clamp(1, 200);
        self.repo
            .list_collections(merchant_id, environment, limit, cursor)
            .await
    }

    async fn update_collection(
        &self,
        id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
        title: Option<String>,
        description: Option<String>,
        expires_at: Option<chrono::DateTime<Utc>>,
        metadata: Option<serde_json::Value>,
    ) -> Result<Collection, CollectionError> {
        // Ownership + existence (scoped). Only non-structural fields are mutable;
        // currency/rule/total are not parameters here (INV-COLLECTION-007).
        let existing = self.get_collection(id, merchant_id, environment).await?;
        self.repo
            .update_collection_mutable(
                id,
                title.or(existing.title),
                description.or(existing.description),
                expires_at.or(existing.expires_at),
                metadata.unwrap_or(existing.metadata),
            )
            .await
    }

    async fn close_collection(
        &self,
        id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Collection, CollectionError> {
        let c = self.get_collection(id, merchant_id, environment).await?;
        if matches!(
            c.status,
            CollectionStatus::Completed
                | CollectionStatus::Cancelled
                | CollectionStatus::Expired
                | CollectionStatus::Failed
        ) {
            return Err(CollectionError::InvalidStatus(format!(
                "cannot close a {} collection",
                c.status.as_str()
            )));
        }
        let collected = self.repo.collected_amount(id).await?;
        let closed = c.rule.is_closed();
        let status = if collected >= c.total_amount_minor && (closed || c.total_amount_minor > 0) {
            CollectionStatus::Completed
        } else if collected > 0 {
            CollectionStatus::PartiallyCompleted
        } else {
            CollectionStatus::Cancelled
        };
        self.repo
            .update_collection_status(id, status, Some(Utc::now()))
            .await
    }

    async fn cancel_collection(
        &self,
        id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<Collection, CollectionError> {
        let c = self.get_collection(id, merchant_id, environment).await?;
        if matches!(
            c.status,
            CollectionStatus::Completed | CollectionStatus::Cancelled | CollectionStatus::Failed
        ) {
            return Err(CollectionError::InvalidStatus(format!(
                "cannot cancel a {} collection",
                c.status.as_str()
            )));
        }
        self.repo
            .update_collection_status(id, CollectionStatus::Cancelled, Some(Utc::now()))
            .await
    }

    async fn create_share(
        &self,
        collection_id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
        req: CreateShareRequest,
    ) -> Result<CollectionShare, CollectionError> {
        let c = self
            .get_collection(collection_id, merchant_id, environment)
            .await?;
        if !matches!(
            c.status,
            CollectionStatus::Open | CollectionStatus::PartiallyCompleted
        ) {
            return Err(CollectionError::InvalidStatus(
                "collection is not open for new shares".into(),
            ));
        }
        // Only open rules accept ad-hoc shares (INV: closed rules are predeclared).
        rules::validate_open_contribution(&c.rule, req.amount_minor)?;

        let now = Utc::now();
        let share = CollectionShare {
            id: CollectionShareId::new(),
            collection_id,
            merchant_id,
            participant: req.participant,
            amount_minor: req.amount_minor,
            currency: c.currency.clone(),
            status: ShareStatus::Pending,
            payment_intent_id: None,
            transfer_id: None,
            environment: environment.to_string(),
            expires_at: req.expires_at,
            paid_at: None,
            metadata: serde_json::json!({}),
            created_at: now,
            updated_at: now,
        };
        self.repo.insert_share(&share).await?;
        Ok(share)
    }

    async fn get_share(
        &self,
        share_id: CollectionShareId,
        merchant_id: MerchantId,
        environment: &str,
    ) -> Result<CollectionShare, CollectionError> {
        self.repo
            .find_share(share_id, merchant_id, environment)
            .await?
            .ok_or(CollectionError::ShareNotFound(share_id))
    }

    async fn list_shares(
        &self,
        collection_id: CollectionId,
        merchant_id: MerchantId,
        environment: &str,
        limit: i64,
        cursor: Option<CollectionShareId>,
    ) -> Result<Vec<CollectionShare>, CollectionError> {
        // Verify ownership of the parent collection first (404 if not ours).
        self.get_collection(collection_id, merchant_id, environment)
            .await?;
        let limit = limit.clamp(1, 200);
        self.repo.list_shares(collection_id, limit, cursor).await
    }

    async fn surface_share(
        &self,
        share_id: CollectionShareId,
        merchant_id: MerchantId,
        environment: &str,
        surface: Surface,
        surface_ref: Option<String>,
    ) -> Result<(PaymentIntent, CollectionShare), CollectionError> {
        let share = self
            .repo
            .find_share(share_id, merchant_id, environment)
            .await?
            .ok_or(CollectionError::ShareNotFound(share_id))?;
        if !matches!(share.status, ShareStatus::Pending) {
            return Err(CollectionError::InvalidStatus(format!(
                "share is {} — only PENDING shares can be surfaced",
                share.status.as_str()
            )));
        }
        let collection = self
            .get_collection(share.collection_id, merchant_id, environment)
            .await?;

        let now = Utc::now();
        let intent = PaymentIntent {
            id: PaymentIntentId::new(),
            operator_id: collection.operator_id.clone(),
            merchant_id,
            payee_wallet_id: WalletId::from_uuid(collection.wallet_id.as_uuid()),
            amount_minor: Some(share.amount_minor),
            currency: share.currency.clone(),
            surface,
            surface_ref,
            status: IntentStatus::Requested,
            transfer_id: None,
            environment: environment.to_string(),
            expires_at: share.expires_at,
            metadata: serde_json::json!({ "collection_id": collection.id.to_string(), "share_id": share.id.to_string() }),
            version: 1,
            created_at: now,
            updated_at: now,
        };
        self.repo.insert_payment_intent(&intent).await?;

        let updated_share = self
            .repo
            .set_share_intent(share_id, intent.id, ShareStatus::LinkCreated)
            .await?;

        tracing::info!(
            share_id = %share_id,
            intent_id = %intent.id,
            "collection share surfaced (payment intent created)"
        );
        Ok((intent, updated_share))
    }

    async fn collected_amount(
        &self,
        collection_id: CollectionId,
    ) -> Result<i64, CollectionError> {
        self.repo.collected_amount(collection_id).await
    }

    async fn settle_from_surface(
        &self,
        surface: Surface,
        surface_ref: &str,
        transfer_id: TransferId,
        environment: &str,
    ) -> Result<Option<SettlementOutcome>, CollectionError> {
        // 1. Resolve the intent from the surface. Not a collection payment -> no-op.
        let Some(intent) = self
            .repo
            .find_intent_by_surface(surface, surface_ref, environment)
            .await?
        else {
            return Ok(None);
        };

        // 2. Mark the intent PAID (idempotent: conditional WHERE status != PAID).
        let _intent_transitioned = self.repo.mark_intent_paid(intent.id, transfer_id).await?;

        // 3. Mark the backing share PAID (idempotent). This transition is the
        //    authoritative "newly paid" signal — events fire only on a real change.
        let mut share = self.repo.find_share_by_intent(intent.id).await?;
        let newly_paid = match &share {
            Some(s) => self.repo.mark_share_paid(s.id, transfer_id).await?,
            None => false,
        };
        if newly_paid {
            if let Some(s) = share.as_mut() {
                s.status = ShareStatus::Paid;
                s.transfer_id = Some(transfer_id);
                s.paid_at = Some(Utc::now());
            }
        }

        // 4. Roll up the collection from the persisted shares (never a counter).
        let mut transition = None;
        let mut collection = match &share {
            Some(s) => self.repo.find_collection_unscoped(s.collection_id).await?,
            None => None,
        };
        if newly_paid {
            if let Some(c) = collection.as_mut() {
                let collected = self.repo.collected_amount(c.id).await?;
                let (total_shares, paid_shares) = self.repo.share_counts(c.id).await?;
                let closed = c.rule.is_closed();
                let target_reached = (closed && collected >= c.total_amount_minor)
                    || (total_shares > 0 && paid_shares == total_shares);
                let next = if target_reached {
                    Some(CollectionStatus::Completed)
                } else if collected > 0 {
                    Some(CollectionStatus::PartiallyCompleted)
                } else {
                    None
                };
                // Forward-only; never overwrite a terminal collection.
                if let Some(ns) = next {
                    let terminal = matches!(
                        c.status,
                        CollectionStatus::Completed
                            | CollectionStatus::Cancelled
                            | CollectionStatus::Expired
                            | CollectionStatus::Failed
                    );
                    if c.status != ns && !terminal {
                        let closed_at = if matches!(ns, CollectionStatus::Completed) {
                            Some(Utc::now())
                        } else {
                            None
                        };
                        let updated =
                            self.repo.update_collection_status(c.id, ns, closed_at).await?;
                        *c = updated;
                        transition = Some(ns);
                    }
                }
            }
        }

        Ok(Some(SettlementOutcome {
            intent_id: intent.id,
            share,
            collection,
            newly_paid,
            transition,
        }))
    }
}
