"""Integration-style tests for WalletsResource."""

from __future__ import annotations

import httpx
import respx

from banza import Banzami
from banza.models.wallet import WalletStatus

BASE = "https://api.banzami.test"

WALLET = {
    "id":          "wal_001",
    "merchant_id": "m_001",
    "currency":    "AOA",
    "status":      "ACTIVE",
    "created_at":  "2026-01-01T00:00:00Z",
}

BALANCE = {
    "available_minor": 150000,
    "reserved_minor":  25000,
    "currency":        "AOA",
}


async def test_retrieve_wallet():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/wallets/wal_001").mock(return_value=httpx.Response(200, json=WALLET))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            wallet = await c.wallets.retrieve("wal_001")

    assert wallet.id == "wal_001"
    assert wallet.status == WalletStatus.ACTIVE
    assert wallet.currency == "AOA"


async def test_wallet_balance():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/wallets/wal_001/balance").mock(return_value=httpx.Response(200, json=BALANCE))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            balance = await c.wallets.balance("wal_001")

    assert balance.available_minor == 150000
    assert balance.reserved_minor == 25000
    assert balance.total_minor == 175000
    assert balance.currency == "AOA"
