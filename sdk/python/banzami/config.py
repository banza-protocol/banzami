"""Client configuration with safe production defaults."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BanzamiConfig:
    """Immutable configuration snapshot passed to every component of the client."""

    base_url: str = "https://api.banzami.ao"

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
