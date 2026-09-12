# DOCS-PROD-001 — the public developer documentation

**FINAL_BANZAMI_SHA** `45f27fdf` · **FINAL_DOA_SHA** `2612573` (unchanged — no DOA source change was needed)

CI is **green at `98c96b41`**, the last commit carrying code, tooling or workflow
changes. `45f27fdf` and `f8eda47e` touch only this file, and the workflow's `paths-ignore`
skips `docs/**` by design — so it has no run of its own, rather than a missing one.

Every deployed component runs the source in this tree (`make check-deploy-parity`).
Nothing reaching a deployed artefact changed after `a4995b98`, so no redeploy was
required.

---

## 1. The merchant dashboard is retired, not quarantined

Everything asked of `apps/dashboard` came back negative. No container ran it and
no image for it existed on the host; `dashboard.banzami.com` has never resolved;
no CI job named it; nothing in the Console, the SDKs, the services or the core
imported it; and no capability lived only there — QR, refunds and payouts are all
core/gateway/SDK, and it merely drew UI over them.

What settled it was how it authenticated: it kept a **secret API key in
`localStorage`** and called the Gateway from the browser. CLAUDE.md §13 forbids
that outright, and in a public repository it is a worked example of the thing the
security documentation tells developers never to do. An app nobody can reach is
harmless; an app that teaches the wrong thing is not.

Removed coherently: source, deploy entry, dev-harness window, component coverage,
asset inventory, and the doc pages that described it as current. The ADR that
created it and the repair log that recorded its breakage keep their text with a
superseded marker — they are the history, and that is what they are for.
CAP-APP-002 now records `disposition: removed`, so a reader asking what happened
finds an answer rather than a gap.

Its deny entry in `deploy.sh` went too. With the name out of `ALL_SERVICES` the
branch was unreachable, and the script now rejects it as not a service at all,
which is the stronger answer. The authority-gate test asserts that instead.

| Counter | |
|---|---|
| `OLD_DEVELOPER_DASHBOARD_ACTIVE_CODE` | **0** |
| `OLD_DEVELOPER_DASHBOARD_BUILD_REFERENCES` | **0** |
| `OLD_DEVELOPER_DASHBOARD_DEPLOY_REFERENCES` | **0** |
| `OLD_DEVELOPER_DASHBOARD_DOC_REFERENCES` | **0** live (ADR-008, ADR-012, REPAIR_LOG RA-003 and one evidence report keep their text, each marked superseded) |
| `CURRENT_DEVELOPER_CONSOLE_IMPLEMENTATIONS` | **1** — `apps/website/app/developers` |

`make check-retired-surfaces` keeps it gone — the directory, the build references
and the manifest record — for this app and for `apps/checkout`. Three conditions,
all proven by mutation.

### The four matrix items — resolved 2026-09-12, under the owner's authorisation

They were VALIDATED on evidence that pointed into `apps/dashboard`, which had
been deleted. That is the worst state an item can be in: it still reads
VALIDATED, and nothing behind it can be opened.

Re-pointing the evidence at the Console would have been just as dishonest if
nobody checked whether the Console actually does these things. So every
acceptance criterion was asked of the deployed system — `tools/e2e/console/
matrix-bw-proof.mjs`, evidence at `evidence/assurance/matrix/bw-001-004-runtime-proof.json`
— and the answer decided the status rather than the other way round.

| Item | Was | Is | Runtime | Why |
|---|---|---|---|---|
| **BW-003** Gestão de chaves API | VALIDATED | **VALIDATED** | **4/4** | Generated once; never in the listing; revocation immediate (`200` → `401` on the very next call); `bz_live_` refused fail-closed. |
| **BW-004** Gestão de equipa e permissões | VALIDATED | **IN_PROGRESS** | **4/5** | Invite, five distinct roles, a read-only role refused by the **service** and not by a hidden button, immediate removal. The per-member access log is not served. |
| **BW-001** Dashboard web Banzami Business | VALIDATED | **RETIRED** | **0/1** | `dashboard.banzami.com` does not resolve. The product was retired; the Console is not its replacement. |
| **BW-002** Análises e relatórios | VALIDATED | **RETIRED** | **0/1** | `GET /v1/analytics` → 404. The engine remains in `core/api/src/routes/analytics.rs`, unexposed. |

