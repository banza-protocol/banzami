from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class PayoutStatus(StrEnum):
    PENDING    = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED  = "COMPLETED"
    FAILED     = "FAILED"


class Payout(BaseModel):
    id:           str
    wallet_id:    str
    amount_minor: int
    currency:     str
    status:       PayoutStatus
    reference:    str | None = None
    created_at:   datetime
    updated_at:   datetime
