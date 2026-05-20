"""Merchants resource — merchant profile and API-key management."""

from __future__ import annotations

from banza.models.merchant import ApiKey, Merchant, NewApiKey

from .base import AsyncResource


class MerchantsResource(AsyncResource):
    async def retrieve(self, merchant_id: str) -> Merchant:
        """Retrieve a merchant profile by ID."""
        data = await self._get(f"/merchants/{merchant_id}")
        return Merchant.model_validate(data)

    async def list_api_keys(self, merchant_id: str) -> list[ApiKey]:
        """List all API keys for a merchant."""
        data = await self._get(f"/merchants/{merchant_id}/api-keys")
        return [ApiKey.model_validate(item) for item in data]

    async def create_api_key(
        self,
        merchant_id: str,
        *,
        label: str | None = None,
    ) -> NewApiKey:
        """Create a new API key. The ``key`` field is only visible once."""
        data = await self._post(
            f"/merchants/{merchant_id}/api-keys",
            {"label": label},
        )
        return NewApiKey.model_validate(data)

    async def revoke_api_key(self, merchant_id: str, key_id: str) -> None:
        """Permanently revoke an API key."""
        await self._delete(f"/merchants/{merchant_id}/api-keys/{key_id}")
