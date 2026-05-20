"""QR Payments resource — static and dynamic QR payment flows."""

from __future__ import annotations

from datetime import datetime

from banza.models.qr_payment import ParsedQr, QrPayment
from banza.utils.ids import new_idempotency_key

from .base import AsyncResource


class QrPaymentsResource(AsyncResource):
    async def create_static(
        self,
        *,
        owner_id: str,
        currency: str = "AOA",
        idempotency_key: str | None = None,
    ) -> QrPayment:
        """Create a reusable static QR code tied to an owner.

        Static QR codes have no fixed amount; the payer enters the amount.
        """
        data = await self._post(
            "/qr/static",
            {"owner_id": owner_id, "currency": currency},
            idempotency_key=idempotency_key or new_idempotency_key(),
        )
        return QrPayment.model_validate(data)

    async def create_dynamic(
        self,
        *,
        owner_id: str,
        amount: int,
        expires_at: datetime,
        currency: str = "AOA",
        reference: str | None = None,
        idempotency_key: str | None = None,
    ) -> QrPayment:
        """Create a single-use dynamic QR code for an exact amount.

        Parameters
        ----------
        amount:
            Amount in minor units (Kz for AOA).
        expires_at:
            UTC datetime after which the QR code becomes invalid.
        reference:
            Optional merchant-defined reference (order ID, SKU, etc.).
        """
        data = await self._post(
            "/qr/dynamic",
            {
                "owner_id":     owner_id,
                "amount_minor": amount,
                "currency":     currency,
                "expires_at":   expires_at.isoformat(),
                "reference":    reference,
            },
            idempotency_key=idempotency_key or new_idempotency_key(),
        )
        return QrPayment.model_validate(data)

    async def retrieve(self, qr_id: str) -> QrPayment:
        """Retrieve a QR code by ID."""
        data = await self._get(f"/qr/{qr_id}")
        return QrPayment.model_validate(data)

    async def decode(self, payload: str) -> ParsedQr:
        """Decode a raw QR payload string into structured metadata."""
        data = await self._post("/qr/decode", {"payload": payload})
        return ParsedQr.model_validate(data)

    async def mark_used(self, qr_id: str) -> None:
        """Mark a QR code as used after a successful payment."""
        await self._post(f"/qr/{qr_id}/use")

    async def check_status(self, qr_id: str) -> str:
        """Return the current status string of a QR code (ACTIVE / USED / EXPIRED)."""
        qr = await self.retrieve(qr_id)
        return qr.qr_code.status
