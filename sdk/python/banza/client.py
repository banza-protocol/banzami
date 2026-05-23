"""Banzami async HTTP client."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx

from .auth import APIKeyAuth
from .config import BanzamiConfig
from .exceptions import (
    BanzamiTimeoutError,
    BanzaNetworkError,
    api_error_from_response,
)
from .resources import (
    DisputesResource,
    MerchantsResource,
    PaymentLinksResource,
    PaymentRequestsResource,
    PayoutsResource,
    QrPaymentsResource,
    RefundsResource,
    TransactionsResource,
    TransfersResource,
    WalletsResource,
    WebhooksResource,
)
from .retries import build_retry_policy
from .utils.ids import new_idempotency_key

logger = logging.getLogger("banzami")


# ---------------------------------------------------------------------------
# Observability hooks
# ---------------------------------------------------------------------------

@dataclass
class BanzaHooks:
    """Optional callbacks for logging, tracing, and monitoring.

    All callbacks are synchronous. For async hooks, schedule them with
    ``asyncio.create_task`` inside the callback.
    """

    on_request:  Callable[[str, str, int], None] | None = None
    """Called before every HTTP attempt. Args: method, path, attempt_number."""

    on_response: Callable[[str, str, int, int], None] | None = None
    """Called after a successful response. Args: method, path, status_code, duration_ms."""

    on_error:    Callable[[str, str, Exception, int], None] | None = None
    """Called when an error is not retried or retries are exhausted.
    Args: method, path, exception, total_attempts."""


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

class BanzaClient:
    """Async HTTP client for the Banzami API.

    All network operations are async. Use this client with ``async with``
    for connection-pool lifecycle management, or call ``close()`` explicitly.

    Example
    -------
    ```python
    async with BanzaClient(api_key="bz_live_...") as client:
        tx = await client.transactions.create(amount=50000, currency="AOA")
        print(tx.id)
    ```
    """

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        retry_delay: float | None = None,
        webhook_secret: str | None = None,
        hooks: BanzaHooks | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        overrides: dict[str, Any] = {}
        if base_url is not None:
            overrides["base_url"] = base_url.rstrip("/")
        if timeout is not None:
            overrides["timeout"] = timeout
        if max_retries is not None:
            overrides["max_retries"] = max_retries
        if retry_delay is not None:
            overrides["retry_delay"] = retry_delay

        self._config = BanzamiConfig(**overrides)
        self._hooks  = hooks or BanzaHooks()

        self._retry_policy = build_retry_policy(
            self._config.max_retries,
            self._config.retry_delay,
            self._config.max_retry_delay,
        )

        self._http = http_client or httpx.AsyncClient(
            base_url=self._config.base_url,
            auth=APIKeyAuth(api_key),
            timeout=self._config.timeout,
            headers={
                "Accept":       "application/json",
                "Content-Type": "application/json",
                "User-Agent":   "banzami-python/0.1.0",
            },
        )

        # Resources
        self.transactions    = TransactionsResource(self)
        self.qr_payments     = QrPaymentsResource(self)
        self.transfers       = TransfersResource(self)
        self.payouts         = PayoutsResource(self)
        self.wallets         = WalletsResource(self)
        self.merchants       = MerchantsResource(self)
        self.webhooks        = WebhooksResource(self, webhook_secret)
        self.payment_links   = PaymentLinksResource(self)
        self.refunds         = RefundsResource(self)
        self.disputes        = DisputesResource(self)
        self.payment_requests = PaymentRequestsResource(self)

    # ------------------------------------------------------------------
    # Context manager support
    # ------------------------------------------------------------------

    async def __aenter__(self) -> BanzaClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    async def close(self) -> None:
        """Release the underlying HTTP connection pool."""
        await self._http.aclose()

    # ------------------------------------------------------------------
    # Core request method
    # ------------------------------------------------------------------

    async def _request(
        self,
        method: str,
        path: str,
        *,
        body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        """Execute a request with retry, idempotency, and observability."""
        # Idempotency key is generated once before any retry attempt.
        if method == "POST" and idempotency_key is None:
            idempotency_key = new_idempotency_key()

        attempt = 0

        async for retry_attempt in self._retry_policy:
            with retry_attempt:
                attempt += 1
                result = await self._execute(
                    method,
                    path,
                    body=body,
                    params=params,
                    idempotency_key=idempotency_key,
                    attempt=attempt,
                )
                return result

    async def _execute(
        self,
        method: str,
        path: str,
        *,
        body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
        attempt: int = 1,
    ) -> Any:
        self._hooks.on_request and self._hooks.on_request(method, path, attempt)  # noqa: E501

        headers: dict[str, str] = {}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        # Strip None values from params and body.
        clean_params = {k: str(v) for k, v in (params or {}).items() if v is not None}
        clean_body   = {k: v for k, v in (body or {}).items() if v is not None} or None

        import time
        t0 = time.monotonic()

        try:
            response = await self._http.request(
                method,
                f"/v1{path}",
                json=clean_body,
                params=clean_params or None,
                headers=headers,
            )
        except httpx.TimeoutException as exc:
            err: BanzaNetworkError = BanzamiTimeoutError(str(exc))
            self._hooks.on_error and self._hooks.on_error(method, path, err, attempt)
            raise err from exc
        except httpx.NetworkError as exc:
            err = BanzaNetworkError(str(exc))
            self._hooks.on_error and self._hooks.on_error(method, path, err, attempt)
            raise err from exc

        duration_ms = int((time.monotonic() - t0) * 1000)

        if not response.is_success:
            api_err = self._parse_error(response)
            if not _is_retryable_status(response.status_code):
                self._hooks.on_error and self._hooks.on_error(method, path, api_err, attempt)
            raise api_err

        self._hooks.on_response and self._hooks.on_response(
            method, path, response.status_code, duration_ms
        )
        logger.debug("%s /v1%s → %d (%dms)", method, path, response.status_code, duration_ms)

        if response.status_code == 204:
            return None

        return response.json()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_error(response: httpx.Response) -> Exception:
        request_id = response.headers.get("X-Request-Id")
        try:
            data    = response.json()
            code    = data.get("code") or data.get("error", {}).get("code", "UNKNOWN")
            message = (
                data.get("message")
                or data.get("error", {}).get("message")
                or response.reason_phrase
            )
        except Exception:
            code    = "UNKNOWN"
            message = response.reason_phrase or f"HTTP {response.status_code}"

        return api_error_from_response(response.status_code, code, message, request_id)


def _is_retryable_status(status: int) -> bool:
    return status == 429 or status >= 500


# ---------------------------------------------------------------------------
# Convenience alias
# ---------------------------------------------------------------------------

Banzami = BanzaClient
