# ADR-012 — SDK-First Ecosystem: Mandatory SDK Usage for All External Integrations

**Status:** Accepted  
**Date:** 2026-05-18  
**Supersedes:** None  
**Amends:** [ADR-011](ADR-011-integration-ecosystem-strategy.md) (extends with mandatory SDK requirement)

---

## Context

ADR-011 established the Banza integration ecosystem: SDKs, plugins, adapters, and reference implementations as first-class platform infrastructure. The ecosystem was built and partially deployed.

As the first reference integration matured — DOA, the canonical merchant example — a pattern emerged: the initial DOA integration used direct `fetch()` calls rather than the TypeScript SDK. This was pragmatic at the time (SDK was not yet production-ready when DOA integration began), but it created a problem:

**Official examples that bypass the SDK layer send the wrong signal to developers.**

If the canonical reference implementation uses raw HTTP, merchants will:
- copy that pattern for their own integrations,
- implement idempotency manually (and incorrectly),
- implement webhook verification manually (with subtler bugs),
- miss retry handling,
- handle errors inconsistently,
- and create a long-tail of bespoke integrations Banza cannot maintain or guarantee.

The SDK exists to prevent exactly these failure modes. If official examples don't use it, the SDK becomes optional infrastructure that nobody uses.

Additionally, as the ecosystem grows beyond Angola into broader African markets, the surface area for integration bugs scales. SDK standardization is the only scalable solution.

---

## Decision

**Banza is officially an SDK-first ecosystem.**

All external applications integrating Banza MUST use an official Banza SDK.

Direct HTTP integrations using `fetch()`, `axios()`, `requests()`, `curl` wrappers, or handcrafted API clients are NOT the recommended integration path and MUST NOT be used in official examples.

This applies to:
- official examples,
- demos,
- merchant integrations,
- documentation,
- showcase applications,
- reference implementations,
- plugins,
- templates,
- and tutorials.

The Banza TypeScript SDK, PHP SDK, Python SDK, Flutter SDK, and other official SDKs are not optional helper libraries. They are:
- security boundaries,
- DX infrastructure,
- payment orchestration layers,
- compatibility layers,
- and ecosystem standardization tools.

---

## Rationale

### 1. The SDK provides correctness guarantees that raw HTTP cannot

Manual integrations require developers to implement:

| Concern | Manual implementation | SDK |
|---------|----------------------|-----|
| Idempotency key generation and reuse | Error-prone — keys often regenerated per retry | Automatic — generated before first attempt, reused across retries |
| Webhook signature verification | `timingSafeEqual` required but often skipped | Built-in — correct by default |
| Exponential backoff on 429/5xx | Rarely implemented correctly | Built-in — 500ms base, 3× max retries |
| Environment routing | Must check key prefix and switch URLs manually | Automatic — key prefix drives routing |
| Error handling | Raw HTTP status codes require manual mapping | Typed exception hierarchy |
| Typed responses | Manual `as SomeType` casts | Compile-time checked models |

Every one of these is a class of bug that has been observed in merchant integrations in other ecosystems. The SDK eliminates all of them.

### 2. Official examples define ecosystem conventions

Developers study reference implementations and replicate their patterns. If the canonical example uses raw `fetch()`:
- the community adopts raw `fetch()`,
- idiosyncratic implementations proliferate,
- support load increases because integrations vary wildly,
- and the SDK's existence becomes incoherent.

The reference implementation must be the implementation developers should copy.

### 3. SDK-first enables ecosystem evolution

When the Banza API changes (new endpoint version, deprecation, breaking change), SDK users receive compatibility through a library update. Raw HTTP users must find and patch every integration manually.

SDK-first creates an upgrade path. Direct HTTP does not.

### 4. Security is harder to get right manually

The webhook verification pattern (HMAC-SHA256 + `timingSafeEqual` + replay window) has specific correctness requirements. Every component that gets it wrong — variable-time comparison, body read as JSON before verification, missing replay check — creates a real attack surface.

The SDK gets this right once, for everyone. Individual developers should not be implementing constant-time comparisons.

---

## Consequences

### Immediate

1. **DOA must migrate to the TypeScript SDK.** The current fetch()-based implementation is explicitly designated transitional. DOA is the canonical reference implementation and cannot remain inconsistent with the ecosystem mandate.

2. **Documentation must update.** All integration documentation must present SDK usage as the primary path. Raw HTTP examples are relegated to low-level API reference and advanced debugging sections.

3. **CLAUDE.md updated.** SDK-first is added as section 14 of the Engineering Constitution.

4. **SDK completeness is now critical-path.** If a required SDK is missing or incomplete, integrations must wait for the SDK rather than proceed with raw HTTP. This makes SDK quality a platform-blocking concern.

### SDK v1 Requirements

The following SDKs are mandatory before the v1 ecosystem is considered complete:

**Server-side:**
- TypeScript / Node.js SDK
- PHP SDK
- Python SDK
- Go SDK

**Client-side:**
- Flutter SDK
- JavaScript Browser SDK

**Future:**
- Laravel package
- WordPress / WooCommerce plugin
- Android native SDK
- iOS native SDK

