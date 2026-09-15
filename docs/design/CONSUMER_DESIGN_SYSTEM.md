# Consumer design system

Version: 1.0 · WEB-APP-001 (§8). The canonical source for the Consumer product's
visual language, shared by App Banzami Web and the native apps. The goal is
`CONSUMER_DESIGN_TOKEN_DRIFT=0`: Web and native read the same tokens rather than
hand-copying values.

## Font

**Inter** — bundled (`Inter-Regular/Medium/SemiBold/Bold/ExtraBold`). The native
app bundles the same faces (`apps/mobile/assets/fonts`); the Web app self-hosts
them via `next/font/local` (no external request, CSP-clean). Weights in use:
400/500/600/700/800.

## Colour

| Token | Hex | Use |
|-------|-----|-----|
| cherry (primary) | `#B5101F` | CTAs, accents, brand |
| cherry-dark | `#9A1B22` | hover, accent text |
| cherry-coral | `#E8434B` | decorative / glow |
| cherry-bright | `#D7242E` | gradient stop |
| pink-200 | `#FBD2D0` | tints, chips |
| ink | `#241D20` | primary text |
| ink-soft / ink-muted | `#5A4A4E` / `#8A7E82` | secondary text |
| cream-50 / cream-100 | `#FBF9F9` / `#F6EFEF` | surfaces |

Brand gradient: `#E8434B → #B5101F → #9A1B22`. Amber Sandbox disclosure:
`#FFF4D6 / #F6C453 / #92400E`.

## Money

The canonical **"50 000 Kz"** format: a regular (non-breaking) space thousands
separator, `Kz` suffix last, no cents. AOA minor units ÷ 100. One implementation
per surface (`apps/app-banzami/lib/money.ts`, `apps/website/lib/money.ts`, the
Flutter formatter) — unit-tested against the same cases.

## Navigation & surfaces

Bottom navigation: **Início · Histórico · Receber · Perfil**. Send is a primary
action on Home, not a tab. Cards use 18–24px radii and soft cherry-tinted
shadows; the balance is a cherry-gradient card; activity rows show a direction
glyph, counterparty, note/date and a signed amount.

## Platform adaptations

Web uses a phone-width column centred on larger viewports and full-bleed on
phones — never a nested mock phone. Desktop uses the available space around the
same product identity, not a bank dashboard. Icons are Material-rounded
equivalents of the native set.

## Page headers (one title system)

There is ONE page-title style across every primary Consumer and Merchant screen
(ACCOUNT-ONBOARDING-NAME-001: `APP_HEADER_VISUAL_SYSTEM=ONE`). It is the
`BanzamiTextStyles.pageTitle` token — **28px / w700 / -0.5 tracking** — rendered
only through the shared `AppScreenHeader`
(`sdk/flutter/lib/widgets/app_screen_header.dart`). Screens never inline their
own title `fontSize`/`fontWeight` (`PAGE_TITLE_SCREEN_LOCAL_OVERRIDES=0`).

Header classes:

| Class | Anatomy | Example | Component |
|-------|---------|---------|-----------|
| **ROOT_PAGE** | big title + optional subtitle + optional trailing, no back | Perfil · Receber · Histórico | `AppScreenHeader(title:, subtitle:, trailing:)` |
| **CHILD_PAGE** | back affordance above the same big title | Criar conta · Entrar · Enviar · Confirmar envio · PIN & Segurança | `AppScreenHeader(title:, onBack:)` |
| **MODAL/SHEET** | sheet/dialog title | biometrics sheet | `headingMd` (18) — a distinct, deliberate class |
| **IMMERSIVE / NO_HEADER** | intentional full-screen or hero, no standard header | Welcome, Splash, Home dashboard hero (`_TopBar`), the full-screen Comprovativo/receipt, the camera Scan screen, the app-unlock PIN | documented exception |

Root and child share the SAME title typography; only the navigation anatomy
differs (a root tab needs no back button; a pushed child does — the back button
is the one `arrow_back_ios_new_rounded` inside `AppScreenHeader`, never a
per-screen copy). Titles wrap for long PT/EN labels and never truncate
(`UNINTENDED_PAGE_TITLE_TRUNCATION=0`). The left edge aligns to the
`BanzamiSpacing.xl` content inset on every screen.

Do not reintroduce a compact app-bar caption (the old 16px `BanzamiAppBar`
title) or a hand-rolled `Text(displayMd)` title on a Consumer page — route the
title through `AppScreenHeader`.
