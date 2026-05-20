"""HMAC-SHA256 webhook signature verification.

Banzami signs every webhook delivery with:

    Banzami-Signature: t=<unix_seconds>,v1=<hex_hmac_sha256>

The HMAC is computed over the concatenation of the timestamp string, a
literal period, and the raw request body bytes:

    hmac_input = f"{unix_seconds}.".encode() + raw_body_bytes

Pass the *raw* request body (bytes) and the full ``Banzami-Signature``
header value to :func:`verify_signature`.  Never decode or JSON-parse the
body before verification — doing so can alter the byte sequence and
invalidate the signature.

Spec: docs/standards/webhook-signature-spec.md
"""

from __future__ import annotations

import hashlib
import hmac
import time as _time
from typing import NamedTuple

SIGNATURE_HEADER = "Banzami-Signature"
TOLERANCE_SECONDS = 300


class _ParsedHeader(NamedTuple):
    timestamp: int
    v1: str


def _parse_header(header: str) -> _ParsedHeader:
    """Parse the Banzami-Signature header into (timestamp, v1).

    Raises ValueError on malformed input.
    """
    ts: int | None = None
    v1: str | None = None

    for part in header.split(","):
        part = part.strip()
        if "=" not in part:
            continue
        key, _, val = part.partition("=")
        key = key.strip()
        val = val.strip()
        if key == "t":
            try:
                ts = int(val)
            except ValueError as exc:
                raise ValueError(
                    f"Banzami-Signature: invalid timestamp value {val!r}"
                ) from exc
        elif key == "v1":
            v1 = val

    if ts is None or not v1:
        raise ValueError(
            "Banzami-Signature header is malformed: expected 't=<unix>,v1=<hex>'"
        )
    return _ParsedHeader(timestamp=ts, v1=v1)


def verify_signature(
    raw_body: bytes | str,
    signature: str,
    secret: str,
    *,
    tolerance: int = TOLERANCE_SECONDS,
    current_timestamp: int | None = None,
) -> bool:
    """Return True when the Banzami-Signature is valid.

    Parameters
    ----------
    raw_body:
        Raw HTTP request body exactly as received — do not JSON-parse first.
    signature:
        Full value of the ``Banzami-Signature`` header.
    secret:
        Webhook secret obtained from the Banzami dashboard.
    tolerance:
        Maximum age of the request in seconds (default: 300). Set to 0 to
        disable replay protection (not recommended in production).
    current_timestamp:
        Override the current time for testing. Defaults to ``time.time()``.

    Returns
    -------
    bool
        ``True`` if the signature is valid and within the replay window.
        ``False`` for any verification failure (bad signature, expired
        timestamp, malformed header).
    """
    if not signature:
        return False

    try:
        parsed = _parse_header(signature)
    except ValueError:
        return False

    now = int(current_timestamp if current_timestamp is not None else _time.time())
    age = abs(now - parsed.timestamp)
    if tolerance > 0 and age > tolerance:
        return False

    body = raw_body.encode() if isinstance(raw_body, str) else raw_body

    mac = hmac.new(secret.encode(), digestmod=hashlib.sha256)
    mac.update(f"{parsed.timestamp}.".encode())
    mac.update(body)
    expected_hex = mac.hexdigest()

    # Constant-time comparison prevents timing-oracle attacks.
    return hmac.compare_digest(expected_hex, parsed.v1)


def generate_test_signature(
    raw_body: bytes | str,
    secret: str,
    *,
    timestamp: int | None = None,
) -> str:
    """Generate a valid ``Banzami-Signature`` header value for local testing.

    Use this in test suites to simulate incoming Banzami webhooks without
    making real API calls.

    Parameters
    ----------
    raw_body:
        The raw webhook body bytes (or string) to sign.
    secret:
        Any test webhook secret string.
    timestamp:
        Unix seconds for the ``t=`` field. Defaults to the current time.

    Returns
    -------
    str
        A ``Banzami-Signature`` header value, e.g.
        ``"t=1716000000,v1=abc123..."``
    """
    ts = timestamp if timestamp is not None else int(_time.time())
    body = raw_body.encode() if isinstance(raw_body, str) else raw_body

    mac = hmac.new(secret.encode(), digestmod=hashlib.sha256)
    mac.update(f"{ts}.".encode())
    mac.update(body)
    return f"t={ts},v1={mac.hexdigest()}"
