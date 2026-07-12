# Developers Docs P3B — Visual Hierarchy & UX Polish

Version: 1.0
Date: 2026-07-12
Source commit at execution: `bda8f9480308375a2b174ed7737b7474e40f729f`

> **Scope note.** Sanitised: no secrets, tokens, IPs, private hostnames, server paths,
> raw logs, DB URLs, provider details or PII. Repo file paths and public domain names only.

## UX/visual-hierarchy issues found after P3A

1. **Home density** — the PT/EN landing pages led with a 4-bullet status card and a flat
   2-column grid; no "choose your path" entry points, no scannable state summary, no
   journeys. It read like a status card, not a documentation index.
2. **Quickstart contradiction** — the get-started quickstart (step 7) framed
   "Continue over direct HTTP (curl)… optionally… with an SDK" — i.e. HTTP primary, SDK
   optional — which contradicted the SDK-first positioning stated everywhere else.
3. **Misleading transfers badge** — the get-started capability card for Transferências
   showed a green "Disponível em Sandbox", while a developer key's transfers scope is
   Pending E2E (403). Refunds/webhooks cards also lacked credential-scoped nuance.
4. **Thin/absent page intros** — several area pages (notably PT Guides) jumped straight
   from the heading into dense content with no "what this page is for" orientation and no
   next-step links.

## Routes reviewed

PT + EN: `/docs`, and the 9 area routes each — get-started, sdk, guides, reference,
testing, trust, artifacts, changelog, glossary.

## Benchmark principles applied

- **Flask** — a light landing/index with clear entry points, each page opening with a
  short "what you'll find here" line.
- **Bitcoin Developer Reference** — explicit protocol-reference framing distinct from
  the recommended path.
- **Stripe Docs** — scannable status/availability summary, credential-accurate badges,
  and "next step" cross-links to guide the journey.

## What was improved

- **Landing homes** (`page.tsx`, `en/page.tsx`): one-paragraph positioning ("SDK-first
  payment infrastructure for Angola, Sandbox/Preview scope") · three primary path cards
  (Começar com preview SDK / Validar no Sandbox / Consultar referência técnica) · a
  concise 6-row state summary (SDKs, HTTP/OpenAPI, Produção/live, Console, refunds/
  transfers, webhooks outbound) · the full 9-section grid · three suggested journeys.
  Data lives in `shell.tsx` so the homes stay lean (< 120 lines each).
- **Quickstart reframe**: added the explicit "Caminho recomendado: SDK preview aprovado
  … use curl apenas para validar o protocolo, diagnosticar o Sandbox ou auditar chamadas
  de baixo nível" (PT) / EN equivalent; rewrote step 7 so the SDK preview is the
  implementation path and curl is diagnostic/protocol validation only.
- **Credential-scoped card badges**: Transferências / Reembolsos cards now read
  "Pendente E2E para chave developer"; Webhooks reads "Assinatura documentada · outbound
  simulado". The underlying `tone` field is preserved so the manifest-disposition
  docs-claims gate stays green (the capability reference badge is unchanged); only the
  navigational card's visible wording is made credential-accurate.
- **Page intros + next steps**: a short `PageLede` "what this page is for" and a
  `NextSteps` link row added to the thin area pages (guides, reference, testing,
  artifacts, changelog, glossary) plus orientation next-steps on get-started, sdk and
  trust. Reference pages explicitly state they are "not the recommended implementation
  path".
- **New shared helpers** `PageLede` / `NextSteps` in `ui.tsx` reuse existing tokens.

## What was NOT changed

- No theme, colour, font, typography, visual identity, layout framework or component
  replacement. New markup reuses the existing card/badge/callout/link/sidebar styles.
- Sidebar labels already matched the P3A/P3B IA — left unchanged.
- **Disclaimers were not pruned.** P3B Phase 7 permits reducing repeated disclaimers, but
  the P0–P2E claim-safety tests assert specific disclaimer strings verbatim; removing them
  would weaken guardrails. Every existing safety statement was kept intact; scannability
  was improved additively (path cards, state summary, intros) rather than by deletion.
- No content deleted; public artifact URLs unchanged (20, verified by test).

## Design/theme/layout preservation

Only content organization, copy and existing-style cards/links changed. Same brand
tokens (`#B5101F` etc.), same components, same sidebar/shell. The experience is the same
Banzami Developers documentation, clearer and more navigable.

## Claim-safety preservation

Re-verified across the polished corpus in PT and EN: SDK-first primary; SDKs controlled
preview/not published; no fake install commands; HTTP/OpenAPI secondary protocol
reference; refunds/transfers Pending E2E; webhook outbound simulated/not publicly
claimed; Console demo/non-operational; Stage C not implemented/not approved; no
production/live/real-money/BNA/provider/regulatory or certification/uptime claims;
PT/EN only.

## Before/after route purpose map

| Route | Before | After |
|---|---|---|
| /docs, /docs/en | Status card + flat grid | Positioning + 3 path cards + 6-row state + 9-section grid + journeys |
| get-started | Intro + quickstart (curl framed primary) | Intro + next-steps + SDK-first quickstart lead + credential-accurate cards |
| sdk/guides/reference/testing/trust/artifacts/changelog/glossary | Heading → dense content | Heading → `PageLede` "what's here" → `NextSteps` → content |

## Public verification plan

Verify all 20 doc routes (10 PT + 10 EN) return 200, `/docs/fr` 404, the 6 public
artifact URLs 200; confirm the new home path cards, quickstart wording, page intros and
credential badges are visible; confirm SDKs/HTTP/refunds/webhooks/Console/Stage C
safety wording persists; confirm banzami.com healthy and api/admin/pay remain 503.

Final status: **P3B UX POLISH IMPLEMENTED — CONTENT AND CLAIMS PRESERVED.**
