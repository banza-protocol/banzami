# Firebase client keys — inventory, what was tested, what must be applied

Date: 2026-09-08 · Project `banzami` (number 473654224852)

**Verdict: the two keys are Firebase client keys, public by design, and grant
access to nothing today. Not a release blocker.** What is warranted, and is
recorded here as an ordinary hardening action rather than a gate, is an **API
restriction** limiting each key to the three Firebase APIs the applications
actually use. The four GitHub alerts are correct detections of a public-by-
construction credential class — see the last section.

## Inventory — there are TWO keys, not four

This corrects the earlier reading of this file. GitHub raises four alerts
because the same two keys appear in several files; the project has one Android
key and one iOS key, each shared across both applications.

Values are never printed here. `keyhash` is `sha256(key)[0:12]`, enough to prove
two files carry the same key and useless for anything else.

| Key | `keyhash` | Platform | Files | Identities it must serve |
|---|---|---|---|---|
| **A** | `a2626d564b36` | Android | `apps/mobile/android/app/src/consumer/google-services.json`, `apps/mobile/android/app/src/merchant/google-services.json` | `com.banzami.consumer` **and** `com.banzami.merchant` |
| **B** | `83f573718a5b` | iOS | `apps/mobile/ios/config/consumer/GoogleService-Info.plist`, `apps/mobile/ios/config/merchant/GoogleService-Info.plist`, `apps/mobile/ios/Runner/GoogleService-Info.plist` | bundles `com.banzami.consumer` and `com.banzami.merchant` |

**This changes the restriction, and getting it wrong breaks an app.** Key A is
one key serving two packages, so its Android restriction must list *both* — an
entry for only one package silently kills the other. The same holds for key B
and the two bundles.

`apps/mobile/ios/Runner/GoogleService-Info.plist` is a duplicate of the consumer
config: same bundle, same app id, same key.

There is no web key. Nothing in the repository ships a Firebase web config, so
no HTTP-referrer restriction applies to anything.

Firebase app ids, for identifying the entries in the console:

    iOS consumer   1:473654224852:ios:3bd11ef959177de9561841
    iOS merchant   1:473654224852:ios:c476db04a193ec08561841

No `oauth_client` block exists in either `google-services.json`, which is why no
SHA-1 is recorded in the repository — see the fingerprints section below.

## What the app actually uses

`apps/mobile/pubspec.yaml` declares exactly three Firebase packages:

    firebase_core        ^3.8.0
    firebase_messaging   ^15.1.4
    firebase_crashlytics ^4.3.0

Dart source references only `FirebaseMessaging.instance` and
`FirebaseCrashlytics.instance`. **No Firestore, no Realtime Database, no
Firebase Storage, no Firebase Auth.**

## Negative test — possession of the key, unauthenticated

| Probe | Result | Meaning |
|---|---|---|
| Firestore documents | `404` | no `(default)` database exists — a provisioned but locked one answers `403 PERMISSION_DENIED` |
| Realtime Database, two regions | `404` | no instance |
| Storage bucket listing | `404` | not exposed |
| Identity Toolkit sign-in | `400 CONFIGURATION_NOT_FOUND` | Firebase Auth is not configured, so no account can be created |

**Holding the key grants access to nothing, because none of those products exist
in this project.** That is the substantive answer to "is the published key an
exposure": no.

## What restriction the keys carry today — probed, not assumed

An earlier revision of this file called the keys "unrestricted" and recorded
**FAIL**, on the strength of one probe: a bare installations call, carrying no
`X-Android-Package` and no `X-Android-Cert`, was accepted and registered an
installation.

That probe is real and its result stands. What was wrong was the conclusion
drawn from it. It measures the **application** restriction — whether the key
demands proof of which app is calling — and a Firebase client key ships inside
the application binary and inside this repository *by design*. Every Android
APK on every device carries it in the clear. Treating "someone without the app
can use it" as a release blocker measures a property the key never had.

The question that actually bounds exposure is the **API** restriction: which
Google APIs this key is permitted to reach at all. That was probed directly, by
calling APIs the application does not use and reading which layer answers.

| API called with the key | Used by the app? | Key A `a2626d564b36` | Key B `83f573718a5b` |
|---|---|---|---|
| Identity Toolkit `accounts:signUp` | no | `400 CONFIGURATION_NOT_FOUND` | `400 CONFIGURATION_NOT_FOUND` |
| Secure Token `v1/token` | no | `400 MISSING_GRANT_TYPE` | `400 MISSING_GRANT_TYPE` |
| Remote Config `namespaces/firebase:fetch` | no | `400 INVALID_ARGUMENT` | `400 INVALID_ARGUMENT` |
| Firebase Installations | yes | `400 INVALID_ARGUMENT` | `400 INVALID_ARGUMENT` |

