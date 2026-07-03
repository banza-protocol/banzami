"""Integration-style tests for RefundsResource — typed source (BANZA ADR-030)."""

from __future__ import annotations

import json

import httpx
import respx

from banzami import Banzami
from banzami.models.refund import RefundSourceType, RefundStatus

BASE = "https://api.banzami.test"

REFUND = {
    "id":             "ref_001",
    "source_type":    "WALLET_PAYMENT",
    "source_id":      "wp_001",
    "transaction_id": None,
    "merchant_id":    "m_001",
    "consumer_id":    "c_001",
    "amount_minor":   20000,
    "currency":       "AOA",
    "status":         "PENDING",
    "reason":         "Produto devolvido",
    "created_at":     "2026-05-20T11:00:00Z",
    "updated_at":     "2026-05-20T11:00:00Z",
}

PAGE = {"data": [REFUND]}


async def test_create_refund_sends_typed_source():
    with respx.mock(base_url=BASE) as mock:
        route = mock.post("/v1/refunds").mock(return_value=httpx.Response(200, json=REFUND))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            refund = await c.refunds.create(
                source_type=RefundSourceType.WALLET_PAYMENT,
                source_id="wp_001",
                amount=20000,
                currency="AOA",
                reason="Produto devolvido",
            )

    body = json.loads(route.calls.last.request.content)
    assert body["source_type"] == "WALLET_PAYMENT"
    assert body["source_id"] == "wp_001"
    assert body["currency"] == "AOA"
    assert body["amount_minor"] == 20000
    assert "transaction_id" not in body  # never a bare transaction id / transfer
    assert refund.id == "ref_001"
    assert refund.source_type == RefundSourceType.WALLET_PAYMENT
    assert refund.status == RefundStatus.PENDING


async def test_create_acquiring_refund():
    acq = {**REFUND, "source_type": "ACQUIRING_PAYMENT", "source_id": "tx_001", "transaction_id": "tx_001", "consumer_id": None}
    with respx.mock(base_url=BASE) as mock:
        route = mock.post("/v1/refunds").mock(return_value=httpx.Response(200, json=acq))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            refund = await c.refunds.create(
                source_type="ACQUIRING_PAYMENT", source_id="tx_001", amount=20000, currency="AOA",
            )

    body = json.loads(route.calls.last.request.content)
    assert body["source_type"] == "ACQUIRING_PAYMENT"
    assert refund.source_type == RefundSourceType.ACQUIRING_PAYMENT


async def test_retrieve_refund():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/refunds/ref_001").mock(return_value=httpx.Response(200, json=REFUND))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            refund = await c.refunds.retrieve("ref_001")

    assert refund.source_id == "wp_001"


async def test_list_refunds_by_source():
    with respx.mock(base_url=BASE) as mock:
        route = mock.get("/v1/refunds").mock(return_value=httpx.Response(200, json=PAGE))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            page = await c.refunds.list(source_id="wp_001")

    assert "source_id=wp_001" in str(route.calls.last.request.url)
    assert len(page.data) == 1
    assert page.data[0].id == "ref_001"
