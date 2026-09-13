# DOCS-PROD-001 — §0–81 conformance matrix

Version 1.0 · audited 2026-09-13 · spec [DOCS_PROD_001_SPEC.md](DOCS_PROD_001_SPEC.md)

One row per spec section, generated against the spec's own headings and checked
by `tools/check-docs-prod-001-matrix.mjs`: the rows must be exactly the 82
sections, in order, each with evidence; the only verdicts are PASS,
NOT_APPLICABLE (with a reason) and PENDING_REVIEW_CEREMONY. The gate reports
`DOCS_PROD_001_GAPS` as every row that is not PASS or NOT_APPLICABLE, so the
matrix cannot read complete while a journey is still waiting.

| § | Section | Verdict | Evidence |
|---|---|---|---|
| 0 | PRECONDITION | PASS | Public API v1 only (`DOCS_V2_REFERENCES=0`, check-docs-drift); Financial LIVE fail-closed on every page; SDK 0.13.0 from npm. |
| 1 | AUDIT THE COMPLETE DEPLOYED PUBLIC DOCUMENTATION | PASS | Deployed crawl `tools/e2e/docs/audit.mjs` 50/50; claim-by-claim ledger 908 claims, `UNCLASSIFIED_CLAIMS=0` ([DEVELOPER_DOCUMENTATION_AUDIT.md](DEVELOPER_DOCUMENTATION_AUDIT.md)). |
| 2 | REMOVE ALL STALE PUBLIC CLAIMS | PASS | `PUBLIC_DOC_STALE_CLAIMS=0`, `PUBLIC_DOC_LEGACY_CONTRACTS=0` (audit.mjs, check-docs-drift); stale landing page, preview wording and pseudo-SDK example files removed. |
| 3 | DOCUMENTATION MUST BE SELF-SUFFICIENT | PASS | Cold reader 12/12 PT+EN on deployed pages; coverage gate derives every *_COMPLETE item from the spec. |
| 4 | INFORMATION ARCHITECTURE | PASS | IA: Início, Começar, Consola, SDKs, Guias, DOA, Referência (erros, eventos, limites), Testar, Segurança, Artefactos, Changelog, Glossário — PT/EN structure gate. |
| 5 | DOCUMENTATION HOMEPAGE | PASS | Docs home: capability paths, quickstart, DOA, Sandbox available / LIVE unavailable (docs/page.tsx). |
| 6 | QUICKSTART — REAL AND RUNNABLE | PENDING_REVIEW_CEREMONY | Harness `tools/e2e/docs/quickstart-e2e.mjs`: steps 1–3, 5–7 PASS; step 4 awaits operator review of application 98e69d17…; 8–12 run in `complete`. |
| 7 | COMPLETE DEVELOPER CONSOLE DOCUMENTATION | PASS | `DOCS_CONSOLE/WORKSPACE/PROJECT/FINANCIAL_SETUP/API_KEYS/WEBHOOKS_COMPLETE=PASS` derived by `tools/check-docs-coverage.mjs`. |
| 8 | CANONICAL CONCEPT MODEL | PASS | ConceptModelDiagram (SVG) + “A autoridade desce, nunca sobe” in both languages. |
| 9 | DOA — CANONICAL REFERENCE IMPLEMENTATION | PASS | DOA page; `DOA_DOC_SPECIAL_CASES=0` counted from the harness source; DOA uses only public contracts. |
| 10 | DOA ARCHITECTURE | PASS | Boundary table + DonationFlowDiagram + SegregatedAccountsDiagram (SVG) in both languages. |
| 11 | DOA STEP-BY-STEP TUTORIAL | PASS | 13-step tutorial; `tools/e2e/docs/doa-tutorial-e2e.mjs contract` 13/13 on deployed PT+EN; selftest 24 mutations. |
| 12 | DOA CODE EXAMPLES | PASS | DOA code blocks compile against @banzami/sdk from npm (`check-docs-code-examples`); payload field `reference_id` checked against core. |
| 13 | DOA SOURCE / CONCEPT MAPPING | PASS | DOA ↔ Banzami mapping: owns table, per-campaign account, webhook, receipt, settlement sections. |
| 14 | SDK DOCUMENTATION | PASS | SDK page: published packages from registry (check-docs-drift registry checks), contract, family table (`banzami/sdk-php`). |
| 15 | API REFERENCE — OPENAPI v1 IS AUTHORITY | PASS | `DOC_ENDPOINTS_NOT_IN_OPENAPI=0`, `OPENAPI_ENDPOINTS_UNDOCUMENTED=0`, `OPENAPI_OPERATIONS_UNDOCUMENTED=0`, route↔OpenAPI drift gate. |
| 16 | API EXPLORER — OPTIONAL ONLY IF SAFE | NOT_APPLICABLE | No API explorer is offered. Optional by the spec; an explorer calling the Sandbox with a pasted secret key would teach the thing §29 forbids. |
| 17 | MULTI-LANGUAGE CODE EXAMPLES | PASS | Examples: TypeScript (SDK-first) compiled; curl reference checked by drift gate; no Python/PHP examples published because those packages are unpublished and lack payment-session APIs. |
| 18 | CODE COPY UX | PASS | CodeBlock copy buttons ≥24px and keyboard-reachable (`tools/e2e/docs/sweep.mjs` 314/314). |
| 19 | AMOUNTS AND CURRENCIES | PASS | Minor units stated (“100 unidades menores = 1 Kz”) and enforced by examples-are-tested money test; glossary “Unidades menores”. |
| 20 | IDEMPOTENCY — FIRST-CLASS GUIDE | PASS | Idempotency sections + catalogue `idempotency_rule` (4xx stored → new key; 5xx/429/timeout → same key) verified in `middleware/idempotency.go`. |
| 21 | ERRORS — FIRST-CLASS GUIDE | PASS | Error catalogue, 72 codes PT/EN with action/retry/key; `DOC_ERRORS_MISSING=0`, `NOT_PUBLIC=0`, `ROUTE_DRIFT=0`; selftest 13 mutations. |
| 22 | WEBHOOK DOCUMENTATION | PASS | Webhooks guide: raw body, verify-before-parse, 5-minute tolerance (sdk webhooks.ts), 5 attempts 1m/5m/30m/2h, rotation, disable/re-enable semantics. |
| 23 | EVENT CATALOGUE — BIDIRECTIONAL TRUTH | PASS | `check-webhook-event-catalogue.mjs` bidirectional: 7 emitted = 7 documented, PT/EN. |
| 24 | QR PAYMENTS | PASS | `DOCS_QR_PAYMENTS_COMPLETE=PASS`: DYNAMIC_QR interface encodes the hosted pay URL; result via webhook or reading the session. |
| 25 | PAYMENT LIFECYCLES | PASS | Session statuses from `db/migrations/0085`; links ACTIVE/cancel; receipts CONFIRMED…REVERSED; no invented CREATED→PAID machine. |
| 26 | REFUNDS | PASS | `DOCS_REFUNDS_COMPLETE=PASS`. |
| 27 | SETTLEMENTS | PASS | `DOCS_SETTLEMENTS_COMPLETE=PASS`; worked example -100000 + 2000 + 98000 = 0; fee destination documented. |
| 28 | RECEIPTS / PROOF VERIFICATION | PASS | `DOCS_RECEIPTS_COMPLETE=PASS`; SECURE_V1, exact match, 200/404/503. |
| 29 | SECURITY BEST PRACTICES | PASS | Segurança page: server-only keys, reveal once, least privilege, rotation, webhook secrets, no secrets to support; TLS 1.2 floor not contradicted. |
| 30 | SANDBOX | PASS | Sandbox: operational, fictitious money, real webhooks — never “demo”/“simulated” (tests p3b/p3c, audit). |
| 31 | LIVE STATUS | PASS | “Financial LIVE / trilhos bancários / fornecedores externos — Indisponível · fail-closed” canonical row (p0-accuracy test). |
| 32 | CONSOLE SCREEN GUIDES | PASS | Console page: conta, workspaces/papéis, atividade, projetos, configuração financeira, chaves, webhooks, saldos/transações/registos. |
| 33 | NEXT-STEP NAVIGATION | PASS | NextSteps on every area page + previous/next chapter navigation (chapter-nav.test). |
| 34 | SEARCH | PASS | Client-side search over generated index (pages, sections, 30 endpoints, 72 errors, 7 events, SDK methods, 28 terms); `DOCS_SEARCH_INDEX_CURRENT=PASS`; nothing typed leaves the browser. |
| 35 | NAVIGATION UX | PASS | Persistent sidebar with aria-current, prev/next, mobile stacking; sweep 314/314. |
| 36 | ON-PAGE TABLE OF CONTENTS | PASS | “Nesta página” from rendered H3 anchors (every H3 has an id); collapsible on mobile; CLS ≤0.006. |
| 37 | URL DESIGN | PASS | Stable routes /docs/<area> and /docs/en/<area>; legacy /developers/docs 308 (middleware). |
| 38 | PT / EN PARITY | PASS | `DOCS_PT_EN_PAGE_PARITY=PASS` (audit), `DOCS_PT_EN_STRUCTURE_DRIFT=0`, catalogue/event/sample-method parity gates. |
| 39 | GLOSSARY | PASS | 28 terms incl. Workspace, Projeto, Configuração financeira, Business, Wallet account, Link de pagamento, Reembolso, Transação, Unidades menores. |
| 40 | CHANGELOG | PASS | Changelog with dated September 2026 entries from git history (ledger class HISTORY). |
| 41 | OLD DOCUMENTATION CLEANUP | PASS | Current-contract stale hits 0 (audit.mjs retired vocabulary; landing rewrite; preview wording removed). |
| 42 | OPENAPI ARTIFACT | PASS | OpenAPI v1 validates (`swagger-cli validate` in CI); no internal routes (route drift gate). |
| 43 | POSTMAN / OTHER ARTIFACTS | PASS | Postman: 9 requests all valid OpenAPI operations; manifest lists purpose/owner; stale Python/PHP pseudo-examples removed; TS example compiled in CI. |
| 44 | DOCUMENTATION EXAMPLES ARE CODE | PASS | `DOC_CODE_EXAMPLES_TESTED=PASS` (23 TypeScript samples + published example file); curl/JSON checked; `DOC_CODE_EXAMPLES_PT_EN_DRIFT=0`. |
| 45 | LIVE SANDBOX QUICKSTART SMOKE | PENDING_REVIEW_CEREMONY | Same harness as §6; residue measured after `complete` and retirement. |
| 46 | DOA DOCUMENTATION ACCEPTANCE — BUILD THE MISSING HARNESS | PENDING_REVIEW_CEREMONY | `tools/e2e/docs/doa-tutorial-e2e.mjs` prepared: steps 1,3,4 PASS; step 2 awaits operator review of application 0f373e3f…; 5–13 in `complete`. |
| 47 | SECURITY OF THE DOCUMENTATION ITSELF | PASS | `PUBLIC_DOC_REAL_SECRETS=0`, `PUBLIC_DOC_PRIVATE_IDENTIFIERS=0` (audit.mjs); gitleaks with repo config 0 findings on apps/website. |
| 48 | CLAIM SAFETY | PASS | `PUBLIC_DOC_UNSUPPORTED_CLAIMS=0` via check-docs-claims + claim ledger; settlement never described as automatic. |
| 49 | API VERSION POLICY | PASS | `DOCS_CURRENT_API_VERSION=v1`, `DOCS_V2_REFERENCES=0`. |
| 50 | STATUS BADGES | PASS | Badges from assurance manifest (p3b test); Sandbox available / Financial LIVE unavailable. |
| 51 | RATE LIMITS | PASS | Rate limits section: per IP and per key, 429 + Retry-After (ratelimit.go, developer_auth.go), values not a contract. |
| 52 | PAGINATION / FILTERING / SORTING | PASS | List endpoints documented with real parameters: sessions (status, limit 1–200), links (limit 1–100, cursor/next_cursor), refunds, events; gateway paging 500 fixed. |
| 53 | TIME | PASS | Dates section: UTC RFC 3339; Console local time; verifier in Luanda time. |
| 54 | IDENTIFIERS | PASS | Identifiers section: Project ID, resource ids, reference_id, event id, BZM reference, request_id; ids are not authority. |
| 55 | TROUBLESHOOTING | PASS | Troubleshooting: 13 rows incl. 401, scope, not ready, pending, webhook, signature, key reused, 429, receipt, refund, settlement. |
| 56 | SUPPORT | PASS | Support guidance in SDK, Guias, DOA, Segurança; “Abrir suporte” CTA /suporte; never send secrets. |
| 57 | SEO / DISCOVERABILITY | PASS | Per-page title/description/canonical/hreflang; developers sitemap.xml 24 docs URLs; Console X-Robots-Tag noindex (lib/docs-seo.test.ts). |
| 58 | PERFORMANCE | PASS | Measured on deployed pages: JS 461–698 KB, load 0.7–1.1 s, CLS 0.000–0.006 after a metric-matched Nunito fallback (was 0.11–0.16). |
| 59 | ACCESSIBILITY | PASS | `DOCS_ACCESSIBILITY=PASS` (sweep: keyboard, target size, headings, language attribute). |
| 60 | RESPONSIVE | PASS | `DOCS_RESPONSIVE=PASS` at 1440/1280/768/390; changelog overflow fixed. |
| 61 | BROKEN LINKS / ANCHORS | PASS | `BROKEN_INTERNAL_DOC_LINKS=0`, `BROKEN_DOC_ANCHORS=0` (366 checked). |
| 62 | DOCS ↔ PRODUCT CROSS-LINKING | PASS | Console → docs links on API keys, Configuração financeira, Webhooks, Registos, Atividade; docs → Console login. |
| 63 | README / REPOSITORY CONSISTENCY | PASS | README points to canonical docs; SDK READMEs and DOCUMENTATION_MAP carry no contradicting claim. |
| 64 | DOCUMENTATION SOURCE-OF-TRUTH MODEL | PASS | Authorities: error-catalogue.json (gateway-derived), OpenAPI, SDK compile, event emitters, assurance manifest; one generated search index. |
| 65 | AUTOMATED DRIFT GATES | PASS | CI: route↔OpenAPI, OpenAPI↔reference per operation, SDK compile, events, errors, PT/EN structure, links/claims, secrets, illustrations, coverage, claim ledger — each mutation-proved. |
| 66 | TARGETED FORBIDDEN STALE CONTRACTS | PASS | Targeted guards: retired vocabulary (check-docs-drift), p2c/p3b/p3c tests (no preview, no “do not npm install”, no simulated webhooks). |
| 67 | VISUAL DOCUMENTATION QA | PASS | Screenshots of home, quickstart, reference, DOA, search and TOC at 1440 and 390 inspected; no clipped code, broken tables or overflow. |
| 68 | EXTERNAL DEVELOPER / COLD READER ACCEPTANCE | PASS | `DOCS_COLD_READER_ACCEPTANCE=12/12` on deployed pages, both languages. |
| 69 | DOA IS A TEACHING DEVICE, NOT A PRODUCT DEPENDENCY | PASS | DOA page: “O DOA não é um inquilino especial… Se algo aqui só funcionasse para o DOA, não estaria documentado.” |
| 70 | DOCUMENT LIMITS HONESTLY | PASS | Limits current and specific: LIVE unavailable, Python/PHP unpublished, rate-limit values not contractual. |
| 71 | DELETE OLD DOCUMENTATION RATHER THAN ACCUMULATE | PASS | Removed: stale landing contracts, pseudo-SDK examples, duplicate hand-written error tables (now one generated catalogue). |
| 72 | WRITING STYLE | PASS | Plain PT-first prose, callouts sparing; reviewed during the claim audit. |
| 73 | CODE STYLE | PASS | Real method/field/package names (compile gate); placeholders `bz_test_sk_XXXX…`, `order_123`, `idem_…`. |
| 74 | DOA GUIDE — EXPECTED READER UNDERSTANDING | PASS | Tutorial covers state ownership, hosted payment, webhook idempotency, receipt, closure, pricing, beneficiary net and fee destination (contract 13/13). |
| 75 | FINAL QUICKSTART ACCEPTANCE | PENDING_REVIEW_CEREMONY | Depends on §6 `complete`. |
| 76 | FINAL DOCUMENTATION REGRESSION | PENDING_REVIEW_CEREMONY | Static regression green (website 1081 tests, typecheck, build, gates); runtime quickstart and DOA E2E pending the review ceremony. |
| 77 | DEPLOYMENT | PASS | website-frontend and api-gateway-staging deployed from the committed SHA; deployed pages verified (audit, sweep, cold reader, contract). |
| 78 | FINAL ACCEPTANCE MATRIX | PENDING_REVIEW_CEREMONY | Assembled in the final report after §6/§46 complete. |
| 79 | FINAL REPORT | PENDING_REVIEW_CEREMONY | One final report after the ceremony. |
| 80 | VERDICT | PENDING_REVIEW_CEREMONY | Verdict only when DOCS_PROD_001_GAPS=0. |
| 81 | FINAL PRINCIPLE | PASS | The self-sufficiency questions are answered by the published pages (cold reader 12/12, coverage gate). |
