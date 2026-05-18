# ADR-011 — Integration Ecosystem Strategy: v1

**Status:** Accepted  
**Date:** 2026-05-15  
**Extended by:** [ADR-012](ADR-012-sdk-first-ecosystem.md) — mandatory SDK usage for all external integrations

---

## Context

Banzami's financial infrastructure — the Rust ledger, the Go API gateway, the PostgreSQL source of truth — exists to move money correctly and reliably. That infrastructure is necessary but not sufficient. Its strategic value is realized only when developers and merchants can integrate it.

The Angolan payments market has structural barriers that make integration speed a competitive differentiator:

1. **Most businesses have no payment integration at all.** Merchants accept cash or informal bank transfers. The first product that lowers friction enough to change that behavior wins the ecosystem.

2. **Developer tooling in Angola is underdeveloped.** Global payment platforms treat Angolan developers as an afterthought. A well-documented, locally-relevant SDK fills a real gap.

3. **Mobile commerce is primary, not secondary.** Facebook Marketplace, WhatsApp groups, and Instagram are the dominant merchant channels. Payment must work inside those flows — which means QR, payment links, and in-app checkout, not traditional hosted payment pages.

4. **Trust is earned incrementally.** Developers and merchants evaluate platforms by their documentation quality, SDK reliability, and integration speed before they ever go live. The integration experience is therefore a direct sales channel.

At the start of 2026, Banzami had a functional financial core and Go API layer but no systematic integration layer. Each potential merchant required custom implementation work. This ADR defines the strategy to change that.

---

## Decision

**Banzami will build a first-class, production-grade integration ecosystem in parallel with the financial infrastructure.**

The integration ecosystem is not a layer on top of Banzami — it IS Banzami from the merchant's and developer's perspective. Every SDK, plugin, and checkout interface is treated as production infrastructure, held to the same engineering standards as the Rust ledger.

The v1 ecosystem consists of six layers, each with a defined priority:

| Layer | Component | Location | Priority |
|-------|-----------|----------|----------|
| Mobile SDK | Flutter SDK | `sdk/flutter/` | CRITICAL |
| Web/Backend SDK | TypeScript SDK | `sdk/typescript/` | CRITICAL |
| Python SDK | Python SDK | `sdk/python/` | HIGH |
| Commerce plugin | WooCommerce | `plugins/woocommerce/` | CRITICAL |
| Hosted checkout | Checkout app | `apps/checkout/` | CRITICAL |
| API layer | REST API + OpenAPI | `docs/api/` | CRITICAL |

---

## Rationale

### Why integration experience is the primary strategic asset

Financial infrastructure is a commodity in a mature market. In an emerging market like Angola, the infrastructure itself is the differentiator today — but that window is short. Within 18–36 months, the real differentiator will be ecosystem size: how many merchants are live, how many developers know the API, how many platforms have plugins.

Ecosystem size compounds. A merchant using Banzami trains their developers to use Banzami. Those developers take that knowledge to their next client. A WooCommerce plugin installed by one merchant becomes a template for hundreds of others. The integration ecosystem is the primary growth mechanism.

### Why QR is the strategic core of the integration layer

QR payment is the natural payment modality for Angola's market:

- It works offline (merchant's device shows QR; payer's app scans it)
- It requires no card infrastructure
- It is already familiar from WhatsApp QR codes and other regional apps
- It collapses the payment flow to two steps: scan → confirm

Every integration point — SDKs, checkout, WooCommerce, payment links — must treat QR as a first-class primitive, not a feature added later.

### Why Flutter is CRITICAL

The primary Banzami user interface is mobile. The Flutter SDK is not a convenience wrapper — it is the runtime that merchants and consumers interact with. It must include reusable widgets, payment sheets, QR generation and scanning, and the full transfer and wallet UX. Building it to production quality is equivalent to building a mobile operating system for Angolan commerce.

### Why TypeScript is CRITICAL

TypeScript is the language of the Angolan developer who builds web backends, Next.js storefronts, and SaaS products. It is the highest-volume SDK by expected integration count. It must be SSR-safe, browser-safe, ESM- and CJS-compatible, and fully typed. The ergonomics must match Stripe's TypeScript SDK — that is the competitive benchmark.

### Why Python is HIGH (not CRITICAL)

Python has significant strategic importance for Django backends, FastAPI microservices, ERP integrations, and data tooling in enterprise contexts. However, the volume of Python integrations in the Angolan SME market is lower than Flutter or TypeScript in the near term. It is therefore HIGH priority but not a v1 blocker.

### Why WooCommerce before Shopify