**BW-003's fourth criterion was corrected, not weakened.** It read "clear
separation between sandbox and production". There is no production to separate
from: no live key is issued to anyone, and one presented at the Gateway is
refused fail-closed. The new wording says that, which is the stronger claim.

**BW-004 could not stay VALIDATED.** Four of its five criteria hold. The fifth —
a readable per-member access log — has no surface: `developer.audit_events` rows
are written on every membership change and no route reads them. Dropping the
criterion to keep the item green is exactly what the authorisation forbade, so
the criterion stays, the gap is recorded in `blockingIssues`, and the item is
IN_PROGRESS until a read surface ships or the criterion is withdrawn by its own
proposal.

**A fifth item had to move with them.** `IDT-002` (brand architecture) cited
`apps/dashboard` and `apps/checkout`, both deleted, and package names from before
BANZA ADR-002 inverted the naming — `@banza/sdk`, `banza_flutter`,
`banza-python`. Its acceptance criteria stated the inversion backwards. The
property holds and was re-checked against the shipped manifests
(`@banzami/sdk`, `banzami_client`, `banzami_flutter`, `banzami-python`,
`banzami/sdk-php`, `banzami-go`, with `banza-signature` correctly preserved as a
protocol wire contract), so the **status does not change** — only the evidence
and the criteria. It is named here because the authorisation's required end state
could not be reached without it.

```
IMPLEMENTATION_MATRIX_DASHBOARD_REFERENCES          = 0
IMPLEMENTATION_MATRIX_DEAD_EVIDENCE_REFERENCES      = 0   (in the re-evidenced items)
IMPLEMENTATION_MATRIX_VALIDATED_WITH_CURRENT_EVIDENCE = PASS
IMPLEMENTATION_MATRIX_UNRESOLVED_ITEMS              = 0
```

`make check-implementation-matrix` is why this will not recur: no item may cite a
retired surface as evidence, every path-shaped reference must resolve, and a
VALIDATED item may not declare its own gap. Three failure modes proven by
mutation.

**Two things it reports rather than fails, because they are not mine to change.**
Twenty path references in seventeen *other* items point at files that moved or
went before this change, and two VALIDATED items (`APP-001`, `API-003`) carry
blocking issues from before it. Each needs its own §16 proposal. They are listed
every time the gate runs so the next person meets them as a list, not a
discovery — and the gate still passes, because one that can never pass is one
people stop running.

### Two things CI found that nothing else would have

Both were in jobs added the day before, so nobody had seen them.

**The Laravel plugin's lockfile needs PHP 8.4 and its manifest said 8.2.** The
job ran at 8.3 and failed on its first run; it passed locally because this
machine has 8.5. CI is at 8.4 now, and `plugins/generic-laravel/composer.json`
declares `>=8.4.1` — what the installed tree actually requires. A manifest that
understates its floor sends an integrator to an install error that looks like
their own mistake.

**Retiring a product made the launch headline worse.** Moving BW-001 and BW-002
to RETIRED dropped launch-ready from 66 to 63 and put two items into "blocked on
internal engineering" — two things the team appears to still owe. The readiness
model had no notion of a retired item: anything not VALIDATED and not roadmap or
baseline fell through to internally-blocked. RETIRED now sits outside the launch
surface with them — never launch-ready, never code-complete, never a blocker,
because there is nothing left to unblock.

The headline is **63/74**, and exactly **one** item is blocked on internal
engineering: BW-004's per-member access log. That number is the truth this whole
exercise was for.

---

## 2. Every remaining resource, classified

`ops/canonical-resources.yaml` names every identity, workspace, project and key
allowed to be active, with owner, purpose, why it must exist now, authority and
expected lifetime. `make check-canonical-resources` reads the live Sandbox and
fails on anything active that is not named there — **a resource cannot survive by
being forgotten, because being forgotten is the failure.** A declaration that is
only a name fails too: no owner or no reason is a list, not a classification.

