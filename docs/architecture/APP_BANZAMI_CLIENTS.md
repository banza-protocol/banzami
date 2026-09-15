# App Banzami — clients and environment architecture

Version: 1.0 · WEB-APP-001 (ADR-064)

App Banzami is one Consumer product with three client surfaces. Clients provide
access to the same domain; none is a financial authority.

```
                           Banzami Core
                               │
                            Ledger
                               │
                        Consumer Domain
                (identity · @banza · wallet)
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
       Web                    iOS                  Android
  app.banzami.com        (TestFlight beta)     (Play testing beta)
        │                      │                      │
     BFF (session,             └──────────┬───────────┘
     CSRF, forward)                       │
        │                        Consumer API (public-api)
        └───────────────► sandbox-api.banzami.com/consumer ◄──────┘
```

## Environment boundary

```
                         App Banzami (Web · iOS · Android)
                                    │
                             Consumer domain
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
               SANDBOX                              LIVE
            available today                     future / not enabled
            fictitious value                    regulated, fail-closed
```

Client parity is environment-independent; financial authority is
environment-specific. The Web client selects its environment through
`CONSUMER_API_BASE` (Sandbox today); the backend enforces authority. Sandbox and
Live financial positions are isolated and never cross.

## The Web client (app.banzami.com)

- **BFF**: Next.js route handlers. Holds the Consumer Bearer in an AES-256-GCM
  HttpOnly session cookie (never in the browser). Re-attaches it on every
  Consumer call. Owns session mediation, CSRF and forwarding only.
- **No Web financial endpoints**, no Project keys, no DB write authority.
- **Realtime**: balance and activity are refreshed on focus/visibility and polled
  while visible; the canonical GET is the reconciliation source of truth, so a
  reconnect never duplicates.
- **QR**: the canonical Banzami scheme (`banzami-sandbox:@handle`), byte-identical
  to native, so QRs are scannable across clients.

## Applications built on the Developer Platform

Applications using the Developer API participate through payment resources,
webhooks and Wallet Accounts — they never become Consumer identity providers. A
developer can test the Consumer side of a payment using App Banzami Web (a real
Sandbox Consumer), while the deterministic test payer remains for automated
scenarios.
