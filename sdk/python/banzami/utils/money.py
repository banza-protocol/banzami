"""Monetary formatting and conversion helpers.

Every currency here uses 100 minor units per major unit. For AOA the minor
unit is the cêntimo: 1 Kz = 100 minor units, as in the ledger
(core/types currency.rs) and docs/architecture/money-engine.md.

These helpers used to treat 1 AOA minor unit as 1 Kz, so every AOA amount was
displayed and converted 100 times too large.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

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
    # Decimal, not float: `amount_minor / 100` is binary floating point, and a
    # large enough amount stops being representable exactly — 999999999999999999
    # minor units formats as ...0.00 instead of its true last cêntimos. Money is
    # never divided in float here.
    major = (Decimal(int(amount_minor)) / _SUBUNIT).quantize(Decimal("0.01"))
    return f"{cur} {major:,.2f}"


def to_minor(amount: Decimal | int | str | float, currency: str) -> int:
    """Convert a decimal amount to integer minor units (multiply by 100, round).

    Money is never computed in binary floating point (Banzami engineering
    constitution §9.3): a float argument is read through its decimal spelling,
    so 1.15 is one hundred and fifteen minor units and not 114.

    Examples
    --------
    >>> to_minor(Decimal("1000.00"), "AOA")
    100000
    >>> to_minor("50.99", "USD")
    5099
    >>> to_minor(1.15, "AOA")
    115
    """
    value = amount if isinstance(amount, Decimal) else Decimal(str(amount))
    return int((value * _SUBUNIT).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def from_minor(amount_minor: int, currency: str) -> Decimal:
    """Convert integer minor units back to an exact decimal amount.

    Returns a Decimal, not a float: a float cannot hold most amounts exactly,
    and an amount that is only nearly right is a wrong amount.

    Examples
    --------
    >>> from_minor(50000, "AOA")
    Decimal('500.00')
    >>> from_minor(5000, "USD")
    Decimal('50.00')
    """
    return (Decimal(amount_minor) / _SUBUNIT).quantize(Decimal("0.01"))
