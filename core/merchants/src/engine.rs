use chrono::Utc;

use banzami_types::{ApiKeyId, MerchantId};

use crate::{
    api_key::{generate_raw_key, hash_key, key_prefix, ApiKey, ApiKeyEnvironment, ApiKeySecret},
    merchant::{CreateMerchantRequest, Merchant, MerchantStatus},
    repository::{ApiKeyRepository, MerchantRepository},
    MerchantError,
};

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait MerchantEngine: Send + Sync {
    async fn create(&self, req: CreateMerchantRequest) -> Result<Merchant, MerchantError>;
    async fn get(&self, id: MerchantId) -> Result<Merchant, MerchantError>;
    async fn list(&self, search: Option<&str>) -> Result<Vec<Merchant>, MerchantError>;
    async fn suspend(&self, id: MerchantId) -> Result<Merchant, MerchantError>;

    /// Issues a new API key for the merchant. The raw secret is in the returned
    /// [`ApiKeySecret`] and cannot be recovered after this call.
    async fn create_api_key(
        &self,
        merchant_id: MerchantId,
        name: String,
        environment: ApiKeyEnvironment,
    ) -> Result<ApiKeySecret, MerchantError>;

    async fn list_api_keys(&self, merchant_id: MerchantId) -> Result<Vec<ApiKey>, MerchantError>;
    async fn revoke_api_key(&self, key_id: ApiKeyId) -> Result<ApiKey, MerchantError>;

    async fn set_verified(&self, id: MerchantId, verified: bool) -> Result<Merchant, MerchantError>;

    async fn delete(&self, id: MerchantId) -> Result<(), MerchantError>;

    /// Verifies a raw API key and returns the associated key record and merchant.
    /// Records `last_used_at` as a side-effect.
    async fn verify_api_key(&self, raw_key: &str) -> Result<(ApiKey, Merchant), MerchantError>;
}

// ---------------------------------------------------------------------------
// Production implementation
// ---------------------------------------------------------------------------

pub struct PostgresMerchantEngine<MR: MerchantRepository, KR: ApiKeyRepository> {
    merchant_repo: MR,
    api_key_repo:  KR,
}

impl<MR: MerchantRepository, KR: ApiKeyRepository> PostgresMerchantEngine<MR, KR> {
    pub fn new(merchant_repo: MR, api_key_repo: KR) -> Self {
        Self { merchant_repo, api_key_repo }
    }
}

