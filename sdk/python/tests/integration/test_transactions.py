"""Integration-style tests for the TransactionsResource."""

from __future__ import annotations

import httpx
import respx

from banza import Banzami
from banza.models.transaction import TransactionStatus
from banza.pagination import auto_paginate

BASE = "https://api.banzami.test"

COMPLETED_TX = {
    "id":           "tx_completed",
    "merchant_id":  "m_001",
    "amount_minor": 25000,
    "currency":     "AOA",
    "status":       "COMPLETED",
    "description":  "Compra loja #42",
    "created_at":   "2026-05-15T10:00:00Z",
    "updated_at":   "2026-05-15T10:01:00Z",
}

PAGE_1 = {"data": [COMPLETED_TX], "next_cursor": "cursor_page2"}
PAGE_2 = {"data": [{**COMPLETED_TX, "id": "tx_002"}]}


async def test_create_and_retrieve():
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/transactions").mock(return_value=httpx.Response(200, json=COMPLETED_TX))
        mock.get("/v1/transactions/tx_completed").mock(return_value=httpx.Response(200, json=COMPLETED_TX))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            created   = await c.transactions.create(amount=25000, description="Compra loja #42")
            retrieved = await c.transactions.retrieve(created.id)

    assert created.id == retrieved.id
    assert created.status == TransactionStatus.COMPLETED
    assert created.currency == "AOA"


async def test_list_transactions_paginates():
    responses = [
        httpx.Response(200, json=PAGE_1),
        httpx.Response(200, json=PAGE_2),
    ]
    idx = 0

    def next_page(request: httpx.Request) -> httpx.Response:
        nonlocal idx
        r = responses[idx]
        idx += 1
        return r

    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/transactions").mock(side_effect=next_page)
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            all_txs = [tx async for tx in auto_paginate(c.transactions.list, limit=1)]

    assert len(all_txs) == 2
    assert all_txs[0].id == "tx_completed"
    assert all_txs[1].id == "tx_002"


async def test_capture_transaction():
    captured_tx = {**COMPLETED_TX, "status": "REFUNDED"}
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/transactions/tx_completed/capture").mock(
            return_value=httpx.Response(200, json=captured_tx)
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            tx = await c.transactions.capture("tx_completed")
    assert tx.status == TransactionStatus.REFUNDED


async def test_reverse_transaction():
    reversed_tx = {**COMPLETED_TX, "status": "REFUNDED"}
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/transactions/tx_completed/reverse").mock(
            return_value=httpx.Response(200, json=reversed_tx)
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            tx = await c.transactions.reverse("tx_completed")
    assert tx.status == TransactionStatus.REFUNDED
