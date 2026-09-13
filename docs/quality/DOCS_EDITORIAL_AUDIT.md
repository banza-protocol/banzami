# Developer documentation — editorial audit

Version: 1.0

Every public page of developers.banzami.com/docs, in Portuguese and English,
reviewed sentence by sentence in the DOCS-DX-001 global editorial pass. The
rules are in [DOCS_TERMINOLOGY_PT_EN.md](DOCS_TERMINOLOGY_PT_EN.md); the
mechanical part of them is enforced by `tools/check-docs-editorial.mjs`, which
reads every page, the reference, the error catalogue (72 codes), the event
reference, the troubleshooting symptoms and the glossary.

## Counters

```
DOCS_EDITORIAL_PAGES=23 (PT) + 23 (EN) + home
DOCS_EDITORIAL_UNREVIEWED_PAGES=0
DOCS_UNPROFESSIONAL_COPY_HITS=0
DOCS_AWKWARD_TRANSLATION_HITS=0
DOCS_MARKETING_HITS=0
DOCS_INTERNAL_LANGUAGE_HITS=0
DOCS_AI_SOUNDING_HITS=0
DOCS_EMPTY_INTRO_HITS=0
DOCS_REGIONAL_HITS=0
DOCS_OVERSIZED_CALLOUTS=0
DOCS_CLICK_HERE_LINKS=0
```

Each lint rule was shown failing on a planted sentence before it was trusted
(for example "a sério", "just", "tenant" in Portuguese prose, a 300-character
callout, a "clique aqui" link). There is no allowlist file: every hit was fixed
in the copy, not excused.

## What changed across all pages

