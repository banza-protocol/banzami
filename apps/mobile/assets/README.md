# Banzami — Official Brand Assets

> Version: 1.0

There are exactly **two** official asset sets — nothing else. Sandbox has no
branding of its own.

## Banzami (`assets/banzami/`)

The consumer app (Banzami) brand set.

| File | Purpose |
|------|---------|
| `icon.png` | App icon source (`flutter_launcher_icons`) and in-app logo (`BrandingAssets.icon`) |
| `logo.png` | Wordmark/logo used in-app (`BrandingAssets.logo`) |
| `splash.png` | Full-resolution brand image |
| `splash_native.png` | Native splash source (`flutter_native_splash`), centered on `#B5101F` |

## Banzami Business (`assets/business/`)

The merchant app (Banzami Business) brand set.

| File | Purpose |
|------|---------|
| `business_icon.png` | Business app icon source |
| `business_logo.png` | Business wordmark/logo |
| `business_splash.png` | Full-resolution Business brand image |
| `business_splash_native.png` | Business native splash source (same logic as `banzami/splash_native.png`, Business branding) |

## Sandbox — no separate branding

Sandbox **reuses the official Banzami / Banzami Business assets**. There is no
`sandbox/` asset set and no `*_sandbox` images. The only visual difference in
Sandbox is the **permanent yellow banner** rendered inside the app, driven by
`AppConfig.isSandbox` — not the brand assets.

## How they are wired

- App icons: `flutter_launcher_icons` → `assets/banzami/icon.png` (see `pubspec.yaml`).
- Native splash: `flutter_native_splash` → `assets/banzami/splash_native.png`.
- In-app logo/icon: `lib/branding_assets.dart` → `assets/banzami/*` (sandbox reuses these).

Do not reintroduce a `branding/`, `images/`, or `sandbox/` asset folder, and do
not add `*_sandbox` images — this is the single source of truth.
