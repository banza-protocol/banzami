"""Base class shared by all resource objects."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from banza.client import BanzaClient


class AsyncResource:
    """Thin wrapper that delegates HTTP calls back to the root client."""

    def __init__(self, client: BanzaClient) -> None:
        self._client = client

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return await self._client._request("GET", path, params=params)

    async def _post(
        self,
        path: str,
        body: dict[str, Any] | None = None,
        *,
        idempotency_key: str | None = None,
    ) -> Any:
        return await self._client._request(
            "POST", path, body=body, idempotency_key=idempotency_key
        )

    async def _delete(self, path: str) -> Any:
        return await self._client._request("DELETE", path)