- **Register.** Casual and colloquial wording removed ("a sério", "com doadores
  a sério", "quem quiser", "vaquinha", "é só", "just", "simply"). Financial
  language throughout: *montante*, *taxa*, *liquidação*, *beneficiário*.
- **DOA.** Rewritten as a reference story. The intro states the rule once: DOA
  is a reference implementation, not a privileged Banzami tenant, and uses the
  same public API, SDK, authorisation model, contracts, webhooks and settlement
  as any integration. PT says *cliente privilegiado do Banzami*; "tenant" is not
  used in Portuguese.
- **Internal assurance language removed** from public prose (gates, mutation,
  evidence, binding, root wallet, ADR and repair-log numbers).
- **Intros.** Every page opens with what the thing is and when to use it. No
  "Esta página explica" / "This page explains".
- **One idea per paragraph, one idea per callout.** Long callouts were split
  into prose, a table or a step.
- **Headings** are actions or searchable nouns ("Criar uma sessão de
  pagamento", "Verificar a assinatura antes de interpretar", "Rodar e revogar
  chaves").
- **Links** name their destination and CTAs name the action ("Configurar
  webhooks", "Contactar o suporte").
- **Repetition.** One canonical explanation per concept, linked from elsewhere:
  idempotency (API reference), minor units (How Banzami works), webhook
  verification (Webhooks), request_id (How Banzami works + Troubleshooting),
  Sandbox vs Live (How Banzami works).
- **Security copy** is calm and actionable: do / never, no fear language.
- **PT spelling** follows AO90 (*ativo*, *atual*, *exato*, *transação*,
  *recetor*); Angolan/European usage, never Brazilian.
- **EN** was rewritten natively, not translated from the Portuguese: sentence
  order, idiom and titles are English.

## Structured copy rewritten

| Source | Scope |
|---|---|
| `reference.tsx` + `endpoint-meta.ts` | All 30 endpoint descriptions, credentials, parameter notes and error notes. |
| `error-catalogue.json` | All 72 codes: meaning and action, PT and EN. No shouting, no repeated boilerplate suffixes. |
| `events.ts` | 7 events: when, fields, what to do, duplicates, ordering, Sandbox, DOA. |
| `symptoms.ts` | 16 troubleshooting symptoms. |
| `glossary.ts` | 29 terms. |
| `CapabilityCards.tsx` | Card titles and descriptions. |

## Page by page

Status for every row: **REVIEWED** in both languages.

| Page | Intro (EN) | Editorial notes |
|---|---|---|
| Home | Task-first: what you can build and where to start. | Task cards replace the old "primary paths"; environment status stated once with a link. |
| Quickstart | Create your first payment in the Sandbox and confirm it on your server. Twelve steps, in four stages. | Every step: what, why, do, done when, next. Stage headings added so no step sits under the h1. Prerequisites in one sentence. |
| How Banzami works | How Banzami organises an integration — workspace, project, Business — and the rules every financial resource follows. | Intro rewritten in the final pass (the earlier one was a noun list). Minor units taught at the first money example. |
| Accept payments | Collect a payment with a Payment Session, a reusable Payment Link or a QR code… | Choice table first; confirmation states and errors with fixes. |
| Webhooks | Banzami sends signed events to an HTTPS endpoint on your server… | Ten-step recipe; "verify before parsing" as a heading; retry/disable truth stated plainly ("events emitted while disabled are never delivered"). |
| Events | The seven events Banzami emits… | Per-event mini reference; only non-owner fields documented. |
| Refunds | Return all or part of a confirmed payment to the payer… | Three steps; errors with retry guidance. |
| Settlements | Pay out the balance of a segregated account to a beneficiary… | Worked example 100000 / 200 bps / 2000 / 98000, sum zero; "not automatic" in the comparison table. |
| Receipts | Every confirmed payment has a receipt with a public reference… | Transaction reference vs proof reference table. |
| Accounts and transfers | Keep funds apart per campaign, store or event… | "A transfer is / is not" table. |
| DOA | DOA is an Angolan fundraising application that uses the Banzami Sandbox… | Reference story in 16 sections; DOA OWNS / BANZAMI OWNS; chapter facts per step. |
| Console | The Console… is where you manage workspaces, projects, Financial Setup, keys, webhooks and logs. | Scope-by-task table added; key prefix and log retention stated. |
| API reference | Banzami's public API v1, endpoint by endpoint… | Canonical idempotency rules open with the timeout case. |
| Errors | Every error response uses the same envelope. Handle it by HTTP status first, then by the code field — never by the message. | Two layers: HTTP class, then searchable catalogue. |
| SDKs | The official SDKs handle authentication, idempotency, retries and webhook verification… | Language tabs only where an SDK exists. |
| Artifacts | The same API in formats for tooling… | |
| Sandbox testing | Test scenarios for every part of your integration… | 18 recipes, one shape; limitations stated (no API marks a session paid). |
| From Sandbox toward Live | Financial Live is not available… | No dates, no approval promises. |
| Security | Where to store keys and secrets, how to limit permissions, and how to rotate credentials. | Do / never; rotation order. |
| Troubleshooting | Start from what you are seeing… | Symptom → causes, check, Console, retry, request_id. |
| Support | Email developers@banzami.com from your account address… | What to include; what never to send. Address rendered outside Cloudflare's email obfuscation. |
| Changelog | Changes to the API contract, the SDK, the Sandbox and the documentation, with their impact… | Impact and action per row. |
| Glossary | The terms used in this documentation, in Banzami's context. | Aligned to the terminology table. |

## Mobile editorial quality

Checked at 375–390 px: fact grids put the label above the value, so a sentence
is never squeezed into a narrow column beside its label; diagrams either redraw
in one column or scroll inside their figure; tables scroll in their own
container; no page scrolls sideways (`tools/e2e/docs/sweep.mjs`, four widths).

## Editorial mutation tests for high-risk truths

The truths that would do harm if an edit softened them are held by gates that
fail on the source, not by review alone:

| Truth | Held by |
|---|---|
| Financial Live is unavailable (fail-closed) | `check-docs-drift`, `check-docs-claims`, claims ledger |
| Verify the webhook signature before parsing | `check-docs-dx` (webhook safety), cold reader Q7, task harness T5 |
| Events emitted while an endpoint is disabled are never delivered | `check-docs-dx` |
| Settlement is not automatic; 100000 − 2000 = 98000 | `check-docs-dx` (settlement clarity), task harness T10 |
| Minor units (100 = 1 Kz) at the first money example | `check-docs-dx` |
| DOA is not a special tenant | `check-docs-dx` (DOA contract and human flow) |
| No invented events, errors, SDK methods or fields | `check-webhook-event-catalogue`, `check-docs-error-catalogue`, `check-docs-api-reference` |
| Client-supplied payee fields are refused | `check-docs-api-reference` (refused fields) |
