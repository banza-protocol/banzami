# Developers Docs P3C — Public Post-P3B Audit & Final Polish

Version: 1.0
Date: 2026-07-12
Source commit at execution: `a4623dbeb3626206e90eb8fff3b0fe92e1aaa6aa`

> **Scope note.** Sanitised: no secrets, tokens, IPs, private hostnames, server paths,
> raw logs, DB URLs, provider details or PII. Public domain names and repo paths only.

## Executive verdict

After P3B, `developers.banzami.com/docs` already reads as a real, multi-area developer
documentation site: a scannable landing, a 9-area IA, per-page intros, journey links, an
SDK-first quickstart and credential-accurate badges. A live page-by-page audit of all 21
routes (10 PT + 10 EN + `/docs/fr`) confirmed the structure is professional and honest,
with **four concrete polish gaps** worth closing: (1) the SDK and Trust pages opened on an
`<h3>` while every sibling opened on an `<h2>` (broken heading hierarchy); (2) the Testing
pages carried a duplicate-title `<h3>` identical to their `<h2>`; (3) EN Guides was missing
the Charges/Transfers/Refunds narrative that PT Guides has (PT/EN parity gap); (4) the
Changelog and Glossary pages had no next-step links. All four are fixed in this PR. No
critical issues; no claim-safety problems found.

**Verdict: professional and honest. The four fixes are the final hierarchy/parity polish.**

## Scores (out of 10)

| Dimension | Score | Note |
|---|---|---|
| Structure | 9 | Clean 9-area IA per language; the H2/H3 inconsistencies (now fixed) were the only structural blemish. |
| Visual hierarchy | 8 → 9 | Fixed lone-H3 openings + duplicate-title stacks. |
| Navigation | 9 | Sidebar labels match the IA; active state + PT/EN switch + home link work. |
| Developer journey | 9 | Primary path cards + 3 profile journeys + per-page next-steps (now incl. changelog/glossary). |
| SDK-first clarity | 10 | Quickstart, badges and reference framing all state SDK-first + curl-as-diagnostic. |
| Claim-safety | 10 | Pending-E2E, simulated webhooks, demo Console, Stage-C-not-approved, no overclaims — all held. |
| PT/EN parity | 8 → 9 | Closed the EN Guides Charges/Transfers/Refunds gap. |
| Artifact discoverability | 9 | Artifacts page + manifest link every public artifact; URLs unchanged. |
| Benchmark similarity (organization) | 9 | Landing → get-started → guides/reference split → testing/trust → glossary mirrors Flask/Bitcoin/Stripe structure. |

## Route-by-route audit (live HTML)

| Route (PT & EN) | First impression | Finding | Action |
|---|---|---|---|
| `/docs`, `/docs/en` | Clean landing: positioning, 3 path cards, 6-row state, 9 section cards, journeys | Good | — |
| get-started | Intro + SDK-first quickstart + credential-accurate cards | Good | — |
| sdk | Strong SDK-first content | Opened on `<h3>`; stray mid-page `<h2>SDKs` after H3s | Add top `<h2>SDKs`; demote mid H2 → H3 "maturity matrix" |
| guides | PT: charges/transfers/refunds/webhooks | EN had only webhooks | Port charges/transfers/refunds to EN (claim-safe) |
| reference | Credential matrix + resource reference; states "not the recommended implementation path" | Good | — |
| testing | Sandbox validation + limits | Duplicate-title `<h3>` == `<h2>` | Remove redundant H3 |
| trust | Availability, evidence, risks, gates, posture | Opened on `<h3>` (no H2) | Add top `<h2>` title |
| artifacts | Public Sandbox/Preview artifacts + links | H2 + near-dup H3 ("técnicos de referência") — meaningful subsection, kept | — |
| changelog | Dated, categorised entries | No next-step links | Add NextSteps |
| glossary | 19 concepts | No next-step links | Add NextSteps |
| `/docs/fr` | — | 404 (correct) | — |

## Benchmark comparison (organization only, not visual)

| Principle | Flask | Bitcoin Dev | Stripe | Banzami (post-P3C) |
|---|---|---|---|---|
| Clear entry point / landing | ✅ | ✅ | ✅ | ✅ landing + 3 path cards |
| Quickstart ≠ reference separation | ✅ | ✅ | ✅ | ✅ get-started vs reference routes |
| Guide vs reference separation | ✅ | ✅ | ✅ | ✅ guides vs reference routes |
| Consistent heading hierarchy | ✅ | ✅ | ✅ | ✅ (fixed: all pages open H2) |
| Next-step navigation | partial | ✅ | ✅ | ✅ per-page NextSteps |
| Glossary section | partial | ✅ | partial | ✅ dedicated route |
| Reference-oriented API structure | n/a | ✅ | ✅ | ✅ credential matrix + resource reference + OpenAPI |
| Journey-based entry points | partial | n/a | ✅ | ✅ 3 profile journeys |
| Honesty enforcement by tests | ❌ | ❌ | ❌ | ✅ P0–P3C suites (unique) |

## Critical issues

None.

## Minor polish issues (all fixed in this PR)

1. SDK & Trust pages opened on `<h3>` — added consistent `<h2>` page titles.
2. Testing pages had a duplicate-title `<h3>` — removed the redundant heading.
3. EN Guides lacked Charges/Transfers/Refunds — ported from PT with typed-source
   (ADR-030) fields and Pending-E2E/403 credential notes intact.
4. Changelog & Glossary lacked next-step links — added.

## Fixes intentionally deferred

- **Disclaimer de-duplication** (the closing "not Production contracts / do not activate
  live rails / regulatory approval" sentence recurs across sdk/trust/artifacts). Deferred
  because the P2A/P2B/P2E claim-safety tests assert those exact strings; removing them
  would weaken guardrails. One strong reminder per page already exists; repetition is a
  safety feature here, not a defect.
- **Artifacts H2/H3 near-duplicate** ("Artefactos" / "Artefactos técnicos de referência")
  — kept: the H3 is a meaningful subsection title, not a pure duplicate.

## Before/after summary

Before: professional multi-area docs with two heading-hierarchy blemishes, an EN Guides
content gap, and two pages missing next-steps. After: every area page opens on a
consistent H2 title, no duplicate-title stacks, PT/EN Guides at parity, and next-step
navigation on all pages — with zero design/theme change and every claim-safety guarantee
intact.

## Public verification plan

Verify all 20 doc routes (10 PT + 10 EN) → 200, `/docs/fr` → 404, 6 public artifact URLs
→ 200; confirm SDK/Trust pages show an H2 title, EN Guides shows Charges/Transfers/Refunds,
changelog/glossary show next-steps; confirm SDK-first/curl-diagnostic/Pending-E2E/simulated
/demo-Console/Stage-C-not-approved wording persists; confirm banzami.com healthy and
api/admin/pay remain controlled 503.

## Design/theme/layout preservation

Only heading levels, section ordering, EN copy (guides parity) and next-step links changed.
Same brand tokens, components, sidebar and shell. No new visual system, framework or colour.

## Claim-safety preservation

Re-verified across the polished corpus in PT and EN: SDK-first primary; SDKs controlled
preview/not published; no fake install commands; HTTP/OpenAPI secondary; curl
diagnostic-only; refunds/transfers Pending E2E (403 for developer keys); webhook outbound
simulated/not publicly claimed; Console demo/non-operational; Stage C not implemented/not
approved; no production/live/real-money/BNA/provider/regulatory/certification/uptime
claims; PT/EN only.

Final status: **P3C PUBLIC AUDIT & POLISH IMPLEMENTED — CONTENT AND CLAIMS PRESERVED.**
