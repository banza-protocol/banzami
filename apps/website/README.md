# Banzami Website (`apps/website`)

Official Banzami marketing/institutional website — Angola's wallet-native payment
network, built on the open BANZA protocol.

- **Stack:** Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS 3.4
- **Language:** Portuguese only
- **Source of truth for content & claims:** [`BANZAMI_REFERENCIA.md`](../../BANZAMI_REFERENCIA.md)
  (§24 allowed claims, §25 forbidden claims, §26 sensitive info — binding).
- **Design:** implemented from the approved Claude Design handoff (clear, premium,
  fintech, Banzami reds, very white). Reproduced as clean React components — not a
  paste of the prototype HTML.

## Run locally

```bash
cd apps/website
npm install          # install dependencies
npm run dev          # http://localhost:3005
npm run build        # production build
npm run typecheck    # tsc --noEmit
```

No deploy is configured for this app. It is local-first.

## Routes

| Route | Page |
|-------|------|
| `/` | Home — hero, problema, solução, como funciona, produtos, comerciantes, programadores, segurança, conformance, sobre, CTA |
| `/programadores` | Developer Platform — API, SDKs, sandbox, casos de uso |
| `/comerciantes` | Comerciantes — aceitar pagamentos sem terminal |
| `/conformance` | BANZA Conformance / Transparência — estado real, L0–L4, PASS = evidência |
| `/sobre` | Sobre — ecossistema BANZA/Banzami/BanzAI, impacto nacional |
| `/contacto` | Contacto — canais e email oficial |

## Content guardrails (binding)

- Portuguese only. Banzami is masculine (*o* Banzami).
- **Never** claim: certified, launch-ready, production-ready, a bank, L1/L2/L3/L4
  validated, M2/M3 complete, production live, BANZA owned by Banzami.
- Always: "PASS significa evidência, não certificação" when mentioning conformance.
- No internal endpoints (`/internal/v1`), secrets, or sensitive matrix detail.

Fonts (Nunito + JetBrains Mono) load via Google Fonts `<link>` with a `system-ui`
fallback, so the build has no network dependency. QR/mockups are inline SVG/CSS —
no external images.
