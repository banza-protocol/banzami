# Banza Webhook Signature Specification

**Version:** 1.0  
**Status:** Canonical  
**Source of truth:** `services/api-gateway/internal/webhook/signer.go`

This document is the single authoritative specification for Banza webhook signature verification. All SDKs, integrations, and examples MUST implement this specification exactly. Deviations are security defects.

---

## Overview

Every webhook HTTP request from Banza carries a `Banza-Signature` header containing an HMAC-SHA256 signature over the timestamp and raw request body. Merchants verify this signature to confirm that the request originated from Banza and has not been tampered with.

The timestamp in the signed payload is also used for replay attack prevention — requests older than 300 seconds are rejected.

---

## Header Format

```
Banza-Signature: t=<unix_timestamp>,v1=<hex_hmac_sha256>
```

| Field | Type | Description |
|-------|------|-------------|
| `t` | Unix timestamp (integer seconds) | When the webhook was dispatched |
| `v1` | Lowercase hex string, 64 characters | HMAC-SHA256 of the signed payload |

The `v1` prefix allows Banza to introduce additional signature schemes in future versions without breaking existing verifiers. A verifier MUST check the `v1` field and MAY ignore unknown fields.

### Example header

```
Banza-Signature: t=1716000000,v1=a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd
```

---

## Signed Payload Construction

The HMAC input is constructed as:

```
signed_payload = "{unix_timestamp}.{raw_body_bytes}"
```

Where:
- `{unix_timestamp}` is the decimal string representation of the `t` value from the header (e.g., `"1716000000"`)
- `.` is a single ASCII period (0x2E)
- `{raw_body_bytes}` is the raw, unmodified HTTP request body as received

**Critical:** The body MUST be used in its raw byte form — before any JSON parsing, whitespace normalization, or re-encoding. Any modification to the byte sequence will produce a different digest and fail verification.

---

## Signing Algorithm

```
HMAC-SHA256(key=webhook_secret_bytes, message=signed_payload)
```

Where:
- `webhook_secret_bytes` is the webhook secret as UTF-8 encoded bytes
- `signed_payload` is the constructed payload string, encoded as UTF-8 bytes
- The output digest is hex-encoded (lowercase)

### Go reference implementation

```go
// services/api-gateway/internal/webhook/signer.go
func Sign(secret string, t time.Time, payload []byte) string {
    ts := t.Unix()
    mac := hmac.New(sha256.New, []byte(secret))
    fmt.Fprintf(mac, "%d.", ts)
    mac.Write(payload)
    return fmt.Sprintf("t=%d,v1=%s", ts, hex.EncodeToString(mac.Sum(nil)))
}
```

---

## Verification Algorithm

A verifier MUST perform all of the following steps in order:

### Step 1 — Parse the header

Split the `Banza-Signature` header value on `,` and extract:
- `t`: parse as a 64-bit signed integer (Unix seconds)
- `v1`: the hex HMAC digest string

If either field is absent or malformed, reject the request with HTTP 400.

### Step 2 — Replay protection

Compute the age of the timestamp:

```
age = abs(current_unix_seconds - t)
```

If `age > 300`, reject the request with HTTP 400. This prevents replay attacks where an attacker captures a legitimate webhook and re-delivers it later.

### Step 3 — Reconstruct the signed payload

```
signed_payload = "{t}.{raw_body}"
```

### Step 4 — Compute the expected HMAC

```
expected = HMAC-SHA256(key=webhook_secret, message=signed_payload)
expected_hex = hex_encode(expected)
```

### Step 5 — Constant-time comparison

Compare `expected_hex` to the `v1` value from the header using a **constant-time** comparison function (e.g., `hmac.compare_digest` in Python, `crypto.timingSafeEqual` in Node.js, `hmac.Equal` in Go).

Variable-time string comparison allows timing oracle attacks that can recover the secret. This step is a security requirement, not an optimisation.

If the comparison fails, reject the request with HTTP 401.

### Step 6 — Parse the event

Only after successful signature verification, parse the JSON body and process the event.

---

## Verification Pseudocode

```
function verify_webhook(raw_body, signature_header, webhook_secret):
    # Step 1: Parse header
    parts = parse_kv(signature_header)   # e.g. {"t": "1716000000", "v1": "a1b2..."}
    if "t" not in parts or "v1" not in parts:
        raise MalformedHeader

    ts = parse_int(parts["t"])
    v1 = parts["v1"]

    # Step 2: Replay protection
    age = abs(unix_now() - ts)
    if age > 300:
        raise ReplayAttack

    # Step 3: Reconstruct signed payload
    signed_payload = utf8_encode(str(ts) + ".") + raw_body

    # Step 4: Compute expected HMAC
    expected_bytes = hmac_sha256(key=utf8_encode(webhook_secret), msg=signed_payload)
    expected_hex   = hex_encode(expected_bytes)

    # Step 5: Constant-time comparison
    if not constant_time_equal(expected_hex, v1):
        raise SignatureMismatch

    # Step 6: Parse event
    return json_parse(raw_body)
```

