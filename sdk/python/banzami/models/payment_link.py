from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class PaymentLinkStatus(StrEnum):
    ACTIVE    = "ACTIVE"
    USED      = "USED"
    CANCELLED = "CANCELLED"
    EXPIRED   = "EXPIRED"


class PaymentLink(BaseModel):
    id:           str
    slug:         str
    merchant_id:  str
    wallet_id:    str
    amount_minor: int | None = None
    currency:     str
    description:  str | None = None
    status:       PaymentLinkStatus
    expires_at:   datetime | None = None
    paid_at:      datetime | None = None
    created_at:   datetime
    updated_at:   datetime

    @property
    def checkout_url(self) -> str:
        return f"https://pay.banzami.co/{self.slug}"
