"""Webhooks resource — endpoint management, event listing, and signature verification."""

from __future__ import annotations

import json

from banzami.exceptions import BanzamiWebhookSignatureError
from banzami.models.webhook import WebhookEndpoint, WebhookEvent
from banzami.pagination import Page
from banzami.signature import verify_signature

from .base import AsyncResource


class WebhooksResource(AsyncResource):
    def __init__(self, client: "object", webhook_secret: str | None = None) -> None:  # type: ignore[override]
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
            Value of the ``X-Banzami-Signature`` header.
        webhook_secret:
            Override the secret configured on the client. Useful when
            handling events from multiple endpoints with different secrets.

        Raises
        ------
        BanzamiWebhookSignatureError
            If the signature does not match.
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
            raise BanzamiWebhookSignatureError(
                "Webhook signature verification failed. "
                "Ensure you are passing the raw request body before any parsing."
            )

        body = payload if isinstance(payload, str) else payload.decode()
        return WebhookEvent.model_validate(json.loads(body))
