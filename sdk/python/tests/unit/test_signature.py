"""Webhook signature verification tests.

Golden test vectors are derived from the canonical Go implementation in
services/api-gateway/internal/webhook/signer.go.

All vectors use:
    secret    = "whsec_test_secret"
    timestamp = 1716000000
    body      = b'{"type":"payment_link.paid","id":"evt_test_001"}'

The expected HMAC is computed as:
    HMAC-SHA256(key=secret, msg=f"{timestamp}." + body)
"""

import hashlib
import hmac
import time

from banza.signature import (
    SIGNATURE_HEADER,
    TOLERANCE_SECONDS,
    generate_test_signature,
    verify_signature,
)

SECRET    = "whsec_test_secret"
PAYLOAD   = b'{"type":"payment_link.paid","id":"evt_test_001"}'
TIMESTAMP = 1716000000

# ---------------------------------------------------------------------------
# Signing helper — mirrors the canonical signer.go
# ---------------------------------------------------------------------------

def _make_sig(payload: bytes, secret: str, ts: int) -> str:
    mac = hmac.new(secret.encode(), digestmod=hashlib.sha256)
    mac.update(f"{ts}.".encode())
    mac.update(payload)
    return f"t={ts},v1={mac.hexdigest()}"


VALID_SIG = _make_sig(PAYLOAD, SECRET, TIMESTAMP)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

def test_signature_header_constant():
    assert SIGNATURE_HEADER == "Banzami-Signature"


def test_tolerance_constant():
    assert TOLERANCE_SECONDS == 300


# ---------------------------------------------------------------------------
# Valid signatures
# ---------------------------------------------------------------------------

def test_valid_signature_bytes():
    assert verify_signature(PAYLOAD, VALID_SIG, SECRET, current_timestamp=TIMESTAMP) is True


def test_valid_signature_string():
    assert verify_signature(PAYLOAD.decode(), VALID_SIG, SECRET, current_timestamp=TIMESTAMP) is True


def test_valid_signature_at_tolerance_boundary():
    """Exactly at the tolerance boundary (300 s) must pass."""
    sig = _make_sig(PAYLOAD, SECRET, TIMESTAMP)
    assert verify_signature(PAYLOAD, sig, SECRET, current_timestamp=TIMESTAMP + 300) is True


def test_valid_signature_in_the_past():
    """Timestamps slightly in the past (within tolerance) must pass."""
    sig = _make_sig(PAYLOAD, SECRET, TIMESTAMP - 100)
    assert verify_signature(PAYLOAD, sig, SECRET, current_timestamp=TIMESTAMP) is True


def test_valid_signature_slightly_in_future():
    """Timestamps slightly in the future (within tolerance) must pass."""
    sig = _make_sig(PAYLOAD, SECRET, TIMESTAMP + 100)
    assert verify_signature(PAYLOAD, sig, SECRET, current_timestamp=TIMESTAMP) is True


# ---------------------------------------------------------------------------
# Replay protection — expired timestamps
# ---------------------------------------------------------------------------

def test_expired_timestamp_rejected():
    """Request older than 300 seconds must be rejected."""
    sig = _make_sig(PAYLOAD, SECRET, TIMESTAMP)
    assert verify_signature(PAYLOAD, sig, SECRET, current_timestamp=TIMESTAMP + 301) is False


def test_future_timestamp_outside_window_rejected():
    """Timestamp too far in the future must be rejected."""
    sig = _make_sig(PAYLOAD, SECRET, TIMESTAMP + 500)
    assert verify_signature(PAYLOAD, sig, SECRET, current_timestamp=TIMESTAMP) is False


def test_tolerance_zero_disables_replay_protection():
    """tolerance=0 skips the replay window check entirely."""
    old_sig = _make_sig(PAYLOAD, SECRET, TIMESTAMP - 9999)
    assert verify_signature(PAYLOAD, old_sig, SECRET, tolerance=0, current_timestamp=TIMESTAMP) is True


# ---------------------------------------------------------------------------
# Invalid signatures
# ---------------------------------------------------------------------------

def test_empty_signature_rejected():
    assert verify_signature(PAYLOAD, "", SECRET) is False


def test_tampered_body_rejected():
    tampered = PAYLOAD + b" extra"
    assert verify_signature(tampered, VALID_SIG, SECRET, current_timestamp=TIMESTAMP) is False


