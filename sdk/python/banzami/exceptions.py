"""Banzami exception hierarchy.

All exceptions raised by the SDK inherit from BanzamiError, so callers
can either catch specific sub-classes or handle everything in one place.
"""

from __future__ import annotations


class BanzamiError(Exception):
    """Base class for all Banzami SDK errors."""


class BanzamiNetworkError(BanzamiError):
    """Raised when a network-level failure occurs (connection refused, DNS, TLS)."""


class BanzamiTimeoutError(BanzamiNetworkError):
    """Raised when the HTTP request exceeds the configured timeout."""


class BanzamiAPIError(BanzamiError):
    """Raised when the API returns a structured error response (HTTP 4xx / 5xx)."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        request_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code        = code
        self.message     = message
        self.request_id  = request_id

    def __repr__(self) -> str:
        return (
            f"{type(self).__name__}("
            f"status_code={self.status_code}, "
            f"code={self.code!r}, "
            f"message={self.message!r})"
        )


class BanzamiAuthenticationError(BanzamiAPIError):
    """HTTP 401 — the API key is missing or invalid."""


class BanzamiPermissionError(BanzamiAPIError):
    """HTTP 403 — the API key lacks permission for this operation."""


class BanzamiNotFoundError(BanzamiAPIError):
    """HTTP 404 — the requested resource does not exist."""


class BanzamiConflictError(BanzamiAPIError):
    """HTTP 409 — a conflict with an existing resource (e.g. duplicate idempotency key)."""


class BanzamiValidationError(BanzamiAPIError):
    """HTTP 422 — the request body failed server-side validation."""


class BanzamiRateLimitError(BanzamiAPIError):
    """HTTP 429 — too many requests; the SDK will retry automatically."""


class BanzamiInsufficientFundsError(BanzamiAPIError):
    """Insufficient funds to complete the financial operation."""


class BanzamiServerError(BanzamiAPIError):
    """HTTP 5xx — a transient server-side error; the SDK will retry automatically."""


class BanzamiWebhookSignatureError(BanzamiError):
    """Raised when a webhook payload fails HMAC-SHA256 signature verification."""


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_STATUS_MAP: dict[int, type[BanzamiAPIError]] = {
    401: BanzamiAuthenticationError,
    403: BanzamiPermissionError,
    404: BanzamiNotFoundError,
    409: BanzamiConflictError,
    422: BanzamiValidationError,
    429: BanzamiRateLimitError,
}


def api_error_from_response(
    status_code: int,
    code: str,
    message: str,
    request_id: str | None = None,
) -> BanzamiAPIError:
    """Return the most specific BanzamiAPIError subclass for a given HTTP status."""
    if code == "INSUFFICIENT_FUNDS":
        return BanzamiInsufficientFundsError(status_code, code, message, request_id)
    if status_code >= 500:
        return BanzamiServerError(status_code, code, message, request_id)
    cls = _STATUS_MAP.get(status_code, BanzamiAPIError)
    return cls(status_code, code, message, request_id)
