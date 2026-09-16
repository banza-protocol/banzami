# Vendored ZXing decoder — `web/zxing-library-0.21.3.js`

> This note lives here, **outside `web/`**, on purpose: Flutter serves everything
> under `web/` as a public asset, and vendoring documentation should not be served.
> The vendored decoder itself must stay in `web/` so it is served from our origin.

## Why this file exists

`mobile_scanner` 6.0.11 decodes QR codes on the web with **`@zxing/library`**,
which it loads **at runtime from a CDN**. Its hardcoded default is:

```dart
// mobile_scanner-6.0.11/lib/src/web/zxing/zxing_barcode_reader.dart
String get scriptUrl => 'https://unpkg.com/@zxing/library@0.21.3';
```

The App Banzami Web (`app.banzami.com`) ships a **strict CSP** with
`script-src 'self' 'wasm-unsafe-eval'` — no third-party script origins. That is
correct and must not be weakened. So the runtime load from `unpkg.com` is
(correctly) blocked, the decoder never initialises, and the camera "fails".

The fix is to serve the **exact same decoder from our own origin** and point
mobile_scanner at it, instead of adding `unpkg.com` to `script-src`:

```dart
// sdk/flutter/lib/widgets/banzami_qr_scanner.dart (web only)
MobileScannerPlatform.instance
    .setBarcodeLibraryScriptUrl('/zxing-library-0.21.3.js');
```

Flutter web copies everything under `apps/mobile/web/` into the build output, so
this file is served at `https://app.banzami.com/zxing-library-0.21.3.js` from
`'self'` — no CSP change.

## Exact provenance (version-pinned)

| | |
|---|---|
| Package | `@zxing/library` |
| Version | **0.21.3** (the exact version mobile_scanner 6.0.11 requests) |
| Source | `https://unpkg.com/@zxing/library@0.21.3` (the package `main`, a UMD build) |
| Bytes | 336008 |
| SHA-256 | `d7cc8f69dd70bdcf3ac00c9ae572bf2acb9f4132ba379c72df842e4db918652d` |
| Global | UMD — defines `window.ZXing` |

The vendored file is a **byte-for-byte copy** of that published artifact (verified
by identical SHA-256), so it is the same code mobile_scanner would have fetched —
only served from our origin.

## How to refresh (when mobile_scanner bumps its ZXing version)

1. Read the new expected version from
   `mobile_scanner-<ver>/lib/src/web/zxing/zxing_barcode_reader.dart`
   (`scriptUrl`).
2. Download it and record its hash:
   ```bash
   curl -sSL -o apps/mobile/web/zxing-library-<newver>.js \
     "https://unpkg.com/@zxing/library@<newver>"
   shasum -a 256 apps/mobile/web/zxing-library-<newver>.js
   ```
3. Update the filename in `sdk/flutter/lib/widgets/banzami_qr_scanner.dart`
   (`setBarcodeLibraryScriptUrl`) and this document.
4. Remove the previous version's file.

Do **not** add a CDN origin to the CSP. The decoder is always served from `'self'`.
