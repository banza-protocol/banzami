"""Integration-style tests for QrPaymentsResource."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import respx

from banza import Banzami
from banza.models.qr_payment import QrCodeStatus, QrCodeType

BASE = "https://api.banzami.test"

STATIC_QR = {
    "qr_code": {
        "id":           "qr_static_001",
        "owner_id":     "wal_merchant",
        "type":         "STATIC",
        "status":       "ACTIVE",
        "amount_minor": None,
        "currency":     "AOA",
        "reference":    None,
        "expires_at":   None,
        "created_at":   "2026-05-15T08:00:00Z",
    },
    "payload": "banza://qr/static/qr_static_001",
}

DYNAMIC_QR = {
    "qr_code": {
        "id":           "qr_dyn_001",
        "owner_id":     "wal_merchant",
        "type":         "DYNAMIC",
        "status":       "ACTIVE",
        "amount_minor": 75000,
        "currency":     "AOA",
        "reference":    "order_42",
        "expires_at":   "2026-05-15T08:15:00Z",
        "created_at":   "2026-05-15T08:00:00Z",
    },
    "payload": "banza://qr/dynamic/qr_dyn_001?amt=75000",
}

PARSED_QR = {
    "qr_code_id": "qr_dyn_001",
    "owner_id":   "wal_merchant",
    "type":       "DYNAMIC",
    "currency":   "AOA",
    "is_dynamic": True,
}


async def test_create_static_qr():
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/qr/static").mock(return_value=httpx.Response(200, json=STATIC_QR))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            qr = await c.qr_payments.create_static(owner_id="wal_merchant")

    assert qr.qr_code.type == QrCodeType.STATIC
    assert qr.qr_code.status == QrCodeStatus.ACTIVE
    assert qr.qr_code.amount_minor is None
    assert qr.payload == "banza://qr/static/qr_static_001"


async def test_create_dynamic_qr():
    expires = datetime.now(tz=UTC) + timedelta(minutes=15)
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/qr/dynamic").mock(return_value=httpx.Response(200, json=DYNAMIC_QR))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            qr = await c.qr_payments.create_dynamic(
                owner_id="wal_merchant",
                amount=75000,
                expires_at=expires,
                reference="order_42",
            )

    assert qr.qr_code.type == QrCodeType.DYNAMIC
    assert qr.qr_code.amount_minor == 75000
    assert qr.qr_code.reference == "order_42"


async def test_retrieve_qr():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/qr/qr_dyn_001").mock(return_value=httpx.Response(200, json=DYNAMIC_QR))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            qr = await c.qr_payments.retrieve("qr_dyn_001")

    assert qr.qr_code.id == "qr_dyn_001"


async def test_decode_qr():
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/qr/decode").mock(return_value=httpx.Response(200, json=PARSED_QR))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            parsed = await c.qr_payments.decode("banza://qr/dynamic/qr_dyn_001?amt=75000")

    assert parsed.qr_code_id == "qr_dyn_001"
    assert parsed.is_dynamic is True


async def test_mark_used():
    used_qr = {**DYNAMIC_QR, "qr_code": {**DYNAMIC_QR["qr_code"], "status": "USED"}}
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/qr/qr_dyn_001/use").mock(return_value=httpx.Response(200, json=used_qr))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            await c.qr_payments.mark_used("qr_dyn_001")


async def test_check_status():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/qr/qr_dyn_001").mock(return_value=httpx.Response(200, json=DYNAMIC_QR))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            status = await c.qr_payments.check_status("qr_dyn_001")

    assert status == "ACTIVE"
