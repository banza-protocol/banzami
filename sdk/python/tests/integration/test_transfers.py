"""Integration-style tests for TransfersResource."""

from __future__ import annotations

import httpx
import respx

from banza import Banzami
from banza.models.transfer import TransferStatus
from banza.pagination import auto_paginate

BASE = "https://api.banzami.test"

TRANSFER = {
    "id":           "xfr_001",
    "sender_id":    "wal_sender",
    "recipient_id": "wal_receiver",
    "amount":       {"amount_minor": 50000, "currency": "AOA"},
    "description":  "Pagamento de renda",
    "status":       "COMPLETED",
    "created_at":   "2026-05-15T09:00:00Z",
    "updated_at":   "2026-05-15T09:00:01Z",
}

PAGE_1 = {"data": [TRANSFER], "next_cursor": "cursor_p2"}
PAGE_2 = {"data": [{**TRANSFER, "id": "xfr_002"}]}


async def test_send_transfer():
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/transfers").mock(return_value=httpx.Response(200, json=TRANSFER))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            xfr = await c.transfers.send(
                sender_id="wal_sender",
                recipient_id="wal_receiver",
                amount=50000,
                description="Pagamento de renda",
            )

    assert xfr.id == "xfr_001"
    assert xfr.status == TransferStatus.COMPLETED
    assert xfr.amount.amount_minor == 50000


async def test_retrieve_transfer():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/transfers/xfr_001").mock(return_value=httpx.Response(200, json=TRANSFER))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            xfr = await c.transfers.retrieve("xfr_001")

    assert xfr.id == "xfr_001"
    assert xfr.sender_id == "wal_sender"


async def test_list_transfers_paginates():
    responses = [httpx.Response(200, json=PAGE_1), httpx.Response(200, json=PAGE_2)]
    idx = 0

    def side_effect(request: httpx.Request) -> httpx.Response:
        nonlocal idx
        r = responses[idx]
        idx += 1
        return r

    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/transfers").mock(side_effect=side_effect)
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            all_xfrs = [x async for x in auto_paginate(c.transfers.list, consumer_id="wal_sender")]

    assert len(all_xfrs) == 2
    assert all_xfrs[0].id == "xfr_001"
    assert all_xfrs[1].id == "xfr_002"
