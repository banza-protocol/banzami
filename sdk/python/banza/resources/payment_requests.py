"""Payment requests resource — consumer-to-consumer money requests."""

from __future__ import annotations

from datetime import datetime

from banza.models.payment_request import PaymentRequest, PaymentRequestStatus
from banza.pagination import Page
from banza.utils.ids import new_idempotency_key

from .base import AsyncResource


class PaymentRequestsResource(AsyncResource):
    async def create(
        self,
        *,
        requester_id:    str,
        amount:          int,
        currency:        str = "AOA",
        payer_handle:    str | None = None,
        description:     str | None = None,
        expires_at:      datetime | None = None,
        idempotency_key: str | None = None,
    ) -> PaymentRequest:
        """Create a payment request (pedido de pagamento).

        Parameters
        ----------
        requester_id:
            Consumer ID of the person requesting payment.
        amount:
            Amount to request in minor units (Kz).
        payer_handle:
            @banza handle of the intended payer. Omit for open requests.
        description:
            Optional note shown to the payer.
        expires_at:
            UTC expiry. Defaults to 7 days if omitted.
        idempotency_key:
            Supply your own key to safely retry on network failures.
        """
        data = await self._post(
            "/payment-requests",
            {
                "requester_id": requester_id,
                "payer_handle": payer_handle,
                "amount_minor": amount,
                "currency":     currency,
                "description":  description,
                "expires_at":   expires_at.isoformat() if expires_at else None,
            },
            idempotency_key=idempotency_key or new_idempotency_key(),
        )
        return PaymentRequest.model_validate(data)

    async def retrieve(self, request_id: str) -> PaymentRequest:
        """Retrieve a payment request by ID."""
        data = await self._get(f"/payment-requests/{request_id}")
        return PaymentRequest.model_validate(data)

    async def list(
        self,
        *,
        requester_id: str | None = None,
        payer_id:     str | None = None,
        status:       PaymentRequestStatus | None = None,
        limit:        int = 20,
        cursor:       str | None = None,
    ) -> Page[PaymentRequest]:
        """List payment requests for a requester or payer."""
        params: dict[str, object] = {"limit": limit}
        if requester_id:
            params["requester_id"] = requester_id
        if payer_id:
            params["payer_id"] = payer_id
        if status:
            params["status"] = str(status)
        if cursor:
            params["cursor"] = cursor
        data = await self._get("/payment-requests", params=params)
        return Page[PaymentRequest].model_validate(data)

    async def pay(
        self,
        request_id:      str,
        *,
        idempotency_key: str | None = None,
    ) -> PaymentRequest:
        """Fulfil a payment request — executes the wallet transfer."""
        data = await self._post(
            f"/payment-requests/{request_id}/pay",
            idempotency_key=idempotency_key or new_idempotency_key(),
        )
        return PaymentRequest.model_validate(data)

    async def decline(self, request_id: str) -> PaymentRequest:
        """Decline a pending payment request."""
        data = await self._post(f"/payment-requests/{request_id}/decline")
        return PaymentRequest.model_validate(data)

    async def cancel(self, request_id: str) -> PaymentRequest:
        """Cancel your own outbound payment request."""
        data = await self._post(f"/payment-requests/{request_id}/cancel")
        return PaymentRequest.model_validate(data)
