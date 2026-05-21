"""Pagination helpers tests."""

from __future__ import annotations

from banza.models.transaction import Transaction
from banza.pagination import Page, auto_paginate


def _make_tx(id: str) -> dict:
    return {
        "id":          id,
        "merchant_id": "m_1",
        "amount_minor": 1000,
        "currency":    "AOA",
        "status":      "COMPLETED",
        "created_at":  "2026-01-01T00:00:00Z",
        "updated_at":  "2026-01-01T00:00:00Z",
    }


def test_page_has_more_true():
    page: Page[Transaction] = Page[Transaction].model_validate(
        {"data": [_make_tx("tx_1")], "next_cursor": "cursor_abc"}
    )
    assert page.has_more is True
    assert page.next_cursor == "cursor_abc"


def test_page_has_more_false():
    page: Page[Transaction] = Page[Transaction].model_validate(
        {"data": [_make_tx("tx_1")]}
    )
    assert page.has_more is False


async def test_auto_paginate_two_pages():
    calls: list[dict] = []

    async def fetch_page(*, limit: int, cursor: str | None = None) -> Page[Transaction]:
        calls.append({"limit": limit, "cursor": cursor})
        if cursor is None:
            return Page[Transaction].model_validate(
                {"data": [_make_tx("tx_1"), _make_tx("tx_2")], "next_cursor": "page2"}
            )
        return Page[Transaction].model_validate(
            {"data": [_make_tx("tx_3")]}
        )

    items = [tx async for tx in auto_paginate(fetch_page, limit=2)]

    assert len(items) == 3
    assert items[0].id == "tx_1"
    assert items[2].id == "tx_3"
    assert len(calls) == 2
    assert calls[1]["cursor"] == "page2"


async def test_auto_paginate_single_page():
    async def fetch_single(*, limit: int, cursor: str | None = None) -> Page[Transaction]:
        return Page[Transaction].model_validate({"data": [_make_tx("tx_1")]})

    items = [tx async for tx in auto_paginate(fetch_single, limit=10)]
    assert len(items) == 1
