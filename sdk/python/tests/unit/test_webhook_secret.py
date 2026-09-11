"""A2-03: an empty or blank webhook secret never verifies — an event signed
with the empty key used to be accepted by an integration that forgot its secret."""
import hashlib
import hmac
import time

from banzami.signature import verify_signature


def test_an_empty_secret_never_verifies():
    body = b'{"id":"evt_1","type":"payment_link.paid","data":{}}'
    ts = int(time.time())
    mac = hmac.new(b"", digestmod=hashlib.sha256)
    mac.update(f"{ts}.".encode())
    mac.update(body)
    forged = f"t={ts},v1={mac.hexdigest()}"
    for secret in ("", "   "):
        assert verify_signature(body, forged, secret) is False
