"""Cursor-based pagination helpers."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import Any, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class Page[T: BaseModel](BaseModel):
    """A single page of results from a list endpoint."""

    data: list[T]
    next_cursor: str | None = None

    @property
    def has_more(self) -> bool:
        return self.next_cursor is not None


async def auto_paginate(
    fetch: Callable[..., Any],
    *,
    limit: int = 50,
    **kwargs: Any,
) -> AsyncIterator[Any]:
    """Yield individual items from every page of a paginated endpoint.

    Parameters
    ----------
    fetch:
        The resource method that accepts ``limit`` and ``cursor`` kwargs and
        returns a ``Page[T]``.
    limit:
        Items per page (default 50).
    **kwargs:
        Additional keyword arguments forwarded to ``fetch`` on every call.
    """
    cursor: str | None = None
    while True:
        page: Page[Any] = await fetch(limit=limit, cursor=cursor, **kwargs)
        for item in page.data:
            yield item
        if not page.has_more:
            break
        cursor = page.next_cursor
