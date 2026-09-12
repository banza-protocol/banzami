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

## Who may pay a QR

`POST /v1/qr/pay` on the **consumer** surface, with a consumer session. The payer
is the person that session authenticated and is **not a request field**.

That is the whole authority model, and it exists because the first attempt got it
wrong: `POST /v1/qr/pay` once lived on the MERCHANT surface and took
`payer_consumer_id` as free text, so anyone holding a merchant API key could name
any consumer and take their money. It was withdrawn rather than patched (RA-053),
and `/internal/v1/qr/pay` is still on core's withdrawn-routes list — that path is
the broken contract's name. The rebuilt route is
`POST /internal/v1/consumer/qr/pay`, reachable only from the surface that can say
who is paying.

The request carries the scanned payload, which identifies the **recipient**, and
an amount only for a static code. There is nothing in it to forge.

---

## Verification Flow (Dynamic QR)

When a payer scans a dynamic QR, the payment route does all of this itself —
`resolve_for_payment` is the single entry point, and a payload validated against
its own contents proves nothing:

1. `decode(payload)` — parse Base64url JSON, extract `qr_code_id`
2. `get(qr_code_id)` — fetch from DB, verify status = ACTIVE, not expired
   (synchronously, whether or not the expiry worker has reached the row)
3. Re-verify HMAC: `hmac_verify(sign_message(qr_record), sig_from_payload)`
4. Claim the code and post the ledger entries **in one transaction**
5. Record the merchant payment (the refundable object) after it commits

Step 3 re-verifies the signature against the DB record to prevent tampering. Note
what that also buys: the signed message includes `expires_at`, so a code's life
cannot be extended by editing its row — the signature simply stops matching.

Step 4 is where single use lives. The claim is a conditional
`UPDATE … WHERE status = 'ACTIVE'` inside the payment's own transaction: two
payers can both resolve while the code is ACTIVE, only one statement can take it
out of ACTIVE, and the loser's ledger entries never commit. A refused payment —
no funds, frozen account — rolls the claim back with the posting, so a failure
never burns a customer's code.

The engine's `mark_used` + `release_claim` pair is deliberately **not** used by
the payment path. Claiming on one connection and posting on another leaves a
window where the code is spent and the money has not moved; `release_claim`
compensates for a window that does not need to exist.

### What the payer is charged

| | Static | Dynamic |
|---|---|---|
| Amount | the payer's, required | the signed record's |
| A client-supplied amount | is the amount | is **ignored**, not compared |
| Reuse | reusable — a shop's printed code is paid all day | single use |

"Ignored, not compared" is deliberate. Comparing invites a later patch that
tolerates a difference.

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
| `POST` | `/internal/v1/consumer/qr/pay` | Pay a scanned QR (payer from the consumer session) |

---

## Security Considerations

- The HMAC signing key (`QR_SIGNING_KEY`) must be rotated if compromised — all existing dynamic QR codes would need to be regenerated.
- Static QR payloads are **not signed** — they only identify the recipient, not the amount. The payment system must validate the final amount at transaction time.
- Dynamic QR codes should be short-lived (minutes to hours). Long-lived dynamic QRs increase replay risk.
- The single-use claim IS atomic with the settlement: one transaction, one
  conditional update, and a rollback that leaves the code payable. Anything that
  claims on a separate connection re-opens the double-spend window.
- A transfer settled from a QR records `initiated_via = 'QR'`. The receipt's
  channel used to be inferred from the row's shape — joined to a payment link, or
  not — and a QR payment joins none, so it would have been signed as "paid by
  @banza": a proof asserting something the payer did not do.

---

## Future Compatibility

The payload format is designed to be extended:
- Additional fields can be added without breaking existing parsers (JSON is forward-compatible).
- EMVCo-compatible QR can be layered on top of this infrastructure when banking interoperability is required.
