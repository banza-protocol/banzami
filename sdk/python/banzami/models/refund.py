"""Refund model."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class RefundStatus(StrEnum):
    PENDING   = "PENDING"
    SUCCEEDED = "SUCCEEDED"
    FAILED    = "FAILED"


class RefundSourceType(StrEnum):
    """Typed refund source (BANZA ADR-030) — never a generic transfer."""

    ACQUIRING_PAYMENT = "ACQUIRING_PAYMENT"  # external-rail; credit lands in transit
    WALLET_PAYMENT    = "WALLET_PAYMENT"     # wallet-native; credit returns to the payer


class Refund(BaseModel):
    id:             str
    source_type:    RefundSourceType
    source_id:      str
    merchant_id:    str
    consumer_id:    str | None = None  # WALLET_PAYMENT only (the payer)
    amount_minor:   int
    currency:       str
    status:         RefundStatus
    reason:         str | None = None
    created_at:     datetime
    updated_at:     datetime
