# Banzami Brand Assets

Canonical visual identity for the **Banzami** payment network.

This directory is the **single source of visual truth** for all Banzami product assets. Do not fork, duplicate, or scatter these files.

## Structure

```
assets/banza/
  icon/                       ← App icon, favicon, touch icon
    banza_icon.png            ← Master source (1254×1254)
    banza_icon_1024.png       ← iOS App Store, macOS
    banza_icon_512.png        ← Android Play Store, PWA
    banza_icon_256.png        ← Desktop
    banza_icon_192.png        ← Android adaptive, PWA manifest
    banza_icon_180.png        ← Apple Touch Icon
    banza_icon_128.png        ← Toolbar
    banza_icon_64.png         ← Tab favicon
    banza_icon_32.png         ← Browser favicon
    banza_icon_16.png         ← Smallest favicon

  logo/
    banza_logo.png            ← Logo master (1254×1254)

  splash/
    banza_splash.png          ← Splash / launch screen master (1254×1254)

  tokens/
    banza.tokens.json         ← Canonical design tokens (JSON)
    banza.tokens.ts           ← TypeScript token exports
    banza.tokens.css          ← CSS custom properties
    tailwind.banza.js         ← Tailwind theme extension

  guidelines/
    BANZA_BRAND_GUIDELINES.md ← Official brand guidelines document
```

## Quick Reference

**Primary:** `#990011` Space Cherry  
**Highlight:** `#c21a2c` Cherry Highlight  
**Shadow:** `#5e000a` Deep Shadow  
**Surface:** `#FCF6F5` Soft White  
**Text:** `#1a1a1a` Near Black

**Brand gradient:**
```css
linear-gradient(145deg, #c21a2c 0%, #990011 38%, #7a000d 72%, #5e000a 100%)
```

## App Integration

| App | Status | Notes |
|-----|--------|-------|
| `apps/docs` | ✅ | Favicon metadata in layout.tsx; gradient tokens in tailwind config |
| `apps/pay` | ✅ | icon.png + apple-icon.png placed in app/ directory |
| `apps/dashboard` | ✅ | Favicon PNGs in public/ |
| `apps/checkout` | ✅ | Favicon PNGs in public/ |
| `sdk/flutter` | Pending | Add to pubspec.yaml assets block |
| `sdk/typescript` | Pending | Re-export from banza.tokens.ts |

## Full Documentation

See [guidelines/BANZA_BRAND_GUIDELINES.md](guidelines/BANZA_BRAND_GUIDELINES.md) for:
- Banza vs Banzami distinction
- Color philosophy and usage rules
- Gradient specifications
- Icon usage, sizing, clear space
- Dark/light behavior
- Favicon integration guide
- Flutter/mobile integration
- Amendment process
