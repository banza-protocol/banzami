"""Payment links resource — merchant-facing payment link lifecycle."""

from __future__ import annotations

from datetime import datetime

from banza.models.payment_link import PaymentLink
from banza.pagination import Page
from banza.utils.ids import new_idempotency_key

from .base import AsyncResource


class PaymentLinksResource(AsyncResource):
    async def create(
        self,
        *,
        merchant_id:     str,
        wallet_id:       str,
        currency:        str = "AOA",
        amount:          int | None = None,
        description:     str | None = None,
        expires_at:      datetime | None = None,
        idempotency_key: str | None = None,
    ) -> PaymentLink:
        """Create a new payment link.

        Parameters
        ----------
        merchant_id:
            ID of the merchant who owns this link.
        wallet_id:
            Destination wallet for received funds.
        amount:
            Fixed amount in minor units (Kz). Omit for open-amount links.
        expires_at:
            UTC datetime after which the link becomes invalid.
        idempotency_key:
            Supply your own key to safely retry on network failures.
        """
        data = await self._post(
            "/payment-links",
            {
                "merchant_id":  merchant_id,
                "wallet_id":    wallet_id,
                "currency":     currency,
                "amount_minor": amount,
                "description":  description,
                "expires_at":   expires_at.isoformat() if expires_at else None,
            },
            idempotency_key=idempotency_key or new_idempotency_key(),
        )
        return PaymentLink.model_validate(data)

    async def retrieve(self, link_id: str) -> PaymentLink:
        """Retrieve a payment link by ID."""
        data = await self._get(f"/payment-links/{link_id}")
        return PaymentLink.model_validate(data)

    async def list(
        self,
        *,
        merchant_id: str,
        limit:       int = 20,
        cursor:      str | None = None,
    ) -> Page[PaymentLink]:
        """List payment links for a merchant."""
        params: dict[str, object] = {"merchant_id": merchant_id, "limit": limit}
        if cursor:
            params["cursor"] = cursor
        data = await self._get("/payment-links", params=params)
        return Page[PaymentLink].model_validate(data)

    async def cancel(self, link_id: str) -> PaymentLink:
        """Cancel an active payment link."""
        data = await self._delete(f"/payment-links/{link_id}")
        return PaymentLink.model_validate(data)

    async def get_public(self, slug: str) -> PaymentLink:
        """Retrieve a payment link by its public slug (no auth required)."""
        data = await self._get(f"/public/pay/{slug}")
        return PaymentLink.model_validate(data)

    async def check_status(self, slug: str) -> bool:
        """Return ``True`` if the payment link has been paid."""
        data = await self._get(f"/public/pay/{slug}/status")
        return bool(data.get("paid", False))
