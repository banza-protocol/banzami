# Doa × Banzami — Security

Security architecture for the Banzami payment integration: secret management, webhook verification, replay protection, environment isolation, and logging rules.

---

## Threat Model

The Doa × Banzami integration faces three primary threat surfaces:

| Surface | Risk | Mitigation |
|---------|------|------------|
| Webhook endpoint | Forged events triggering fraudulent confirmations | HMAC-SHA256 signature verification on every request |
| Credential exposure | API key or webhook secret leaking to client | `import 'server-only'` + server-only env vars |
| Replay attacks | Captured webhook replayed hours later | 5-minute timestamp tolerance window |

---

## Secret Management

Banzami integration uses three secrets:

| Secret | Variable | Where stored |
|--------|----------|-------------|
| API key | `BANZAMI_API_KEY` | Server-only environment — never in browser |
| Webhook signing secret | `BANZAMI_WEBHOOK_SECRET` | Server-only environment — never in browser |
| Banzami JWT | Ephemeral — not stored | In-memory per request, obtained fresh each call |

**Server-only enforcement**: Both `lib/payments/providers/banzami.ts` and `app/api/donations/banzami-status/route.ts` begin with:

```typescript
import 'server-only';
```

This is a Next.js build-time compiler directive. Importing either file from a `'use client'` component causes the build to fail with an explicit error. Credentials in these modules are unreachable from the browser by construction — not just by convention.

**What reaches the browser**: Only the pay URL (`https://pay.banzami.org/{slug}`) and link ID. The pay URL is the public interaction surface — it is intended to be shared with the donor.

---

## Webhook Signature Verification

Every inbound webhook request must pass HMAC-SHA256 verification before any payload is processed.

### Signature Header Format

```
Banza-Signature: t=1716033007,v1=a1b2c3d4e5f6...
```

| Component | Description |
|-----------|-------------|
| `t` | Unix timestamp (seconds) when Banzami computed the signature |
| `v1` | Hex-encoded HMAC-SHA256 of `"{t}.{raw_body}"` using the endpoint secret |

### HMAC Input Construction

```
HMAC input = "{unix_timestamp}." + raw_body_bytes
```

The timestamp prefix ensures the same payload sent at different times produces different signatures. An attacker who captures a valid delivery cannot replay it — the signature is bound to the delivery time.

### Verification Implementation

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

function verifySignature(
  header: string,
  rawBody: string,
): { ok: true } | { ok: false; reason: string } {
  if (!WEBHOOK_SECRET) return { ok: false, reason: 'secret not configured' };

  let ts = 0;
  let v1 = '';
  for (const part of header.split(',')) {
    const eq = part.trim().indexOf('=');
    if (eq === -1) continue;
    const k = part.trim().slice(0, eq);
    const v = part.trim().slice(eq + 1);
    if (k === 't') ts = parseInt(v, 10);
    if (k === 'v1') v1 = v;
  }
  if (!ts || !v1) return { ok: false, reason: 'malformed header' };

  const age = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (age > 300) return { ok: false, reason: 'timestamp outside tolerance window' };

  const mac = createHmac('sha256', WEBHOOK_SECRET);
  mac.update(`${ts}.`);
  mac.update(rawBody);
  const expected = mac.digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}
```

### Why `timingSafeEqual`

A naive string comparison (`expected === v1`) is vulnerable to timing side-channels: it returns early when bytes differ, leaking how many bytes match. An attacker who can send many requests and measure response times can learn the expected signature one byte at a time.

`crypto.timingSafeEqual` runs in constant time regardless of where the buffers differ — the comparison time is always proportional to buffer length, not to the number of matching bytes.

### Raw Body Requirement

The raw request body must be read and verified **before any JSON parsing**:

```typescript
const raw = await req.text();          // ← correct
const verification = verifySignature(sigHeader, raw);
if (!verification.ok) { return 401; }

