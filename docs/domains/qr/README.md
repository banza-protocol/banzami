# Domain: QR Codes

## Business Purpose

QR codes are a first-class payment primitive. A consumer or merchant displays their QR code; the payer scans it to initiate a payment. No typing of account numbers or handles required.

Two modes serve different use cases:

| Mode | Reusable | Amount | Expiry | Use case |
|------|----------|--------|--------|----------|
| **Static** | Yes | Payer sets | Never | Shop counter, personal handle, street vendor |
| **Dynamic** | No (one-time) | Pre-set | Required | Invoice, e-commerce order, POS terminal |

---

## Payload Format

The scannable string is a **Base64url-encoded JSON object** (no padding). This makes the QR code a compact, URL-safe string that any mobile scanner can handle.

### Static QR

```json
{"t":"S","oid":"<owner-uuid>","ot":"C"|"M","c":"AOA"}
```

- `t` = type: `"S"` (static)
- `oid` = owner UUID (consumer or merchant)
- `ot` = owner type: `"C"` consumer, `"M"` merchant
- `c` = ISO 4217 currency code

No signature required — static QR only identifies the recipient; the payer sets the amount on their device.

### Dynamic QR

```json
{"t":"D","id":"<qr_code_id>","sig":"<base64url-hmac>"}
```

- `t` = type: `"D"` (dynamic)
- `id` = `qr_codes.id` UUID — used to look up amount, currency, expiry
- `sig` = HMAC-SHA256 signature (Base64url-encoded, no padding)

The HMAC is computed over:

```
"<qr_id>|<owner_id>|<amount_minor>|<currency>|<expires_at_unix_secs>"
```

---

## Architecture

```
                  ┌──────────────────────┐
                  │    QrEngine (trait)  │
                  │                      │
                  │  create_static()     │
                  │  create_dynamic()    │
                  │  get()               │
                  │  encode()            │  ← generates scannable string
                  │  decode()            │  ← parses + structural validation
                  │  mark_used()         │
                  └──────────┬───────────┘
                             │
                  ┌──────────▼───────────┐
                  │   QrRepository       │
                  │   (qr_codes table)   │
                  └──────────────────────┘
```

The `encode()` and `decode()` methods are **pure functions** — they don't touch the database. This makes them fast and testable without DB fixtures.

---

## Verification Flow (Dynamic QR)

When a payer scans a dynamic QR:

1. `decode(payload)` — parse Base64url JSON, extract `qr_code_id`
2. `get(qr_code_id)` — fetch from DB, verify status = ACTIVE, not expired
3. Re-verify HMAC: `hmac_verify(sign_message(qr_record), sig_from_payload)`
4. Proceed to payment (transfer or transaction)
5. `mark_used(qr_code_id)` — atomically transition status to USED

Step 3 re-verifies the signature against the DB record to prevent tampering.

---

## Status Lifecycle

```
Static:   ACTIVE                     (never expires or gets used)
Dynamic:  ACTIVE → USED              (after successful payment)
          ACTIVE → EXPIRED           (after expires_at passes, set by background job)
```

---

## Invariants

1. **Dynamic QR requires amount and expiry** — enforced by DB CHECK constraints.
2. **Expiry in the future** — `create_dynamic` rejects `expires_at ≤ now()`.
3. **Static QR cannot be marked used** — one-time semantics only apply to dynamic.
4. **HMAC signing key is secret** — loaded from `QR_SIGNING_KEY` env var; never logged or stored in DB.
5. **Payload is stateless for static QR** — no DB lookup needed to display a static QR.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/internal/v1/qr/static` | Create static QR code |
| `POST` | `/internal/v1/qr/dynamic` | Create dynamic QR code |
| `GET`  | `/internal/v1/qr/:id` | Get QR code + encoded payload |
| `POST` | `/internal/v1/qr/decode` | Decode a scanned payload string |
| `POST` | `/internal/v1/qr/:id/use` | Mark dynamic QR as used |

---

## Security Considerations

- The HMAC signing key (`QR_SIGNING_KEY`) must be rotated if compromised — all existing dynamic QR codes would need to be regenerated.
- Static QR payloads are **not signed** — they only identify the recipient, not the amount. The payment system must validate the final amount at transaction time.
- Dynamic QR codes should be short-lived (minutes to hours). Long-lived dynamic QRs increase replay risk.
- `mark_used` should be called atomically with the payment settlement to prevent double-spending.

---

## Future Compatibility

The payload format is designed to be extended:
- Additional fields can be added without breaking existing parsers (JSON is forward-compatible).
- EMVCo-compatible QR can be layered on top of this infrastructure when banking interoperability is required.
