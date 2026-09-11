"""Monetary formatting and conversion helpers.

Every currency here uses 100 minor units per major unit. For AOA the minor
unit is the cêntimo: 1 Kz = 100 minor units, as in the ledger
(core/types currency.rs) and docs/architecture/money-engine.md.

These helpers used to treat 1 AOA minor unit as 1 Kz, so every AOA amount was
displayed and converted 100 times too large.
"""

from __future__ import annotations

import math

_SUBUNIT = 100


def _group_thousands(n: int) -> str:
    s = str(n)
    out = ""
    for i, ch in enumerate(s):
        if i > 0 and (len(s) - i) % 3 == 0:
            out += " "
        out += ch
    return out


def format_minor(amount_minor: int, currency: str) -> str:
    """Return a human-readable amount string.

    AOA follows the Money Engine display rule: thousands grouped with a space,
    comma decimal, "Kz" last, cêntimos only when present. Integer arithmetic
    only.

    Examples
    --------
    >>> format_minor(5000000, "AOA")
    '50 000 Kz'
    >>> format_minor(5000050, "AOA")
    '50 000,50 Kz'
    >>> format_minor(5000, "USD")
    'USD 50.00'
    """
    cur = currency.upper()
    if cur == "AOA":
        whole, frac = divmod(abs(int(amount_minor)), _SUBUNIT)
        out = _group_thousands(whole)
        if frac:
            out += f",{frac:02d}"
        sign = "-" if amount_minor < 0 else ""
        return f"{sign}{out} Kz"
    major = amount_minor / _SUBUNIT
    return f"{cur} {major:,.2f}"


def to_minor(amount: float, currency: str) -> int:
    """Convert a decimal amount to integer minor units (multiply by 100, round).

    Examples
    --------
    >>> to_minor(1000.0, "AOA")
    100000
    >>> to_minor(50.99, "USD")
    5099
    """
    return math.floor(amount * _SUBUNIT + 0.5)


def from_minor(amount_minor: int, currency: str) -> float:
    """Convert integer minor units back to a decimal amount (divide by 100).

    Examples
    --------
    >>> from_minor(50000, "AOA")
    500.0
    >>> from_minor(5000, "USD")
    50.0
    """
    return amount_minor / _SUBUNIT
