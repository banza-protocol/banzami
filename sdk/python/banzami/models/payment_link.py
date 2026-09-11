from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel

from banzami.config import PAY_BASE_URL


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
        """The page a payer opens: pay.banzami.com/pay/<slug> (the canonical path;
        the bare pay.banzami.com/<slug> only redirects there). It used to build
        https://pay.banzami.co/<slug> — a domain that is not Banzami's."""
        return f"{PAY_BASE_URL}/pay/{self.slug}"
