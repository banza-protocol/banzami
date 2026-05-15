"""Webhook signature verification tests."""

import hashlib
import hmac

import pytest

from banzami.signature import verify_signature

SECRET  = "whsec_test_secret"
PAYLOAD = b'{"type":"transaction.completed","id":"evt_123"}'


def _sign(payload: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def test_valid_signature_bytes():
    sig = _sign(PAYLOAD, SECRET)
    assert verify_signature(PAYLOAD, sig, SECRET) is True


def test_valid_signature_string():
    sig = _sign(PAYLOAD, SECRET)
    assert verify_signature(PAYLOAD.decode(), sig, SECRET) is True


def test_invalid_signature_rejected():
    assert verify_signature(PAYLOAD, "sha256=deadbeef", SECRET) is False


def test_empty_signature_rejected():
    assert verify_signature(PAYLOAD, "", SECRET) is False


def test_tampered_body_rejected():
    sig     = _sign(PAYLOAD, SECRET)
    tampered = PAYLOAD + b" extra"
    assert verify_signature(tampered, sig, SECRET) is False


def test_wrong_secret_rejected():
    sig = _sign(PAYLOAD, SECRET)
    assert verify_signature(PAYLOAD, sig, "wrong_secret") is False


def test_missing_sha256_prefix_rejected():
    digest = hmac.new(SECRET.encode(), PAYLOAD, hashlib.sha256).hexdigest()
    assert verify_signature(PAYLOAD, digest, SECRET) is False  # no "sha256=" prefix
