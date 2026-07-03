"""Refunds resource — partial and full refund lifecycle."""

from __future__ import annotations

from banzami.models.refund import Refund, RefundSourceType
from banzami.pagination import Page
from banzami.utils.ids import new_idempotency_key

from .base import AsyncResource


class RefundsResource(AsyncResource):
    async def create(
        self,
        *,
        source_type:     RefundSourceType | str,
        source_id:       str,
        amount:          int,
        currency:        str,
        reason:          str | None = None,
        idempotency_key: str | None = None,
    ) -> Refund:
        """Issue a refund against a TYPED, captured payment source (BANZA ADR-030).

        A refund always names its source explicitly — never a generic transfer,
        never an inferred type.

        Parameters
        ----------
        source_type:
            ``ACQUIRING_PAYMENT`` (external-rail) or ``WALLET_PAYMENT`` (wallet-native).
        source_id:
            ID of the typed source object (a transaction id, or a wallet-payment id).
        amount:
            Amount to refund in minor units (Kz). Must stay within the source's
            refund ceiling (captured amount minus any prior refunds).
        currency:
            ISO-4217 code; the authoritative refund currency is the source's.
        reason:
            Optional free-text reason recorded on the refund.
        idempotency_key:
            Supply your own key to safely retry on network failures.
        """
        data = await self._post(
            "/refunds",
            {
                "source_type":  str(source_type),
                "source_id":    source_id,
                "amount_minor": amount,
                "currency":     currency,
                "reason":       reason,
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
        source_id: str | None = None,
        limit:     int = 20,
        cursor:    str | None = None,
    ) -> Page[Refund]:
        """List refunds, optionally filtered by typed source id."""
        params: dict[str, object] = {"limit": limit}
        if source_id:
            params["source_id"] = source_id
        if cursor:
            params["cursor"] = cursor
        data = await self._get("/refunds", params=params)
        return Page[Refund].model_validate(data)
