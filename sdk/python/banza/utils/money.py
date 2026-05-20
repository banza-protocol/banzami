"""Monetary formatting and conversion helpers.

AOA (Kwanza) is integer-denominated: 1 Kz = 1 minor unit.
Most other currencies follow ISO 4217: 1 major unit = 100 minor units.
"""

from __future__ import annotations

import math


def format_minor(amount_minor: int, currency: str) -> str:
    """Return a human-readable amount string.

    Examples
    --------
    >>> format_minor(50000, "AOA")
    '50.000 Kz'
    >>> format_minor(5000, "USD")
    'USD 50.00'
    """
    cur = currency.upper()
    if cur == "AOA":
        formatted = f"{amount_minor:,}".replace(",", ".")
        return f"{formatted} Kz"
    major = amount_minor / 100
    return f"{cur} {major:,.2f}"


def to_minor(amount: float, currency: str) -> int:
    """Convert a decimal amount to integer minor units.

    AOA: round to the nearest kwanza.
    All others: multiply by 100 and round.

    Examples
    --------
    >>> to_minor(1000.0, "AOA")
    1000
    >>> to_minor(50.99, "USD")
    5099
    """
    cur = currency.upper()
    if cur == "AOA":
        return math.floor(amount + 0.5)  # banker-safe rounding
    return math.floor(amount * 100 + 0.5)


def from_minor(amount_minor: int, currency: str) -> float:
    """Convert integer minor units back to a decimal amount.

    Examples
    --------
    >>> from_minor(50000, "AOA")
    50000.0
    >>> from_minor(5000, "USD")
    50.0
    """
    cur = currency.upper()
    if cur == "AOA":
        return float(amount_minor)
    return amount_minor / 100
