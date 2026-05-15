from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class MerchantStatus(StrEnum):
    ACTIVE    = "ACTIVE"
    SUSPENDED = "SUSPENDED"


class Merchant(BaseModel):
    id:         str
    name:       str
    status:     MerchantStatus
    created_at: datetime


class ApiKey(BaseModel):
    id:           str
    prefix:       str
    label:        str | None = None
    created_at:   datetime
    last_used_at: datetime | None = None


class NewApiKey(ApiKey):
    """Returned only on creation — the ``key`` field is never shown again."""

    key: str
