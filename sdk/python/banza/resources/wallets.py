"""Wallets resource — merchant wallet management."""

from __future__ import annotations

from banza.models.wallet import Wallet, WalletBalance

from .base import AsyncResource


class WalletsResource(AsyncResource):
    async def retrieve(self, wallet_id: str) -> Wallet:
        """Retrieve a wallet by ID."""
        data = await self._get(f"/wallets/{wallet_id}")
        return Wallet.model_validate(data)

    async def balance(self, wallet_id: str) -> WalletBalance:
        """Retrieve the current balance of a wallet."""
        data = await self._get(f"/wallets/{wallet_id}/balance")
        return WalletBalance.model_validate(data)
