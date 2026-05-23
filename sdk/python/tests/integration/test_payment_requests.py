"""Integration-style tests for PaymentRequestsResource."""

from __future__ import annotations

import httpx
import respx

from banza import Banzami
from banza.models.payment_request import PaymentRequestStatus

BASE = "https://api.banzami.test"

REQUEST = {
    "id":           "pr_001",
    "requester_id": "con_001",
    "payer_id":     "con_002",
    "amount_minor": 30000,
    "currency":     "AOA",
    "description":  "Jantar de ontem",
    "status":       "PENDING",
    "expires_at":   "2026-05-27T23:59:59Z",
    "created_at":   "2026-05-20T18:00:00Z",
    "updated_at":   "2026-05-20T18:00:00Z",
}

PAGE = {"data": [REQUEST]}


async def test_create_payment_request():
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/payment-requests").mock(return_value=httpx.Response(200, json=REQUEST))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            req = await c.payment_requests.create(
                requester_id="con_001",
                amount=30000,
                payer_handle="@ana",
                description="Jantar de ontem",
            )

    assert req.id == "pr_001"
    assert req.amount_minor == 30000
    assert req.status == PaymentRequestStatus.PENDING
    assert req.description == "Jantar de ontem"


async def test_create_open_payment_request():
    open_req = {**REQUEST, "payer_id": None}
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/payment-requests").mock(return_value=httpx.Response(200, json=open_req))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            req = await c.payment_requests.create(requester_id="con_001", amount=30000)

    assert req.payer_id is None


async def test_retrieve_payment_request():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/payment-requests/pr_001").mock(
            return_value=httpx.Response(200, json=REQUEST)
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            req = await c.payment_requests.retrieve("pr_001")

    assert req.requester_id == "con_001"


async def test_list_payment_requests():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/payment-requests").mock(return_value=httpx.Response(200, json=PAGE))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            page = await c.payment_requests.list(requester_id="con_001")

    assert len(page.data) == 1


async def test_pay_payment_request():
    paid = {**REQUEST, "status": "PAID"}
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/payment-requests/pr_001/pay").mock(
            return_value=httpx.Response(200, json=paid)
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            req = await c.payment_requests.pay("pr_001")

    assert req.status == PaymentRequestStatus.PAID


async def test_decline_payment_request():
    declined = {**REQUEST, "status": "DECLINED"}
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/payment-requests/pr_001/decline").mock(
            return_value=httpx.Response(200, json=declined)
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            req = await c.payment_requests.decline("pr_001")

    assert req.status == PaymentRequestStatus.DECLINED


async def test_cancel_payment_request():
    cancelled = {**REQUEST, "status": "CANCELLED"}
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/payment-requests/pr_001/cancel").mock(
            return_value=httpx.Response(200, json=cancelled)
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            req = await c.payment_requests.cancel("pr_001")

    assert req.status == PaymentRequestStatus.CANCELLED
