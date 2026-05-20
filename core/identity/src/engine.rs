use chrono::Utc;

use banzami_types::ConsumerId;

use crate::{
    identity::{
        normalize_handle, validate_handle, ConsumerIdentity, ConsumerStatus,
        CreateConsumerRequest, HandleResolution, VerificationBadge,
    },
    repository::IdentityRepository,
    IdentityError,
};

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait IdentityEngine: Send + Sync {
    async fn create(&self, req: CreateConsumerRequest)
        -> Result<ConsumerIdentity, IdentityError>;
    async fn get(&self, id: ConsumerId) -> Result<ConsumerIdentity, IdentityError>;
    async fn get_by_handle(&self, handle: &str) -> Result<ConsumerIdentity, IdentityError>;
    async fn suspend(&self, id: ConsumerId, notes: Option<String>) -> Result<ConsumerIdentity, IdentityError>;
    async fn close(&self, id: ConsumerId) -> Result<ConsumerIdentity, IdentityError>;
    async fn set_badge(
        &self,
        id:    ConsumerId,
        badge: Option<VerificationBadge>,
    ) -> Result<ConsumerIdentity, IdentityError>;

    /// Resolve a @banza handle to its owner, confirming they are ACTIVE.
    ///
    /// Returns `SuspendedIdentity` or `ClosedIdentity` for non-active consumers,
    /// so callers never accidentally send money to an unreachable recipient.
    async fn resolve_handle(&self, handle: &str) -> Result<HandleResolution, IdentityError>;
}

// ---------------------------------------------------------------------------
// Production implementation
// ---------------------------------------------------------------------------

pub struct PostgresIdentityEngine<R: IdentityRepository> {
    repo: R,
}

impl<R: IdentityRepository> PostgresIdentityEngine<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }
}

impl<R: IdentityRepository> IdentityEngine for PostgresIdentityEngine<R> {
    async fn create(
        &self,
        req: CreateConsumerRequest,
    ) -> Result<ConsumerIdentity, IdentityError> {
        let handle = normalize_handle(&req.handle);
        validate_handle(&handle).map_err(IdentityError::InvalidHandle)?;

        let now = Utc::now();
        let identity = ConsumerIdentity {
            id:                 ConsumerId::new(),
            handle,
            display_name:       req.display_name,
            status:             ConsumerStatus::Active,
            verification_badge: None,
            suspension_notes:   None,
            created_at:         now,
            updated_at:         now,
        };

        self.repo.create(identity).await
    }

    async fn get(&self, id: ConsumerId) -> Result<ConsumerIdentity, IdentityError> {
        self.repo.get(id).await
    }

    async fn get_by_handle(&self, handle: &str) -> Result<ConsumerIdentity, IdentityError> {
        let normalized = normalize_handle(handle);
        self.repo.get_by_handle(&normalized).await
    }

    async fn suspend(&self, id: ConsumerId, notes: Option<String>) -> Result<ConsumerIdentity, IdentityError> {
        let identity = self.repo.get(id).await?;
        if identity.status == ConsumerStatus::Closed {
            return Err(IdentityError::InvalidStatusTransition {
                from: ConsumerStatus::Closed,
                to:   ConsumerStatus::Suspended,
            });
        }
        self.repo.suspend_with_notes(id, notes).await
    }

    async fn close(&self, id: ConsumerId) -> Result<ConsumerIdentity, IdentityError> {
        self.repo.update_status(id, ConsumerStatus::Closed).await
    }

    async fn set_badge(
        &self,
        id:    ConsumerId,
        badge: Option<VerificationBadge>,
    ) -> Result<ConsumerIdentity, IdentityError> {
        self.repo.set_badge(id, badge).await
    }

