# Banzami Developers Documentation — Audit

Version: 1.0
Date: 2026-07-10
Audited surface: `developers.banzami.com/docs` (public, served) + repository source
(`apps/website/app/developers/**`) + Developer Platform evidence
(`evidence/developer-platform/*`). Benchmarks: Flask, Bitcoin Developer, Stripe.

> **This is an audit and plan only. The redesign is NOT implemented in this PR.**

---

## 1. Executive verdict

The current documentation is a **single, well-crafted, unusually honest page** — and
that is both its greatest strength and its structural ceiling. Integrity is
exceptional for the sector: availability claims are conservative, uniformly
sandbox-scoped, and **enforced by unit tests** (forbidden marketing phrasings,
forbidden unverified webhook events, forbidden legacy endpoints, mandatory
disclaimers). No fintech benchmark audited here test-guards its own honesty; Banzami
does. But as *developer documentation*, it is far from fintech-grade: there is no
real API reference (no response bodies anywhere, three concrete endpoints
documented out of dozens that exist), no curl, one code language, no pagination/rate
limit/versioning/error-envelope documentation, no runnable quickstart, and a
Developer Console whose non-wired pages (dashboard, webhooks, logs + four stubs) can
mislead a visitor about what is operational.

**Verdict: honest brochure, not yet documentation. Rebuild the information
architecture around the real, evidence-backed API surface — without losing the
test-guarded honesty system, which must be extended, not diluted.**

## 2. Score

| Dimension | Score /10 |
|---|---|
| Honesty / claim integrity | 9 |
| Information architecture | 3 |
| Quickstart / time-to-first-call | 3 |
| API reference completeness | 2 |
| Code examples (languages, copy-pasteability) | 3 |
| Webhooks documentation | 6 |
| Errors documentation | 2 |
| Glossary / concepts | 7 |
| Console ↔ docs coherence | 4 |
| **Overall (fintech-grade)** | **4.5 / 10** |

## 3. Strengths

1. **Test-guarded honesty** — `docs.test.tsx` / `refunds-docs.test.tsx` /
   `glossary.test.tsx` enforce: only the 5 verified webhook events may appear;
   unverified events are forbidden; `/v1/charges` is forbidden; "Não corra
   `npm install @banzami/sdk`" anti-instruction is mandatory; refund inputs must be
   typed-source (ADR-030); marketing phrasings are banned. This is a genuine
   differentiator — keep and extend it.
2. **Webhook signature documentation** is near-benchmark quality: `banza-signature`
   header format, HMAC-SHA256 over `"{t}.{body}"`, 5-minute replay window,
   at-least-once + no-ordering semantics, dedupe guidance, SDK `constructEvent`.
3. **Glossary**: 19 contextual terms, single source of truth, accessible popovers,
   deep-linked concepts section.
4. **Status badge system** (Disponível em Sandbox · Em validação contínua ·
   Brevemente · Produção em preparação) — the right idea; needs to become a single
   sourced availability map.
5. **SDK honesty**: explicitly not published to npm/PyPI/Packagist; maturity matrix
   instead of fake install commands.
6. **Real quickstart skeleton** (10 steps, OTP → workspace → project → key →
   `GET /v1/me` verification) matching the real Console flow.
7. Accessible, static, fetch-free page (fast, private, test-asserted).

## 4. Critical gaps

1. **No API reference worth the name.** Three endpoints documented
   (`POST /v1/payment-sessions`, `GET /v1/me`, `POST /v1/refunds`); the
   real gateway exposes dozens of developer-relevant routes (payment sessions incl.
   `/link` + `/qr`, payment links + public pay flow, payment requests, QR
   static/dynamic/decode/pay, webhooks endpoints/events/deliveries/replay, refunds,
   transfers, wallets/balances, sandbox fund/simulate). **Zero response bodies are
   documented anywhere.**
2. **No curl; one language.** Only TypeScript (+ one bare HTTP request line). No
   Python/PHP/Go/Dart examples despite an SDK matrix listing all of them. Samples
   are illustrative, not runnable; the quickstart's `GET /v1/me` shows no
   request/response.
