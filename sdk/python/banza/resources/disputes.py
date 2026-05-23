"""Disputes resource — consumer dispute filing and merchant evidence submission."""

from __future__ import annotations

from datetime import datetime

from banza.models.dispute import Dispute, DisputeStatus
from banza.pagination import Page
from banza.utils.ids import new_idempotency_key

from .base import AsyncResource


class DisputesResource(AsyncResource):
    async def open(
        self,
        *,
        transaction_id:   str,
        consumer_id:      str,
        amount:           int,
        currency:         str = "AOA",
        reason:           str,
        evidence_deadline: datetime | None = None,
        idempotency_key:  str | None = None,
    ) -> Dispute:
        """Open a new dispute on behalf of a consumer.

        Parameters
        ----------
        transaction_id:
            ID of the transaction being disputed.
        consumer_id:
            ID of the disputing consumer.
        amount:
            Disputed amount in minor units (Kz).
        reason:
            Human-readable reason for the dispute.
        evidence_deadline:
            UTC deadline by which the merchant must submit evidence.
        idempotency_key:
            Supply your own key to safely retry on network failures.
        """
        data = await self._post(
            "/disputes",
            {
                "transaction_id":    transaction_id,
                "consumer_id":       consumer_id,
                "amount_minor":      amount,
                "currency":          currency,
                "reason":            reason,
                "evidence_deadline": evidence_deadline.isoformat() if evidence_deadline else None,
            },
            idempotency_key=idempotency_key or new_idempotency_key(),
        )
        return Dispute.model_validate(data)

    async def retrieve(self, dispute_id: str) -> Dispute:
        """Retrieve a dispute by ID."""
        data = await self._get(f"/disputes/{dispute_id}")
        return Dispute.model_validate(data)

    async def list(
        self,
        *,
        status: DisputeStatus | None = None,
        limit:  int = 20,
        cursor: str | None = None,
    ) -> Page[Dispute]:
        """List disputes with optional status filter."""
        params: dict[str, object] = {"limit": limit}
        if status:
            params["status"] = str(status)
        if cursor:
            params["cursor"] = cursor
        data = await self._get("/disputes", params=params)
        return Page[Dispute].model_validate(data)

    async def add_evidence(
        self,
        dispute_id: str,
        *,
        evidence:        str,
        idempotency_key: str | None = None,
    ) -> Dispute:
        """Submit merchant evidence for an open dispute.

        Parameters
        ----------
        evidence:
            Free-text evidence description or URL to supporting document.
        """
        data = await self._post(
            f"/disputes/{dispute_id}/evidence",
            {"evidence": evidence},
            idempotency_key=idempotency_key or new_idempotency_key(),
        )
        return Dispute.model_validate(data)
