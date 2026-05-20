"""Webhook construction and signature verification integration tests."""

from __future__ import annotations

import json
import time

import httpx
import pytest
import respx

from banza import Banzami
from banza.exceptions import BanzaWebhookSignatureError
from banza.signature import generate_test_signature

BASE           = "https://api.banzami.test"
WEBHOOK_SECRET = "whsec_integration_test_secret!!"

EVENT_PAYLOAD = {
    "id":         "evt_001",
    "type":       "payment_link.paid",
    "data":       {"payment_link_id": "lnk_001", "amount_minor": 50000},
    "created_at": "2026-05-15T10:00:00Z",
}


async def test_construct_event_success():
    with respx.mock(base_url=BASE):
        async with Banzami(api_key="bz_test", base_url=BASE, webhook_secret=WEBHOOK_SECRET) as c:
            raw   = json.dumps(EVENT_PAYLOAD).encode()
            sig   = generate_test_signature(raw, WEBHOOK_SECRET)
            event = c.webhooks.construct_event(raw, sig)

    assert event.id == "evt_001"
    assert event.type == "payment_link.paid"


async def test_construct_event_invalid_signature():
    with respx.mock(base_url=BASE):
        async with Banzami(api_key="bz_test", base_url=BASE, webhook_secret=WEBHOOK_SECRET) as c:
            raw  = json.dumps(EVENT_PAYLOAD).encode()
            ts   = int(time.time())
            with pytest.raises(BanzaWebhookSignatureError):
                c.webhooks.construct_event(raw, f"t={ts},v1=deadbeef" + "0" * 56)


async def test_construct_event_tampered_body():
    with respx.mock(base_url=BASE):
        async with Banzami(api_key="bz_test", base_url=BASE, webhook_secret=WEBHOOK_SECRET) as c:
            raw = json.dumps(EVENT_PAYLOAD).encode()
            sig = generate_test_signature(raw, WEBHOOK_SECRET)
            with pytest.raises(BanzaWebhookSignatureError):
                c.webhooks.construct_event(raw + b"tampered", sig)


async def test_construct_event_expired_timestamp():
    """Requests older than 300 seconds must be rejected."""
    with respx.mock(base_url=BASE):
        async with Banzami(api_key="bz_test", base_url=BASE, webhook_secret=WEBHOOK_SECRET) as c:
            raw       = json.dumps(EVENT_PAYLOAD).encode()
            old_ts    = int(time.time()) - 400
            old_sig   = generate_test_signature(raw, WEBHOOK_SECRET, timestamp=old_ts)
            with pytest.raises(BanzaWebhookSignatureError):
                c.webhooks.construct_event(raw, old_sig)


async def test_construct_event_no_secret_raises():
    with respx.mock(base_url=BASE):
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            raw = json.dumps(EVENT_PAYLOAD).encode()
            sig = generate_test_signature(raw, WEBHOOK_SECRET)
            with pytest.raises(ValueError, match="webhook_secret"):
                c.webhooks.construct_event(raw, sig)


async def test_construct_event_override_secret():
    other_secret = "whsec_other_endpoint_secret!!!!"
    with respx.mock(base_url=BASE):
        async with Banzami(api_key="bz_test", base_url=BASE, webhook_secret=WEBHOOK_SECRET) as c:
            raw   = json.dumps(EVENT_PAYLOAD).encode()
            sig   = generate_test_signature(raw, other_secret)
            event = c.webhooks.construct_event(raw, sig, webhook_secret=other_secret)
    assert event.id == "evt_001"


async def test_generate_test_signature_helper():
    """The webhooks resource exposes a test helper on the client."""
    with respx.mock(base_url=BASE):
        async with Banzami(api_key="bz_test", base_url=BASE, webhook_secret=WEBHOOK_SECRET) as c:
            raw = json.dumps(EVENT_PAYLOAD).encode()
            sig = c.webhooks.generate_test_signature(raw)
            event = c.webhooks.construct_event(raw, sig)
    assert event.id == "evt_001"


async def test_list_endpoints():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/webhooks/endpoints").mock(
            return_value=httpx.Response(200, json=[
                {
                    "id":         "ep_001",
                    "url":        "https://myapp.ao/webhooks/banzami",
                    "events":     ["payment_link.paid"],
                    "status":     "ACTIVE",
                    "created_at": "2026-01-01T00:00:00Z",
                }
            ])
        )
        async with Banzami(api_key="bz_test", base_url=BASE, webhook_secret=WEBHOOK_SECRET) as c:
            endpoints = await c.webhooks.list_endpoints()
    assert len(endpoints) == 1
    assert endpoints[0].url == "https://myapp.ao/webhooks/banzami"
