"""Exception hierarchy and factory tests."""


from banza.exceptions import (
    BanzaAPIError,
    BanzamiAuthenticationError,
    BanzamiInsufficientFundsError,
    BanzamiNotFoundError,
    BanzamiPermissionError,
    BanzamiRateLimitError,
    BanzamiServerError,
    BanzamiValidationError,
    api_error_from_response,
)


def test_factory_401():
    err = api_error_from_response(401, "UNAUTHORIZED", "Invalid API key")
    assert isinstance(err, BanzamiAuthenticationError)
    assert err.status_code == 401


def test_factory_403():
    err = api_error_from_response(403, "FORBIDDEN", "No permission")
    assert isinstance(err, BanzamiPermissionError)


def test_factory_404():
    err = api_error_from_response(404, "NOT_FOUND", "Resource not found")
    assert isinstance(err, BanzamiNotFoundError)


def test_factory_422():
    err = api_error_from_response(422, "VALIDATION_ERROR", "Bad input")
    assert isinstance(err, BanzamiValidationError)


def test_factory_429():
    err = api_error_from_response(429, "RATE_LIMIT", "Slow down")
    assert isinstance(err, BanzamiRateLimitError)


def test_factory_500():
    err = api_error_from_response(500, "INTERNAL", "Server error")
    assert isinstance(err, BanzamiServerError)
    assert err.status_code == 500


def test_factory_502():
    err = api_error_from_response(502, "BAD_GATEWAY", "Bad gateway")
    assert isinstance(err, BanzamiServerError)


def test_factory_insufficient_funds():
    err = api_error_from_response(402, "INSUFFICIENT_FUNDS", "Not enough Kz")
    assert isinstance(err, BanzamiInsufficientFundsError)
    assert err.code == "INSUFFICIENT_FUNDS"


def test_api_error_is_base():
    err = api_error_from_response(401, "X", "y")
    assert isinstance(err, BanzaAPIError)


def test_request_id_propagated():
    err = api_error_from_response(404, "NOT_FOUND", "x", request_id="req_abc")
    assert err.request_id == "req_abc"


def test_repr_includes_status():
    err = api_error_from_response(404, "NOT_FOUND", "missing")
    assert "404" in repr(err)
    assert "NOT_FOUND" in repr(err)
