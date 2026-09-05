# Changelog

## 0.1.0 — 2026-09-05

First public release.

The Banzami **client** SDK: present a hosted checkout your server created, watch
whether it has been paid, and handle Banzami links and QR codes.

### Added

- `BanzamiClient` — publishable-key client for client-safe reads.
  - `identity()` · `resolveHandle()` · `checkout()` · `checkoutStatus()`
  - `waitUntilPaid()` — polling that tolerates a dropped request, because a
    payer on a phone will drop one and giving up would report an unpaid payment
    that is actually paid.
  - `checkoutUrl()` — the hosted checkout URL to open.
- `BanzamiLinks` — validate and extract a payment slug from a link or QR.
  Refuses look-alike hosts: a deep link is attacker-reachable on mobile and a QR
  is whatever the camera saw, so both are untrusted input.
- Typed errors, so an app deciding whether to retry does not have to read a
  message.
- `BanzamiEnvironment` — sandbox works; a live client throws while Banzami LIVE
  is unreleased, rather than failing later in a way that looks like a network
  problem.

### Security boundary

A **secret** key is refused by the constructor. Anyone who downloads an app can
read what was compiled into it, and a secret key can move money. Creating a
payment, refunding, transferring, opening an account and managing webhooks all
need a secret key and belong on a server; the operator refuses a publishable key
on those routes, verified against the deployed Sandbox.

### Not this package

`banzami_flutter` is Banzami's own first-party application framework and is not
published. For the server side, use `@banzami/sdk` (TypeScript).
