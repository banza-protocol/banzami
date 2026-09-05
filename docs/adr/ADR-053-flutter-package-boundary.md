# Banzami ADR-053: What `banzami_flutter` is, and what a published Flutter SDK would be

**Status:** Accepted
**Date:** 2026-09-05
**Related:** CLAUDE.md §13 (SDK-first) · CAP-SDK-002 · Banzami ADR-052

---

## Context

`CAP-SDK-002` records a "Flutter SDK (banzami_flutter)" with the api_surface
`pub banzami_flutter`. pub.dev answers **404** for that name, so the capability
has been held. The obvious reading of the gap is "publish it".

Inspecting the package first says otherwise.

`sdk/flutter` is a **path dependency of Banzami's own mobile applications**:

```yaml
# apps/mobile/pubspec.yaml
banzami_flutter:
  path: ../../sdk/flutter
```

Its 53 source files are the Consumer and Business apps' framework — merchant
onboarding screens, KYB flows, the receive screen, the app theme, activity
models. Its client authenticates **the app's own signed-in user**, with the
session JWT from @handle + PIN login; the `apiKey` field carries the merchant's
own credential, not a third party's.

Its documentation, until this change, opened with
`BanzamiClient(apiKey: 'bz_live_...')` — instructing a developer to compile a
Developer Platform **secret** key into a mobile binary. That key can move money,
and anyone who downloads an app can read its binary.

## Decision

**1 — `banzami_flutter` is not published, and says so.** It is a first-party
application framework. Publishing it would present Banzami's own app internals
as a third-party integration product, and would put a package on pub.dev whose
public surface no integrator needs.

**2 — CAP-SDK-002 names a different package.** It was not held because a publish
step was outstanding; it was held because the package the capability named is not
the product the capability describes. The capability now names
**`banzami_client`** — the purpose-built public client SDK — and is released on
its evidence, not on this one's.

**3 — The published SDK is `banzami_client` (`sdk/dart-client`).** Pure Dart, so
it works in Flutter apps, CLIs and Dart servers. Its credential is a
**publishable** key (`bz_test_pk_…`), which the operator restricts to read
scopes, and its surface is presentation and status only:

```text
  Flutter app ──publishable key──▶ Banzami   read a payment, its status, its QR
       │
       └──────▶ your backend ──secret key──▶ Banzami   create · refund · transfer
```

Anything that moves money stays on a server credential. This is not a Flutter
constraint; it is what "publishable" means.

**4 — The hazard is fixed now, ahead of any packaging decision.** Every entry
point states the boundary, and a test guards it — scoped to *teaching* a secret
key rather than *mentioning* one, since naming a key in order to forbid it is
the opposite of the hazard.

## Outcome (2026-09-05)

`banzami_client` **0.1.0** is published on pub.dev and installs cleanly from a
directory outside every Banzami repository, with no path or git dependency.

The boundary is measured rather than asserted. With a real publishable key
against the deployed Sandbox, the four client-safe reads succeed and **all six**
privileged operations are refused with 403: create a payment, transfer, refund,
open an account, manage webhooks, list the owner's accounts. The constructor
refuses a secret key before any request; three mutations (accepting a secret key,
dropping the deep-link host allow-list, skipping slug validation) each fail the
suite.

`sdk/flutter` carries `publish_to: none`, so the mistake this ADR exists to
prevent is now impossible rather than discouraged.

## Consequences

- `sdk/flutter` keeps serving the mobile apps unchanged; no export was trimmed
  and no app broke.
- The operator gained a real invariant on the way: publishable keys could be
  minted with `transfers:write` and `refunds:write`. Nothing restricted them, and
  the gateway accepts `bz_test_pk_` on those routes — financial write authority
  in an app-store download. Publishable keys are now limited to client-safe
  scopes.
- The external Sandbox launch gate continues to be held by CAP-SDK-002, honestly
  and for a stated reason.
