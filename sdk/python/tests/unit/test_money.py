"""Money formatting and conversion unit tests.

AOA minor units are cêntimos: 1 Kz = 100 minor units, as in the ledger
(core/types currency.rs) and docs/architecture/money-engine.md. These helpers
used to treat 1 minor unit as 1 Kz, so every AOA amount displayed and converted
100 times too large.
"""

import pytest

from decimal import Decimal

from banzami.utils.money import format_minor, from_minor, to_minor


class TestFormatMinor:
    def test_aoa_minor_units_are_centimos(self):
        assert format_minor(5_000_000, "AOA") == "50 000 Kz"
        assert format_minor(50_000, "AOA") == "500 Kz"
        assert format_minor(12_500, "AOA") == "125 Kz"

    def test_aoa_centimos_shown_only_when_present(self):
        assert format_minor(5_000_050, "AOA") == "50 000,50 Kz"
        assert format_minor(1, "AOA") == "0,01 Kz"

    def test_aoa_negative(self):
        assert format_minor(-150, "AOA") == "-1,50 Kz"

    def test_aoa_lowercase(self):
        assert format_minor(100_000, "aoa") == "1 000 Kz"

    def test_aoa_zero(self):
        assert format_minor(0, "AOA") == "0 Kz"

    def test_usd(self):
        result = format_minor(5000, "USD")
        assert "50.00" in result
        assert "USD" in result

    def test_eur(self):
        result = format_minor(9999, "EUR")
        assert "99.99" in result
        assert "EUR" in result

    @pytest.mark.parametrize(
        "minor,expected",
        [
            (0, "0 Kz"),
            (1, "0,01 Kz"),
            (100, "1 Kz"),
            (1_000, "10 Kz"),
            (-1, "-0,01 Kz"),
            (-1_000, "-10 Kz"),
            (100_000_000_000, "1 000 000 000 Kz"),
        ],
    )
    def test_aoa_boundary_amounts(self, minor, expected):
        assert format_minor(minor, "AOA") == expected

    def test_non_aoa_large_amount_keeps_its_last_centimos(self):
        # Binary float division loses the tail of a large amount:
        # 999_999_999_999_999_99 / 100 rounds to ...000.00 in float and prints
        # a different number from the one held in the ledger. Decimal does not.
        assert format_minor(99_999_999_999_999_999, "USD") == "USD 999,999,999,999,999.99"


class TestToMinor:
    def test_aoa_multiplies_by_100(self):
        assert to_minor(1000.0, "AOA") == 100_000

    def test_aoa_centimos(self):
        assert to_minor(99.6, "AOA") == 9960
        assert to_minor(0.01, "AOA") == 1

    def test_usd_multiplies(self):
        assert to_minor(50.0, "USD") == 5000

    def test_usd_fractional(self):
        assert to_minor(0.01, "USD") == 1

    def test_case_insensitive(self):
        assert to_minor(500.0, "aoa") == 50_000
        assert to_minor(1.0, "usd") == 100


class TestFromMinor:
    def test_aoa_divides_by_100(self):
        assert from_minor(50000, "AOA") == 500.0

    def test_usd_divides(self):
        assert from_minor(5000, "USD") == 50.0

    def test_roundtrip(self):
        # Exact, not approximate: money is decimal, never binary floating point.
        for cur in ("USD", "AOA"):
            original = Decimal("49.99")
            assert from_minor(to_minor(original, cur), cur) == original

    def test_a_float_is_read_through_its_decimal_spelling(self):
        # 1.15 in binary is just under 1.15; multiplying by 100 and flooring
        # gave 114 minor units — a cêntimo lost on an amount a person typed.
        assert to_minor(1.15, "AOA") == 115
        assert to_minor("1.15", "AOA") == 115
        assert to_minor(Decimal("1.15"), "AOA") == 115
