"""Webhook construction and signature verification integration tests."""

from __future__ import annotations

import hashlib
import hmac
import json

import httpx
import pytest
import respx

from banzami import Banzami
from banzami.exceptions import BanzamiWebhookSignatureError

BASE           = "https://api.banzami.test"
WEBHOOK_SECRET = "whsec_integration_test_secret!!"

EVENT_PAYLOAD = {
    "id":         "evt_001",
    "type":       "transaction.completed",
    "payload":    {"transaction_id": "tx_001", "amount_minor": 50000},
    "created_at": "2026-05-15T10:00:00Z",
}


def _sign(body: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


async def test_construct_event_success():
    with respx.mock(base_url=BASE):
        async with Banzami(api_key="bz_test", base_url=BASE, webhook_secret=WEBHOOK_SECRET) as c:
            raw   = json.dumps(EVENT_PAYLOAD).encode()
            event = c.webhooks.construct_event(raw, _sign(raw, WEBHOOK_SECRET))

    assert event.id == "evt_001"
    assert event.type == "transaction.completed"
    assert event.payload["amount_minor"] == 50000


async def test_construct_event_invalid_signature():
    with respx.mock(base_url=BASE):
        async with Banzami(api_key="bz_test", base_url=BASE, webhook_secret=WEBHOOK_SECRET) as c:
            raw = json.dumps(EVENT_PAYLOAD).encode()
            with pytest.raises(BanzamiWebhookSignatureError):
                c.webhooks.construct_event(raw, "sha256=invalid")


async def test_construct_event_tampered_body():
    with respx.mock(base_url=BASE):
        async with Banzami(api_key="bz_test", base_url=BASE, webhook_secret=WEBHOOK_SECRET) as c:
            raw = json.dumps(EVENT_PAYLOAD).encode()
            sig = _sign(raw, WEBHOOK_SECRET)
            with pytest.raises(BanzamiWebhookSignatureError):
                c.webhooks.construct_event(raw + b"tampered", sig)


async def test_construct_event_no_secret_raises():
    with respx.mock(base_url=BASE):
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            raw = json.dumps(EVENT_PAYLOAD).encode()
            with pytest.raises(ValueError, match="webhook_secret"):
                c.webhooks.construct_event(raw, "sha256=abc")


async def test_construct_event_override_secret():
    other_secret = "whsec_other_endpoint_secret!!!!"
    with respx.mock(base_url=BASE):
        async with Banzami(api_key="bz_test", base_url=BASE, webhook_secret=WEBHOOK_SECRET) as c:
            raw   = json.dumps(EVENT_PAYLOAD).encode()
            event = c.webhooks.construct_event(raw, _sign(raw, other_secret), webhook_secret=other_secret)
    assert event.id == "evt_001"


async def test_list_endpoints():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/webhooks/endpoints").mock(
            return_value=httpx.Response(200, json=[
                {
                    "id":         "ep_001",
                    "url":        "https://myapp.ao/webhooks/banzami",
                    "events":     ["transaction.completed"],
                    "status":     "ACTIVE",
                    "created_at": "2026-01-01T00:00:00Z",
                }
            ])
        )
        async with Banzami(api_key="bz_test", base_url=BASE, webhook_secret=WEBHOOK_SECRET) as c:
            endpoints = await c.webhooks.list_endpoints()
    assert len(endpoints) == 1
    assert endpoints[0].url == "https://myapp.ao/webhooks/banzami"
