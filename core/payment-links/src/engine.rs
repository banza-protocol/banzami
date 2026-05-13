use chrono::Utc;

use banzami_types::PaymentLinkId;

use crate::{
    payment_link::{CreatePaymentLinkRequest, PaymentLink, PaymentLinkStatus},
    repository::PaymentLinkRepository,
    PaymentLinkError,
};

#[allow(async_fn_in_trait)]
pub trait PaymentLinkEngine: Send + Sync {
    async fn create(&self, req: CreatePaymentLinkRequest) -> Result<PaymentLink, PaymentLinkError>;
    async fn get(&self, id: PaymentLinkId) -> Result<PaymentLink, PaymentLinkError>;
    async fn get_by_slug(&self, slug: &str) -> Result<PaymentLink, PaymentLinkError>;
    async fn list_for_merchant(
        &self,
        merchant_id: banzami_types::MerchantId,
        limit:       i64,
        cursor:      Option<PaymentLinkId>,
    ) -> Result<Vec<PaymentLink>, PaymentLinkError>;
    async fn cancel(&self, id: PaymentLinkId) -> Result<PaymentLink, PaymentLinkError>;
    async fn mark_used(&self, id: PaymentLinkId) -> Result<PaymentLink, PaymentLinkError>;
}

pub struct PostgresPaymentLinkEngine<R: PaymentLinkRepository> {
    repo: R,
}

impl<R: PaymentLinkRepository> PostgresPaymentLinkEngine<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }

    /// 12 lowercase hex chars from a random UUID — ~281 trillion unique values.
    fn generate_slug() -> String {
        uuid::Uuid::new_v4().simple().to_string()[..12].to_string()
    }
}

impl<R: PaymentLinkRepository> PaymentLinkEngine for PostgresPaymentLinkEngine<R> {
    async fn create(&self, req: CreatePaymentLinkRequest) -> Result<PaymentLink, PaymentLinkError> {
        if let Some(amount) = req.amount_minor {
            if amount <= 0 {
                return Err(PaymentLinkError::InvalidAmount);
            }
        }
        if let Some(expires_at) = req.expires_at {
            if expires_at <= Utc::now() {
                return Err(PaymentLinkError::ExpiryInPast);
            }
        }
        let now  = Utc::now();
        let link = PaymentLink {
            id:           PaymentLinkId::new(),
            slug:         Self::generate_slug(),
            merchant_id:  req.merchant_id,
            wallet_id:    req.wallet_id,
            amount_minor: req.amount_minor,
            currency:     req.currency,
            description:  req.description,
            status:       PaymentLinkStatus::Active,
            expires_at:   req.expires_at,
            paid_at:      None,
            created_at:   now,
            updated_at:   now,
        };
        self.repo.insert(&link).await?;
        tracing::info!(
            link_id  = %link.id,
            slug     = %link.slug,
            merchant = %link.merchant_id,
            "payment link created"
        );
        Ok(link)
    }

    async fn get(&self, id: PaymentLinkId) -> Result<PaymentLink, PaymentLinkError> {
        self.repo.find_by_id(id).await?.ok_or(PaymentLinkError::NotFound(id))
    }

    async fn get_by_slug(&self, slug: &str) -> Result<PaymentLink, PaymentLinkError> {
        self.repo
            .find_by_slug(slug)
            .await?
            .ok_or_else(|| PaymentLinkError::SlugNotFound(slug.to_string()))
    }

    async fn list_for_merchant(
        &self,
        merchant_id: banzami_types::MerchantId,
        limit:       i64,
        cursor:      Option<PaymentLinkId>,
    ) -> Result<Vec<PaymentLink>, PaymentLinkError> {
        let limit = limit.clamp(1, 100);
        self.repo.list_for_merchant(merchant_id, limit, cursor).await
    }

    async fn cancel(&self, id: PaymentLinkId) -> Result<PaymentLink, PaymentLinkError> {
        let link = self.get(id).await?;
        if !matches!(link.status, PaymentLinkStatus::Active) {
            return Err(PaymentLinkError::NotActive(id));
        }
        self.repo
            .update_status(id, PaymentLinkStatus::Cancelled, None)
            .await
    }

    async fn mark_used(&self, id: PaymentLinkId) -> Result<PaymentLink, PaymentLinkError> {
        let link = self.get(id).await?;
        if !matches!(link.status, PaymentLinkStatus::Active) {
            return Err(PaymentLinkError::NotActive(id));
        }
        if let Some(expires_at) = link.expires_at {
            if expires_at <= Utc::now() {
                return Err(PaymentLinkError::Expired(id));
            }
        }
        let paid_at = Utc::now();
        let updated = self
            .repo
            .update_status(id, PaymentLinkStatus::Used, Some(paid_at))
            .await?;
        tracing::info!(link_id = %id, "payment link marked as used");
        Ok(updated)
    }
}
