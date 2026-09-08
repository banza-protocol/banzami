# Firebase client keys — inventory, what was tested, what must be applied

Date: 2026-09-08 · Project `banzami` (number 473654224852) · 4 GitHub secret
alerts left **open**, deliberately.

## Inventory

| # | File | App | Platform | Identity | Key |
|---|---|---|---|---|---|
| 1 | `apps/mobile/android/app/src/consumer/google-services.json` | Consumer | Android | `com.banzami.consumer` | one, shared across the two client entries |
| 2 | `apps/mobile/android/app/src/merchant/google-services.json` | Merchant | Android | `com.banzami.merchant` | same shape |
| 3 | `apps/mobile/ios/config/consumer/GoogleService-Info.plist` | Consumer | iOS | bundle `com.banzami.consumer`, app id `1:473654224852:ios:3bd11ef959177de9561841` | one |
| 4 | `apps/mobile/ios/config/merchant/GoogleService-Info.plist` | Merchant | iOS | bundle `com.banzami.merchant`, app id `1:473654224852:ios:c476db04a193ec08561841` | one |

`apps/mobile/ios/Runner/GoogleService-Info.plist` is a fifth file and a copy of
the consumer one — same bundle, same app id.

No web app. Nothing in the repository ships a Firebase web config.

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

## Exact human actions

Google Cloud Console → project `banzami` → **APIs & Services → Credentials**.
For each key, open it and set:

**Application restrictions**

* Android keys → *Android apps*, one entry per package with its signing SHA-1:
  * `com.banzami.consumer`
  * `com.banzami.merchant`
  * Get the fingerprints from Play Console → *Setup → App signing* (use the
    **App signing key** SHA-1, not only the upload key, or installs from Play
    break), plus the debug keystore SHA-1 if debug builds must work.
* iOS keys → *iOS apps*, one entry per bundle:
  * `com.banzami.consumer`
  * `com.banzami.merchant`
* No web key exists, so no referrer restriction applies.

**API restrictions** — *Restrict key*, and select only what the three packages
need:

* Firebase Installations API — required by both Messaging and Crashlytics
* Firebase Cloud Messaging API
* Firebase Crashlytics / Firebase Crashlytics Report API
* Firebase Remote Config Realtime API only if Remote Config is actually enabled
  server-side; the app does not import it

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
