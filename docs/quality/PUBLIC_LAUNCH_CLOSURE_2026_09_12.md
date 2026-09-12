# Public launch closure — 2026-09-12

Banzami Public Sandbox and DOA, closed for public release.

**Banzami** `1ae94f33` · **DOA** `2612573` · every deployed component running the
source in the tree, checked by `make check-deploy-parity`.

---

## What this session found

Fourteen defects, every one found by running something rather than reading it.
They fall into three groups, and the third is the one worth reading first.

### Things that were broken

| | |
|---|---|
| **An open redirect on a donation domain** | `www.doadoa.app/api/webhooks/payment/mock-trigger?…&return_url=https://example.com/phish` answered **307 to any host**. The route is the mock provider's callback; it shipped unconditionally, so it answered on a deployment where that provider is not available and never can be. A link that begins on the real donation domain and ends on someone else's page is a phishing primitive. Two defences now, each proven by removing the other: the route 404s unless the mock provider is active, and the donor is returned to this origin or nowhere. |
| **An OTP route in the production bundle** | `/api/__test__/otp-peek` brute-forced the bcrypt keyspace to return a live one-time code. It was gated on `NODE_ENV` and a header and did answer 404 in production — the gate was never the problem; shipping the capability was, in a repository anyone can read. The work is test work and now lives with the tests. |
| **The sandbox disclosure was absent from every first paint** | The site-wide SANDBOX bar rendered from an effect with an initial state of `false`, so every public page's first paint carried no disclosure, and a reader whose JavaScript never ran got none at all. Its own comment said it stayed visible on a read failure; the code said the opposite. |
| **Three Console controls too small to hit** | "Mostrar arquivados" (on every page — it is in the shell), "Ver registos →", and the copy-user-id button: text-only controls with `padding: 0`, so the clickable box was as tall as the text, ~13px against a 24px minimum. |
| **Three DOA controls disabled without saying why** | Onboarding's *Continuar* — on the first screen after signing in — the settlements CSV export with nothing to export, and *Guardar destino*, whose disabled state is the normal state of the page. |
| **A field labelled with a database column name** | The campaign detail screen showed the Banzami wallet account id under "Conta da campanha (**wallet_account**)". An operator matches that value against the Banzami Console, not against our schema. |
| **267 workspaces nobody could reach, and nobody could close** | See below. |

### Gates that were not gates

