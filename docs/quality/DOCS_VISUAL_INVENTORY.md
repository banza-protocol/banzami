# Developer documentation — visual inventory

Version: 1.0

Every visual device on developers.banzami.com/docs, why it is there, and every
page that deliberately has none. A diagram, table or step component exists only
where it teaches something prose would teach worse; decoration is not a reason.

Counts are per language; PT and EN are identical in structure (held by
`tools/check-docs-pt-en-structure.mjs`). Diagrams are SVG, drawn in
`apps/website/app/developers/docs/diagrams.tsx`: `role="img"`, a `<title>` and a
`<desc>` referenced by `aria-labelledby`, 3–7 nodes, one highlighted node at most
(held by `tools/check-docs-illustrations.mjs` and `tools/check-docs-dx.mjs`). No
ASCII art anywhere.

## Summary

```
DOCS_VISUAL_DIAGRAMS=13          (per language: 12 on 10 guide pages, 1 on the home page)
DOCS_VISUAL_PAGES_REVIEWED=23    (per language)
DOCS_VISUAL_JUSTIFIED_GAPS=0
DOCS_OVERSIZED_CALLOUTS=0        (tools/check-docs-editorial.mjs, limit 260 characters)
```

`DOCS_VISUAL_JUSTIFIED_GAPS` counts places where a visual would teach better and
is missing. Pages without a diagram are listed below with the reason none is
needed; those are decisions, not gaps.

## Phone behaviour

| Device | Under 600 px |
|---|---|
| `PathDiagram` | Redrawn as one step per row (`.bz-diag-narrow`): labels stay ≥ 13 px on screen instead of shrinking to ~8 px. |
| `SettlementSplitDiagram` | Redrawn vertically: source, net, fee, then the sum. The amounts are the lesson. |
| Other diagrams | Keep a 640 px minimum width and scroll inside their figure, like a wide table. The page body never scrolls sideways (sweep: `docScrollWidth == clientWidth` at 390 px). |
| Tables | Scroll inside their own container. |
| Fact grids (step, recipe, chapter, event, symptom) | Label above value. |
| "On this page" | Collapsed list above the article below 1240 px; sticky right rail from 1240 px. |

## Diagrams

| Page | Diagram | Nodes | What it teaches that prose would not |
|---|---|---|---|
| Home | `PathDiagram` — from sign-up to first payment | 7 | The order of the path at a glance, with Financial Setup highlighted as the step that waits on a review. |
| Quickstart | `PathDiagram` — same path | 7 | Orientation before twelve steps; matches the stage bar. |
| Quickstart | `FinancialSetupDiagram` — two ways in, one result | 4 | That "new Business" and "existing Business" are alternatives converging on the same readiness — the most common point of confusion. Followed by the comparison table. |
| How Banzami works | `ConceptModelDiagram` — person, workspace, project, what a project holds | 6 | Containment: which object owns which. A hierarchy is spatial. |
| Accept payments | `ResponsibilityDiagram` — the life of a payment | 6 | Which steps are the application's and which are Banzami's, in order. |
| Webhooks | `PathDiagram` — the life of a delivery | 6 | Verify comes before deduplicate and apply; the highlighted node is the security rule. |
| Refunds | `PathDiagram` — how a refund flows | 5 | `refund_source` from the paid session is the input to `createRefund`. |
| Settlements | `SettlementSplitDiagram` — 100000 → 98000 + 2000 | 3 + sum | Gross, fee and net as movements that sum to zero. |
| Receipts | `PathDiagram` — verifying a receipt | 4 | The QR, the public page and the API are the same check. |
| Accounts and transfers | `SegregatedAccountsDiagram` — one Business, one account per campaign | 4 | Segregation is spatial: separate balances under one Business. |
| DOA | `PathDiagram` — integration architecture | 6 | Where DOA's server, the SDK, the API and the payment page sit. |
| DOA | `ResponsibilityDiagram` — donor to settlement | 7 | The DOA OWNS / BANZAMI OWNS split across the whole story, next to the table that states it. |
| Security | `PathDiagram` — rotating a key without downtime | 4 | Revoke is last; the order is the whole point. |

## Comparison tables

Used where comparing is the task.

