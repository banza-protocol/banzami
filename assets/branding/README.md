# Banzami Brand Assets

Source brand images for the Banzami operator, split by environment. These are reference/source assets — apps keep their own platform-specific copies under `apps/*/assets/` and `apps/*/public/`.

## Structure

```
assets/branding/
  production/                  ← LIVE brand (red rounded-square mark)
    banzami_icon.png           1254×1254
    banzami_logo.png           1254×1254
    banzami_splash.png         1254×1254
  sandbox/                     ← SANDBOX brand (red mark + yellow "S" badge)
    sbanzami_icon.png          1254×1254
    sbanzami_logo.png          1254×1254
    sbanzami_splash.png        1254×1254
```

The `s`-prefixed sandbox variants carry a yellow **S** badge so test/sandbox builds are visually distinct from production at a glance (home-screen icon, splash, favicon).

## Derivation Guide

| Platform | Size | Source (production) | Source (sandbox) |
|----------|------|---------------------|------------------|
| iOS App Store | 1024×1024 | `production/banzami_icon.png` | `sandbox/sbanzami_icon.png` |
| Android Play Store | 512×512 | `production/banzami_icon.png` | `sandbox/sbanzami_icon.png` |
| Favicon (browser) | 32×32, 64×64 | `production/banzami_icon.png` | `sandbox/sbanzami_icon.png` |
| Apple Touch Icon | 180×180 | `production/banzami_icon.png` | `sandbox/sbanzami_icon.png` |

> 2026-06-13: the previous `assets/` brand images were not the Banzami brand and were removed. These are the canonical Banzami brand sources, organized by environment (production / sandbox).
