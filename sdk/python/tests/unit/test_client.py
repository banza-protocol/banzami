"""Core client behaviour: idempotency, retries, error mapping, hooks."""

from __future__ import annotations

import httpx
import pytest
import respx

from banza import BanzaHooks, Banzami
from banza.exceptions import (
    BanzamiAuthenticationError,
    BanzamiNotFoundError,
    BanzamiServerError,
)

BASE = "https://api.banzami.test"

TX_PAYLOAD = {
    "id":           "tx_001",
    "merchant_id":  "m_001",
    "amount_minor": 50000,
    "currency":     "AOA",
    "status":       "PENDING",
    "created_at":   "2026-01-01T00:00:00Z",
    "updated_at":   "2026-01-01T00:00:00Z",
}


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

async def test_create_transaction_success():
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/transactions").mock(return_value=httpx.Response(200, json=TX_PAYLOAD))
        async with Banzami(api_key="bz_test", base_url=BASE) as client:
            tx = await client.transactions.create(amount=50000, currency="AOA")
    assert tx.id == "tx_001"
    assert tx.amount_minor == 50000


async def test_retrieve_transaction_success():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/transactions/tx_001").mock(return_value=httpx.Response(200, json=TX_PAYLOAD))
        async with Banzami(api_key="bz_test", base_url=BASE) as client:
            tx = await client.transactions.retrieve("tx_001")
    assert tx.id == "tx_001"


# ---------------------------------------------------------------------------
# Error mapping
# ---------------------------------------------------------------------------

async def test_401_raises_authentication_error():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/transactions/tx_x").mock(
            return_value=httpx.Response(401, json={"code": "UNAUTHORIZED", "message": "Bad key"})
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as client:
            with pytest.raises(BanzamiAuthenticationError):
                await client.transactions.retrieve("tx_x")


async def test_404_raises_not_found():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/transactions/missing").mock(
            return_value=httpx.Response(404, json={"code": "NOT_FOUND", "message": "Not found"})
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as client:
            with pytest.raises(BanzamiNotFoundError):
                await client.transactions.retrieve("missing")


async def test_500_raises_server_error():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/transactions/tx_err").mock(
            return_value=httpx.Response(500, json={"code": "INTERNAL", "message": "Oops"})
        )
        async with Banzami(api_key="bz_test", base_url=BASE, max_retries=0) as client:
            with pytest.raises(BanzamiServerError):
                await client.transactions.retrieve("tx_err")


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------

async def test_post_sends_idempotency_key():
    captured: list[str] = []

    def capture(request: httpx.Request) -> httpx.Response:
        captured.append(request.headers.get("idempotency-key", ""))
        return httpx.Response(200, json=TX_PAYLOAD)

    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/transactions").mock(side_effect=capture)
        async with Banzami(api_key="bz_test", base_url=BASE) as client:
            await client.transactions.create(amount=1000)
    assert captured[0] != ""


async def test_custom_idempotency_key_preserved():
    captured: list[str] = []

    def capture(request: httpx.Request) -> httpx.Response:
        captured.append(request.headers.get("idempotency-key", ""))
        return httpx.Response(200, json=TX_PAYLOAD)

    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/transactions").mock(side_effect=capture)
        async with Banzami(api_key="bz_test", base_url=BASE) as client:
            await client.transactions.create(amount=1000, idempotency_key="my-key-123")
    assert captured[0] == "my-key-123"


# ---------------------------------------------------------------------------
# Retry behaviour
# ---------------------------------------------------------------------------

async def test_retries_on_503_then_succeeds():
    call_count = 0

    def flaky(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            return httpx.Response(503, json={"code": "UNAVAILABLE", "message": "retry"})
        return httpx.Response(200, json=TX_PAYLOAD)

    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/transactions/tx_001").mock(side_effect=flaky)
        async with Banzami(api_key="bz_test", base_url=BASE, max_retries=3, retry_delay=0.01) as client:
            tx = await client.transactions.retrieve("tx_001")
    assert tx.id == "tx_001"
    assert call_count == 3


async def test_no_retry_on_404():
    call_count = 0

    def count(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(404, json={"code": "NOT_FOUND", "message": "x"})

    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/transactions/missing").mock(side_effect=count)
        async with Banzami(api_key="bz_test", base_url=BASE) as client:
            with pytest.raises(BanzamiNotFoundError):
                await client.transactions.retrieve("missing")
    assert call_count == 1


async def test_retry_reuses_idempotency_key():
    seen_keys: list[str] = []

    def capture(request: httpx.Request) -> httpx.Response:
        seen_keys.append(request.headers.get("idempotency-key", ""))
        if len(seen_keys) < 3:
            return httpx.Response(503, json={"code": "UNAVAILABLE", "message": "retry"})
        return httpx.Response(200, json=TX_PAYLOAD)

    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/transactions").mock(side_effect=capture)
        async with Banzami(api_key="bz_test", base_url=BASE, max_retries=3, retry_delay=0.01) as client:
            await client.transactions.create(amount=1000)
    assert len(set(seen_keys)) == 1, "All retries must share the same idempotency key"


# ---------------------------------------------------------------------------
# Observability hooks
# ---------------------------------------------------------------------------

async def test_on_request_hook_fires():
    calls: list[tuple] = []

    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/transactions/tx_001").mock(return_value=httpx.Response(200, json=TX_PAYLOAD))
        hooks = BanzaHooks(on_request=lambda m, p, a: calls.append((m, p, a)))
        async with Banzami(api_key="bz_test", base_url=BASE, hooks=hooks) as c:
            await c.transactions.retrieve("tx_001")

    assert len(calls) == 1
    assert calls[0][0] == "GET"
    assert "/transactions/tx_001" in calls[0][1]


async def test_on_error_hook_fires_on_4xx():
    errors: list[tuple] = []

    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/transactions/bad").mock(
            return_value=httpx.Response(404, json={"code": "NOT_FOUND", "message": "x"})
        )
        hooks = BanzaHooks(on_error=lambda m, p, e, a: errors.append((m, p, e, a)))
        async with Banzami(api_key="bz_test", base_url=BASE, hooks=hooks) as c:
            with pytest.raises(BanzamiNotFoundError):
                await c.transactions.retrieve("bad")

    assert len(errors) == 1
    assert isinstance(errors[0][2], BanzamiNotFoundError)