| Resource | Owner | Why it must exist now | Class | Lifetime |
|---|---|---|---|---|
| `fidel.monteiro@banzami.com` | operator | Banzami's own account on its own product; every Console proof was signed in as a person | canonical | permanent |
| `fidelrmonteiro@gmail.com` | operator (external role) | proves the journey from an address with no relationship to the operator | canonical | permanent |
| `contact@doadoa.app` | DOA | a live application taking real donations through this Sandbox | canonical | while DOA integrates |
| workspace **DOA** | contact@doadoa.app | holds the only ACTIVE project on the platform | canonical | while DOA integrates |
| workspace **Cleanroom Dev** | contact@doadoa.app | standing cleanroom — a journey re-proved from a clean start without minting a new identity each time | canonical | standing |
| workspace **External Cleanroom** | fidelrmonteiro@gmail.com | the same, from outside the operator's domain | canonical | standing |
| project **Doa-Sandbox** | workspace DOA | live application traffic depends on it | canonical | while DOA integrates |
| key **DOA web runtime** | Doa-Sandbox | www.doadoa.app server-side | canonical | until rotated |
| key **DOA admin runtime** | Doa-Sandbox | admin.doadoa.app server-side | canonical | until rotated |

**Eight stranded payee bindings were found and closed.** They were ACTIVE and
UNSEALED under archived projects, left by projects archived before
`ArchiveProject` learned to disable them. They were closed through the product's
own retire route — which converges on an already-archived project for exactly
this reason — not by SQL. The 111 sealed bindings stay: ADR-055 makes a binding
immutable once a payer-facing artifact exists under it, and that record does not
stop being true because the project closed.

```
UNCLASSIFIED_ACTIVE_IDENTITIES = 0    UNCLASSIFIED_ACTIVE_PROJECTS = 0
UNCLASSIFIED_ACTIVE_WORKSPACES = 0    UNCLASSIFIED_ACTIVE_KEYS     = 0
SYNTHETIC_RESIDUE_ACTIVE       = 0    (14 counters, all zero)
```

---

## 3. What the documentation audit found

### The documentation described a product you had to be admitted to

The pages described an SDK behind an approval: an eligibility step, a preview
approval, controlled access, approved partners, a readiness review, a
partner-responsibilities pack. Meanwhile the same pages told the reader to run
`npm install @banzami/sdk` — which works, for anyone, today — with
`dart pub add banzami_client` beside it.

Two contradictory products on one page, and the one a reader believes decides
whether they start. The programme is gone: the onboarding journey and its eight
stages, the preview responsibilities, the issue template, the readiness criteria,
the whole `/docs/trust` readiness package, and thirteen public artifacts.

What replaced it, because it was the genuinely useful part: a pre-integration
checklist with no gate in front of it, and `/docs/trust` rewritten as **the
security guide the documentation did not have** — where the secret key lives,
what reveal-once means, least privilege, rotation and revocation, the webhook
secret, what the Sandbox guarantees, and what never to send support.

### Three claims were simply false by the time anyone read them

| | |
|---|---|
| **Outbound webhook delivery described as SIMULATED** | On the guides and testing pages, in both languages. It is real: the operator's outbox delivers `payment_session.paid` over the public internet to the reference application, which `tests/phase0/webhook-delivery-to-doa.sh` exists to prove. |
| **"Public customer onboarding is not allowed"** | On a Sandbox whose reference application takes donations from the public every day. |
| **The artifact manifest and availability matrix** | The manifest said refunds and transfers were absent pending E2E; the matrix called the Console dashboard a demo preview with illustrative data. It reads the project's own request log and events, and `illustrative-data.test.ts` asserts no Console page renders constants. |

The machine-readable state `documented_preview` became
`served_pending_capability`. The surfaces it described are served and working; the
old name read as though they were hypothetical. What it still withholds is the
released badge, which only a released assurance capability may grant.

### Two sections the canonical IA calls for did not exist

**The Console.** Everything at `developers.banzami.com` had to be learned by
clicking. The new section leads with the model — Person, Workspace, Project,
Business, wallet accounts — because nearly every integration mistake is one of
those four mistaken for another, and states the rule that makes the rest follow:
**authority flows down, never up.** Your key identifies the Project, the Project
determines the Business, the Business determines the wallet; the ids in your
request select resources inside what is already yours and never grant access to
anything else. Then the screens in the order a developer meets them: account and
sessions; workspaces with the five roles; projects and why the Project ID
survives a rename; Financial Setup and its two genuinely different paths; keys;
webhooks; balances and logs.

