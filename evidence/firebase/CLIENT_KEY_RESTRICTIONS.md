# Firebase client keys — inventory, what was tested, what must be applied

Date: 2026-09-08 · Project `banzami` (number 473654224852) · 4 GitHub secret
alerts left **open**, deliberately.

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

## The real gap — the keys are unrestricted

    POST firebaseinstallations.googleapis.com/v1/projects/banzami/installations
      bare, no X-Android-Package, no X-Android-Cert   → 200, installation created

An application-restricted key answers `403` to that. It was accepted, and it
registered an installation — which is precisely the abuse a restriction prevents.

**Status: FAIL.** Closing it needs the Google Cloud console.

## Signing fingerprints — what is known here, and what is not

**Debug**, read from this machine's `~/.android/debug.keystore` (its password is
the published constant `android`, so this is not a secret):

    SHA-1    86:2D:43:62:4E:DF:3A:E5:6E:9C:20:35:76:6C:25:E9:9E:88:76:0D
    SHA-256  E1:1D:4D:04:F6:49:1D:E9:89:0F:7A:CA:54:F4:BB:6B:DE:D9:FE:DA:F5:30:5E:F7:B8:F7:D1:9D:84:D6:03:CC

Needed only if debug builds must keep working against the restricted key. If
they do not, leave it out — every fingerprint added widens the restriction.

**Release is not obtainable from here.** `apps/mobile/android/key.properties` is
absent and no keystore is present; the build reads the release signing config
from that gitignored file or from the environment. So the release fingerprint
comes from one of two places, and the distinction matters:

* **If the app is distributed through Play**, the signature Google sees is
  Play's re-signing key, not the upload key. Take the SHA-1 from
  **Play Console → your app → Setup → App integrity → App signing key
  certificate**. Using the upload key here makes every Play install fail while
  local builds keep working — the worst shape of this mistake.
* **If it is not on Play yet**, it is the release keystore's own:

      keytool -list -v -keystore /path/to/banzami-release.jks -alias <alias>

Both applications are built from one keystore in this configuration, so one
release fingerprint covers both packages.

## Exact human actions

Google Cloud Console → project `banzami` → **APIs & Services → Credentials**.
For each key, open it and set:

**Application restrictions**

**Key A (Android, `a2626d564b36`)** → *Android apps*. It needs **two** entries,
because one key serves both applications:

| Package | SHA-1 |
|---|---|
| `com.banzami.consumer` | the release fingerprint (see above) |
| `com.banzami.merchant` | the same release fingerprint |

Add the debug fingerprint as further entries for the same two packages only if
debug builds must work.

**Key B (iOS, `83f573718a5b`)** → *iOS apps*, again **two** entries:
`com.banzami.consumer` and `com.banzami.merchant`.

No web key exists, so no HTTP-referrer restriction applies.

**API restrictions** — *Restrict key*, and select only what the SDK set needs.

The list is derived from the application's dependencies, which is the
authoritative source: the app can only call what its SDKs call. An attempt to
read the enabled-service list with the API key was inconclusive — those
management endpoints answer `401 UNAUTHENTICATED` because they require OAuth, not
a key — so this is derived rather than probed, and the console's *Enabled APIs*
page is where to confirm the intersection.

`pubspec.yaml` declares exactly three Firebase packages, and Dart source
references only `FirebaseMessaging.instance` and `FirebaseCrashlytics.instance`:

| Package | API to allow |
|---|---|
| `firebase_core` | **Firebase Installations API** — every Firebase SDK registers an app instance through it |
| `firebase_messaging` | **Firebase Cloud Messaging API** (+ Installations, above) |
| `firebase_crashlytics` | **Firebase Crashlytics API** / Crashlytics Report API (+ Installations) |

Nothing else. In particular do not add Remote Config: the app does not import
it.

Do **not** enable Firestore, Realtime Database, Storage or Identity Toolkit to
make anything pass. They are not used, and their absence is what makes the
published key harmless today.

## App Check

**NOT APPLICABLE**, and stated as that rather than as a pass.

App Check attests requests to Firestore, Realtime Database, Cloud Storage, Cloud
Functions and Firebase Auth. This project uses none of them. It does not protect
Cloud Messaging token registration or Crashlytics ingestion, so there is nothing
here for it to enforce. If Firestore, Storage or Auth are ever adopted, App Check
becomes applicable on the same day and this line stops being true.

## After the restrictions are applied

Re-run the probe that was accepted:

```bash
node /dev/stdin <<'JS'
import { readFileSync } from 'node:fs';
const k = JSON.parse(readFileSync('apps/mobile/android/app/src/consumer/google-services.json','utf8'))
  .client[0].api_key[0].current_key;
const r = await fetch(`https://firebaseinstallations.googleapis.com/v1/projects/banzami/installations?key=${k}`, {
  method:'POST', headers:{'content-type':'application/json'},
  body: JSON.stringify({ fid:'cZZZZZZZZZZZZZZZZZZZZZ', appId:'1:473654224852:android:0000000000000000', authVersion:'FIS_v2', sdkVersion:'a:probe' }),
});
console.log(r.status, (await r.text()).slice(0,120));   // expect 403, not 200
JS
```

A `403` naming the restriction is the evidence. **Only then** resolve the four
GitHub alerts, and resolve them as what they are — a client key that is
intentionally public, now restricted — not as a false positive. The alerts stay
open until that evidence exists.
