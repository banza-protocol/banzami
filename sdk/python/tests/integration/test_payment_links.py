"""Integration-style tests for PaymentLinksResource."""

from __future__ import annotations

import httpx
import respx

from banza import Banzami
from banza.models.payment_link import PaymentLinkStatus

BASE = "https://api.banzami.test"

LINK = {
    "id":           "pl_001",
    "slug":         "pagamento-loja",
    "merchant_id":  "m_001",
    "wallet_id":    "wal_001",
    "amount_minor": 75000,
    "currency":     "AOA",
    "description":  "Compra online",
    "status":       "ACTIVE",
    "expires_at":   None,
    "paid_at":      None,
    "created_at":   "2026-05-20T10:00:00Z",
    "updated_at":   "2026-05-20T10:00:00Z",
}

OPEN_LINK = {**LINK, "id": "pl_002", "slug": "open-link", "amount_minor": None}

PAGE = {"data": [LINK, OPEN_LINK]}


async def test_create_fixed_payment_link():
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/payment-links").mock(return_value=httpx.Response(200, json=LINK))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            link = await c.payment_links.create(
                merchant_id="m_001",
                wallet_id="wal_001",
                amount=75000,
                description="Compra online",
            )

    assert link.id == "pl_001"
    assert link.amount_minor == 75000
    assert link.status == PaymentLinkStatus.ACTIVE
    assert link.checkout_url == "https://pay.banzami.co/pagamento-loja"


async def test_create_open_payment_link():
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/payment-links").mock(return_value=httpx.Response(200, json=OPEN_LINK))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            link = await c.payment_links.create(
                merchant_id="m_001",
                wallet_id="wal_001",
            )

    assert link.amount_minor is None


async def test_retrieve_payment_link():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/payment-links/pl_001").mock(return_value=httpx.Response(200, json=LINK))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            link = await c.payment_links.retrieve("pl_001")

    assert link.slug == "pagamento-loja"


async def test_list_payment_links():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/payment-links").mock(return_value=httpx.Response(200, json=PAGE))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            page = await c.payment_links.list(merchant_id="m_001")

    assert len(page.data) == 2


async def test_cancel_payment_link():
    cancelled = {**LINK, "status": "CANCELLED"}
    with respx.mock(base_url=BASE) as mock:
        mock.delete("/v1/payment-links/pl_001").mock(
            return_value=httpx.Response(200, json=cancelled)
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            link = await c.payment_links.cancel("pl_001")

    assert link.status == PaymentLinkStatus.CANCELLED


async def test_get_public_payment_link():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/public/pay/pagamento-loja").mock(
            return_value=httpx.Response(200, json=LINK)
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            link = await c.payment_links.get_public("pagamento-loja")

    assert link.id == "pl_001"


async def test_check_status_paid():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/public/pay/pagamento-loja/status").mock(
            return_value=httpx.Response(200, json={"paid": True})
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            paid = await c.payment_links.check_status("pagamento-loja")

    assert paid is True


async def test_check_status_unpaid():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/public/pay/nao-pago/status").mock(
            return_value=httpx.Response(200, json={"paid": False})
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            paid = await c.payment_links.check_status("nao-pago")

    assert paid is False
