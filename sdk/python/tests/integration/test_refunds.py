"""Integration-style tests for RefundsResource."""

from __future__ import annotations

import httpx
import respx

from banza import Banzami
from banza.models.refund import RefundStatus

BASE = "https://api.banzami.test"

REFUND = {
    "id":             "ref_001",
    "transaction_id": "tx_001",
    "merchant_id":    "m_001",
    "amount_minor":   20000,
    "currency":       "AOA",
    "status":         "PENDING",
    "reason":         "Produto devolvido",
    "created_at":     "2026-05-20T11:00:00Z",
    "updated_at":     "2026-05-20T11:00:00Z",
}

PAGE = {"data": [REFUND]}


async def test_create_refund():
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/refunds").mock(return_value=httpx.Response(200, json=REFUND))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            refund = await c.refunds.create(
                transaction_id="tx_001",
                amount=20000,
                reason="Produto devolvido",
            )

    assert refund.id == "ref_001"
    assert refund.amount_minor == 20000
    assert refund.status == RefundStatus.PENDING
    assert refund.reason == "Produto devolvido"


async def test_create_refund_no_reason():
    no_reason = {**REFUND, "reason": None}
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/refunds").mock(return_value=httpx.Response(200, json=no_reason))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            refund = await c.refunds.create(transaction_id="tx_001", amount=20000)

    assert refund.reason is None


async def test_retrieve_refund():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/refunds/ref_001").mock(return_value=httpx.Response(200, json=REFUND))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            refund = await c.refunds.retrieve("ref_001")

    assert refund.transaction_id == "tx_001"


async def test_list_refunds():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/refunds").mock(return_value=httpx.Response(200, json=PAGE))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            page = await c.refunds.list(transaction_id="tx_001")

    assert len(page.data) == 1
    assert page.data[0].id == "ref_001"


async def test_refund_succeeded_status():
    succeeded = {**REFUND, "status": "SUCCEEDED"}
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/refunds/ref_001").mock(return_value=httpx.Response(200, json=succeeded))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            refund = await c.refunds.retrieve("ref_001")

    assert refund.status == RefundStatus.SUCCEEDED
