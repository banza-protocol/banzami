# Developers Docs P3A — Information Architecture Reorganization

Version: 1.0
Date: 2026-07-12
Source commit at execution: `e8a9b9fa5d1d9443078e60892166fc0ea271bb64`

> **Scope note.** Sanitised: no secrets, IPs, hostnames, paths outside repo context,
> logs, env, DB URLs, tokens or PII. Repo file paths and public domain names only.

## Current (pre-P3A) route/page structure

- `developers.banzami.com/docs` — one PT page (~1250 lines): Introdução (status card,
  SDK-first model, três camadas, DOA), Quickstart (+ Testar no Sandbox), API Reference
  (credenciais, integração, idempotência, autenticação, referência por recurso,
  artefactos, cobrança/transferências/reembolsos), SDKs (matriz, preview controlado,
  contrato, famílias, exemplos, onboarding P2D, confiança/prontidão P2E), Webhooks,
  Errors, Changelog, Conceitos.
- `developers.banzami.com/docs/en` — one EN page (~960 lines) mirroring the PT areas.

## Target (P3A) route/page structure

PT: `/docs` (landing) + `/docs/{get-started,sdk,guides,reference,testing,trust,artifacts,changelog,glossary}`.
EN: `/docs/en` (landing) + `/docs/en/{same nine}`. Served by the existing generic
console-host rewrite — no middleware/routing change, no i18n framework, no new deps.

## Migration map (old section → new route)

| Old block | New PT route | New EN route |
|---|---|---|
| Intro + status card + três camadas + DOA + Produção card | /docs/get-started | /docs/en/get-started |
| SDK-first model (H3, was in Introdução) | /docs/sdk | /docs/en/sdk |
| Quickstart (curl-first, keys, anti-instruction) | /docs/get-started | /docs/en/get-started |
| Testar no Sandbox / Testing in the Sandbox | /docs/testing | /docs/en/testing |
| Credenciais/Integração/Idempotência/Autenticação/Referência por recurso | /docs/reference | /docs/en/reference |
| Artefactos técnicos de referência | /docs/artifacts | /docs/en/artifacts |
| Cobrança/Transferências/Reembolsos | /docs/guides | (EN equivalent lives in reference/resource-reference) |
| SDKs (matriz, P2C preview/contrato/famílias/exemplos, P2D onboarding) | /docs/sdk | /docs/en/sdk |
| P2E confiança/prontidão (disponibilidade, evidências, riscos, pacote, portões, postura) | /docs/trust | /docs/en/trust |
| Webhooks (como funciona, envelope, reentrega, eventos) | /docs/guides | /docs/en/guides |
| Errors (envelope + tabela) | /docs/reference | /docs/en/reference |
| Changelog | /docs/changelog | /docs/en/changelog |
| Conceitos / Concepts (19 termos) | /docs/glossary | /docs/en/glossary |

Implementation: content blocks were **moved verbatim** into
`content-pt.tsx`/`content-en.tsx` (area components), rendered by thin route pages
inside a shared `shell.tsx` (the SAME header, sidebar, layout grid, help card and
copy-toast as before — sidebar now navigates area routes). Cross-area anchors were
remapped to routes; `content-map.ts` records the migration and is enforced by
`p3a-information-architecture.test.ts`.

## Content preserved

All 16 mapped content groups (status/availability, SDK-first model, quickstart,
credential matrix, resource reference, sandbox testing, webhooks, errors,
idempotency, authentication, changelog, glossary, technical artifacts, SDK
contracts, SDK preview onboarding, trust/readiness package) — each token-verified in
both languages by the P3A test, plus all 133 pre-existing P0–P2E test assertions
updated only to FOLLOW the moved content (corpus reads + area-page renders), never
weakened.

## Public artifact URLs preserved

All 20 public artifact URLs unchanged (openapi, postman, availability, artifacts
manifest, sdk-first manifest, sdk-contract, 2 curl examples, 5 onboarding, 7 trust)
— enumerated in `content-map.ts` and existence-checked by test.

## Design/theme/layout preservation

No theme, colour, typography, component or brand change: the shell reuses the exact
header/sidebar/layout/help-card/toast markup and styles; area content is the same
JSX moved; the landing pages use only the pre-existing card/badge/callout styles.
The visual result is the same Banzami Developers experience, better organized.

## Claim-safety preservation

Every P0–P2E guarantee retained and re-verified across the reorganized corpus in
both languages: SDK-first primary; SDKs controlled preview/not published; no fake
install commands (anti-instructions only); HTTP/OpenAPI secondary protocol
reference (no official/recommended-HTTP wording); refunds/transfers Pending E2E;
webhook outbound simulated; Console demo/non-operational; Stage C not
implemented/not approved; no production/live/real-money/BNA/provider/regulatory or
certification/uptime claims; PT/EN only (fr remains 404).

Final status: **P3A INFORMATION ARCHITECTURE IMPLEMENTED — CONTENT AND CLAIMS PRESERVED.**
