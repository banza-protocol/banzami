"""Integration-style tests for MerchantsResource."""

from __future__ import annotations

import httpx
import respx

from banza import Banzami
from banza.models.merchant import MerchantStatus

BASE = "https://api.banzami.test"

MERCHANT = {
    "id":         "m_001",
    "name":       "Loja do João",
    "status":     "ACTIVE",
    "created_at": "2026-01-01T00:00:00Z",
}

API_KEY = {
    "id":           "key_001",
    "prefix":       "bz_live_abcd",
    "label":        "Produção",
    "created_at":   "2026-02-01T00:00:00Z",
    "last_used_at": None,
}

NEW_API_KEY = {**API_KEY, "key": "bz_live_abcdef1234567890_secretpart"}


async def test_retrieve_merchant():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/merchants/m_001").mock(return_value=httpx.Response(200, json=MERCHANT))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            merchant = await c.merchants.retrieve("m_001")

    assert merchant.id == "m_001"
    assert merchant.name == "Loja do João"
    assert merchant.status == MerchantStatus.ACTIVE


async def test_list_api_keys():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/merchants/m_001/api-keys").mock(
            return_value=httpx.Response(200, json=[API_KEY])
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            keys = await c.merchants.list_api_keys("m_001")

    assert len(keys) == 1
    assert keys[0].prefix == "bz_live_abcd"


async def test_create_api_key():
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/merchants/m_001/api-keys").mock(
            return_value=httpx.Response(200, json=NEW_API_KEY)
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            new_key = await c.merchants.create_api_key("m_001", label="Produção")

    assert new_key.key == "bz_live_abcdef1234567890_secretpart"
    assert new_key.label == "Produção"


async def test_revoke_api_key():
    with respx.mock(base_url=BASE) as mock:
        mock.delete("/v1/merchants/m_001/api-keys/key_001").mock(
            return_value=httpx.Response(204)
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            await c.merchants.revoke_api_key("m_001", "key_001")
