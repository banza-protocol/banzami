"""httpx authentication handler for API-key Bearer tokens."""

from __future__ import annotations

from collections.abc import Generator

import httpx


class APIKeyAuth(httpx.Auth):
    """Attaches a Bearer token derived from the Banzami API key to every request."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def auth_flow(
        self, request: httpx.Request
    ) -> Generator[httpx.Request, httpx.Response, None]:
        request.headers["Authorization"] = f"Bearer {self._api_key}"
        yield request