**DOA as the reference implementation.** It leads with what DOA is *not*: no
endpoints of its own, no scopes of its own, no code path that names it — which is
exactly what makes it teachable. Then the boundary most integrations get wrong in
the expensive direction: DOA owns campaigns, the donor experience and its own
business state; Banzami owns the money, the pricing, the ledger and the receipts.
DOA never stores a balance of its own, because two numbers that ought to be equal
eventually are not, and then somebody has to decide which one is true. The
settlement example carries the arithmetic that makes it auditable:
`-10000000 + 200000 + 9800000 = 0`.

### English readers were getting a different product

The Portuguese pages carried four code samples the English ones did not: creating
a payment session in curl with the full response, the same in TypeScript,
verifying and handling an event, and registering and rotating a webhook secret.
An English reader reached the end of Get started without ever seeing a payment
created. Both languages now carry all four. The first-payment section also moved
to Get started in **both** languages — it had been on the API Reference page in
Portuguese and in Get started in English.

### Three ways the pages were hard to read

| | |
|---|---|
| **Every English page declared Portuguese** | Only the root layout renders `<html>`, and it says `pt` — so all twelve `/docs/en` pages told assistive technology they were Portuguese. A screen reader takes that literally and reads English prose with Portuguese pronunciation, which is worse than no declaration. |
| **`/docs/reference` scrolled sideways on a phone** | Not a table and not a code block: a paragraph containing `https://pay.banzami.com/pay/{slug}`, which has no break opportunity and ran past the box holding it. Prose components may now break a word that cannot otherwise fit. |
| **A skipped heading level** | `h1` straight to `h3` on both Get started pages — a screen reader announcing a subsection of something that is not there. |

### Troubleshooting

Eleven problems that actually come up, what each usually is, and what to do:
a 401 against a rotated key; a 403 for a scope that can never be added to an
existing key; a 404 for another project's resource (deliberate — a 403 would let
you enumerate them); a 409 for an idempotency key reused with a different body;
the webhook that never arrives; the signature that fails because the body was
re-serialised. Each row ends with an action, and the section ends by saying what
never to send support.

---

## 4. What the checks themselves got wrong

Worth recording, because a gate that is wrong in the reader's favour is the
dangerous kind.

- **The money rule took three attempts.** Guessing which fields are money from
  their names read `fee_destination` — a @banza handle — and `total_last_24h` — a
  count of deliveries — as amounts. It states the operator's own convention now:
  anything named `_minor` **is** money and must be a whole number; anything
  numeric named amount/balance/fee must carry `_minor` unless its name already
  says it is a rate, a percentage or a count.
- **The responsive sweep looked for a scrolling ancestor and never the element
  itself**, so every code block on every page came back as unescaped overflow —
  forty false findings with one real one underneath.
- **The docs drift gate had a silent path.** Its SDK section wrapped a dynamic
  import of a TypeScript module in a catch and only read the file when the import
  failed — which is the only thing that ever happens. It printed nothing, and
  nothing is indistinguishable from passing.
- **The deploy-parity gate compared two commits**, which says nothing about an
  uncommitted edit to a deployed service — the exact state where "it's deployed"
  stops being true. A real edit to `server.go` produced a green check. It reads
  the working tree now.
- **The example-id parity check** read `psess_exemplo` and `psess_example` as
  different endpoints. Each path is reduced to its OpenAPI template first.

---

## 5. Acceptance

### Documentation

