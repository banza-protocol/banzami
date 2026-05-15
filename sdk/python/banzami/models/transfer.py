from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel

from .common import Money


class TransferStatus(StrEnum):
    PENDING   = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED    = "FAILED"


class TransferDirection(StrEnum):
    SENT     = "SENT"
    RECEIVED = "RECEIVED"


class Transfer(BaseModel):
    id:           str
    sender_id:    str
    recipient_id: str
    amount:       Money
    description:  str | None = None
    status:       TransferStatus
    created_at:   datetime
    updated_at:   datetime