3. **No conventions layer**: no error envelope shape, no HTTP-status↔code catalog,
   no pagination, no numeric rate limits or `Retry-After` guidance, no versioning/
   deprecation policy, no authentication deep-dive (key → short-lived token exchange
   is mentioned, never shown).
4. **Idempotency is preached, never shown** — no header/param in any sample.
5. **Webhook retry policy unspecified** — "reentrega em caso de falha" with no
   backoff schedule, max attempts, or timing (the outbox worker has a contract;
   document it).
6. **No sandbox test scenarios** — no fixtures/simulate documentation (the gateway
   has `/v1/sandbox/{status,instruments,fund,simulate/payment}`), no "force a
   failure" amounts, no test wallet ids — Stripe's test-cards equivalent is absent.
7. **Quickstart dead-ends at the SDK step**: the sample imports `@banzami/sdk`, the
   docs (correctly) forbid installing it, and no HTTP-first alternative path is
   given. Zero-to-first-successful-call is currently **not achievable from the docs
   alone**.
8. **Single-page architecture** cannot host the above; navigation is 7 anchors +
   appendix, with no guide/reference separation.
9. Changelog has four entries all dated "Julho 2026" — no granularity or versions.
10. No security best-practices page (secret handling is scattered prose).

## 5. Misleading / risky claims (regulatory & trust lens)

| # | Finding | Risk | Required action |
|---|---|---|---|
| R1 | **Overview page (`/developers`) diagrams use unverified event vocabulary** (`payment.created/confirmed/failed/refunded`) and an SDK-ecosystem diagram (iOS/Android/REST) not matching the /docs matrix. These contradict the verified-events rule that /docs tests enforce — and are **not test-guarded**. | Developers build against event names that don't exist; honesty system silently bypassed on the sibling page. | P0: align or remove; extend forbidden-token tests to the overview page. |
| R2 | **Console pages that look operational are mocks/stubs**: dashboard, webhooks, logs, go-live, settings are static mocks; transações, saldos, clientes, status are empty stubs. Only auth/invites/workspaces/projects/api-keys are wired to real APIs. | A logged-in developer sees webhook endpoints/deliveries that are fake data — direct trust/regulatory exposure for a payment operator. | P0: visibly label mock pages ("pré-visualização — dados ilustrativos") or gate them; docs must state which Console areas are live. |
| R3 | **Credential ambiguity on refunds/transfers**: /docs badges refunds and transfers "Disponível em Sandbox" (they were E2E-verified), but developer-key scopes `refunds:write`, `transfers:*`, `payments:*` are **recorded and not yet enforced by any released route** ("pending-e2e"); the released developer-key surface is `identity:read` + payment_links/payment_sessions scopes (gated on binding). A developer with a Console key reading /docs will call `POST /v1/refunds` and get 403/401. | "Available in Sandbox" is true for the platform, false for *the reader's credential* — the most likely first failure a real integrator hits. | P0: a credential↔capability matrix (which key type can call which endpoint today). |
| R4 | Webhooks: /docs says "Jornada completa verificada em Sandbox"; platform evidence records outbound delivery as **SIMULATED** in the E2E suite (a real reference-app journey exists, but scoped). Console webhooks page is a mock. | Over-reading of delivery guarantees. | P0/P1: scope the claim precisely + document retry contract; keep the existing scoped-email honesty pattern. |
| R5 | "Parcial — webhooks + payment links" style maturity claims lack a link to the evidence that backs them. | Unverifiable claims. | P1: link maturity matrix rows to evidence/alignment doc statuses (SUPPORTED/LIMITED/NOT_PUBLIC). |

**What is done RIGHT and must stay:** no production/live/real-money claims anywhere;
"Produção em preparação" everywhere; "Nunca há dinheiro real" disclaimers; SDK
non-publication warnings; Console described as "não é uma API pública"; forbidden
marketing-phrase tests. **None of these may be weakened by the redesign.**