impl<MR: MerchantRepository, KR: ApiKeyRepository> MerchantEngine
    for PostgresMerchantEngine<MR, KR>
{
    async fn create(&self, req: CreateMerchantRequest) -> Result<Merchant, MerchantError> {
        let now = Utc::now();
        let merchant = Merchant {
            id:         MerchantId::new(),
            name:       req.name,
            email:      req.email,
            status:     MerchantStatus::Active,
            verified:   false,
            created_at: now,
            updated_at: now,
        };
        self.merchant_repo.create(merchant).await
    }

    async fn get(&self, id: MerchantId) -> Result<Merchant, MerchantError> {
        self.merchant_repo.get(id).await
    }

    async fn list(&self, search: Option<&str>) -> Result<Vec<Merchant>, MerchantError> {
        self.merchant_repo.list(search).await
    }

    async fn set_verified(&self, id: MerchantId, verified: bool) -> Result<Merchant, MerchantError> {
        self.merchant_repo.set_verified(id, verified).await
    }

    async fn delete(&self, id: MerchantId) -> Result<(), MerchantError> {
        self.merchant_repo.delete(id).await
    }

    async fn suspend(&self, id: MerchantId) -> Result<Merchant, MerchantError> {
        let merchant = self.merchant_repo.get(id).await?;
        if merchant.status == MerchantStatus::Closed {
            return Err(MerchantError::NotActive(id));
        }
        self.merchant_repo
            .update_status(id, MerchantStatus::Suspended)
            .await
    }

    async fn create_api_key(
        &self,
        merchant_id: MerchantId,
        name: String,
        environment: ApiKeyEnvironment,
    ) -> Result<ApiKeySecret, MerchantError> {
        let merchant = self.merchant_repo.get(merchant_id).await?;
        if !merchant.is_active() {
            return Err(MerchantError::NotActive(merchant_id));
        }

        let raw    = generate_raw_key(environment);
        let prefix = key_prefix(&raw);
        let hash   = hash_key(&raw);
        let now    = Utc::now();

        let key = ApiKey {
            id:           ApiKeyId::new(),
            merchant_id,
            name,
            key_prefix:   prefix,
            environment,
            key_hash:     hash,
            created_at:   now,
            last_used_at: None,
            revoked_at:   None,
        };

        let key = self.api_key_repo.create(key).await?;
        Ok(ApiKeySecret { key, secret: raw })
    }

    async fn list_api_keys(&self, merchant_id: MerchantId) -> Result<Vec<ApiKey>, MerchantError> {
        self.api_key_repo.list_for_merchant(merchant_id).await
    }

    async fn revoke_api_key(&self, key_id: ApiKeyId) -> Result<ApiKey, MerchantError> {
        self.api_key_repo.revoke(key_id).await
    }

    async fn verify_api_key(&self, raw_key: &str) -> Result<(ApiKey, Merchant), MerchantError> {
        let hash = hash_key(raw_key);

        let key = self
            .api_key_repo
            .find_by_hash(&hash)
            .await?
            .ok_or(MerchantError::InvalidApiKey)?;

        if !key.is_active() {
            return Err(MerchantError::RevokedApiKey(key.id));
        }

        let merchant = self.merchant_repo.get(key.merchant_id).await?;

        // Fire-and-forget in production; sync in tests.
        let _ = self.api_key_repo.record_usage(key.id).await;

        tracing::info!(
            key_id     = %key.id,
            merchant_id = %merchant.id,
            "API key verified"
        );

        Ok((key, merchant))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use banzami_types::{ApiKeyId, MerchantId};

    use super::*;
    use crate::{
        api_key::{hash_key, ApiKey},
        merchant::{Merchant, MerchantStatus},
        repository::{ApiKeyRepository, MerchantRepository},
        MerchantError,
    };

    // -----------------------------------------------------------------------
    // In-memory mock repositories
    // -----------------------------------------------------------------------

    struct MockMerchantRepo {
        rows: Mutex<Vec<Merchant>>,
    }

    impl MockMerchantRepo {
        fn new() -> Self {
            Self { rows: Mutex::new(vec![]) }
        }
    }

    impl MerchantRepository for MockMerchantRepo {
        async fn create(&self, m: Merchant) -> Result<Merchant, MerchantError> {
            let mut rows = self.rows.lock().unwrap();
            if rows.iter().any(|r| r.email == m.email) {
                return Err(MerchantError::DuplicateEmail(m.email.clone()));
            }
            rows.push(m.clone());
            Ok(m)
        }

        async fn get(&self, id: MerchantId) -> Result<Merchant, MerchantError> {
            self.rows
                .lock()
                .unwrap()
                .iter()
                .find(|r| r.id == id)
                .cloned()
                .ok_or(MerchantError::NotFound(id))
        }

        async fn get_by_email(&self, email: &str) -> Result<Option<Merchant>, MerchantError> {
            Ok(self
                .rows
                .lock()
                .unwrap()
                .iter()
                .find(|r| r.email == email)
                .cloned())
        }

        async fn list(&self, search: Option<&str>) -> Result<Vec<Merchant>, MerchantError> {
            let rows = self.rows.lock().unwrap();
            Ok(rows
                .iter()
                .filter(|m| {
                    search.map_or(true, |s| {
                        m.name.contains(s) || m.email.contains(s)
                    })
                })
                .cloned()
                .collect())
        }

        async fn delete(&self, id: MerchantId) -> Result<(), MerchantError> {
            let mut rows = self.rows.lock().unwrap();
            let pos = rows.iter().position(|r| r.id == id).ok_or(MerchantError::NotFound(id))?;
            rows.remove(pos);
            Ok(())
        }

        async fn update_status(
            &self,
            id: MerchantId,
            status: MerchantStatus,
        ) -> Result<Merchant, MerchantError> {
            let mut rows = self.rows.lock().unwrap();
            let m = rows
                .iter_mut()
                .find(|r| r.id == id)
                .ok_or(MerchantError::NotFound(id))?;
            m.status     = status;
            m.updated_at = Utc::now();
            Ok(m.clone())
        }

        async fn set_verified(&self, id: MerchantId, verified: bool) -> Result<Merchant, MerchantError> {
            let mut rows = self.rows.lock().unwrap();
            let m = rows
                .iter_mut()
                .find(|r| r.id == id)
                .ok_or(MerchantError::NotFound(id))?;
            m.verified   = verified;
            m.updated_at = Utc::now();
            Ok(m.clone())
        }
    }

    struct MockApiKeyRepo {
        rows: Mutex<Vec<ApiKey>>,
    }

    impl MockApiKeyRepo {
        fn new() -> Self {
            Self { rows: Mutex::new(vec![]) }
        }
    }

    impl ApiKeyRepository for MockApiKeyRepo {
        async fn create(&self, k: ApiKey) -> Result<ApiKey, MerchantError> {
            self.rows.lock().unwrap().push(k.clone());
            Ok(k)
        }

        async fn list_for_merchant(
            &self,
            merchant_id: MerchantId,
        ) -> Result<Vec<ApiKey>, MerchantError> {
            Ok(self
                .rows
                .lock()
                .unwrap()
                .iter()
                .filter(|k| k.merchant_id == merchant_id)
                .cloned()
                .collect())
        }

        async fn get(&self, id: ApiKeyId) -> Result<ApiKey, MerchantError> {
            self.rows
                .lock()
                .unwrap()
                .iter()
                .find(|k| k.id == id)
                .cloned()
                .ok_or(MerchantError::ApiKeyNotFound(id))
        }

        async fn find_by_hash(&self, key_hash: &str) -> Result<Option<ApiKey>, MerchantError> {
            Ok(self
                .rows
                .lock()
                .unwrap()
                .iter()
                .find(|k| k.key_hash == key_hash)
                .cloned())
        }

        async fn revoke(&self, id: ApiKeyId) -> Result<ApiKey, MerchantError> {
            let mut rows = self.rows.lock().unwrap();
            let k = rows
                .iter_mut()
                .find(|k| k.id == id)
                .ok_or(MerchantError::ApiKeyNotFound(id))?;
            if k.revoked_at.is_none() {
                k.revoked_at = Some(Utc::now());
            }
            Ok(k.clone())
        }

        async fn record_usage(&self, id: ApiKeyId) -> Result<(), MerchantError> {
            let mut rows = self.rows.lock().unwrap();
            if let Some(k) = rows.iter_mut().find(|k| k.id == id) {
                k.last_used_at = Some(Utc::now());
            }
            Ok(())
        }
    }

    fn make_engine() -> PostgresMerchantEngine<MockMerchantRepo, MockApiKeyRepo> {
        PostgresMerchantEngine::new(MockMerchantRepo::new(), MockApiKeyRepo::new())
    }

    async fn create_acme(
        engine: &PostgresMerchantEngine<MockMerchantRepo, MockApiKeyRepo>,
    ) -> Merchant {
        engine
            .create(CreateMerchantRequest {
                name:  "Acme Lda".into(),
                email: "acme@example.ao".into(),
            })
            .await
            .unwrap()
    }

    // -----------------------------------------------------------------------
    // Tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn create_merchant_is_active() {
        let engine = make_engine();
        let m = create_acme(&engine).await;
        assert_eq!(m.status, MerchantStatus::Active);
        assert_eq!(m.email, "acme@example.ao");
    }

    #[tokio::test]
    async fn get_merchant_returns_correct_data() {
        let engine = make_engine();
        let created = create_acme(&engine).await;
        let fetched = engine.get(created.id).await.unwrap();
        assert_eq!(created.id, fetched.id);
        assert_eq!(fetched.name, "Acme Lda");
    }

    #[tokio::test]
    async fn duplicate_email_is_rejected() {
        let engine = make_engine();
        create_acme(&engine).await;
        let result = engine
            .create(CreateMerchantRequest {
                name:  "Acme 2".into(),
                email: "acme@example.ao".into(),
            })
            .await;
        assert!(matches!(result, Err(MerchantError::DuplicateEmail(_))));
    }

    #[tokio::test]
    async fn suspend_changes_status() {
        let engine = make_engine();
        let m = create_acme(&engine).await;
        let suspended = engine.suspend(m.id).await.unwrap();
        assert_eq!(suspended.status, MerchantStatus::Suspended);
    }

    #[tokio::test]
    async fn create_api_key_returns_secret_once() {
        let engine = make_engine();
        let m = create_acme(&engine).await;

        let result = engine
            .create_api_key(m.id, "test key".into(), ApiKeyEnvironment::Live)
            .await
            .unwrap();

        assert!(result.secret.starts_with("bz_live_"));
        assert_eq!(result.key.merchant_id, m.id);
        assert_eq!(result.key.environment, ApiKeyEnvironment::Live);
        assert!(result.key.is_active());
        // Prefix is the first 8 chars after "bz_live_"
        assert_eq!(&result.secret[8..16], result.key.key_prefix);
        // Hash of the secret must match what's stored
        assert_eq!(hash_key(&result.secret), result.key.key_hash);
    }

    #[tokio::test]
    async fn verify_valid_key_returns_key_and_merchant() {
        let engine = make_engine();
        let m = create_acme(&engine).await;
        let issued = engine.create_api_key(m.id, "ci key".into(), ApiKeyEnvironment::Live).await.unwrap();

        let (key, merchant) = engine.verify_api_key(&issued.secret).await.unwrap();
        assert_eq!(key.id, issued.key.id);
        assert_eq!(key.environment, ApiKeyEnvironment::Live);
        assert_eq!(merchant.id, m.id);
    }

    #[tokio::test]
    async fn verify_unknown_key_returns_invalid() {
        let engine = make_engine();
        let result = engine.verify_api_key("bz_live_notarealkey").await;
        assert!(matches!(result, Err(MerchantError::InvalidApiKey)));
    }

    #[tokio::test]
    async fn verify_revoked_key_returns_error() {
        let engine = make_engine();
        let m = create_acme(&engine).await;
        let issued = engine.create_api_key(m.id, "temp key".into(), ApiKeyEnvironment::Live).await.unwrap();

        engine.revoke_api_key(issued.key.id).await.unwrap();

        let result = engine.verify_api_key(&issued.secret).await;
        assert!(matches!(result, Err(MerchantError::RevokedApiKey(_))));
    }

    #[tokio::test]
    async fn inactive_merchant_cannot_issue_keys() {
        let engine = make_engine();
        let m = create_acme(&engine).await;
        engine.suspend(m.id).await.unwrap();

        let result = engine.create_api_key(m.id, "blocked key".into(), ApiKeyEnvironment::Live).await;
        assert!(matches!(result, Err(MerchantError::NotActive(_))));
    }
}
