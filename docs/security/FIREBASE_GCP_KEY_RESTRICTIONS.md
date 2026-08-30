# Firebase / GCP API key restrictions — operational runbook

**Status:** EXTERNAL ACTION REQUIRED (Google Cloud Console / gcloud).
**Owner:** whoever holds Owner or `roles/serviceusage.apiKeysAdmin` on GCP project `banzami`.
**Blocks security PASS:** No. See "Why this is not a vulnerability" below.

---

## 1. What these keys are, and what they are not

`apps/mobile/android/app/src/*/google-services.json` and
`apps/mobile/ios/**/GoogleService-Info.plist` contain a field named `api_key` /
`API_KEY`. A secret scanner flags it; it is **not a secret**.

Firebase mobile/web API keys are **client identifiers**. They identify which
Firebase project a request belongs to, and Google's own documentation states they
are expected to ship inside the application binary — anyone can extract one from
a published APK or IPA. Access is controlled by Firebase Security Rules,
Firebase App Check, and the API-key restrictions configured below, **never** by
keeping the value private.

Two consequences the audit acted on:

* These files are deliberately **not** removed from the repository, and the
  secret-scan policy allowlists them **by path** with this reasoning recorded in
  `.gitleaks.toml`. Treating them as leaked credentials would be wrong.
* The genuinely secret Firebase credential is the **service account**
  (`FIREBASE_CREDENTIALS_JSON`, used by api-gateway to send FCM messages). It was
  verified **absent from the repository and from git history**; it is supplied
  only through the environment, and push notifications are disabled when it is
  unset. The one match for `"type": "service_account"` in the tree is a truncated
  documentation example in `docs/playbooks/fcm-push-notifications-flutter-ios.md`
  containing no private key.

## 2. Why this is not a vulnerability (and does not block security PASS)

An unrestricted client key cannot read or move money: it grants no access to the
Banzami API, which authenticates with its own JWT/API-key scheme. The exposure is
**quota and cost abuse** — a third party could use the key to make Firebase calls
billed to project `banzami` — plus the loss of a defence-in-depth boundary. That
is a hardening gap, not an exploitable financial-security defect, so it is
recorded as an external action rather than an open finding.

## 3. Facts extracted from the repository

Do not re-type these from memory; they are read from the committed config.

| Field | Value |
|---|---|
| GCP / Firebase project id | `banzami` |
| Project number | `473654224852` |
| Android package (consumer) | `com.banzami.consumer` |
| Android package (merchant) | `com.banzami.merchant` |
| Android app id (consumer) | `1:473654224852:android:1c17b31c97e00d83561841` |
| Android app id (merchant) | `1:473654224852:android:40fac7beffe1ba1c561841` |
| iOS bundle id (consumer) | `com.banzami.consumer` |
| iOS bundle id (merchant) | `com.banzami.merchant` |
| iOS app id (consumer) | `1:473654224852:ios:3bd11ef959177de9561841` |
| iOS app id (merchant) | `1:473654224852:ios:c476db04a193ec08561841` |

There are **two distinct keys** in the committed config — one used by the Android
configs and one by the iOS configs. Identify them in the console by their last
six characters (`…pu2oBM` for Android, `…UFA5rQ` for iOS) rather than by
searching for the full value. Full key values are deliberately not reproduced in
this document.

The Android **release signing SHA-1** is not in the repository (the keystore is
external, as it should be). Take it from Play Console → *Release* → *Setup* →
*App signing*. If Play App Signing is enabled, register the SHA-1 of **both** the
upload certificate and the app-signing certificate.

## 4. Which Google APIs the apps actually need

From `apps/mobile/pubspec.yaml` the apps use `firebase_core`,
`firebase_messaging` and `firebase_crashlytics`. The API allow-list should
therefore be limited to:

* **Firebase Cloud Messaging API** — push delivery
* **Firebase Installations API** — required by FCM to obtain an installation id
* **Firebase Remote Config API** — only if Remote Config is later adopted; omit for now
* **Firebase Crashlytics API** — crash reporting

Everything else must be **blocked**, in particular any API that could carry cost
or data exposure if abused: Identity Toolkit, Cloud Firestore, Cloud Storage,
Realtime Database, Maps/Places/Geocoding, Cloud Translation, Vertex AI.

## 5. Apply the restrictions

### Console
Google Cloud Console → **APIs & Services → Credentials** → project `banzami` →
select each key.

**Android key (`…pu2oBM`)**
* Application restrictions → **Android apps**
  * `com.banzami.consumer` + release SHA-1
  * `com.banzami.merchant` + release SHA-1
  * add the debug SHA-1 only on a separate development key, never on this one
* API restrictions → **Restrict key** → the four APIs in §4

**iOS key (`…UFA5rQ`)**
* Application restrictions → **iOS apps**
  * `com.banzami.consumer`
  * `com.banzami.merchant`
* API restrictions → **Restrict key** → the four APIs in §4

### gcloud (equivalent, scriptable)

```bash
gcloud config set project banzami
gcloud services api-keys list --format='table(uid,displayName,restrictions)'

# Replace KEY_UID with the uid of the Android key, and SHA1 with the release
# signing certificate fingerprint from Play Console.
gcloud services api-keys update KEY_UID \
  --allowed-application=sha1_fingerprint=SHA1,package_name=com.banzami.consumer \
  --allowed-application=sha1_fingerprint=SHA1,package_name=com.banzami.merchant \
  --api-target=service=fcm.googleapis.com \
  --api-target=service=firebaseinstallations.googleapis.com \
  --api-target=service=firebasecrashlytics.googleapis.com

gcloud services api-keys update IOS_KEY_UID \
  --allowed-bundle-ids=com.banzami.consumer,com.banzami.merchant \
  --api-target=service=fcm.googleapis.com \
  --api-target=service=firebaseinstallations.googleapis.com \
  --api-target=service=firebasecrashlytics.googleapis.com
```

## 6. Verify completion

```bash
gcloud services api-keys list --project=banzami \
  --format='table(displayName, restrictions.androidKeyRestrictions.allowedApplications,
                  restrictions.iosKeyRestrictions.allowedBundleIds,
                  restrictions.apiTargets)'
```

Done when **every** key reports a non-empty application restriction **and** a
non-empty API target list. A key showing no restrictions is still open.

Then confirm the apps still work — restrictions are enforced immediately:
push notification received on a release build of each app (consumer and
merchant), on both Android and iOS.

## 7. Additionally recommended

Enable **Firebase App Check** for FCM and Crashlytics. App Check attests that the
caller is a genuine build of your app, which is the control that actually stops
key reuse; API-key restrictions alone can be worked around by an attacker who
replicates the package name and, on Android, obtains a matching signature.