| | |
|---|---|
| **The schema canary watched a table that has never existed** | `check-schema-reality` — written because a current migration ledger did not imply a usable schema, and the Console was dead for seven weeks — listed `developer.projects`. The table is `developer.dev_projects`. The check failed against every database including a healthy one, so a gate that could not pass told you nothing about the day it should have fired. |
| **The binding gate enforced a decision that had been superseded** | RT04C decided bindings were immutable because no rebind route existed; ADR-055 replaced that with a seal and shipped the route. The gate kept enforcing the old decision, so a correct product failed its own check — and the check that should have caught a rebind of a *sealed* binding was checking nothing. It now enforces what ADR-055 promises, all four parts proven by mutation, and the deployed E2E it was waiting for has run: **15/15 against the Sandbox**. |
| **Four published packages and two apps had tests nothing ran** | CI had jobs for Rust, the Go services, the TypeScript SDK, the Dart client, the website and BANZADMIN — and none for `sdk/go`, `sdk/php`, `sdk/python`, `plugins/`, the hosted payer surface or the Validation Studio. Running them found what unwatched code always has: `sdk/go` unformatted; `sdk/php` with no `phpunit.xml`, so `phpunit` printed its usage and exited 0 with three test files never once executed; `plugins/generic-php` still declaring `namespace Banza` under a `Banzami\` autoload map, so the class loaded twice and every test died on a fatal. |
| **No one compared the published API to the reachable one** | A documented route that is not mounted 404s the integrator who wrote the call; a route a developer key can reach that nobody published has no contract and no deprecation path. Both directions are now read from the router, so it runs in CI with no Sandbox and no key. |
| **Five `lint` scripts that could not run** | `create-next-app` scaffolding: no app has an eslint dependency, so `npm run lint` opened an interactive installer and never returned. A script that cannot run is not a check. |

### Harnesses that proved nothing

This is the group that matters, because it is the one that produced green ticks.

**The Console harnesses wrote themselves sessions.** `mint-console-session.sh`
built a token, hashed it with the deployed session secret, and INSERTed the row
into `account_identity.identity_sessions`. It called that "a bypass of email
delivery and nothing else". It was a write into the authentication store to
produce a pass — and `lifecycle-delete` went further and INSERTed the
`identity_users` row too, because the script could only sign in an account that
already existed. Six more harnesses did the same.

A harness that can write itself a session proves nothing about whether anyone can
sign in. That is precisely what went wrong earlier in this closure, when sweeps
reported green while the session they held was the mint script's error text.

`mint-session.mjs` signs in the way a first-time developer does: request a code,
read it from the message the product sent, verify it, and let `UpsertVerifiedUser`
create the identity on the way through. **No INSERT, no session secret, no OTP
read out of the database.** Fixture addresses only, so the cleanup guard added
after a real account was deleted still governs everything it mints. The provider
credential stays on the Sandbox host and is never printed. Sign-in is rate-limited
— 20 per IP per 15 minutes — and the mint waits that window out rather than
reporting the product's own correct refusal as a broken sweep.

**The sweeps had been running against an empty account.** On an account with no
workspace and no project the Console pages are nearly empty, and a sweep of an
empty page is a pass that examined nothing. Signing in with a workspace, a project
and a key turned three clean sweeps into three failures — the three undersized
controls above, plus two failures that were the sweep's own: "Remove o projeto
definitivamente" is the Portuguese imperative of *remover* and was counted as the
English word, and `NOT_CONFIGURED` on `/financeiro` sits in a `<code>` immediately
after "Não configurado", which is the API's value beside its translation and the
point of a developer console.

**267 workspaces nobody could reach.** A harness that minted a workspace and a
project retired only the project, and then deleted the identity that created the
workspace. The workspace stayed ACTIVE with no creator to sign in as and no email
for the pattern-based cleanup to match — unreachable from the Console and from
every tool. There were 267 against three that belong to someone. Three separate
causes, each fixed where it happened, and `retire-orphaned-workspaces.mjs` retired
what had accumulated: **268 archived, 3 left** — the two Cleanrooms and DOA.

**The field sweep had to be written three times** before it examined anything.
Reading only `<dl>` pairs, fourteen of sixteen pages yielded nothing and reported
"every labelled field has a value (0 read)". Reading every rendered value, it
called a UUID residue on a card whose whole purpose is to show an operator the
project id.

**The delivery check passed on a bounce — and would have passed on a failure.**
`email-login-e2e.mjs` printed the Resend delivery status as a tick whatever the
status was, including `failed`, which means the message never left. It now says
what a bounce actually is (the controlled address has no mailbox, so
accepted-sent-rejected proves the whole path except the mailbox) and fails on a
status that means nothing was sent.

**The parity check itself.** The first version compared the deployed revision to
HEAD, which says nothing about an uncommitted edit to a deployed service — exactly
the state where "it's deployed" stops being true. A real edit to `server.go`
produced a green check. It reads the working tree now.

---

## Claims that were no longer true

- `journey.mjs` said the admin deployment could not deliver email at all and that
  login-by-email was the one leg not proven. Both surfaces now sign in with a real
  emailed code from their own verified domain.
- The admin handover doc still called `RESEND_API_KEY` "the one thing left".
- The campaign page carried a long note about a soft 404 — `notFound()` rendering
  the not-found page while answering HTTP 200 — tracked against the Next 16
  upgrade. It does not reproduce; the route sweep now asserts a real 404.
- ADR-047's "no rebind endpoint exists" bullets, superseded by ADR-055 and now
  marked as such where they stand.
- `check-rollout-secret-hygiene` F said the payment capability must never be
  enabled anywhere. It is released. F1/F2/F3 keep the property that made the
  release safe: inert outside a Sandbox, never enabled in a unit not pinned to
  sandbox, unset means off.

---

## Acceptance

### Banzami — regression

| Surface | Result |
|---|---|
| Rust core | 68 test binaries, **671 tests, 0 failures**; `fmt` clean; clippy 0 errors |
| Go services (5) | `gofmt` 0, `vet` ok, **0 failing packages** |
| Website / Console | typecheck clean, **988 tests** |
| BANZADMIN · Payer surface · Validation Studio | 120 · 21 · 108 tests, typecheck clean |
| SDKs | TypeScript 105 · Python 127 · PHP 11 · Go ok · Dart client 32 · Flutter 200 |
| Plugins | Node 31 · PHP 30 · Laravel 12 |
| Mobile | analyze clean, **262 tests** |
| Gates | every `tools/check-*.mjs` green; `security-check` **PASSED**; `assure-sandbox-launch` **passed**; `assure-reference` passed; developer / payments / project-payment-binding foundations **GO** |
| Ledger | 1812 postings, 3624 entries, **6/6, BOOK_SUMS_TO_ZERO** |
| Schema | manifest drift **none** on the deployed Sandbox (mutation-proven); reality check passes as `bl_app_runtime` |

### Banzami — authenticated Console sweeps

Run with a workspace, a project and a key, on a session minted through the
product's own sign-in.

| Sweep | Result |
|---|---|
| Locale | **28 / 28** |
| Accessibility | **32 / 32** |
| Responsive | **40 / 40** |
| Click audit | **235 work**, 2 disabled-with-reason, 5 destructive-not-pressed · dead CTAs **0** · unexplained disabled **0** · unnamed **0** · console errors **0** · 404/5xx **0** |
| Cross-project isolation | **15 / 15** |
| RBAC matrix | **22 / 22** |
| Lifecycle delete | **23 / 23** |
| ADR-055 binding seal (deployed) | **15 / 15** |

Every sweep exits 2 with **zero pass lines** on an invalid session, and the three
that mint their own fail before counting anything if the mint cannot authenticate.

### DOA

| Surface | Result |
|---|---|
| Unit | **495 passed**, 10 skipped |
| Typecheck · deps · env · topology · crypto · build-secret scan | all green |
| Accessibility · responsive · word-break | 0 serious/critical · 0 issues · 0 breaks |
| Public sweep | **42 / 42** |
| Route sweep | `DEAD_PUBLIC_ROUTES=0` — 7 public, 17 auth-gated, 1 off-on-this-deployment, 1 hard 404 |
| Field sweep (creator + operator) | dead fields **0** · raw ids **0** · raw enums **0** · unnamed inputs **0** · unnamed controls **0** · unexplained disabled **0** |

### Residue

| | |
|---|---|
| Synthetic residue (14 counters) | **all 0** |
| Fixture authority older than 24h | **0** across keys, merchants, projects, endpoints, links |
| Run manifests never cleared | **none** |
| Console fixture accounts | **0** |
| Unreachable workspaces | **0** |
| Console identities | **3** — all real |
| Active workspaces / projects / keys | **3 / 1 / 2** — the two Cleanrooms and DOA's canonical tenant |
| DOA disposable accounts | **0** |

### Deploy

`make check-deploy-parity` — every file that reaches an artefact matches the tree.

| Component | Built from |
|---|---|
| developer-api | `81403aac` |
| website-frontend | `f8c4c947` |
| api-gateway · admin-api · public-api | `ba5d2e0e` |
| core-api | `e8662c4b` |
| admin-frontend · pay-frontend | `ba5d2e0e` |
| DOA www · admin | `2612573` |

The lagging revisions differ from the tree only in test files and `package.json`
scripts, neither of which reaches a binary or a bundle — which is what the parity
gate checks, rather than comparing tags.

---

## What is deliberately still true

- **The public API is v1 only.** No `/v2`, no legacy aliases, no dual versioning.
- **`POST /v1/payment-links/{id}/mark-used` is retired**, not removed: it answers
  410 `ROUTE_RETIRED` so an old integration gets an explanation instead of a 404.
  It earns its absence from the OpenAPI document from its own source.
- **Financial LIVE does not exist** and fails closed. The site-wide SANDBOX
  disclosure is present from the first byte and is withdrawn only on a confirmed
  LIVE.
- **`apps/dashboard` was retired and deleted** on 2026-09-12, after this report
  was first written. It was never routed, ran in no container, was named by no CI
  job, was imported by nothing, and implemented no capability that lived only
  there — and it kept a **secret API key in `localStorage`** and called the
  Gateway from the browser, which §13 forbids. `make check-retired-surfaces`
  keeps it gone, and CAP-APP-002 records why.
- **Two abandoned DOA donation intents remain.** A donor who started and did not
  finish is product data, not residue; deleting them would delete the record of
  something that happened.
- **The Go standard-library advisories** reported as notices by `security-check`
  do not apply to what is deployed: all four Go services are built with
  **go1.26.8**, verified from the binaries in the running containers.
