"""Integration-style tests for DisputesResource."""

from __future__ import annotations

import httpx
import respx

from banza import Banzami
from banza.models.dispute import DisputeStatus

BASE = "https://api.banzami.test"

DISPUTE = {
    "id":                "dsp_001",
    "transaction_id":    "tx_001",
    "merchant_id":       "m_001",
    "consumer_id":       "con_001",
    "amount_minor":      50000,
    "currency":          "AOA",
    "reason":            "Produto não recebido",
    "status":            "OPEN",
    "evidence_deadline": "2026-05-27T23:59:59Z",
    "resolution_notes":  None,
    "resolved_at":       None,
    "created_at":        "2026-05-20T14:00:00Z",
    "updated_at":        "2026-05-20T14:00:00Z",
}

PAGE = {"data": [DISPUTE]}


async def test_open_dispute():
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/disputes").mock(return_value=httpx.Response(200, json=DISPUTE))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            dispute = await c.disputes.open(
                transaction_id="tx_001",
                consumer_id="con_001",
                amount=50000,
                reason="Produto não recebido",
            )

    assert dispute.id == "dsp_001"
    assert dispute.status == DisputeStatus.OPEN
    assert dispute.amount_minor == 50000


async def test_retrieve_dispute():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/disputes/dsp_001").mock(return_value=httpx.Response(200, json=DISPUTE))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            dispute = await c.disputes.retrieve("dsp_001")

    assert dispute.transaction_id == "tx_001"
    assert dispute.reason == "Produto não recebido"


async def test_list_disputes():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/disputes").mock(return_value=httpx.Response(200, json=PAGE))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            page = await c.disputes.list()

    assert len(page.data) == 1


async def test_list_disputes_filter_by_status():
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/disputes").mock(return_value=httpx.Response(200, json=PAGE))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            page = await c.disputes.list(status=DisputeStatus.OPEN)

    assert page.data[0].status == DisputeStatus.OPEN


async def test_add_evidence():
    under_review = {**DISPUTE, "status": "UNDER_REVIEW"}
    with respx.mock(base_url=BASE) as mock:
        mock.post("/v1/disputes/dsp_001/evidence").mock(
            return_value=httpx.Response(200, json=under_review)
        )
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            dispute = await c.disputes.add_evidence(
                "dsp_001",
                evidence="https://storage.banzami.com/receipts/rec_001.pdf",
            )

    assert dispute.status == DisputeStatus.UNDER_REVIEW


async def test_dispute_resolved():
    resolved = {
        **DISPUTE,
        "status":           "WON_BY_MERCHANT",
        "resolution_notes": "Entrega confirmada pelo courier",
        "resolved_at":      "2026-05-25T10:00:00Z",
    }
    with respx.mock(base_url=BASE) as mock:
        mock.get("/v1/disputes/dsp_001").mock(return_value=httpx.Response(200, json=resolved))
        async with Banzami(api_key="bz_test", base_url=BASE) as c:
            dispute = await c.disputes.retrieve("dsp_001")

    assert dispute.status == DisputeStatus.WON_BY_MERCHANT
    assert dispute.resolution_notes == "Entrega confirmada pelo courier"
    assert dispute.resolved_at is not None
