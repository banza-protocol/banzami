# Developer Docs Audit — Evidence Record

Version: 1.0
Date: 2026-07-10
Source commit at execution: `660328ad099441071fcb28ec878b63efea8eaa7b`

> **Scope note.** Sanitised: no secrets, tokens, API keys, private endpoints,
> private hostnames, IPs, server paths, DB URLs, raw logs, raw env, raw Docker
> output, provider details or PII. Public domain names and repo file paths only.
> Read-only audit — no deploy, no publish, no runtime/service change, no Stage C.

## What was audited

1. **Public served docs** — `https://developers.banzami.com/docs` fetched read-only;
   heading structure extracted and confirmed identical to the repository source
   (8 top sections: Introdução, Quickstart, API Reference, SDKs, Webhooks, Errors,
   Changelog, Conceitos). The only `npm install` string on the page is inside the
   anti-instruction ("Não corra …"), confirming no fake install commands are served.
2. **Repository docs source** — `apps/website/app/developers/docs/` (711-line
   `page.tsx`, `glossary.ts` with 19 terms, `GlossaryTerm.tsx`, 4 test files) and
   the sibling overview page `apps/website/app/developers/page.tsx` with its
   component toolkit (`components/developers/*`).
3. **Honesty tests** — `docs.test.tsx`, `refunds-docs.test.tsx`, `glossary.test.tsx`,
   `page.test.tsx`: forbidden marketing phrasings, forbidden unverified webhook
   events, forbidden `/v1/charges`, mandatory disclaimers and anti-instructions,
   ADR-030 typed-source refund inputs, static/fetch-free rendering.
4. **Real API surface** (to ground every claim):
   - `services/developer-api` — OTP/session Console auth; workspaces/projects/
     members/keys routes; internal introspection; sandbox-only fixtures; the
     **closed scope set** with its release/binding gates (ADR-046/047): released
     `identity:read`; gated `payment_sessions:*`/`payment_links:*`; recorded but
     **pending-e2e** `payments:*`, `transfers:*`, `refunds:write`.
   - `services/api-gateway` — the developer-relevant public route inventory
     (payment sessions/links/requests, QR, webhooks endpoints/events/deliveries/
     replay, refunds, transfers, wallets, sandbox fund/simulate) and the
     fail-closed developer-key mount conditions.
5. **Console pages** — wired-to-real-API set (login/verify/invites/workspaces/
   projects/api-keys) vs static mocks (dashboard, webhooks, logs, go-live,
   settings) vs empty stubs (transações, saldos, clientes, status), per
   `apps/website/lib/developer-api.ts` usage.
6. **Platform evidence** — `evidence/developer-platform/` E2E results (F0-DP-001..016
   PASS except webhooks outbound = SIMULATED and Console-UI item = BLOCKED), gap
   matrix, and the docs↔website alignment record (PASS 15 · SIMULATED 1 · BLOCKED 1).
7. **SDK packaging** — six SDK directories with package identifiers; no
   `publishConfig`/registry evidence → not published (docs' non-publication claim is
   accurate).
8. **Benchmarks** — Flask, Bitcoin Developer and Stripe documentation patterns
   (structure layering, reference depth, fixtures, multi-language examples).

## Key findings (full detail in the audit)

- **Score 4.5/10 fintech-grade** — integrity 9/10 (test-guarded honesty, unique
  among the benchmarks), reference/DX 2–3/10.
- Three endpoints documented vs dozens existing; zero response bodies; no curl; one
  code language; no pagination/rate-limits/versioning/error-envelope; idempotency
  never shown in code; webhook retry contract undocumented; no sandbox test
  scenarios despite the API existing; quickstart dead-ends at an SDK that must not
  be installed.
- **Risk R1:** overview-page diagrams use unverified `payment.*` event vocabulary,
  outside the honesty-test perimeter.
- **Risk R2:** Console mock/stub pages can read as operational.
- **Risk R3:** refunds/transfers badged "Disponível em Sandbox" while the reader's
  developer-key scopes for them are pending-e2e — credential↔capability matrix
  needed.
- No production/live/real-money claims found anywhere (correct); SDK honesty
  correct; Console correctly framed as not a public API.

## Deliverables of this audit

- [../../docs/developer/DOCUMENTATION_AUDIT.md](../../docs/developer/DOCUMENTATION_AUDIT.md)
  — verdict, scores, gaps, risky claims, benchmark table, page inventory,
  P0/P1/P2 roadmap, acceptance criteria.
- [../../docs/developer/DEVELOPER_DOCS_INFORMATION_ARCHITECTURE.md](../../docs/developer/DEVELOPER_DOCS_INFORMATION_ARCHITECTURE.md)
  — proposed tree, navigation model, content-sourcing rules, honesty-system
  extensions.

## Non-usage confirmation

No deploy, publish, image rebuild, service start/restart, runtime or routing
change, database command, migration, Stage C implementation or external-provider
command was used. The only network activity was read-only HTTPS fetches of the
public documentation page. No secret values were read, printed or committed.

Final status: **DEVELOPER DOCUMENTATION AUDIT COMPLETE — REDESIGN NOT IMPLEMENTED.**