**Read the layer that answered, not the status code.** Every one of those is the
target API's *own* application-level complaint about an empty request body — the
call reached the service. A key carrying an API restriction that omits the
service answers `403 API_KEY_SERVICE_BLOCKED` ("Requests to this API … are
blocked") *before* the service ever sees the request. No probe produced that.

**Conclusion: neither key carries an API restriction today.** Three APIs the
application does not use are reachable with a published key.

### What that does and does not expose

The management plane is closed structurally, not by configuration:

    firebase.googleapis.com   (project management)   401 "API keys are not
    cloudresourcemanager.googleapis.com               supported by this API"

An API key cannot reach project administration at all, whatever its
restrictions. And the data products remain absent — Firestore, Realtime
Database and Storage answer `404` because they do not exist in this project.

So the exposure today is **inert**, and one thing is worth naming precisely
because it is the part that can stop being inert without anyone touching a key:

> Identity Toolkit and Secure Token are **enabled** on the project and reachable
> with the published key. They do nothing today only because no Auth provider is
> configured — that is what `CONFIGURATION_NOT_FOUND` means. On the day someone
> enables a sign-in provider in this project, the key already in every published
> APK can create accounts and mint tokens. Nothing would need to leak.

That is the real argument for an API restriction, and it is an argument about
reachable surface — not about making an unidentified request return `403`.

**Status: the keys are public by design and currently harmless. Restricting them
by API is warranted and is not a release blocker.**

## Exact human actions

Google Cloud Console → project `banzami` → **APIs & Services → Credentials**.

### 1 · API restrictions — the action that matters

For **each** of the two keys: open it, choose **Restrict key**, and select only:

| API | Why |
|---|---|
| **Firebase Installations API** | every Firebase SDK registers an app instance through it |
| **Firebase Cloud Messaging API** (and *FCM Registration API* if listed separately) | `firebase_messaging` |
| **Firebase Crashlytics API** | `firebase_crashlytics` |

Nothing else. The list is derived from dependencies, which is authoritative —
the app can only call what its SDKs call. `apps/mobile/pubspec.yaml` declares
exactly `firebase_core`, `firebase_messaging`, `firebase_crashlytics`; the lock
file adds no other Firebase package; Dart source references only
`FirebaseMessaging.instance` and `FirebaseCrashlytics.instance`. So no Remote
Config, no Analytics, no Auth.

This is safe to apply to a working configuration: it removes reach the
application never uses. It also closes the one surface named above — after it,
enabling a sign-in provider later can no longer make the published key useful
against Identity Toolkit.

Do **not** enable Firestore, Realtime Database, Storage or Identity Toolkit to
make anything pass. Their absence is what makes the published key harmless.

**Verify by the same method that established the gap** — after applying, the
three unused APIs must answer `403 API_KEY_SERVICE_BLOCKED` instead of their own
`400`, and Installations must keep answering its own `400`:

```bash
tests/security/firebase-key-restrictions.test.sh
```

Then confirm on device, which is the check that outranks any probe: both apps
still receive a push notification and still report a crash.

### 2 · Application restrictions — deliberately NOT done now

An Android/iOS application restriction would additionally require the caller to
prove which app it is. It is **not** required for release and is **not** what
the alerts are about.

It is deferred rather than skipped, because applying it blind breaks shipped
apps, and the preconditions are not met from here:

* **One key serves two applications.** Key A is shared by `com.banzami.consumer`
  and `com.banzami.merchant`; key B by both iOS bundles. Each restriction needs
  **two** entries — restricting a key to one package silently kills the other
  app. This is the mistake that would be made by following a per-app template.
* **The release SHA-1 is not obtainable here.** `apps/mobile/android/key.properties`
  is absent and no keystore is present.
* **On Play, the right fingerprint is Play's re-signing certificate**, not the
  upload key — Play Console → Setup → App integrity → *App signing key
  certificate*. Using the upload key makes every Play install fail while local
  builds keep working, which is the worst shape of this mistake because it
  passes local testing.

Revisit it only when all three hold: both packages' behaviour verified, the Play
App Signing certificate known, and Messaging/Installations/Crashlytics confirmed
still working on both apps afterwards.

Debug fingerprint, if debug builds must keep working against a restricted key —
read from this machine's `~/.android/debug.keystore`, whose password is the
published constant `android`, so it is not a secret:

    SHA-1    86:2D:43:62:4E:DF:3A:E5:6E:9C:20:35:76:6C:25:E9:9E:88:76:0D
    SHA-256  E1:1D:4D:04:F6:49:1D:E9:89:0F:7A:CA:54:F4:BB:6B:DE:D9:FE:DA:F5:30:5E:F7:B8:F7:D1:9D:84:D6:03:CC

Every fingerprint added widens the restriction; add none that is not needed.

## App Check

**NOT APPLICABLE**, and stated as that rather than as a pass.

App Check attests requests to Firestore, Realtime Database, Cloud Storage, Cloud
Functions and Firebase Auth. This project uses none of them. It does not protect
Cloud Messaging token registration or Crashlytics ingestion, so there is nothing
here for it to enforce. If Firestore, Storage or Auth are ever adopted, App Check
becomes applicable on the same day and this line stops being true.

## The four GitHub alerts

They are **not** false positives and are **not** vulnerabilities. They are
correct detections of a credential class that is public by construction: a
Firebase client key, shipped in every APK and IPA, present in this repository
because the build requires it there.

Resolve them as **used in tests / won't fix — public client configuration**,
with this file as the reason. They do not depend on the API restriction and were
never a release blocker; an earlier revision of this file said they should stay
open until a probe returned `403`, which optimised for a scanner outcome rather
than for exposure.

Rotating these keys is not indicated. Rotation means shipping a new mobile
release, and it would replace a public value with a different public value —
buying nothing, since neither was ever secret.
