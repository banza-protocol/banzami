from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class WalletStatus(StrEnum):
    ACTIVE    = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    CLOSED    = "CLOSED"


class Wallet(BaseModel):
    id:          str
    merchant_id: str | None = None
    currency:    str
    status:      WalletStatus
    created_at:  datetime


class WalletBalance(BaseModel):
    available_minor: int
    reserved_minor:  int
    currency:        str

    @property
    def total_minor(self) -> int:
        return self.available_minor + self.reserved_minor
