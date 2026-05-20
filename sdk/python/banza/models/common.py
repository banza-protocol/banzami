"""Shared model primitives."""

from __future__ import annotations

from pydantic import BaseModel


class Money(BaseModel):
    """Minor-unit monetary amount with currency."""

    amount_minor: int
    currency: str

    def format(self) -> str:
        """Return a display string appropriate for the currency."""
        from banza.utils.money import format_minor  # local import avoids circular
        return format_minor(self.amount_minor, self.currency)