| | |
|---|---|
| `PUBLIC_DOC_SINGLE_TRUTH` | **PASS** |
| `PUBLIC_DOC_STALE_CLAIMS` | **0** |
| `PUBLIC_DOC_LEGACY_CONTRACTS` | **0** |
| `DOCS_CURRENT_API_VERSION` | **v1** · `DOCS_V2_REFERENCES` **0** |
| `DOCS_CONSOLE_COMPLETE` | **PASS** — account, workspaces, members/roles, projects, Financial Setup, keys, webhooks, logs, lifecycle |
| `DOCS_SDK_CURRENT` · `PUBLIC_SDK_INSTALL_FROM_REGISTRY` | **PASS** — `@banzami/sdk` 0.13.0 (npm), `banzami_client` 0.1.0 (pub.dev); Python, PHP and Go declared unpublished with no install command |
| `DOC_ENDPOINTS_NOT_IN_OPENAPI` | **0** (2 named only to say they are not part of this contract) |
| `OPENAPI_ENDPOINTS_UNDOCUMENTED` | **0** of 24 |
| `DOA_REFERENCE_IMPLEMENTATION` · `DOA_DOC_SPECIAL_CASES` | **PASS** · **0** |
| `DOC_CODE_EXAMPLES_TESTED` | **PASS** — 74 checks over every curl, JSON, TypeScript and webhook sample |
| `DOCS_PT_EN_PAGE_PARITY` · `DOCS_PT_EN_CONTRACT_PARITY` | **PASS** — 11 areas in both languages, same endpoints on every page |
| `PUBLIC_DOC_REAL_SECRETS` · `PUBLIC_DOC_PRIVATE_IDENTIFIERS` | **0** · **0** |
| `BROKEN_INTERNAL_DOC_LINKS` · `BROKEN_DOC_ANCHORS` | **0** · **0** (279 checked) |
| `DOCS_ACCESSIBILITY` · `DOCS_RESPONSIVE` | **PASS** · **PASS** — 314 checks, 24 pages, four widths |
| `DOC_QUICKSTART_E2E` · `DOC_QUICKSTART_RESIDUE` | **PASS** (10 steps) · **0** |
| `DOCS_COLD_READER_ACCEPTANCE` | **PASS** — see below |

**The cold-reader run is the acceptance that matters.** It reads the deployed
quickstart page, extracts what the page actually tells a reader to run, and runs
*that* — it cannot execute a command the page does not contain. The SDK is
installed from the public registry into an empty directory outside every Banzami
checkout; the first call is made twice, once through the SDK and once with the
curl line the page prints; and the credential is obtained the reader's way, by
signing in with an emailed code and creating a key. No fixture route, no internal
key, no database, no operator bypass. Proven by pointing it at a page with the
install command removed, where it fails.

### Product regression

| Surface | Result |
|---|---|
| Website / Console / docs | typecheck clean, **1059 tests** |
| Every `tools/check-*.mjs` gate | green, including the four new ones |
| `security-check` | **PASSED** |
| `assure-sandbox-launch` | **passed** |
| `check-canonical-resources` | everything active is declared canonical |
| `check-deploy-parity` | every deployed component runs this tree's source |
| DOA | 495 tests; public sweep **42/42**; route sweep `DEAD_PUBLIC_ROUTES=0`; field sweep all zeros |

### New gates, all mutation-proven

| Gate | Catches |
|---|---|
| `check-retired-surfaces` | a retired app returning, or half-deleted |
| `check-canonical-resources` | any active resource nobody declared |
| `check-docs-drift` | documentation invalidated by a product change, on a pull request |
| `docs/audit.mjs` | the deployed pages contradicting the product |
| `docs/sweep.mjs` | pages that cannot be used, at four widths |
| `docs/quickstart-e2e.mjs` | a quickstart a stranger cannot follow |
| `examples-are-tested.test.ts` | a sample that stopped compiling, parsing or pointing anywhere real |
| `no-preview-programme.test.ts` | the preview framing returning |

---

## 6. Known remaining documentation defects

**NONE.**

Four things are deliberately outstanding and are not documentation defects:

- **BW-004 is IN_PROGRESS, not VALIDATED.** Its per-member access log has no read
  surface: `developer.audit_events` is written on every membership change and no
  route serves it. Either that surface ships, or the criterion is withdrawn by
  its own §16 proposal — it will not be dropped to make the item green.
- **Twenty dead evidence references in seventeen other matrix items**, and two
  VALIDATED items carrying pre-existing blocking issues. Outside this
  authorisation; listed by `make check-implementation-matrix` on every run.
- **Python, PHP and Go SDKs are not published.** The documentation says so and
  gives no install command for them, because a command pointing at a package no
  registry has returns an error that looks like the reader's mistake.
- **`analytics.rs` has no public route.** The engine exists; nothing serves it.
  BW-002 records that rather than implying a surface.