def test_wrong_secret_rejected():
    assert verify_signature(PAYLOAD, VALID_SIG, "wrong_secret", current_timestamp=TIMESTAMP) is False


def test_wrong_hmac_value_rejected():
    bad_sig = f"t={TIMESTAMP},v1=deadbeef00000000deadbeef00000000deadbeef00000000deadbeef00000000"
    assert verify_signature(PAYLOAD, bad_sig, SECRET, current_timestamp=TIMESTAMP) is False


def test_wrong_timestamp_in_hmac_rejected():
    """Signature computed with different timestamp must not pass with another."""
    sig_different_ts = _make_sig(PAYLOAD, SECRET, TIMESTAMP + 1)
    assert verify_signature(PAYLOAD, sig_different_ts, SECRET, current_timestamp=TIMESTAMP + 1) is True
    # But using the original timestamp in the header while HMAC was computed with +1 fails:
    bad_sig = f"t={TIMESTAMP},v1=" + _make_sig(PAYLOAD, SECRET, TIMESTAMP + 1).split("v1=")[1]
    assert verify_signature(PAYLOAD, bad_sig, SECRET, current_timestamp=TIMESTAMP) is False


# ---------------------------------------------------------------------------
# Old format rejection — SDK migration guard
# ---------------------------------------------------------------------------

def test_old_sha256_prefix_format_rejected():
    """The legacy 'sha256=<hex>' format (no timestamp) must be rejected."""
    digest = hmac.new(SECRET.encode(), PAYLOAD, hashlib.sha256).hexdigest()
    old_format = f"sha256={digest}"
    assert verify_signature(PAYLOAD, old_format, SECRET, current_timestamp=TIMESTAMP) is False


def test_x_banzami_signature_header_format_rejected():
    """Headers without 't=' and 'v1=' fields must be rejected."""
    assert verify_signature(PAYLOAD, "invalid-header-value", SECRET, current_timestamp=TIMESTAMP) is False


def test_missing_v1_field_rejected():
    assert verify_signature(PAYLOAD, f"t={TIMESTAMP}", SECRET, current_timestamp=TIMESTAMP) is False


def test_missing_t_field_rejected():
    mac = hmac.new(SECRET.encode(), digestmod=hashlib.sha256)
    mac.update(f"{TIMESTAMP}.".encode())
    mac.update(PAYLOAD)
    assert verify_signature(PAYLOAD, f"v1={mac.hexdigest()}", SECRET, current_timestamp=TIMESTAMP) is False


def test_malformed_timestamp_rejected():
    mac = hmac.new(SECRET.encode(), digestmod=hashlib.sha256)
    mac.update(b"notanumber.")
    mac.update(PAYLOAD)
    assert verify_signature(PAYLOAD, f"t=notanumber,v1={mac.hexdigest()}", SECRET, current_timestamp=TIMESTAMP) is False


# ---------------------------------------------------------------------------
# generate_test_signature
# ---------------------------------------------------------------------------

def test_generate_test_signature_produces_verifiable_sig():
    sig = generate_test_signature(PAYLOAD, SECRET, timestamp=TIMESTAMP)
    assert verify_signature(PAYLOAD, sig, SECRET, current_timestamp=TIMESTAMP) is True


def test_generate_test_signature_format():
    sig = generate_test_signature(PAYLOAD, SECRET, timestamp=TIMESTAMP)
    assert sig.startswith(f"t={TIMESTAMP},v1=")
    v1 = sig.split("v1=")[1]
    assert len(v1) == 64  # 32-byte SHA-256 hex-encoded


def test_generate_test_signature_defaults_to_current_time():
    before = int(time.time())
    sig = generate_test_signature(PAYLOAD, SECRET)
    after = int(time.time())
    ts = int(sig.split(",")[0].split("=")[1])
    assert before <= ts <= after


def test_generate_test_signature_with_string_payload():
    sig = generate_test_signature(PAYLOAD.decode(), SECRET, timestamp=TIMESTAMP)
    assert verify_signature(PAYLOAD, sig, SECRET, current_timestamp=TIMESTAMP) is True


def test_generate_test_signature_matches_canonical():
    """Matches the canonical Go signer output for the same inputs."""
    sig = generate_test_signature(PAYLOAD, SECRET, timestamp=TIMESTAMP)
    expected = _make_sig(PAYLOAD, SECRET, TIMESTAMP)
    assert sig == expected
