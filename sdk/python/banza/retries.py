"""Retry policy built on tenacity.

The policy retries only transient errors (429, 5xx). Client errors (4xx,
except 429) are never retried because they will not resolve on their own.
"""

from __future__ import annotations

from tenacity import (
    AsyncRetrying,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from .exceptions import BanzamiRateLimitError, BanzamiServerError


def _is_retryable(exc: BaseException) -> bool:
    return isinstance(exc, (BanzamiRateLimitError, BanzamiServerError))


def build_retry_policy(
    max_retries: int,
    base_delay: float,
    max_delay: float,
) -> AsyncRetrying:
    """Return a configured tenacity AsyncRetrying instance.

    Parameters
    ----------
    max_retries:
        Number of additional attempts after the first. Total attempts = max_retries + 1.
    base_delay:
        Minimum backoff delay in seconds (doubles each retry).
    max_delay:
        Upper bound on backoff delay in seconds.
    """
    return AsyncRetrying(
        retry=retry_if_exception(_is_retryable),
        stop=stop_after_attempt(max_retries + 1),
        wait=wait_exponential(multiplier=base_delay, min=base_delay, max=max_delay),
        reraise=True,
    )
