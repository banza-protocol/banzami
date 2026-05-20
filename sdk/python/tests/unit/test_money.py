"""Money formatting and conversion unit tests."""

import pytest

from banza.utils.money import format_minor, from_minor, to_minor


class TestFormatMinor:
    def test_aoa_no_decimal(self):
        assert format_minor(50000, "AOA") == "50.000 Kz"

    def test_aoa_lowercase(self):
        assert format_minor(1000, "aoa") == "1.000 Kz"

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


class TestToMinor:
    def test_aoa_integer(self):
        assert to_minor(1000.0, "AOA") == 1000

    def test_aoa_rounds_up(self):
        assert to_minor(99.6, "AOA") == 100

    def test_aoa_rounds_down(self):
        assert to_minor(99.4, "AOA") == 99

    def test_usd_multiplies(self):
        assert to_minor(50.0, "USD") == 5000

    def test_usd_fractional(self):
        assert to_minor(0.01, "USD") == 1

    def test_case_insensitive(self):
        assert to_minor(500.0, "aoa") == 500
        assert to_minor(1.0, "usd") == 100


class TestFromMinor:
    def test_aoa_identity(self):
        assert from_minor(50000, "AOA") == 50000.0

    def test_usd_divides(self):
        assert from_minor(5000, "USD") == 50.0

    def test_roundtrip_usd(self):
        original = 49.99
        assert from_minor(to_minor(original, "USD"), "USD") == pytest.approx(original, abs=0.01)