## 6. Benchmark comparison

| Pattern | Flask | Bitcoin Developer | Stripe | Banzami today |
|---|---|---|---|---|
| Guide vs Reference separation | ✅ Quickstart → Tutorial → Patterns → API | ✅ Guide / Reference / Examples / Glossary | ✅ Guides + full API reference | ❌ single page mixes both |
| Runnable quickstart (zero→first success) | ✅ minimal app in minutes | ✅ RPC examples | ✅ copy-paste + test keys inline | ❌ dead-ends at SDK step |
| Multi-language examples | n/a (one language, complete) | ✅ curl/RPC | ✅ 7+ languages, switcher | ❌ TS only, no curl |
| Request AND response schemas | ✅ full API docs | ✅ every RPC result | ✅ every field, expandable | ❌ requests partial, responses absent |
| Error model catalog | ✅ | ✅ | ✅ typed errors + handling guide | ❌ token list only |
| Pagination/rate limits/versioning | ✅ | partial | ✅ explicit, with headers | ❌ absent |
| Test scenarios / fixtures | n/a | ✅ regtest/testnet guides | ✅ test cards, amounts, clocks | ❌ absent (API exists!) |
| Webhooks: signature + retries | n/a | n/a | ✅ both | ⚠️ signature excellent, retries absent |
| Glossary | partial | ✅ dedicated | partial | ✅ strong |
| Honesty enforcement by tests | ❌ | ❌ | ❌ | ✅ **unique strength** |
| Changelog / versioned releases | ✅ | ✅ | ✅ dated API versions | ⚠️ 4 undated-granularity entries |
| OpenAPI / machine-readable spec | n/a | n/a | ✅ | ❌ |

Takeaways adopted: **Flask** → Quickstart/Tutorial/Guides/Reference layering and
"one complete path first"; **Bitcoin Developer** → hard Guide/Reference/Examples/
Glossary separation with a concepts spine; **Stripe** → per-endpoint
request+response+errors, test-scenario fixtures, key-safety warnings inline, and a
credential-scoped view of what the reader can actually call.

## 7. Proposed documentation architecture (summary)

Full tree, page inventory and navigation model:
[DEVELOPER_DOCS_INFORMATION_ARCHITECTURE.md](DEVELOPER_DOCS_INFORMATION_ARCHITECTURE.md).

```text
/docs
├── Começar        → Introdução · Quickstart (curl-first) · Tutorial completo · Ambientes (Sandbox vs Produção)
├── Guias          → Autenticação e chaves · Sessões de pagamento · Payment links · QR ·
│                    Transferências · Reembolsos · Webhooks · Idempotência · Erros · Segurança
├── Referência     → Convenções (auth · erros · paginação · rate limits · versionamento) ·
│                    um capítulo por recurso com request+response+erros · OpenAPI (futuro)
├── Testar         → Cenários de teste no Sandbox · fixtures · simulate · dados de teste
├── SDKs           → matriz de maturidade evidenciada · consumo por código-fonte
├── Plataforma     → Disponibilidade (mapa único de badges) · Console: o que está ativo · Going Live (pendente)
├── Changelog      → entradas datadas
└── Conceitos      → glossário (mantido)
```

## 8. Roadmap — P0 / P1 / P2

### P0 — honesty & unblock the first integration (must precede everything)
1. Align or remove the overview-page diagrams' unverified event/SDK vocabulary;
   **extend the forbidden-token tests to the overview page**.
