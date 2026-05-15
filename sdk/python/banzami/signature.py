"""HMAC-SHA256 webhook signature verification.

The Banzami platform signs every webhook delivery with the format:
    X-Banzami-Signature: sha256=<hex_digest>

Pass the *raw* request body (bytes) and the header value to verify().
Never decode or parse the body before verifying — doing so can alter
whitespace and invalidate the signature.
"""

from __future__ import annotations

import hashlib
import hmac


def verify_signature(
    raw_body: bytes | str,
    signature: str,
    secret: str,
) -> bool:
    """Return True when the HMAC-SHA256 signature matches.

    Parameters
    ----------
    raw_body:
        Raw request body as received from the HTTP server.
    signature:
        Value of the ``X-Banzami-Signature`` header.
    secret:
        Webhook secret from the Banzami dashboard.
    """
    if not signature:
        return False

    body = raw_body.encode() if isinstance(raw_body, str) else raw_body
    expected = "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()

    # Constant-time comparison prevents timing-oracle attacks.
    return hmac.compare_digest(expected, signature)
