"""Payouts resource — wallet-to-bank withdrawals."""

from __future__ import annotations

from banza.models.payout import Payout
from banza.pagination import Page
from banza.utils.ids import new_idempotency_key

from .base import AsyncResource


class PayoutsResource(AsyncResource):
    async def create(
        self,
        *,
        wallet_id: str,
        amount: int,
        currency: str = "AOA",
        idempotency_key: str | None = None,
    ) -> Payout:
        """Initiate a payout from a merchant wallet.

        Parameters
        ----------
        wallet_id:
            ID of the source wallet.
        amount:
            Amount in minor units (Kz for AOA).
        idempotency_key:
            Supply your own key to safely retry on network failures.
        """
        data = await self._post(
            "/payouts",
            {
                "wallet_id":    wallet_id,
                "amount_minor": amount,
                "currency":     currency,
            },
            idempotency_key=idempotency_key or new_idempotency_key(),
        )
        return Payout.model_validate(data)

    async def retrieve(self, payout_id: str) -> Payout:
        """Retrieve a payout by ID."""
        data = await self._get(f"/payouts/{payout_id}")
        return Payout.model_validate(data)

    async def list(
        self,
        *,
        limit: int = 20,
        cursor: str | None = None,
    ) -> Page[Payout]:
        """List payouts for the authenticated merchant."""
        params: dict[str, object] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        data = await self._get("/payouts", params=params)
        return Page[Payout].model_validate(data)