| Page | Table | Comparison |
|---|---|---|
| Quickstart | New Business vs existing Business | When to use, what you do, who decides. |
| How Banzami works | Sandbox vs Financial Live | Status, money, API rules, data, what it does not prove, keys, API, Console. |
| How Banzami works | The integration model | Concept, what it is, not to be confused with. |
| How Banzami works | What your application owns / what Banzami owns | The responsibility split. |
| How Banzami works | One pattern for every financial resource | Resource, create, confirm, idempotency. |
| Accept payments | Session vs link | Which resource to choose. |
| Accept payments | Session status; common errors | Status, meaning, what to do; response, cause, fix. |
| Webhooks | Retries and replay | Attempt and when (1 m / 5 m / 30 m / 2 h). |
| Refunds | Common errors | Response, cause, retry. |
| Settlements | Payment vs settlement | Movement, who starts it, fee, automatic or not, event. |
| Settlements | Errors and retries | Response, cause, idempotency key. |
| Receipts | Transaction reference vs proof reference | Example, what it is, where it appears, publicly verifiable, use. |
| Receipts | Verification responses | 200 / 404 / 503. |
| Accounts and transfers | What a transfer is / is not | |
| DOA | DOA owns / Banzami owns | The responsibility split. |
| DOA | Reconcile | Check and its source at Banzami. |
| Console | Roles; Activity vs Logs | Permissions; what each record answers and keeps. |
| Console | Scopes by task (`ScopeTable`) | Which scope each endpoint needs — rendered from the endpoint contracts. |
| API reference | Capabilities by credential; restricted routes; per-endpoint facts, parameters and errors | Rendered from the endpoint contracts. |
| Errors | Console errors; HTTP classes (`HttpClassTable`); catalogue of 72 codes (`ErrorCatalogue`, searchable and filterable) | |
| SDKs | Available SDKs; status by family | |
| Artifacts | Available files | |
| Security | Secret key vs webhook secret | Purpose, where it lives, rotation. |
| Changelog | Area, change, impact, action | |

## Step, recipe and chapter components

| Page | Component | Count | Why |
|---|---|---|---|
| Quickstart | `StageBar` + `StepCard` | 4 stages, 12 steps | Each step answers what, why, do, done when, next. |
| Webhooks | `StepCard` | 10 | The safe implementation pattern, in order. |
| Refunds | `StepCard` | 3 | Read `refund_source`, create, confirm. |
| Settlements | `StepCard` | 3 | Check readiness, request, confirm. |
| Sandbox testing | `RecipeCard` | 18 | Trigger, API result, event, Console, clean-up, limitations — the same shape for every scenario. |
| DOA | `ChapterFacts` | 5 | Goal, what DOA does, what Banzami does, expected result, common failure. |
| Security | `DoDont` | 1 | Key-handling rules as do / never. |
| Every guide | `NextStepCards` | 1 per page | No dead ends. |
| Home | `TaskCards` | 8 | Task-first entry. |

## Pages with no diagram, and why none is needed

| Page | Primary device | Reason |
|---|---|---|
| Events | Index table + per-event reference | A catalogue; a flow diagram would duplicate the webhook lifecycle. |
| Console | Section lists + two tables | Describes screens; a drawing of a screen would go stale. |
| API reference | Structured endpoint reference | Reference density beats illustration. |
| Errors | HTTP class table + searchable catalogue | Lookup, not explanation. |
| SDKs | Tables | |
| Artifacts | Table | |
| Sandbox testing | Recipe cards | Scenarios are independent; no sequence to draw. |
| From Sandbox toward Live | Checklists | No dates, no approval flow exists to draw. |
| Troubleshooting | Symptom cards | Lookup by symptom. |
| Support | Short sections | |
| Changelog | Table | |
| Glossary | Definition list | |

## Type and colour

- Body and headings use the system sans stack (`DOCS_SANS`); the rounded display
  face stays in the Banzami Developers wordmark only. The rounded face made
  dense reference text and tables harder to scan.
- Code uses the mono stack at 0.86 em on a neutral ground.
- Semantic colour roles (`ui.tsx`): brand `#B5101F` (active navigation, primary
  CTA); link `#9A1B22`; body `#3f3538`; muted `#6f6468`; rule `#EAE3E3`;
  info callout neutral with a left bar; warning callout amber; success
  `#1F6B47` ("Done when", "Expected result"); error `#9A1B22` on `#FFF7F6`
  ("Never"); Sandbox badge in the site banner.
- Weights capped at 700 in the article; 900 only in the wordmark.
