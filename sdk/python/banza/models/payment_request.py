"""Payment request model."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class PaymentRequestStatus(StrEnum):
    PENDING   = "PENDING"
    PAID      = "PAID"
    DECLINED  = "DECLINED"
    CANCELLED = "CANCELLED"
    EXPIRED   = "EXPIRED"


class PaymentRequest(BaseModel):
    id:           str
    requester_id: str
    payer_id:     str | None = None
    amount_minor: int
    currency:     str
    description:  str | None = None
    status:       PaymentRequestStatus
    expires_at:   datetime | None = None
    created_at:   datetime
    updated_at:   datetime
