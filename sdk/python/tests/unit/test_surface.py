"""The SDK talks to Banzami's own hosts, and only to routes the gateway serves."""

from __future__ import annotations

import httpx
import respx

from banzami import Banzami
from banzami.config import LIVE_BASE_URL, SANDBOX_BASE_URL


async def test_a_sandbox_key_goes_to_the_sandbox_gateway():
    with respx.mock(base_url=SANDBOX_BASE_URL, assert_all_called=True) as mock:
        route = mock.get("/v1/transactions").mock(return_value=httpx.Response(200, json={"data": []}))
        async with Banzami(api_key="bz_test_sk_x") as c:
            await c.transactions.list()
    assert route.called
    assert str(route.calls[0].request.url).startswith("https://sandbox-api.banzami.com/v1/")


async def test_a_live_key_goes_to_the_live_gateway():
    with respx.mock(base_url=LIVE_BASE_URL, assert_all_called=True) as mock:
        route = mock.get("/v1/transactions").mock(return_value=httpx.Response(200, json={"data": []}))
        async with Banzami(api_key="bz_live_sk_x") as c:
            await c.transactions.list()
    assert str(route.calls[0].request.url).startswith("https://api.banzami.com/v1/")


def test_the_defaults_are_banzami_hosts():
    # Neither api.banzami.ao nor pay.banzami.co is Banzami's.
    assert LIVE_BASE_URL == "https://api.banzami.com"
    assert SANDBOX_BASE_URL == "https://sandbox-api.banzami.com"


def test_transactions_offer_no_unmounted_routes():
    # The gateway mounts create, list and get for transactions — no capture or
    # reverse — and no merchant transfer surface at all.
    from banzami.resources.transactions import TransactionsResource

    assert not hasattr(TransactionsResource, "capture")
    assert not hasattr(TransactionsResource, "reverse")
    client = Banzami(api_key="bz_test_sk_x")
    assert not hasattr(client, "transfers")


def test_withdrawn_payment_requests_are_not_exported():
    # /v1/payment-requests was withdrawn by the operator (RA-057) and the
    # resource removed; the models stayed exported, offering a feature with no
    # route behind it (A4-06).
    import importlib.util

    import banzami
    import banzami.models

    for mod in (banzami, banzami.models):
        assert not hasattr(mod, "PaymentRequest")
        assert not hasattr(mod, "PaymentRequestStatus")
        assert "PaymentRequest" not in mod.__all__
    assert importlib.util.find_spec("banzami.models.payment_request") is None
