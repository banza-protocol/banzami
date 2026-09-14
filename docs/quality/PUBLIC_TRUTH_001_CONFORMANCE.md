# PUBLIC-TRUTH-001 — conformance

Version: 1.0

The after-state on 2026-09-14, read from the deployed surfaces. The before-state is
[PUBLIC_TRUTH_001_BASELINE.md](PUBLIC_TRUTH_001_BASELINE.md).

Order of authority: runtime → OpenAPI → published SDK → events and errors →
developer documentation → Console → marketing (high level only). Where two
surfaces disagreed, the one lower in that order was changed.

## How the truth is kept

| Mechanism | What it holds |
|---|---|
| `apps/website/lib/public-truth.ts` | The one place banzami.com writes the Sandbox, Financial Live, app-store, API-version and key-prefix facts. Home, Developers, FAQ, Suporte, Comerciantes, Produto, Sobre, the footer and the shared CTA render from it. |
| `tools/check-public-site-truth.mjs` (CI, `make check-public-site-truth`) | Every file banzami.com renders, against the runtime: OpenAPI version, runtime key prefixes (Go source), public capabilities in the assurance manifest, published-package evidence. Fails on legacy API paths, unpublished SDKs, Live/licence/certification/rail claims, store badges, a gated Sandbox, foreign key shapes, missing environment status, competitor names, superlatives, speed and roadmap promises, waitlists, "tu" forms, end-to-end-encryption claims, and a missing or nested `email_off`. Selftest: 20 mutations, each failing on its own counter. |
| `tools/e2e/website/public-truth-live.mjs` | The deployed site through Cloudflare and in Chromium at 1440, 1280, 768 and 390 px. |
| `tools/check-docs-code-examples.mjs` | Every TypeScript example in the docs, compiled against `@banzami/sdk` as the registry serves it (0.14.1), and `SDK_DOCS_REGISTRY_DRIFT` — the SDK page (PT and EN) and `llms.txt` must name the version the registry serves (mutation: EN page set to 0.14.0 → `SDK_DOCS_REGISTRY_DRIFT=1`). |
| `tools/sdk-public-install-proof.mjs` | The package npm serves, installed outside every repository: registry resolution, contents, the README (`tools/lib/sdk-readme-claims.mjs` — retired statements absent, Sandbox/Live status and docs link present) and the public package contract (subpath exports resolve, every method the API reference names is in the published types, `DELAYED` typed). The README rules are mutation-proven against the stale 0.14.0 tarball itself (`tools/lib/sdk-readme-claims.selftest.mjs`, in CI). |
| `ops/canonical-resources.yaml` + `tools/check-canonical-resources.mjs` | Every identity, workspace, project and key allowed to be active on the Sandbox, with owner and reason; anything active and undeclared fails. |
| `tools/check-docs-claims-ledger.mjs` | 2 524 documentation claims, each classified with evidence. |

## Conformance ledger

