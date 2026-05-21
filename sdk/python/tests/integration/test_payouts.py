"""Integration-style tests for PayoutsResource."""

from __future__ import annotations

import httpx
import respx

from banza import Banzami
from banza.models.payout import PayoutStatus
from banza.pagination import auto_paginate

BASE = "https://api.banzami.test"

PAYOUT = {
    "id":           "pay_001",
    "wallet_id":    "wal_001",
    "amount_minor": 200000,
    "currency":     "AOA",
    "status":       "PENDING",
    "reference":    None,
    "created_at":   "2026-05-15T11:00:00Z",
    "updated_at":   "2026-05-15T11:00:00Z",
}

PAGE_1 = {"data": [PAYOUT], "next_cursor": "crs_p2"}
PAGE_2 = {"data": [{**PAYOUT, "id": "pay_002"}]}


async def test_create_payout():
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/payouts").mock(return_value=httpx.Response(200, json=PAYOUT))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            payout = await c.payouts.create(wallet_id="wal_001", amount=200000)

    assert payout.id == "pay_001"
    assert payout.status == PayoutStatus.PENDING
    assert payout.amount_minor == 200000


async def test_retrieve_payout():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/payouts/pay_001").mock(return_value=httpx.Response(200, json=PAYOUT))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            payout = await c.payouts.retrieve("pay_001")

    assert payout.wallet_id == "wal_001"


async def test_list_payouts_paginates():
    responses = [httpx.Response(200, json=PAGE_1), httpx.Response(200, json=PAGE_2)]
    idx = 0

    def side_effect(request: httpx.Request) -> httpx.Response:
        nonlocal idx
        r = responses[idx]
        idx += 1
        return r

    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/payouts").mock(side_effect=side_effect)
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            all_payouts = [p async for p in auto_paginate(c.payouts.list)]

    assert len(all_payouts) == 2
    assert all_payouts[1].id == "pay_002"