### Allowed Exceptions

Raw HTTP integration is permitted in:
- **Low-level API reference documentation** — showing the actual HTTP request/response format
- **SDK implementation code itself** — the SDK must make HTTP calls
- **Advanced debugging** — developers tracing raw requests to diagnose issues
- **Internal Banza services** — Go services calling the Rust core over loopback are not external integrations
- **Public unauthenticated endpoints** — payment link status polling (`GET /public/pay/{slug}/status`), QR payload display, health checks
- **Browser-side checkout UI** — the `@banzami/checkout-js` browser SDK handles frontend flows using only publishable endpoints; no secret keys involved
- **WooCommerce/WordPress frontend polling** — same restriction as browser checkout

### Platform Stabilization Phase (2026-05-18)

A full SDK ecosystem audit identified critical defects in the webhook signature implementation across both the TypeScript and Python SDKs. These defects were blocking production:

| Defect | Impact |
|--------|--------|
| Python SDK: wrong header (`Banza-Signature` vs `Banza-Signature`) | Verification always fails |
| Python SDK: no timestamp in HMAC (`body_only` vs `"{ts}.{body}"`) | Signatures never match gateway |
| TypeScript SDK: missing webhook module entirely | No `constructEvent()` API |
| TypeScript SDK example: same wrong format + wrong event type | Examples corrupt merchant implementations |

Remediation implemented in this phase:
1. **Canonical webhook signature spec** created at `docs/standards/webhook-signature-spec.md` — single source of truth for all SDKs
2. **Python SDK** `signature.py` rewritten with correct format; all tests rewritten to validate correct contract
3. **TypeScript SDK** `webhooks.ts` created with `constructEvent()`, `verifySignature()`, `generateTestSignature()`, `generateTestEvent()`
4. **TypeScript SDK example** corrected with right header name, format, and event types
5. **Go SDK scaffold** created at `sdk/go/` — webhook verification matches canonical Go signer exactly
6. **Cross-SDK certification suite** created at `sdk-certification/` with golden test vectors that all SDKs must pass
7. **Dashboard** `apps/dashboard/lib/api.ts` migrated to use `@banza/sdk` `BanzaClient` internally

---

## Alternatives Considered

### "Allow both and let developers choose"

Rejected. Official examples must represent one canonical approach. Showing two approaches ("use the SDK or do it yourself") creates ambiguity and ensures the direct HTTP path lives on indefinitely.

### "Just document the SDK, but keep DOA as direct HTTP"

Rejected. DOA is the reference implementation. Its implementation pattern IS the recommendation. Inconsistency between documentation ("use the SDK") and the canonical example ("here's how we did it with fetch") teaches developers to ignore the SDK.

### "Defer until DOA migration is done"

Rejected. The policy must be established before the migration, not after. The ADR captures the decision that drives the migration, not a retrospective record of it.

---

## Tradeoffs

| Benefit | Cost |
|---------|------|
| Consistent, correct integrations | SDK must exist and be high quality before integrations proceed |
| Ecosystem maintainability | Migration cost for DOA and any other existing raw HTTP integrations |
| Security correctness by default | SDK development is prioritized over raw integration speed |
| Developer experience comparable to Stripe/Supabase | Ongoing SDK maintenance burden |
| Upgrade path for API evolution | SDKs must publish breaking-change policies and changelogs |

The cost column is real but bounded. The benefit column compounds indefinitely with ecosystem size.

---

## Implementation Notes

### DOA Migration Path

DOA's direct HTTP integration is in:
- `lib/payments/providers/banzami.ts` — payment link creation, auth
- `app/api/donations/banzami-status/route.ts` — payment link status check

Migration replaces these with:
```typescript
import Banzami from '@banza/sdk';

const banzami = new Banzami({ apiKey: process.env.BANZAMI_API_KEY });
```

Idempotency, retries, error handling, environment routing — all move into the SDK.

The webhook route (`app/api/webhooks/banzami/route.ts`) replaces the manual `verifySignature()` function with:
```typescript
const event = await banzami.webhooks.constructEvent(rawBody, sigHeader);
```

### SDK Design Target

The SDK experience must match or exceed:
- Stripe's Node.js SDK (typed events, webhook construction, idempotency)
- Supabase SDK (environment-aware, minimal configuration)
- Firebase SDK (platform-specific initialization)

The integration from a developer's perspective:
```typescript
// Initialize (once, in environment config)
const banzami = new Banzami({ apiKey: process.env.BANZAMI_API_KEY });
// banzami.isSandbox → true if bz_test_ key

// Create payment link
const link = await banzami.paymentLinks.create({
  merchantId: MERCHANT_ID,
  walletId:   WALLET_ID,
  amount:     { minor: 150000, currency: 'AOA' },
  description: `DOA-${intentId.slice(0, 8).toUpperCase()}`,
});

// Verify webhook
const event = await banzami.webhooks.constructEvent(rawBody, sigHeader);
if (event.type === 'payment_link.paid') { ... }
```

The key principle: **minimum configuration, maximum correctness.**
