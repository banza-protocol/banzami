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

**2 — CAP-SDK-002 stays held, and the reason is corrected.** It is not held
because a publish step is outstanding. It is held because the package the
capability names is not the product the capability describes. Marking it
released by publishing this package would be an overclaim with a version number.

**3 — A published Flutter SDK, when it exists, is a different and much smaller
package.** Its credential is a **publishable** key (`bz_test_pk_…`), which the
operator now restricts to read scopes, and its surface is presentation and
status only:

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
