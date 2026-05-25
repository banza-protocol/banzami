# Banzami Brand System

## Identity Statement

Banzami is Angola's programmable instant payments infrastructure — not a startup product, not a western fintech clone, not a wallet app.

The platform is four layers deep: consumer wallets, merchant QR rails, a developer SDK ecosystem, and a regulated financial core. The visual identity communicates: **trust, speed, resilience, and Angolan technological ambition.**

---

## Logo Mark

The symbol is an antelope/gazelle — an animal native to sub-Saharan Africa that represents:

- **Movement** — instant payments, real-time transfers
- **Agility** — low-latency, mobile-first architecture
- **Resilience** — built to survive, built to scale
- **Intelligence** — precision, not brute force
- **African identity** — rooted in the continent, not imported from elsewhere

### Master Asset

```
assets/icons/icon_master_1024.png
```

This 1024×1024 PNG is the source of truth for all derived assets:

| Derived Asset | Resolution | Format | Location |
|---------------|-----------|--------|----------|
| App icon (iOS) | 1024×1024 → 20px…1024px | PNG | `sdk/flutter/assets/icons/` |
| App icon (Android) | Adaptive icon layers | PNG | `sdk/flutter/assets/icons/` |
| Favicon | 32×32, 64×64, 180×180 | PNG/ICO | `apps/dashboard/public/` |
| Social preview | 1200×630 | PNG | `assets/branding/social/` |
| Splash screen | Platform-specific | PNG/SVG | `sdk/flutter/assets/splash/` |

### Usage Rules

- Preserve clean geometry — never skew, stretch, or rotate the mark
- Minimum clear space: 16dp on all sides in digital contexts
- Minimum size: 24×24dp in any rendered context
- Always use on white or light backgrounds as primary; wine background as secondary
- Never place on busy photographic backgrounds without an overlay
- Monochrome variant: full wine (`#6D071A`) on white, or full white on wine

### Never Do

- Drop shadows or glow effects
- Aggressive gradients applied to the mark itself
- Text inside or overlapping the mark
- Rounded corners applied externally (the mark already has its own geometry)
- Any playful, cartoonish, or crypto-adjacent treatment

---

## Color Palette

### Primary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Wine** | `#6D071A` | `109, 7, 26` | Primary brand color — CTA buttons, headers, key UI elements |
| **Wine Dark** | `#4B0911` | `75, 9, 17` | Pressed/active states, deep backgrounds, dark variant |
| **Wine Medium** | `#8E1026` | `142, 16, 38` | Hover states, gradients, secondary accents |

### Secondary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Copper** | `#C56A2D` | `197, 106, 45` | QR actions, positive financial emphasis, warm highlights |
| **Copper Light** | `#D4834A` | `212, 131, 74` | Copper hover state |

### Neutral Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **White** | `#FFFFFF` | `255, 255, 255` | Primary surface — the platform is light-first |
| **Off White** | `#F6F4F1` | `246, 244, 241` | Secondary surface, card backgrounds, subtle separation |
| **Gray 100** | `#F0EDEA` | `240, 237, 234` | Input backgrounds, dividers, skeleton states |
| **Gray 400** | `#9E9A96` | `158, 154, 150` | Placeholder text, disabled states, secondary labels |
| **Gray 700** | `#4A4744` | `74, 71, 68` | Secondary text, captions |
| **Gray 900** | `#1A1816` | `26, 24, 22` | Primary text |

### Semantic Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Success** | `#1A7A4A` | Completed payments, positive states |
| **Warning** | `#B45309` | Pending states, review required |
| **Error** | `#B91C1C` | Failed payments, error states |
| **Info** | `#1E40AF` | Informational, neutral system messages |

---

## Typography

The type system prioritizes **readability, clarity, and numerical precision** — critical for financial amounts.

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `display-xl` | 48sp | 700 | 56sp | Hero amounts, splash |
| `display-lg` | 36sp | 700 | 44sp | Balance display, key figures |
| `display-md` | 28sp | 600 | 36sp | Section headers |
| `heading-lg` | 22sp | 600 | 30sp | Screen titles |
| `heading-md` | 18sp | 600 | 26sp | Card headers, group labels |
| `heading-sm` | 16sp | 600 | 24sp | List item titles |
| `body-lg` | 16sp | 400 | 24sp | Primary body text |
| `body-md` | 14sp | 400 | 20sp | Secondary body, descriptions |
| `body-sm` | 12sp | 400 | 18sp | Captions, metadata |
| `label` | 12sp | 500 | 16sp | Button labels, tags |
| `mono` | 14sp | 400 | 20sp | Amounts, IDs, codes |

**Font stack:** Inter (web/dashboard) · SF Pro / Roboto (native fallback) · system-ui

For monetary amounts, always use monospace spacing (`font-feature-settings: "tnum"`) to align decimal columns.

---

## Spacing System

8dp base grid. All spacing values are multiples of 4:

```
2dp   — micro gaps, icon padding
4dp   — tight spacing
8dp   — standard component gap
12dp  — medium gap
16dp  — section padding
24dp  — card padding
32dp  — section gap
48dp  — screen section gap
64dp  — page-level gap
```

---

## Component Guidelines

### Buttons

- **Primary**: Wine background (`#6D071A`), white text, 8dp radius
- **Secondary**: White background, wine border (1.5dp), wine text
- **Destructive**: Error red background, white text
- **Ghost**: Transparent, wine text, no border

Button height: 48dp (mobile), 40dp (web). Never smaller than 44dp touch target.

### Cards

- White background, `#F0EDEA` border (1dp), 12dp radius
- Elevation shadow only for modal/overlay cards: `0 4px 16px rgba(0,0,0,0.08)`
- No heavy drop shadows on list cards

### Transaction/Transfer Items

- Amount in `mono` font, wine for outgoing, success green for incoming
- Never mix debit/credit coloring ambiguously — always direction-first

### QR Code Surfaces

- White background required for QR legibility
- Copper accent frame or label for dynamic QR distinction
- Static QR labeled clearly as reusable

---

## UI Philosophy

The Banzami interface must feel:

> "Modern African financial infrastructure — confident, fast, and clear."

**Primary reference:** premium East/West African digital banking (not UK challenger banks, not US neobanks)

**Light-only theme** — no dark mode in v1. The priority is clarity and operational confidence.

---

## Mobile Home Screen Hierarchy

The mobile app's primary screen revolves around:

1. **Available balance** — dominant, large, immediately visible
2. **Scan QR** — primary action
3. **Send** — second action
4. **Receive** — third action
5. **Recent activity** — scrollable, below the fold

The hierarchy communicates: *Banzami is a payment tool, not a social network.*

---

## Anti-Patterns

These must never appear in Banzami interfaces:

- Neon or glowing colors
- Dark/night mode themes (v1)
- Animated coin/token graphics
- Blockchain visual language
- Playful mascots or cartoon illustrations
- Financial advice / investment product language
- Gamification (streaks, badges, points)
- Western fintech copy ("Move fast and break things", etc.)

---

## Asset Locations

```
/assets
  /icons
    icon_master_1024.png         ← master source
  /branding
    /social
      og_image_1200x630.png      (to be generated)
    /guidelines
      banzami_brand_guidelines.pdf (to be generated)

/sdk/flutter/assets/
  /icons/
  /splash/

/apps/dashboard/public/
  favicon.ico
  apple-touch-icon.png
  og-image.png
```
