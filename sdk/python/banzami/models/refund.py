"""Refund model."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class RefundStatus(StrEnum):
    PENDING   = "PENDING"
    SUCCEEDED = "SUCCEEDED"
    FAILED    = "FAILED"


class Refund(BaseModel):
    id:             str
    transaction_id: str
    merchant_id:    str
    amount_minor:   int
    currency:       str
    status:         RefundStatus
    reason:         str | None = None
    created_at:     datetime
    updated_at:     datetime