| Surface | Claim | Authority | Deployed result | Status |
|---|---|---|---|---|
| banzami.com (all pages) | Public Sandbox available, self-service, fictitious money | runtime (self-service journeys), ADR-060 | banner, footer and home status strip; fresh journey 24/24 with no operator | PASS |
| banzami.com (all pages) | Financial Live unavailable, subject to regulatory, contractual and operational approvals | assurance manifest (no public `live: true`); gateway refuses `bz_live_` | same wording on banner, footer, home, FAQ, Suporte, Developers, Comerciantes, Produto, Console, SDK README | PASS |
| Home | App in App Store / Google Play | none | removed; "A app Banzami ainda não está disponível na App Store nem no Google Play" | PASS |
| Home | Adoption counters (0/0/4/0) | none | replaced by environment status strip | PASS |
| Home | "COMERCIANTES & EMPRESAS" | `lib/entities.ts` (companies only) | "EMPRESAS E APLICAÇÕES LIGADAS AO BANZAMI" | PASS |
| Home / HowItWorks | speed ("em segundos", "menos de 10 segundos"), "o dinheiro move-se" | none | "Ler, confirmar, pago."; ledger sentence without real-money implication | PASS |
| banzami.com/developers | Second API reference | docs are canonical | landing page: capabilities, platform, environments, SVG diagram, published packages, DOA reference; every detail links to developers.banzami.com/docs. `PUBLIC_WEBSITE_SECOND_API_REFERENCE=0` | PASS |
| Developers / FAQ / Produto | SDK list | `published-packages.ts` + registry evidence | `@banzami/sdk` (npm), `banzami_client` (pub.dev) only; Python/PHP/Go/iOS/Android gone | PASS |
| FAQ | App download, "Em breve" items, "irreversíveis", Live as production | runtime | rewritten; refunds explained; no roadmap items | PASS |
| Produto | "L0 · DRY-RUN", "Operacional ao nível L0", product badges "EM PROGRESSO" | runtime | per-product status: app/merchant app in development, Console/API v1/QR+links available in Sandbox, SDKs published | PASS |
| Produto / ecras / app-demo | "Multicaixa Express integrado", "instantaneamente" | none (no rail in Sandbox) | "Comprovativo verificável"; demo labelled as example data, nothing moves | PASS |
| Produto | KYC/KYB "Não prometemos licença bancária" | ADR-058/059 | "A verificação de negócios existe na Sandbox…"; badge FINANCIAL LIVE · INDISPONÍVEL | PASS |
| Comerciantes | "Onboarding em minutos", "Vários clientes dividem a conta", "Confirmação criptográfica", "Dashboard … análises" | runtime | registration with verification; several payments to one `@banza`; verifiable receipt; realtime status | PASS |
| Candidatura | "Encriptação de ponta a ponta", "menos de 5 minutos" | none | "Ligação cifrada (HTTPS)" | PASS |
| Suporte | Conformance dossier, blocker counts, L0–L4 | too technical, stale | status (#estado), team contact, security reporting, developer help, BANZA/Banzami | PASS |
| Sobre | "equipa será apresentada em breve", waitlist | none | removed; BANZA/Banzami section (#banza) | PASS |
| Navigation / footer / CTA | anchors into the retired reference, Roadmap, Carreiras, Imprensa, waitlist, "Baixar a app", "Seguro por design", "Banzami é como Angola paga" | none | every entry lands on a page, anchor or the docs; 26 same-site links resolve | PASS |
| Regulatory | BNA licence, EMIS/PST-SP certification, approved Live, "license pending" | none held | no such wording anywhere the gate reads | PASS |
| Positioning | superlatives, competitors | editorial policy | none (gate) | PASS |
| Key prefixes | `bz_test_sk_` / `bz_test_pk_` | gateway Go source | the only shapes on the site; SDK README says `bz_live_` is refused | PASS |
| API version | v1 only | OpenAPI (all paths `/v1/`) | `PUBLIC_TRUTH.apiVersion = 'v1'`, gate-checked | PASS |
| Email links | mailto intact | Cloudflare Email Address Obfuscation vs CSP | one `email_off` region in the root layout; `MailLink` plain; 0 `/cdn-cgi/l/email-protection` on 11 pages, HTTP and browser | PASS |
| SEO | canonical, sitemap, security.txt | — | canonical on every public page; `banzami.com/sitemap.xml` lists 11 pages; `/.well-known/security.txt`; www → apex 301 | PASS |
| /produto | a heading | a11y | `h1` present (was none) | PASS |
| /verificar | the proof readers' edge limit | nginx `bz_proof_readers` 20 r/m | menu prefetch disabled for `/verificar` | PASS |
| Developer docs | SDK 0.13.0, "use HTTP until the next release" | registry: `latest` = 0.14.1 | current version 0.14.1 on the SDK page (PT/EN) and `llms.txt`; TypeScript for links, test payers (including `simulate: 'DELAYED'`), realtime and the webhook test event, compiled against npm 0.14.1; changelog rows for 0.14.0 and 0.14.1 kept as history; `DOCS_CURRENT_SDK_VERSION=0.14.1`, `SDK_DOCS_REGISTRY_DRIFT=0` | PASS |
| Console | "Live" / "aprovação institucional" | wording above | "Financial Live", approvals wording | PASS |
| SDK README (npm, `latest` 0.14.1) | Live as production, planned publishable keys, merchant-credential tour, relative repo links | runtime | read from the tarball npm serves (gitHead `348dc074`): none of the retired statements; Sandbox and Financial Live status and the docs link present; `SDK_README_STALE_CLAIMS=0`, `SDK_PUBLIC_PACKAGE_CONTRACT=PASS` (install proof 30/30). 0.14.0 remains on npm as an older version, superseded as `latest` | PASS |
| Sandbox resources after acceptance | nothing synthetic left active; nothing unclassified | `ops/canonical-resources.yaml` | `Doa-Sandbox` (project, workspace `DOA`, created 2026-09-08 — six days before this milestone, owner `contact@doadoa.app`) is declared **canonical**: the Project behind DOA's live donations and its two runtime keys. `check-canonical-resources`: 0 unclassified identities, workspaces, projects and keys. `retire-synthetic-residue.sh` dry run: 0 synthetic merchants, accounts, webhooks, consumers or projects active. Every acceptance run in this closure reported residue 0 and its fixture identities were swept. `DOA_SANDBOX_CLASSIFICATION=CANONICAL` | PASS |
| Go DB-backed tests | clean isolation | final regression | `TestClaimDueDeliveries_OneTickOneClaim` failed once ("claimed 0"): its seed was one second old and 50 older leaked PENDING rows hid it. The leak was a `defer pool.Close()` running before `t.Cleanup` (11 deliveries per run). Fixed in `e88a27c0` (40 pools now closed by `t.Cleanup`; the claim test seeds far in the past, reproduced failing with 60 due rows before, passing after); a full run leaves no webhook row | PASS |
| Explorer | encoded dot segments, cross-host redirects | developer-api broker | `%2e%2e`, `%2E.`, `.%2e`, `%252e%252e`, `%2f`, `\`, `?`, `#` refused (unit + deployed, with a control); another host never contacted | PASS |
| PT/EN | contract parity | docs gate | docs PT/EN structure and claims parity PASS; banzami.com is Portuguese-only by design (`lang="pt"`), so there is no English marketing contract to drift | PASS |
| Status page (§27) | public uptime status | no monitoring source is public | evaluated, not built: Suporte#estado states environment availability and makes no uptime claim; a live status page needs a public health source first | N/A (recorded) |

## Evidence — final regression (2026-09-14, after `@banzami/sdk` 0.14.1)

| Check | Result |
|---|---|
| Registry | `npm view @banzami/sdk version` = 0.14.1; `npm dist-tag ls` → `latest: 0.14.1`; gitHead `348dc074`, shasum `baf6c089…` |
| `node tools/sdk-public-install-proof.mjs` | 30/30 — `PUBLIC_SDK_INSTALL_FROM_REGISTRY=PASS`, `PUBLIC_SDK_LOCAL_FALLBACK=0`, `SDK_README_STALE_CLAIMS=0`, `SDK_PUBLIC_PACKAGE_CONTRACT=PASS` |
| Empty directory outside the repo, `npm install @banzami/sdk@0.14.1` | resolved `https://registry.npmjs.org/@banzami/sdk/-/sdk-0.14.1.tgz`, no `file:`/`link:`, no override; ESM, `/realtime`, `/webhooks` import |
| `tools/lib/sdk-readme-claims.selftest.mjs` | PASS (0.14.0 tarball caught: 7 retired statements, 3 missing) |
| `tools/check-docs-code-examples.mjs` | 33 examples, 0 failing, against npm 0.14.1; `DOCS_CURRENT_SDK_VERSION=0.14.1`, `SDK_DOCS_REGISTRY_DRIFT=0` |
| Cleanroom, `CLEANROOM_SDK_VERSION=0.14.1` | 26/26 — `@banzami/sdk 0.14.1 from registry.npmjs.org`; operator interventions 0; residue 0 |
| Sandbox suites | scenarios 29/29 (DELAYED: 202 PENDING → stream PAID → repeat 200 → webhook), workbench 10/10, refunds 8/8, realtime 17/17, isolation 16/16, expiry 2/2 |
| Journeys | fresh 24/24, application 18/18, quickstart 12/12, DOA tutorial 13/13 (`DOA_DOC_SPECIAL_CASES=0`) |
| Explorer in a browser | 11/11 (encoded dot segments refused, control runs), `API_EXPLORER_SECRET_LEAKS=0` |
| Console (populated fixture) | accessibility 41/41, responsive 52/52, routes 18/18 |
| Docs (deployed) | sweep 600/0, audit 85/0 (`PUBLIC_DOC_REAL_SECRETS=0`, `PUBLIC_DOC_PRIVATE_IDENTIFIERS=0`); `make check-docs-prod` PASS |
| Public site | `check-public-site-truth` PASS + selftest 20/20; deployed 60/60, 0 rewritten mailto, 26 links / 0 broken |
| Ledger (`tests/phase0/ledger-reconciliation.sh`, read-only) | 6/6 — 2 559 postings, 5 118 entries, book sums to zero |
| Rust core (real Postgres) | 686 passed, 0 failed |
| Go (real Postgres + Redis, 0 skips) | api-gateway 735, admin-api 276, developer-api 225, public-api 112, sandbox-operator 11 — all passing |
| Website / SDK | 1 112 tests / 116 tests + typecheck |
| `make security-check` | PASS — gitleaks 0 (planted-credential selftest), govulncheck 0 vulnerable modules for all four Go services built with go1.26.8 (`toolchain go1.26.8` ×6, `golang:1.26.8-alpine` ×5) |
| openpgp (GO-2026-5932) | non-actionable: binary-mode `govulncheck` on the gateway build: "No vulnerabilities found"; 0 `x/crypto/openpgp` symbols in the binary; 0 packages in the import graph |
| Canonical resources | 0 unclassified; synthetic residue 0; fixture accounts 0 |
| `make check-deploy-parity` | every deployed component matches the tree |

## Counters

```
PUBLIC_SDK_VERSION=0.14.1
PUBLIC_SDK_INSTALL_FROM_REGISTRY=PASS
PUBLIC_SDK_LOCAL_FALLBACK=0
PUBLIC_CLEANROOM_SDK_VERSION=0.14.1
SDK_README_STALE_CLAIMS=0
SDK_PUBLIC_PACKAGE_CONTRACT=PASS
DOCS_CURRENT_SDK_VERSION=0.14.1
DOCS_SDK_EXAMPLES_PUBLIC_PACKAGE=PASS
SDK_DOCS_REGISTRY_DRIFT=0
PUBLIC_WEBSITE_SECOND_API_REFERENCE=0
PUBLIC_EMAIL_OBFUSCATION_BROKEN=0
PUBLIC_LEGACY_API_REFERENCES=0
PUBLIC_API_KEY_PREFIX_DRIFT=0
PUBLIC_SITE_STALE_CLAIMS=0
PUBLIC_SITE_UNSUPPORTED_CLAIMS=0
PUBLIC_SITE_AMBIGUOUS_FINANCIAL_CLAIMS=0
PUBLIC_HIGH_RISK_CLAIMS_WITHOUT_EVIDENCE=0
PUBLIC_ENVIRONMENT_MODEL_CONSISTENT=PASS
PUBLIC_SITE_EDITORIAL_QUALITY=PASS
PUBLIC_SITE_PT_EN_CONTRACT_PARITY=PASS
PUBLIC_CROSS_SITE_BROKEN_LINKS=0
PUBLIC_REAL_SECRETS=0
PUBLIC_PRIVATE_IDENTIFIERS=0
PUBLIC_SANDBOX_CLEANROOM=PASS
PUBLIC_SANDBOX_OPERATOR_INTERVENTIONS=0
PUBLIC_TRUTH_ACCEPTANCE_RESIDUE=0
UNCLASSIFIED_SYNTHETIC_RESOURCES=0
DOA_SANDBOX_CLASSIFICATION=CANONICAL
API_EXPLORER_ROUTE_ESCAPE=0
API_EXPLORER_SECRET_LEAKS=0
DEVELOPER_API_LOGS=PASS
DEVELOPER_API_LOG_ERROR_CODE=PASS
WEBHOOK_DELIVERY_LOGS=PASS
WEBHOOK_DELIVERY_ATTEMPT_LATENCY=PASS
KNOWN_GO_STDLIB_ACTIONABLE_ADVISORIES=0
BANZADMIN_CLOUDFLARE_ERROR_BODY_LOSS=0
FINANCIAL_LIVE_STATUS=NOT_READY
FINANCIAL_LIVE_FAIL_CLOSED=PASS
PUBLIC_TRUTH_GAPS=0
```
