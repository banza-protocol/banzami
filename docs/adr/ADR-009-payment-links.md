# ADR-009 — Payment Links: Shareable URL Commerce Primitive

**Status:** Accepted  
**Date:** 2026-05-13

---

## Context

Angola's informal commerce operates largely through WhatsApp groups, Instagram stories, and direct messages. Merchants list products, buyers respond, and payment is settled via mobile money or cash. There is no universal checkout flow.

Banzami needs a zero-friction payment primitive that:

1. Works without the merchant having a website or app.
2. Works for the customer in any browser, without installing an app.
3. Does not require real-time presence of both parties (unlike QR scanning).
4. Can carry a fixed amount (invoice) or be open (donation/tip).

---

## Decision

**Implement a Payment Links domain as a first-class primitive.**

A payment link is a shareable URL (`https://pay.banzami.org/{slug}`) backed by a `payment_links` record. The merchant creates a link, shares it anywhere, and the customer opens it in a browser to pay.

**Slug format:** First 12 hex characters of a UUID v4 `simple` string.

**Two link types:** fixed-amount (amount locked at creation) and open (customer enters amount).

**Pay page stack:** Next.js 14 App Router (`apps/pay/`) serving the consumer-facing checkout page, polling the api-gateway for status updates, rendering a QR code so mobile users can open the Banzami app.

---

## Rationale

### Why a slug and not a full UUID?

A 12-character hex slug (`a3f7c2d19b40`) is:
- Human-readable in a preview pane before clicking.
- Short enough to type if copy-paste fails.
- Unique enough at expected scale (2^48 space; collision at 1M links ≈ 0.01%).

A full UUID would work but is visually hostile in a WhatsApp message.

### Why not QR-only?

QR codes require a camera scan, which is not possible when sharing a link in text. Payment links degrade gracefully: a customer who cannot scan can type the URL or click the link.

### Why a separate pay page (`apps/pay/`) instead of serving from the API?

The pay page is a consumer-facing product surface — it needs branding, responsive layout, a QR renderer, and polling for status. Serving raw JSON from the API and expecting clients to build this themselves is not viable for the target audience (WhatsApp commerce). A dedicated Next.js app keeps this logic decoupled from the API.

### Why server-side render the initial state?

The merchant's payment description, amount, and status must be visible before JavaScript loads. Server-side rendering (Next.js App Router, `page.tsx`) ensures the page is usable even on slow connections and shows the correct terminal state (USED/EXPIRED/CANCELLED) without a loading flicker.

### Why poll for payment status instead of WebSockets?

The pay page polls `GET /public/pay/{slug}/status` every 3 seconds. The endpoint returns `{ "paid": true/false }`. This is simpler to operate and debug than a WebSocket connection, and the latency (≤3s) is acceptable for a payment confirmation UX.

---

## Consequences

**Positive:**
- Zero friction for merchants: one API call creates a shareable link.
- Customers need no app — any browser suffices.
- Works in all async channels (WhatsApp, SMS, email, QR).
- Open links unlock use cases (donations, tips) that fixed-amount links cannot serve.

**Negative:**
- Open links require consumers to have a registered Banzami account — anonymous payment is not supported in V1.
- Pay page requires a separate domain (`pay.banzami.org`) and TLS certificate.
- Slug enumeration is theoretically possible; rate limiting and monitoring are required controls.

---

## Alternatives Considered

| Option | Rejected Because |
|--------|-----------------|
| Full UUID in URL | Too long for comfortable sharing in chat |
| QR-only payment | Does not work in text channels; requires camera |
| Redirect to existing merchant website | Most merchants have no website |
| Serve pay page from api-gateway | Mixing API concerns with HTML rendering |
| WebSocket for status updates | Operational complexity; polling is sufficient at 3s |
