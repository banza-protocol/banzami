from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class WebhookEndpointStatus(StrEnum):
    ACTIVE   = "ACTIVE"
    DISABLED = "DISABLED"


class WebhookEndpoint(BaseModel):
    id:         str
    url:        str
    events:     list[str]
    status:     WebhookEndpointStatus
    created_at: datetime


class WebhookEvent(BaseModel):
    id:         str
    type:       str
    payload:    dict[str, Any]
    created_at: datetime
