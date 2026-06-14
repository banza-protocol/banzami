from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class TransactionStatus(StrEnum):
    PENDING   = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED    = "FAILED"
    REFUNDED  = "REFUNDED"


class Transaction(BaseModel):
    id:          str
    merchant_id: str
    consumer_id: str | None = None
    amount_minor: int
    currency:    str
    status:      TransactionStatus
    reference:   str | None = None
    description: str | None = None
    created_at:  datetime
    updated_at:  datetime
