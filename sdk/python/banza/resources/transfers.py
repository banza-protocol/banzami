"""Transfers resource — instant wallet-to-wallet (P2P) transfers."""

from __future__ import annotations

from banza.models.transfer import Transfer
from banza.pagination import Page
from banza.utils.ids import new_idempotency_key

from .base import AsyncResource


class TransfersResource(AsyncResource):
    async def send(
        self,
        *,
        sender_id: str,
        recipient_id: str,
        amount: int,
        currency: str = "AOA",
        description: str | None = None,
        idempotency_key: str | None = None,
    ) -> Transfer:
        """Execute an instant wallet-to-wallet transfer.

        Parameters
        ----------
        sender_id:
            ID of the sending consumer wallet.
        recipient_id:
            ID of the receiving consumer wallet.
        amount:
            Amount in minor units (Kz for AOA).
        idempotency_key:
            Supply your own key to safely retry on network failures.
        """
        data = await self._post(
            "/transfers",
            {
                "sender_id":    sender_id,
                "recipient_id": recipient_id,
                "amount_minor": amount,
                "currency":     currency,
                "description":  description,
            },
            idempotency_key=idempotency_key or new_idempotency_key(),
        )
        return Transfer.model_validate(data)

    async def retrieve(self, transfer_id: str) -> Transfer:
        """Retrieve a transfer by ID."""
        data = await self._get(f"/transfers/{transfer_id}")
        return Transfer.model_validate(data)

    async def list(
        self,
        *,
        consumer_id: str,
        limit: int = 20,
        cursor: str | None = None,
    ) -> Page[Transfer]:
        """List transfers for a consumer wallet."""
        params: dict[str, object] = {"consumer_id": consumer_id, "limit": limit}
        if cursor:
            params["cursor"] = cursor
        data = await self._get("/transfers", params=params)
        return Page[Transfer].model_validate(data)
