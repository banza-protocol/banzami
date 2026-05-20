"""Transactions resource — merchant-facing payment records."""

from __future__ import annotations

from banza.models.transaction import Transaction
from banza.pagination import Page
from banza.utils.ids import new_idempotency_key

from .base import AsyncResource


class TransactionsResource(AsyncResource):
    async def create(
        self,
        *,
        amount: int,
        currency: str = "AOA",
        description: str | None = None,
        wallet_id: str | None = None,
        transaction_type: str = "payment",
        idempotency_key: str | None = None,
    ) -> Transaction:
        """Create a new payment transaction.

        Parameters
        ----------
        amount:
            Amount in minor units (Kz for AOA).
        currency:
            ISO 4217 currency code. Defaults to ``AOA``.
        description:
            Optional human-readable description shown on statements.
        wallet_id:
            Target merchant wallet. Defaults to the merchant's primary wallet.
        transaction_type:
            Transaction type token. Defaults to ``payment``.
        idempotency_key:
            Supply your own key to safely retry on network failures.
        """
        data = await self._post(
            "/transactions",
            {
                "amount_minor":     amount,
                "currency":         currency,
                "description":      description,
                "wallet_id":        wallet_id,
                "transaction_type": transaction_type,
            },
            idempotency_key=idempotency_key or new_idempotency_key(),
        )
        return Transaction.model_validate(data)

    async def retrieve(self, transaction_id: str) -> Transaction:
        """Retrieve a transaction by ID."""
        data = await self._get(f"/transactions/{transaction_id}")
        return Transaction.model_validate(data)

    async def list(
        self,
        *,
        status: str | None = None,
        limit: int = 20,
        cursor: str | None = None,
    ) -> Page[Transaction]:
        """List transactions with optional status filter."""
        params: dict[str, object] = {"limit": limit}
        if status:
            params["status"] = status
        if cursor:
            params["cursor"] = cursor
        data = await self._get("/transactions", params=params)
        return Page[Transaction].model_validate(data)

    async def capture(
        self,
        transaction_id: str,
        *,
        idempotency_key: str | None = None,
    ) -> Transaction:
        """Capture a pre-authorised transaction."""
        data = await self._post(
            f"/transactions/{transaction_id}/capture",
            idempotency_key=idempotency_key or new_idempotency_key(),
        )
        return Transaction.model_validate(data)

    async def reverse(
        self,
        transaction_id: str,
        *,
        idempotency_key: str | None = None,
    ) -> Transaction:
        """Reverse (refund) a completed transaction."""
        data = await self._post(
            f"/transactions/{transaction_id}/reverse",
            idempotency_key=idempotency_key or new_idempotency_key(),
        )
        return Transaction.model_validate(data)