---

## Webhook Event Envelope

All Banza webhook events share this envelope structure:

```json
{
  "id":         "evt_01jqxyzabc123",
  "type":       "payment_link.paid",
  "data":       { ... },
  "created_at": "2026-05-18T14:32:07.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique event ID — use for deduplication |
| `type` | string | Event type identifier (see Event Types below) |
| `data` | object | Event-specific payload |
| `created_at` | ISO 8601 | When the event was created on the Banza side |

---

## Canonical Event Types

| Event type | Dispatched when |
|-----------|-----------------|
| `payment_link.paid` | A payment link transitions from `ACTIVE` to `USED` (donor completes payment) |
| `transaction.completed` | A transaction is successfully captured and posted to the ledger |
| `transaction.failed` | A transaction fails at any stage (declined, timeout, error) |
| `payout.created` | A payout disbursement is initiated |
| `payout.completed` | A payout is successfully settled to the merchant's bank account |
| `payout.failed` | A payout fails |

Webhook endpoint subscriptions accept individual event types or `"*"` to receive all events.

---

## Test Vectors

These vectors can be used to validate SDK implementations. All use:
- `webhook_secret = "whsec_test_secret_for_vectors_32bytes"`
- `unix_timestamp = 1716000000`
- `raw_body = {"type":"payment_link.paid","id":"evt_test_001"}`

### Vector 1 — Valid signature

```
Banza-Signature: t=1716000000,v1=bc45ad8c20c8c52d0f1ee01a9eec37c43cece3d8fb4d9cad6c1e0c09278fde24
```

Reconstructed signed payload (as bytes):
```
1716000000.{"type":"payment_link.paid","id":"evt_test_001"}
```

### Vector 2 — Tampered body

Altering the body (e.g., changing `"paid"` to `"PAID"`) produces a different digest — verification MUST fail.

### Vector 3 — Expired timestamp

If the current time is `1716000301` and the header has `t=1716000000`, the request is 301 seconds old — verification MUST fail (`age > 300`).

### Vector 4 — Future timestamp (replay)

If `t=1716000500` and the current time is `1716000000`, the timestamp is 500 seconds in the future — verification MUST fail.

### Vector 5 — Wrong secret

Using `webhook_secret = "whsec_wrong_secret"` — verification MUST fail.

### Vector 6 — Malformed header

Header value `sha256=abc123` (missing `t=` and `v1=`) — MUST raise a parse error before any HMAC computation.

---

## Common Mistakes

| Mistake | Consequence | Correct approach |
|---------|-------------|-----------------|
| Reading `X-Banza-Signature` | Header not found — fails silently | Read `Banza-Signature` |
| Using `sha256=<hmac>` format | Never matches Banza output | Parse `t=<ts>,v1=<hmac>` |
| Signing only the body (no timestamp) | Signatures never match | Sign `"{ts}.{body}"` |
| Parsing JSON before verification | Body bytes differ from HMAC input | Read raw bytes first, then verify, then parse |
| Using variable-time string comparison | Timing oracle — attacker can recover secret | Use `hmac.compare_digest` / `timingSafeEqual` / `hmac.Equal` |
| No replay protection | Replay attacks succeed | Reject requests where `|now - t| > 300` |

---

## SDK Conformance Requirement

Every official Banzami SDK MUST:

1. Use the header name `Banza-Signature` (case-insensitive lookup, canonical name as written)
2. Parse both `t` and `v1` fields from the comma-separated header
3. Reject requests where `|now - t| > 300 seconds`
4. Sign `"{timestamp}.{raw_body}"` (not just `"{raw_body}"`)
5. Use HMAC-SHA256 with UTF-8 encoded key and payload
6. Use constant-time comparison
7. Read the raw body as bytes before any JSON parsing
8. Expose `constructEvent(rawBody, header, secret) → WebhookEvent` as the primary API

SDKs failing any of these requirements MUST NOT be marked production-ready.

---

## Cross-SDK Certification

The `sdk-certification/` directory at the repository root contains golden test vectors that all SDK implementations MUST pass. New SDK PRs that fail certification cannot be merged.

See `sdk-certification/README.md` for the verification protocol.
