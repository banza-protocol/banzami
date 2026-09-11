"""Client configuration with safe production defaults."""

from __future__ import annotations

from dataclasses import dataclass

LIVE_BASE_URL = "https://api.banzami.com"
"""The Live gateway. The client adds the ``/v1`` version prefix itself."""

SANDBOX_BASE_URL = "https://sandbox-api.banzami.com"
"""The Sandbox gateway — where every ``bz_test_…`` key belongs."""

PAY_BASE_URL = "https://pay.banzami.com"
"""The hosted payer surface (pay.banzami.com) — where a payment link opens."""


def default_base_url(api_key: str) -> str:
    """The gateway a key belongs to: ``bz_test_…`` → Sandbox, anything else → Live.

    The key's prefix carries its environment, as in every Banzami SDK, so a
    Sandbox key is never sent to the Live gateway by default.
    """
    return SANDBOX_BASE_URL if api_key.startswith("bz_test_") else LIVE_BASE_URL


@dataclass(frozen=True)
class BanzamiConfig:
    """Immutable configuration snapshot passed to every component of the client."""

    base_url: str = LIVE_BASE_URL

    timeout: float = 30.0
    """Total request timeout in seconds (connect + read + write)."""

    max_retries: int = 3
    """Maximum number of retry attempts after the initial request."""

    retry_delay: float = 0.5
    """Base delay in seconds for exponential backoff (doubles each retry)."""

    max_retry_delay: float = 30.0
    """Upper bound on the computed backoff delay."""

    default_currency: str = "AOA"
    """Default currency used when none is specified in a resource call."""

    def __post_init__(self) -> None:
        if self.max_retries < 0:
            raise ValueError("max_retries must be >= 0")
        if self.retry_delay <= 0:
            raise ValueError("retry_delay must be > 0")
        if self.timeout <= 0:
            raise ValueError("timeout must be > 0")
