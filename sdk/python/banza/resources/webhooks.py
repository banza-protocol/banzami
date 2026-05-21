"""Webhooks resource — endpoint management, event listing, and signature verification."""

from __future__ import annotations

import json

from banza.exceptions import BanzaWebhookSignatureError
from banza.models.webhook import WebhookEndpoint, WebhookEvent
from banza.pagination import Page
from banza.signature import generate_test_signature, verify_signature

from .base import AsyncResource


class WebhooksResource(AsyncResource):
    def __init__(self, client: object, webhook_secret: str | None = None) -> None:
        super().__init__(client)  # type: ignore[arg-type]
        self._webhook_secret = webhook_secret

    # ------------------------------------------------------------------
    # Endpoint management
    # ------------------------------------------------------------------

    async def list_endpoints(self) -> list[WebhookEndpoint]:
        """List all registered webhook endpoints."""
        data = await self._get("/webhooks/endpoints")
        return [WebhookEndpoint.model_validate(item) for item in data]

    async def register_endpoint(
        self,
        *,
        url: str,
        events: list[str],
    ) -> WebhookEndpoint:
        """Register a new webhook endpoint.

        Parameters
        ----------
        url:
            HTTPS URL that Banzami will POST events to.
        events:
            List of event type strings to subscribe to, e.g.
            ``["transaction.completed", "payout.created"]``.
            Use ``["*"]`` to receive all events.
        """
        data = await self._post("/webhooks/endpoints", {"url": url, "events": events})
        return WebhookEndpoint.model_validate(data)

    async def delete_endpoint(self, endpoint_id: str) -> None:
        """Delete a webhook endpoint."""
        await self._delete(f"/webhooks/endpoints/{endpoint_id}")

    # ------------------------------------------------------------------
    # Event listing
    # ------------------------------------------------------------------

    async def list_events(
        self,
        *,
        limit: int = 20,
        cursor: str | None = None,
    ) -> Page[WebhookEvent]:
        """List recent webhook delivery events."""
        params: dict[str, object] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        data = await self._get("/webhooks/events", params=params)
        return Page[WebhookEvent].model_validate(data)

    # ------------------------------------------------------------------
    # Signature verification
    # ------------------------------------------------------------------

    def construct_event(
        self,
        payload: bytes | str,
        signature: str,
        *,
        webhook_secret: str | None = None,
    ) -> WebhookEvent:
        """Parse and verify an incoming webhook payload.

        Pass the **raw** request body — do not decode or parse it first.

        Parameters
        ----------
        payload:
            Raw HTTP request body bytes (or string).
        signature:
            Value of the ``Banzami-Signature`` header.
        webhook_secret:
            Override the secret configured on the client. Useful when
            handling events from multiple endpoints with different secrets.

        Raises
        ------
        BanzaWebhookSignatureError
            If the signature does not match or the timestamp is outside the
            300-second replay protection window.
        ValueError
            If no webhook secret is available.
        """
        secret = webhook_secret or self._webhook_secret
        if not secret:
            raise ValueError(
                "A webhook_secret is required to verify webhook signatures. "
                "Pass it to Banzami(webhook_secret=...) or to construct_event()."
            )

        if not verify_signature(payload, signature, secret):
            raise BanzaWebhookSignatureError(
                "Webhook signature verification failed. "
                "Ensure you are passing the raw request body before any parsing, "
                "and that the request timestamp is within 300 seconds of now."
            )

        body = payload if isinstance(payload, str) else payload.decode()
        return WebhookEvent.model_validate(json.loads(body))

    def generate_test_signature(
        self,
        payload: bytes | str,
        *,
        webhook_secret: str | None = None,
        timestamp: int | None = None,
    ) -> str:
        """Generate a valid Banzami-Signature header value for local testing.

        Use in test suites to simulate Banzami webhook deliveries without a
        real Banzami account.

        Parameters
        ----------
        payload:
            The webhook body bytes (or string) you want to sign.
        webhook_secret:
            Override the secret configured on the client.
        timestamp:
            Unix seconds for the ``t=`` field. Defaults to ``time.time()``.

        Returns
        -------
        str
            A ``Banzami-Signature`` header value, e.g.
            ``"t=1716000000,v1=abc123..."``
        """
        secret = webhook_secret or self._webhook_secret or ""
        return generate_test_signature(payload, secret, timestamp=timestamp)
