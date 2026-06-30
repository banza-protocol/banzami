# QR / Deep-link Scheme Contract (operator)

> Version: 1.0

This is the **single source of truth** for the URI schemes Banzami emits and parses.
The structured payment *payload* format (`base64url(JSON {"t":"S"|"D",…})`) is a
**BANZA protocol contract** owned by `~/banza`; this document covers the
operator-side URI schemes and deep links, and how drift is prevented.

## Why this exists

A generator once emitted one format while the parser expected another (the
`banza`→`banzami` rename drift, f765113a), silently breaking scan-to-pay. The fix is
structural: **one definition, consumed by every generator and the parser.**

## Schemes

| Kind | Scheme | Emit? |
|------|--------|-------|
| Live (canonical) | `banzami` | ✅ emit |
| Sandbox (canonical) | `banzami-sandbox` | ✅ emit |
| Live (legacy) | `banza` | read-only (never emit) |
| Sandbox (legacy) | `banza-sandbox` | read-only (never emit) |

Rules: sandbox never emits a live scheme and live never emits a sandbox scheme;
legacy schemes are accepted on read so already-printed QRs keep resolving, but are
never emitted.

## Formats

| Form | Example | Builder |
|------|---------|---------|
| Handle (P2P) | `banzami:@fm65` | `BanzamiQrScheme.handle(h, isSandbox:)` |
| Payment request | `banzami://pay?request=CODE` | `BanzamiQrScheme.paymentRequest(c, isSandbox:)` |
| Payment link | `banzami://pay/link/SLUG` | `BanzamiQrScheme.payLink(slug)` |
| Split session | `banzami://pay/split/ID` | `BanzamiQrScheme.split(id)` (matches core) |
| Structured QR | `base64url(JSON {"t":"S"\|"D",…})` | core `qr/engine.rs` (BANZA payload contract) |
| Web pay URL | `https://pay.banzami.com/{r,u,pay,slug}` | pay app |

## Single sources of truth (per ecosystem)

- **Dart (SDK + app):** `sdk/flutter/lib/utils/qr_scheme.dart` — `BanzamiQrScheme`
  defines the schemes + builders; `qr_parser.dart` derives its accepted prefixes
  from the same constants; the scanner delegates entirely to the parser (no private
  allow-list).
- **TypeScript (Checkout):** `sdk/checkout-web/src/qrScheme.ts` mirrors it; `modal.ts`
  builds its deep link through `BanzamiQrScheme.payLink`.
- **Rust (core):** owns the structured payload (`core/qr/src/engine.rs`) and emits
  the split deep link (`core/api/src/routes/splits.rs`), matching the form above.

## Anti-drift guarantee

`sdk/flutter/test/qr_parser_test.dart` round-trips **every** `BanzamiQrScheme`
builder output through the parser and asserts the correct type + environment, and
asserts no builder ever emits a legacy scheme. If a generator and the parser drift,
a test fails — the drift cannot ship.

## Validation behaviour

Malformed / oversized (>512 chars) / unknown / empty inputs resolve to
`BanzamiQrInvalid` (a safe error surfaced as a toast) — never a thrown exception and
never a payment before validation. Expiry, HMAC integrity and single-use are enforced
by the core when settling a structured/dynamic QR (Progressive-KYC + compliance gate
run before any money moves).
