# Banzami Brand Guidelines

Version: 1.0 — Frozen 2026-05-20

---

## 1. Identity Architecture

### Banza vs. Banzami

| | Banza | Banzami |
|--|---------|-------|
| **What it is** | Organization / infrastructure ecosystem | Payment product / payment experience |
| **Use it for** | Company, team, institutional mission, bank relationships, platform infrastructure | Wallets, QR payments, merchant solutions, SDKs, APIs, consumer UX |
| **Examples** | "Banza builds Angola's payment infrastructure" | "Paga com Banzami", "Banzami Wallet", "Banzami Business" |
| **Never** | "Banza Wallet", "Banza QR", "Pagar com Banza" | "Banzami is the company name" |

**Grammatical gender (Portuguese):** both names are masculine.
- O Banzami (not *a* Banzami)
- O Banza (not *a* Banza)
- "O Banzami é construído com Rust" (not *construída*)

These assets are **Banzami product assets**, not generic Banza corporate assets.

---

## 2. Visual Philosophy

> **"Soft physical depth with restrained luxury lighting."**

The Banzami visual identity is:

- **Premium minimalism** — nothing gratuitous, every element serves a purpose
- **Soft physical depth** — surfaces have weight and dimensionality without being skeuomorphic
- **Restrained luxury** — rich color, subtle light; never garish
- **Sophisticated digital materiality** — like premium hardware: a matte finish with a highlight
- **QR-native payment identity** — the four-quadrant symbol references the QR grid, the modular payment network, and the building blocks of financial infrastructure
- **Apple-like icon depth system** — rounded rectangle container with internal shadow and lighting

---

## 3. The Symbol

The Banzami symbol is four rounded squares in a 2×2 grid:
- Top-left: large, pure white (dominant, foreground)
- Top-right: large, soft pink (secondary)
- Bottom-left: large, soft pink (secondary)
- Bottom-right: small, white (accent)

This references:
- the QR payment grid
- modularity and extensibility
- the four pillars of instant payment: consumer → QR → merchant → settlement

---

## 4. Color System

All colors are frozen. Do not introduce alternatives.

### Primary Palette

| Token | Hex | Name | Use |
|-------|-----|------|-----|
| `--banza-primary` | `#990011` | Space Cherry | CTAs, active states, key UI elements |
| `--banza-primary-highlight` | `#c21a2c` | Cherry Highlight | Hover states, gradient light end, elevated surfaces |
| `--banza-primary-mid` | `#7a000d` | Cherry Mid | Gradient interpolation only |
| `--banza-primary-shadow` | `#5e000a` | Deep Shadow | Pressed states, icon depth, gradient dark end |

### Surface Palette

| Token | Hex | Name | Use |
|-------|-----|------|-----|
| `--banza-surface-light` | `#FCF6F5` | Soft White | Default page background (light mode) |
| `--banza-surface-neutral` | `#d8d0cf` | Soft Neutral Shadow | Borders, dividers, muted text |
| `--banza-near-black` | `#1a1a1a` | Near Black | Primary text, never use pure #000000 |

### Forbidden

- Do not use pure `#ff0000` or pure `#000000`
- Do not introduce blues, greens, or orange tones in the primary palette
- Do not use gray without a warm undertone

---

## 5. Gradients

### Brand Gradient (canonical)

```css
linear-gradient(
  145deg,
  #c21a2c 0%,
  #990011 38%,
  #7a000d 72%,
  #5e000a 100%
)
```

**Use for:** splash screens, hero sections, QR payment frames, payment confirmation screens, app icon background.

**Do not use for:** body text backgrounds, long-scroll page fills, data tables.

### Light Surface Gradient (canonical)

```css
linear-gradient(
  to bottom,
  #ffffff 0%,
  #FCF6F5 55%,
  #d8d0cf 100%
)
```

**Use for:** card backs, modal backgrounds, dashboard panels, empty state illustrations.

---

## 6. Logo Usage

### Canonical Assets

