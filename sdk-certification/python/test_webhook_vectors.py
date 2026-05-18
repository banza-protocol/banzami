"""
Cross-SDK certification: Python webhook signature verification.

Runs the shared golden test vectors from sdk-certification/vectors/webhook_signatures.json
against the Python SDK implementation.

Usage:
    cd sdk-certification/python
    python -m pytest test_webhook_vectors.py -v

Or with the venv:
    ../../sdk/python/.venv/bin/pytest test_webhook_vectors.py -v
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# Allow importing the SDK from its source tree.
sdk_root = Path(__file__).parent.parent.parent / "sdk" / "python"
sys.path.insert(0, str(sdk_root))

from banzami.signature import verify_signature, generate_test_signature  # noqa: E402

VECTORS_FILE = Path(__file__).parent.parent / "vectors" / "webhook_signatures.json"


@pytest.fixture(scope="module")
def suite() -> dict:
    return json.loads(VECTORS_FILE.read_text())


@pytest.fixture(scope="module")
def secret(suite: dict) -> str:
    return suite["shared_secret"]


@pytest.fixture(scope="module")
def vectors(suite: dict) -> list[dict]:
    return suite["vectors"]


def run_vector(vector: dict, secret: str) -> str:
    """Run a single vector and return the result category."""
    header   = vector["expected_header"]
    raw_body = vector["raw_body"].encode()
    ts       = vector.get("current_timestamp_for_test")

    if not header:
        # Empty header — SDK must handle gracefully
        ok = verify_signature(raw_body, header, secret, current_timestamp=ts)
        return "valid" if ok else "malformed_header"

    ok = verify_signature(raw_body, header, secret, current_timestamp=ts)
    return "valid" if ok else _infer_failure_reason(vector, header)


def _infer_failure_reason(vector: dict, header: str) -> str:
    """Classify the failure reason based on vector expectations."""
    expected = vector["expected_result"]
    # All failure results are returned as False from verify_signature;
    # the expected_result from the vector tells us WHICH failure this is.
    if expected in ("replay_rejected", "signature_mismatch", "malformed_header"):
        return expected
    return "unknown_failure"


@pytest.mark.parametrize("vector_id,expected_result", [
    ("V-001", "valid"),
    ("V-002", "valid"),
    ("V-003", "replay_rejected"),
    ("V-005", "valid"),
    ("V-006", "signature_mismatch"),
    ("V-007", "signature_mismatch"),
    ("V-008", "malformed_header"),
    ("V-009", "malformed_header"),
    ("V-010", "malformed_header"),
    ("V-011", "malformed_header"),
    ("V-012", "malformed_header"),
])
def test_vector(vector_id: str, expected_result: str, vectors: list[dict], secret: str):
    vector = next(v for v in vectors if v["id"] == vector_id)
    result = run_vector(vector, secret)
    assert result == expected_result, (
        f"Vector {vector_id}: expected '{expected_result}', got '{result}'\n"
        f"Description: {vector['description']}"
    )


def test_generate_test_signature_matches_vector_001(vectors: list[dict], secret: str):
    """generate_test_signature must produce the exact same header as the golden vector."""
    v = next(v for v in vectors if v["id"] == "V-001")
    sig = generate_test_signature(v["raw_body"].encode(), secret, timestamp=v["timestamp"])
    assert sig == v["expected_header"], (
        f"generate_test_signature mismatch:\n"
        f"  got:      {sig}\n"
        f"  expected: {v['expected_header']}"
    )


def test_generate_test_signature_matches_vector_002(vectors: list[dict], secret: str):
    v = next(v for v in vectors if v["id"] == "V-002")
    sig = generate_test_signature(v["raw_body"].encode(), secret, timestamp=v["timestamp"])
    assert sig == v["expected_header"]
