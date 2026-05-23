"""Refunds resource — partial and full refund lifecycle."""

from __future__ import annotations

from banza.models.refund import Refund
from banza.pagination import Page
from banza.utils.ids import new_idempotency_key

from .base import AsyncResource


class RefundsResource(AsyncResource):
    async def create(
        self,
        *,
        transaction_id:  str,
        amount:          int,
        reason:          str | None = None,
        idempotency_key: str | None = None,
    ) -> Refund:
        """Issue a refund against a completed transaction.

        Parameters
        ----------
        transaction_id:
            ID of the transaction to refund.
        amount:
            Amount to refund in minor units (Kz). Must not exceed the
            original transaction amount minus any prior refunds.
        reason:
            Optional free-text reason recorded on the refund.
        idempotency_key:
            Supply your own key to safely retry on network failures.
        """
        data = await self._post(
            "/refunds",
            {
                "transaction_id": transaction_id,
                "amount_minor":   amount,
                "reason":         reason,
            },
            idempotency_key=idempotency_key or new_idempotency_key(),
        )
        return Refund.model_validate(data)

    async def retrieve(self, refund_id: str) -> Refund:
        """Retrieve a refund by ID."""
        data = await self._get(f"/refunds/{refund_id}")
        return Refund.model_validate(data)

    async def list(
        self,
        *,
        transaction_id: str | None = None,
        limit:          int = 20,
        cursor:         str | None = None,
    ) -> Page[Refund]:
        """List refunds, optionally filtered by transaction."""
        params: dict[str, object] = {"limit": limit}
        if transaction_id:
            params["transaction_id"] = transaction_id
        if cursor:
            params["cursor"] = cursor
        data = await self._get("/refunds", params=params)
        return Page[Refund].model_validate(data)