| File | Size | Use |
|------|------|-----|
| `icon/banza_icon.png` | 1254×1254 | Master source — do not use directly |
| `icon/banza_icon_1024.png` | 1024×1024 | iOS App Store, macOS |
| `icon/banza_icon_512.png` | 512×512 | Android Play Store, general large |
| `icon/banza_icon_256.png` | 256×256 | Desktop app, PWA |
| `icon/banza_icon_192.png` | 192×192 | Android adaptive, PWA manifest |
| `icon/banza_icon_180.png` | 180×180 | Apple Touch Icon |
| `icon/banza_icon_128.png` | 128×128 | Toolbar, medium icon |
| `icon/banza_icon_64.png` | 64×64 | Tab favicon, small icon |
| `icon/banza_icon_32.png` | 32×32 | Browser favicon |
| `icon/banza_icon_16.png` | 16×16 | Smallest favicon |
| `logo/banza_logo.png` | 1254×1254 | Full logo with wordmark context |
| `splash/banza_splash.png` | 1254×1254 | Launch / splash screen |

### Minimum Sizes

| Context | Minimum size |
|---------|-------------|
| App icon (mobile) | 60×60pt (120×120px @2x) |
| Favicon | 32×32 |
| Inline UI element | 24×24 |
| Never render below | 16×16 |

### Clear Space

Minimum clear space around the icon = 10% of the container dimension on all sides.

### Do Not

- Stretch or distort the icon
- Change the corner radius manually
- Place the icon on a clashing background (use the brand gradient or white)
- Recolor the icon elements
- Add drop shadows beyond the canonical shadow spec
- Add text to the icon

---

## 7. Dark / Light Behavior

### Dark surfaces

Use the brand gradient as background. Icon foreground is white + soft pink — it reads correctly on dark.

### Light surfaces

Use Soft White (`#FCF6F5`) or the light surface gradient. The Space Cherry primary works as accent on light.

### Avoid

- White icon on white background (use brand gradient background instead)
- Dark text on brand gradient (use `#ffffff` or `#FCF6F5` only)

---

## 8. Favicon Integration

Per app, add to `<head>`:

```html
<link rel="icon" type="image/png" sizes="32x32" href="/banza_icon_32.png">
<link rel="icon" type="image/png" sizes="64x64" href="/banza_icon_64.png">
<link rel="apple-touch-icon" sizes="180x180" href="/banza_icon_180.png">
<link rel="manifest" href="/manifest.json">
```

`manifest.json`:
```json
{
  "name": "Banza",
  "short_name": "Banza",
  "icons": [
    { "src": "/banza_icon_192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/banza_icon_512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#990011",
  "background_color": "#990011",
  "display": "standalone"
}
```

---

## 9. Flutter / Mobile Integration

```dart
// pubspec.yaml
flutter:
  assets:
    - assets/banza/icon/banza_icon.png
    - assets/banza/splash/banza_splash.png

// Splash screen background color
const Color banzaPrimary = Color(0xFF990011);
const Color banzaHighlight = Color(0xFFC21A2C);
const Color banzaShadow = Color(0xFF5E000A);
const Color banzaSurfaceLight = Color(0xFFFCF6F5);
```

---

## 10. Token Import Reference

### TypeScript / Next.js

```ts
import { BanzaColors, BanzaGradients, BanzaTheme } from '@/../assets/banza/tokens/banza.tokens'

// Usage
style={{ background: BanzaGradients.brand, color: BanzaColors.white }}
```

### CSS

```css
@import 'path/to/assets/banza/tokens/banza.tokens.css';

.hero { background: var(--banza-gradient-brand); }
.cta  { background: var(--banza-primary); color: white; }
```

### Tailwind

```js
// tailwind.config.js
const banza = require('./assets/banza/tokens/tailwind.banza')
module.exports = { presets: [banza], content: [...] }
```

```html
<button class="bg-banza-primary hover:bg-banza-highlight text-white">
  Pagar com Banza
</button>
```

---

## 11. Asset Naming Conventions

```
banza_<type>_<size>.<ext>

Examples:
  banza_icon_32.png
  banza_icon_1024.png
  banza_logo.png          (no size suffix = master)
  banza_splash.png        (no size suffix = master)
```

Rules:
- Lowercase, underscores only, no spaces
- Size suffix only on derived files, never on masters
- Never `banzami_` prefix for product assets (that prefix is for org-level assets)

---

## 12. What Belongs Here

✅ **Banzami product assets** — icon, logo, splash, QR frame graphics, payment UI elements  
❌ **Banza org assets** — corporate logo, letterhead, investor materials → `assets/branding/`

---

## 13. Amendment Process

This document is frozen at v1.0.

To amend:
1. Propose change in an ADR or PR description
2. Update `banza.tokens.json`, `banza.tokens.ts`, `banza.tokens.css`, `tailwind.banza.js` atomically
3. Update this document
4. Update all app integrations in the same PR
5. Never change a token without updating all four token files simultaneously
