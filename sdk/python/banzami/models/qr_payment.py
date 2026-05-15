from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class QrCodeType(StrEnum):
    STATIC  = "STATIC"
    DYNAMIC = "DYNAMIC"


class QrCodeStatus(StrEnum):
    ACTIVE    = "ACTIVE"
    USED      = "USED"
    EXPIRED   = "EXPIRED"
    CANCELLED = "CANCELLED"


class QrCode(BaseModel):
    id:           str
    owner_id:     str
    type:         QrCodeType
    status:       QrCodeStatus
    amount_minor: int | None = None
    currency:     str
    reference:    str | None = None
    expires_at:   datetime | None = None
    created_at:   datetime


class QrPayment(BaseModel):
    """Full QR payment response including the scannable payload."""

    qr_code: QrCode
    payload: str


class ParsedQr(BaseModel):
    owner_id:   str | None = None
    qr_code_id: str | None = None
    type:       QrCodeType
    currency:   str | None = None
    is_dynamic: bool
