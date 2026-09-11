"""Dispute model."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class DisputeStatus(StrEnum):
    OPEN             = "OPEN"
    UNDER_REVIEW     = "UNDER_REVIEW"
    WON_BY_CONSUMER  = "WON_BY_CONSUMER"
    WON_BY_MERCHANT  = "WON_BY_MERCHANT"
    CLOSED           = "CLOSED"


class Dispute(BaseModel):
    id:                str
    transaction_id:    str
    merchant_id:       str
    # None for disputes opened today: the disputed payment has no Banzami consumer.
    consumer_id:       str | None = None
    amount_minor:      int
    currency:          str
    reason:            str
    status:            DisputeStatus
    evidence_deadline: datetime | None = None
    resolution_notes:  str | None = None
    resolved_at:       datetime | None = None
    created_at:        datetime
    updated_at:        datetime
