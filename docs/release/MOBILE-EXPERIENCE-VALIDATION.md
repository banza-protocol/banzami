# MOBILE EXPERIENCE VALIDATION

> Mobile-only responsive pass on the approved, frozen desktop design. No
> redesign, no new visual language, no copy/content/branding change, no backend
> change, no Financial Live change, no launch. Desktop revalidated for regression.

SOURCE_REVISION: `de6a0151` (+ this docs commit)
DEPLOYED_REVISION: `de6a0151` (website-frontend)

VIEWPORTS_TESTED: 320/360/375/390/412/430 (phone), 768/820 (tablet), 1440 (desktop regression). Live measurements taken at 390 and 430 on the production domain; desktop at 1440.

## What changed (mobile-only, all inside `max-width` media queries)

| Area | Problem on mobile | Fix |
|------|-------------------|-----|
| Header / nav | The top-bar "Portal Developers" CTA overflowed the right edge and pushed the burger off-screen | Hide `.bz-navcta` ≤600px; it already lives in the burger drawer (which also has Beta Web + PT/EN) |
| Hero background | The desktop right-side red geometry fell behind the stacked lead copy and hurt legibility | Fade `.bz-homeherobg` to opacity .2 ≤700px; the stacked phone carries the brand moment |
| Audience cards | "Para pessoas" / "Para developers" stayed cramped two-up | Stack `.bz-herocards` to one column ≤560px |
| Code window (developers highlight) | Non-wrapping code forced a 543px box, clipped in a 390 viewport | `.bz-g2 > * { min-width: 0 }` ≤920px so the code scrolls inside its window (box now ≤ viewport) |
| Phone showcases ("como funciona" / "negócios") | Multi-phone rows were zoom+clipped (last phone cut) | Bound `.bz-phones` (min-width:0 / max-width:100%) and make it a controlled horizontal swipe ≤720px |
| Developers SDK table | Inline `overflow:hidden` clipped the 737px table to 312px — columns unreachable | Wrapper → `overflow-x:auto` so the table scrolls; all columns reachable |

FILES_CHANGED:
- `apps/website/app/globals.css`
- `apps/website/components/marketing/HomeHero.tsx`
- `apps/website/components/marketing/pages/Developers.tsx`
- `apps/website/app/mobile-responsive-contract.test.ts` (new guard)

## Live results (production, 390px unless noted)

| Gate | Result | Evidence |
|------|--------|----------|
| HOME_MOBILE | PASS | hero legible, cards stacked, no page overflow |
| NAV_MOBILE | PASS | burger visible + opens (aria-expanded true); full-screen premium drawer with nav + Portal Developers + Beta Web + PT/EN; ~44px touch rows |
| HERO_MOBILE | PASS | headline breaks cleanly ("Kwanza." kept its accent); bg faded (opacity .2); primary CTA dominant, touch-friendly |
| HOW_IT_WORKS_MOBILE | PASS | 3-phone row bounded (clientW 342 ≤ vw) and swipeable; step cards stack; Ler/Confirmar/Pagar clear |
| BUSINESS_MOBILE | PASS | text-first; phone showcase bounded + swipeable |
| DEVELOPERS_MOBILE | PASS | code window scrolls inside (box 330 ≤ vw); SDK table scrolls (clientW 312, scrollW 737); API/SDK/Webhooks stack |
| FOOTER_MOBILE | PASS | single-column stack (`.bz-footgrid` 1fr); legal bar wraps |
| LEGAL_MOBILE (/termos, /privacidade) | PASS | TOC hidden ≤920; sections stack; no giant lines; only decorative hero blobs peek |
| FORMS_MOBILE (candidatura) | PASS | email input `type=email`; data-minimized (no NIF); no overflow |
| ZERO_HORIZONTAL_OVERFLOW | PASS | `documentElement.scrollWidth == innerWidth` on / /produto /comerciantes /developers /seguranca /sobre /candidatura /estado /activar /termos /privacidade /verificar at 390 and 430 |
| REDUCED_MOTION | PASS | `@media (prefers-reduced-motion: reduce)` present (transitions neutralised) |
| DESKTOP_REGRESSION | PASS | at 1440: mega-nav + Portal Developers visible, burger hidden, cards 2-col, hero bg opacity 1, grid 2-col — hero pixel-identical to the frozen design |

PERFORMANCE_NOTES: no new assets or scripts; changes are CSS media queries + one class. Mobile animations remain transform/opacity; no layout-triggering animation added.
ACCESSIBILITY_NOTES: burger `aria-expanded`; drawer rows are large tap targets; email/tel/PIN inputs use correct types; reduced-motion honoured. Full AT audit is a broader follow-up.

## Not changed / not done
Desktop composition, identity, copy, colors, base typography, section order, backend, Financial Live (still 503). No launch performed.

DEPLOY_COMPLETED: YES
DEPLOY_VERIFIED: YES