    async fn resolve_handle(&self, handle: &str) -> Result<HandleResolution, IdentityError> {
        let normalized = normalize_handle(handle);
        let identity   = self.repo.get_by_handle(&normalized).await?;

        match identity.status {
            ConsumerStatus::Active    => {}
            ConsumerStatus::Suspended => return Err(IdentityError::SuspendedIdentity(identity.id)),
            ConsumerStatus::Closed    => return Err(IdentityError::ClosedIdentity(identity.id)),
        }

        Ok(HandleResolution {
            consumer_id:  identity.id,
            handle:       identity.handle,
            display_name: identity.display_name,
            status:       identity.status,
        })
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::ConsumerIdentity;

    struct MockRepo {
        identities: Mutex<Vec<ConsumerIdentity>>,
    }

    impl MockRepo {
        fn new() -> Self {
            Self { identities: Mutex::new(vec![]) }
        }
    }

    impl IdentityRepository for MockRepo {
        async fn create(
            &self,
            identity: ConsumerIdentity,
        ) -> Result<ConsumerIdentity, IdentityError> {
            let mut store = self.identities.lock().unwrap();
            if store.iter().any(|i| i.handle == identity.handle) {
                return Err(IdentityError::HandleTaken(identity.handle));
            }
            store.push(identity.clone());
            Ok(identity)
        }

        async fn get(&self, id: ConsumerId) -> Result<ConsumerIdentity, IdentityError> {
            self.identities
                .lock()
                .unwrap()
                .iter()
                .find(|i| i.id == id)
                .cloned()
                .ok_or(IdentityError::NotFound(id))
        }

        async fn get_by_handle(
            &self,
            handle: &str,
        ) -> Result<ConsumerIdentity, IdentityError> {
            self.identities
                .lock()
                .unwrap()
                .iter()
                .find(|i| i.handle == handle)
                .cloned()
                .ok_or_else(|| IdentityError::HandleNotFound(handle.to_string()))
        }

        async fn update_status(
            &self,
            id:     ConsumerId,
            status: ConsumerStatus,
        ) -> Result<ConsumerIdentity, IdentityError> {
            let mut store = self.identities.lock().unwrap();
            let identity = store
                .iter_mut()
                .find(|i| i.id == id)
                .ok_or(IdentityError::NotFound(id))?;
            identity.status = status;
            Ok(identity.clone())
        }

        async fn suspend_with_notes(
            &self,
            id:    ConsumerId,
            notes: Option<String>,
        ) -> Result<ConsumerIdentity, IdentityError> {
            let mut store = self.identities.lock().unwrap();
            let identity = store
                .iter_mut()
                .find(|i| i.id == id)
                .ok_or(IdentityError::NotFound(id))?;
            identity.status           = ConsumerStatus::Suspended;
            identity.suspension_notes = notes;
            Ok(identity.clone())
        }

        async fn set_badge(
            &self,
            id:    ConsumerId,
            badge: Option<VerificationBadge>,
        ) -> Result<ConsumerIdentity, IdentityError> {
            let mut store = self.identities.lock().unwrap();
            let identity = store
                .iter_mut()
                .find(|i| i.id == id)
                .ok_or(IdentityError::NotFound(id))?;
            identity.verification_badge = badge;
            Ok(identity.clone())
        }
    }

    fn engine() -> PostgresIdentityEngine<MockRepo> {
        PostgresIdentityEngine::new(MockRepo::new())
    }

    #[tokio::test]
    async fn create_and_lookup_by_handle() {
        let eng = engine();
        let identity = eng
            .create(CreateConsumerRequest {
                handle:       "@Carlos".into(),
                display_name: Some("Carlos Silva".into()),
            })
            .await
            .unwrap();

        assert_eq!(identity.handle, "carlos");
        assert_eq!(identity.status, ConsumerStatus::Active);

        let by_handle = eng.get_by_handle("@Carlos").await.unwrap();
        assert_eq!(by_handle.id, identity.id);
    }

    #[tokio::test]
    async fn duplicate_handle_is_rejected() {
        let eng = engine();
        eng.create(CreateConsumerRequest { handle: "ana".into(), display_name: None })
            .await
            .unwrap();
        let err = eng
            .create(CreateConsumerRequest { handle: "ana".into(), display_name: None })
            .await
            .unwrap_err();
        assert!(matches!(err, IdentityError::HandleTaken(_)));
    }

    #[tokio::test]
    async fn reserved_handle_is_rejected() {
        let eng = engine();
        let err = eng
            .create(CreateConsumerRequest { handle: "admin".into(), display_name: None })
            .await
            .unwrap_err();
        assert!(matches!(err, IdentityError::InvalidHandle(_)));
    }

    #[tokio::test]
    async fn suspend_then_close() {
        let eng = engine();
        let identity = eng
            .create(CreateConsumerRequest { handle: "paulo".into(), display_name: None })
            .await
            .unwrap();

        let suspended = eng.suspend(identity.id, Some("test suspension".into())).await.unwrap();
        assert_eq!(suspended.status, ConsumerStatus::Suspended);

        let closed = eng.close(identity.id).await.unwrap();
        assert_eq!(closed.status, ConsumerStatus::Closed);
    }

    #[tokio::test]
    async fn cannot_suspend_closed_identity() {
        let eng = engine();
        let identity = eng
            .create(CreateConsumerRequest { handle: "joao".into(), display_name: None })
            .await
            .unwrap();
        eng.close(identity.id).await.unwrap();
        let err = eng.suspend(identity.id, None).await.unwrap_err();
        assert!(matches!(
            err,
            IdentityError::InvalidStatusTransition {
                from: ConsumerStatus::Closed,
                to:   ConsumerStatus::Suspended,
            }
        ));
    }

    #[tokio::test]
    async fn resolve_handle_returns_active_consumer() {
        let eng = engine();
        let identity = eng
            .create(CreateConsumerRequest { handle: "@Maria".into(), display_name: Some("Maria".into()) })
            .await
            .unwrap();

        let resolved = eng.resolve_handle("@Maria").await.unwrap();
        assert_eq!(resolved.consumer_id, identity.id);
        assert_eq!(resolved.handle, "maria");
        assert_eq!(resolved.status, ConsumerStatus::Active);
    }

    #[tokio::test]
    async fn resolve_suspended_handle_returns_error() {
        let eng = engine();
        let identity = eng
            .create(CreateConsumerRequest { handle: "rui".into(), display_name: None })
            .await
            .unwrap();
        eng.suspend(identity.id, None).await.unwrap();

        let err = eng.resolve_handle("rui").await.unwrap_err();
        assert!(matches!(err, IdentityError::SuspendedIdentity(_)));
    }

    #[tokio::test]
    async fn resolve_closed_handle_returns_error() {
        let eng = engine();
        let identity = eng
            .create(CreateConsumerRequest { handle: "luis".into(), display_name: None })
            .await
            .unwrap();
        eng.close(identity.id).await.unwrap();

        let err = eng.resolve_handle("luis").await.unwrap_err();
        assert!(matches!(err, IdentityError::ClosedIdentity(_)));
    }

    #[tokio::test]
    async fn resolve_unknown_handle_returns_not_found() {
        let eng = engine();
        let err = eng.resolve_handle("nobody").await.unwrap_err();
        assert!(matches!(err, IdentityError::HandleNotFound(_)));
    }
}
