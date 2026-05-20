"""Idempotency key generation."""

from __future__ import annotations

import uuid


def new_idempotency_key() -> str:
    """Return a random UUID v4 suitable for use as an idempotency key."""
    return str(uuid.uuid4())
