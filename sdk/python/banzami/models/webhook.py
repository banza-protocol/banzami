from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

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


# ---------------------------------------------------------------------------
# Canonical event type registry
# Matches the event type strings dispatched by services/api-gateway.
# ---------------------------------------------------------------------------

WebhookEventType = Literal[
    "payment_link.paid",
    "transaction.completed",
    "transaction.failed",
    "payout.created",
    "payout.completed",
    "payout.failed",
]


class WebhookEvent(BaseModel):
    id:         str
    type:       str  # str (not WebhookEventType) to forward-compat unknown event types
    data:       dict[str, Any] = {}
    created_at: datetime