const payload = JSON.parse(raw);       // ← parse AFTER verification
```

**Why not `req.json()` first?** JSON parsing normalizes the byte sequence — it may remove insignificant whitespace, reorder keys (in some parsers), or change number representations. The verified signature was computed over Banzami's original byte sequence. Re-serializing a parsed object produces a different byte sequence, invalidating the HMAC.

---

## Replay Attack Prevention

The 5-minute tolerance window (`|now - t| ≤ 300 seconds`) limits the replay window:

- An attacker who captures a valid webhook delivery cannot replay it more than 5 minutes later.
- Legitimate retries from Banzami (up to 2 hours after the first attempt) use fresh timestamps and recompute the signature — they are not replays.
- Clock skew between Banzami and Doa's server is tolerated within the window. 5 minutes is standard for webhook implementations (used by Stripe, PayPal, and others).

**Duplicate event handling**: Replay prevention operates at the transport layer. Idempotency at the application layer (`applyPaymentEvent()` dedup on `(intent_id, event_type, provider_ref)`) handles the case where the same event is legitimately delivered twice within the tolerance window.

---

## Environment Isolation

A `bz_test_` API key cannot be used against the live gateway, and vice versa. This is enforced by Banzami's infrastructure — not a convention.

| Scenario | Outcome |
|----------|---------|
| `bz_test_` key → `api.banzami.org` | `403 SANDBOX_KEY_REJECTED` |
| `bz_live_` key → `sandbox-api.banzami.org` | `403 LIVE_ONLY` |
| Sandbox payment link in live Banza app | Link marked as environment-incompatible |
| Sandbox webhook → live endpoint | Banzami filters at dispatch — never delivered |

Doa's visual SANDBOX badge reinforces this — it makes environment mismatches immediately visible during development and QA. The badge is driven by the key prefix and disappears automatically when the live key is set.

---

## HTTPS Enforcement

The webhook endpoint must be served over HTTPS. Banzami rejects endpoint registration for HTTP URLs (non-`https://` URLs return a validation error at registration time).

In production (`doadoa.app`):
- All traffic is HTTPS via the hosting provider (Vercel/Cloudflare)
- HSTS headers prevent protocol downgrade attacks

For local development, use ngrok or cloudflared — both provide HTTPS tunnels. Do not expose a plain HTTP webhook endpoint to Banzami even in sandbox.

---

## Authorization

The webhook route at `POST /api/webhooks/banzami` relies entirely on the HMAC signature for authorization. There is no additional API key check, no IP allowlist, and no session requirement.

**Why no IP allowlist**: Banzami does not publish a stable IP range for webhook delivery. Adding an allowlist would require manual maintenance and could cause outages during Banzami infrastructure changes.

**Why no API key on the endpoint**: The webhook receiver is public — Banzami sends to it without any prior authentication. The HMAC signature serves as the authentication mechanism. This is the standard webhook security pattern used across the industry.

---

## Webhook Secret Rotation

If the webhook secret is compromised:

1. Register a new endpoint with Banzami → receive a new `whsec_...`
2. Deactivate the old endpoint via the Banzami dashboard
3. Update `BANZAMI_WEBHOOK_SECRET` in the server environment
4. Restart the Doa server

During the transition window between steps 2 and 4, webhooks may fail verification if delivered with the old secret. Since Banzami retries, these events are not lost — they retry after the new secret is in place.

---

## Logging Rules

### Log at webhook receipt

```typescript
console.log('banzami_webhook_received', { type: payload.type, event_id: payload.id });
```

### Log on success

```typescript
console.log('banzami_webhook_ok', { intent_id, deduped: result.deduped });
```

### Log on verification failure

```typescript
console.warn('banzami_webhook_rejected', { reason: verification.reason });
```

### What NOT to log

| Data | Reason |
|------|--------|
| `BANZAMI_API_KEY` | Credential — never log |
| `BANZAMI_WEBHOOK_SECRET` | Credential — never log |
| Full webhook payload body | May contain PII (phone numbers, wallet IDs) |
| Bearer JWT | Ephemeral credential — never log |
| Donor identity fields (name, phone, email) | PII — log intent_id only for correlation |

Log the minimum needed to diagnose issues: event type, event ID, intent ID, and boolean outcomes. Avoid logging full request/response bodies.

---

## PCI-Conscious Practices

Banza QR payments do not involve card data. The Doa integration handles only:
- Payment amounts (integer centavos)
- Banzami payment link IDs
- Donor intent IDs (Doa-internal UUIDs)

No card numbers, CVVs, or magnetic stripe data are processed or stored. The Banzami consumer app handles cardholder interaction and transmits card data directly to Banzami's PCI-compliant infrastructure — Doa is not in the card data flow.

This significantly reduces Doa's PCI compliance scope. However, Doa still handles financial event records and donor identity data, which require appropriate data protection controls (encryption at rest, access controls, audit logging).

---

## Webhook Endpoint Isolation

The webhook handler is isolated from the donation flow's authentication:

- No session cookie is required
- No CSRF token is required (CSRF attacks require a browser session)
- No user-facing auth middleware runs on the webhook path

Banzami-initiated requests do not originate from a browser — CSRF protections are irrelevant. The HMAC signature is the complete authentication mechanism.

If Doa's API routes have global auth middleware (e.g., checking for a session cookie on all `/api/*` routes), the webhook route must be explicitly excluded.