2. Label all mock/stub Console pages visibly ("pré-visualização — dados
   ilustrativos"); add a "Console: o que está ativo" docs page.
3. **Credential↔capability matrix**: which key/credential can call which endpoint
   in Sandbox today (developer key: `GET /v1/me` + gated payment_links/
   payment_sessions; merchant credential: the wider verified surface; scopes
   pending-e2e listed as such).
4. **Curl-first quickstart** that actually completes: request+response for
   `GET /v1/me` and one payment-session creation; no SDK required.
5. Document the **error envelope** + status↔code catalog for the endpoints already
   referenced.
6. Document the **webhook retry contract** (schedule, attempts, timing) from the
   outbox worker's actual behaviour.

### P1 — reference depth
7. Split single page into the IA above (guides vs reference).
8. Per-endpoint reference for the evidence-backed surface: payment sessions
   (+link/+qr), payment links (+public pay), refunds, transfers, webhooks
   endpoints/events/deliveries/replay, QR — request, response, errors, idempotency
   header shown in every mutating example.
9. Conventions chapter: pagination, rate limits (numbers + headers), versioning/
   deprecation policy, authentication deep-dive (key→token exchange shown).
10. Sandbox testing chapter: fixtures, `sandbox/fund`, `simulate/payment`, test
    scenarios and deterministic outcomes.
11. Multi-language examples: curl (canonical) + TypeScript + Python + PHP, sourced
    from the real SDK code where it exists.
12. Security best-practices page; maturity matrix rows linked to evidence statuses.
13. Dated, versioned changelog.

### P2 — excellence
14. OpenAPI spec generated/validated against the gateway router; reference pages
    generated from it; Postman collection.
15. Language switcher; EN translation.
16. Interactive webhook tester / signed-payload generator in the Console (real,
    not mock).
17. DOA-style end-to-end case study as the flagship tutorial.
18. Availability badges driven by one machine-readable status map consumed by both
    docs and tests.

## 9. Page inventory

**Create (new):** Tutorial completo · Ambientes · Autenticação e chaves · Sessões de
pagamento (guia) · Payment links (guia) · QR (guia) · Idempotência · Erros (guia +
catálogo) · Segurança · Convenções da API · Referência por recurso (8 capítulos) ·
Testar no Sandbox · Console: o que está ativo · Disponibilidade (mapa único).

**Rewrite:** Quickstart (curl-first, runnable) · API Reference (split & deepen) ·
Webhooks (add retry contract + testing) · Errors (envelope + catalog) · Changelog
(dated entries) · SDKs (evidence-linked matrix).

**Remove or soften:** overview-page `payment.*` event diagram vocabulary (replace
with the 5 verified events or a generic unlabeled flow); SDK-ecosystem diagram
(iOS/Android/REST) until backed; any Console screenshot/copy implying dashboard/
webhooks/logs pages show real data.

**Must remain (disclaimers — do not weaken):** "Produção em preparação" ·
"Nunca há dinheiro real" · sandbox-default framing · "Não corra `npm install
@banzami/sdk`" · "A Console não é uma API pública" · scoped-email honesty wording ·
all forbidden-phrase and forbidden-event test assertions.

## 10. Acceptance criteria for the future implementation PR

1. Every availability claim traces to an evidence file or a guarding test; the
   badge set is sourced from one status map.
2. Forbidden-token/honesty tests extended to every developer-facing page (including
   the overview) and to the 5-verified-events rule; existing tests keep passing.
3. No install command for any unpublished package; anti-instruction retained until
   publication is real.
4. Quickstart is executable end-to-end in Sandbox with curl only, showing real
   request AND response bodies, in ≤ 15 minutes.
5. Every documented endpoint shows request schema, response schema, error cases,
   and (for mutations) the idempotency mechanism in the sample.
6. Credential↔capability matrix present and consistent with the enforced scope set.
7. Mock/stub Console pages carry a visible non-operational label (or are gated).
8. No production/live/real-money availability claims; Developer Console not claimed
   operational beyond the wired pages; no Stage C/runtime changes ride along.
9. Sanitised: no secrets, tokens, real keys, private endpoints, IPs, server paths.

## 11. Final recommendation

**Do not implement the documentation redesign in this PR.** This audit and the
information-architecture plan are the deliverables. Implementation should proceed as
a separate PR (or series) following the P0 → P1 → P2 roadmap, gated by the
acceptance criteria above — starting with the P0 honesty items, which are small,
high-impact and de-risk everything that follows.