WordPress + WooCommerce is the dominant CMS/commerce stack for Angolan SME websites. Shopify's penetration in the Angolan market is minimal — its pricing model is poorly suited to AOA-denominated businesses. A WooCommerce plugin reaches the largest addressable merchant audience immediately. Shopify is deferred to a future roadmap item.

### Why the hosted checkout is infrastructure, not a frontend

`apps/checkout/` is not a marketing page. It is the universal payment interface for:
- Payment links shared over WhatsApp
- QR codes displayed at physical merchant locations
- Social commerce (Instagram, Facebook)
- Merchants who cannot or will not build their own checkout

Every payment link points to this app. Its reliability, load speed, and trustworthiness directly affect payment conversion rate. A slow or ugly checkout page causes transaction failures. It must be treated as core payment infrastructure.

---

## Implementation Requirements

### All SDKs must implement

1. **Retry with exponential backoff** — 500 ms base, doubles each attempt, max 3 retries by default. Retry only on: `429`, `502`, `503`, `504`.
2. **Idempotency keys** — auto-generated on every POST, generated once before the first attempt, reused across all retries.
3. **Clean exception hierarchy** — no raw HTTP errors leak to SDK callers.
4. **Typed response models** — every response is a typed model (Pydantic in Python, TypeScript interfaces with generics, Dart classes in Flutter).
5. **Webhook signature verification** — HMAC-SHA256 with constant-time comparison.
6. **Observability hooks** — `onRequest`, `onResponse`, `onError` callbacks (or equivalent for the language) with zero overhead when unused.
7. **Examples** — at least three realistic examples per SDK.
8. **CHANGELOG** — follows Keep a Changelog format.

### Design system compliance

All consumer-facing UI (checkout app, Flutter SDK widgets, WooCommerce plugin) must use the official Banzami design system:

| Token | Value |
|-------|-------|
| Primary | `#990011` |
| Wine Rose | `#A63A50` |
| Savanna Gold | `#C89B3C` |
| Background | `#FCF6F5` |
| Text Primary | `#1A1A1A` |

---

## Alternatives Considered

### Wait until financial core is "complete" before building SDKs

Rejected. Financial infrastructure is never complete. SDKs built while the API is still evolving are a forcing function for API quality — they expose ergonomic problems that internal tests miss. Building in parallel reduces total time-to-market.

### Build one universal SDK (JavaScript only)

Rejected. A JavaScript SDK cannot serve Flutter mobile apps, Python ERP systems, or PHP WordPress plugins. Each runtime has fundamentally different concurrency models, packaging systems, and ergonomic expectations. A forced universal layer would be poor in all of them.

### Third-party SDK on top of raw REST

Rejected. Third-party SDKs reflect third-party priorities. They will not track API changes, will not implement Banzami-specific retry semantics (especially the idempotency-across-retries requirement), and will not carry the Banzami brand. First-party SDKs are a trust signal.

### Shopify over WooCommerce

Rejected. See rationale above. Shopify's market penetration in Angola is not sufficient to justify the development investment in v1.

---

## Consequences

### Positive

- Merchants and developers can integrate Banzami independently, without Banzami engineering involvement.
- Ecosystem compounds: each integration increases visibility for the next.
- API quality improves because SDK development surfaces ergonomic problems early.
- WooCommerce plugin reaches SME merchants who have no engineering team.
- Python SDK reaches enterprise and ERP markets that Flutter and TypeScript do not.
- Hosted checkout enables WhatsApp and social commerce without merchant-side development.

### Negative and tradeoffs

- Maintaining multiple SDKs across five languages/platforms requires ongoing investment. Each API change must be reflected in all SDKs simultaneously.
- SDK quality creates expectations. A developer who finds a bug in the SDK loses trust in the financial platform. SDK quality must therefore be held to the same standard as the core API — there is no "good enough" for an SDK used in financial applications.
- The WooCommerce plugin requires WordPress expertise that is peripheral to the core engineering team's skill set.

### Ongoing obligations

- Every public API change must update all affected SDKs in the same release cycle.
- SDKs must ship changelogs with every version increment.
- Example code must be kept working — broken examples are treated as bugs.
- The design system must remain consistent across all consumer-facing SDK widgets and the checkout app.

---

## References

- [ADR-006 — QR Payment System](ADR-006-qr-payment-system.md)
- [ADR-007 — Flutter SDK Architecture](ADR-007-flutter-sdk-architecture.md)
- [ADR-009 — Payment Links](ADR-009-payment-links.md)
- [Integration Ecosystem Strategy Reference](../architecture/integration-ecosystem.md)
- [Banzami Engineering Constitution](../../CLAUDE.md)
