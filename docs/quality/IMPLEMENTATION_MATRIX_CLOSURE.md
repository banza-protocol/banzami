# Implementation Matrix — Closure Report

**Version:** 1.0
**Date:** 2026-09-13

| | |
|---|---|
| `FINAL_BANZAMI_SHA` | **`bca0a0a5`** |
| `FINAL_DOA_SHA` | **`2612573`** (clean) |
| CI | **GREEN at `bca0a0a5`** |
| Deployed | developer-api + website-frontend at `badf5dc6`; parity verified at HEAD. Nothing since is product-serving source, so nothing was redeployed |
| Verdict | see §12 |

---

## 1. What this closes

BW-004 was fixed by building the product capability, not by withdrawing the
criterion. Twenty dead evidence references were classified and resolved. Two
VALIDATED-with-blockers were resolved. The matrix gate now **fails** on six
states it used to print. The readiness model reports named buckets.

Along the way three things surfaced that nobody had asked for, and each was a
live falsehood in a VALIDATED item:

- **every public host completed a TLS 1.0 handshake**, `pay.banzami.com`
  included, while SEC-001 read VALIDATED on "TLS 1.3 obrigatório";
- **payment requests had been removed as a critical authorization defect** on
  2026-09-01, and three items were still VALIDATED on the 404 it left behind;
- **BANK-001 and BANK-002 asserted BLOCKED on no evidence at all.**

`ACTIVE_INTERNAL_BLOCKERS` went 1 → 2 → **0** over the run: BW-004 closed, then
SEC-001 and APP-001 appeared as real gaps once their evidence was examined, then
both were genuinely fixed.

---

## 2. BW-004 — Workspace Activity

`developer.audit_events` had been written on every invite, accept, role change,
removal, revocation and workspace/project/key lifecycle event since the domain
shipped. **No route had ever read it.** That is worse than not recording: the
answer to "who removed this person" sat in a table nobody could reach.

**Configurações · Atividade** — `GET /workspaces/{wsID}/activity`,
Console-internal, session-authenticated, no `/v1` prefix. **The public Developer
API remains v1 and gained nothing.** No second audit system, no new table, no
invented events. Rendered as sentences with a filter strip, a text search, a
per-member selector and cursor paging — not a JSON dump.

Four properties, each mutation-proved:

| Property | Mechanism | Mutation |
|---|---|---|
| One workspace | `WHERE a.workspace_id = $1` on the indexed column, id from an already-authorised membership | drop it → the cross-tenant test fails naming B's event |
| Managers only | non-member and VIEWER get the **identical** refusal | allow any member → VIEWER reads it |
| Action allow-list | an action appears by being named in the projection | drop it → a planted `account.otp_verified` is served |
| Metadata allow-list | `role`/`previous_role` only; `request_ip`/`request_id` never selected | add `prefix` → the planted key prefix reaches the projection |

`member.role_changed` and `member.removed` now also record the role **held** —
"changed to VIEWER" does not say whether somebody was demoted from OWNER.

**Runtime, at the final SHA:**

```
BW_004_CRITERIA=6/6          BW_004_TENANCY=4/4
BW_004_STATUS=VALIDATED      BW_004_BLOCKING_ISSUES=0
WORKSPACE_AUDIT_CROSS_TENANT_DISCLOSURE=0
WORKSPACE_AUDIT_SECRET_DISCLOSURE=0
WORKSPACE_AUDIT_PERSONAL_SESSION_DISCLOSURE=0
```

A second owner of a second workspace asking for the first workspace's activity
gets **403**. Documented PT (`/docs/console#atividade`) and EN
(`/docs/en/console#activity`), with the distinction stated: Activity answers
"who has authority here, and who gave it to them"; Logs answers "what did my
application ask the API". No implementation table name appears in either.

---

## 3. SEC-001 — the TLS floor

The item read VALIDATED since June on *"Zero comunicação não encriptada. TLS 1.3
obrigatório"*, with two pieces of evidence: an nginx file that no longer exists,
and a Terraform directory containing a README saying *"configuration to be
added"*. **Nobody had asked a server.**

The Cloudflare zone's Minimum TLS Version had been **1.0 since the zone was
created**. The origin nginx was correct all along (`TLSv1.2 TLSv1.3`) — the
origin was never the control. Reading the origin file is exactly how this went
unnoticed for three months.

Set to **1.2**, TLS 1.3 left **on** — not 1.3-only, which would cut off
legitimate modern clients for no proven product requirement.

```
TLS_1_0_ACCEPTED_HOSTS=0        TLS_1_1_ACCEPTED_HOSTS=0
TLS_1_2_REQUIRED_HOSTS=11/11    TLS_1_3_SUPPORTED_HOSTS=11/11
SEC_001_STATUS=VALIDATED        SEC_001_BLOCKING_ISSUES=0
```

All eleven Cloudflare-proxied hosts — `banzami.com`, `www`, `developers`,
`developer-api`, `api`, `sandbox-api`, `sandbox-operator`, `sandbox-webhook`,
`pay`, `checkout`, `admin` — proved by handshake and confirmed independently with
curl (TLS ≤1.1 → connect error; 1.2 → real 200/404). The mail hostnames are
unproxied, serve no Banzami product, and the zone setting cannot reach them; they
are named out of scope rather than silently omitted.

The criterion wording is corrected to what the product actually enforces.
`tools/check-tls-floor.mjs` keeps it checkable by handshake, never by config file.

---

## 4. APP-001 — the device criterion, kept and met

The item read **VALIDATED** while its own blocker said *"Runtime não verificado
em dispositivo real — **obrigatório antes de VALIDATED**"*. The criterion was
kept rather than reclassified as release QA.

A real iPhone (iOS 26.5.2) ran the consumer/release build pointed at
`sandbox-api.banzami.com`, installed and launched 2026-09-12 21:33Z.

**Verified against the runtime, not the report.** The first report named a
recipient that received nothing and a reference belonging to a harness probe; the
second named the wrong recipient, the wrong amount and the same wrong reference.
Searching the runtime found the real operation:

```
consumer  fidel       created 21:41:12.646Z
grant     CREDIT 1 000 000 minor   21:41:12.699Z
transfer  5ad6bea0-…  500 000 minor   fidel → fm65   COMPLETED   21:41:36.784Z
posting   0767083f-…  DEBIT 500 000 · CREDIT 500 000 → sums to 0
```

| Required proof | Result |
|---|---|
| sender exists | `fidel`, `d6fbc4d2-…`, wallet created 21:41:12 |
| transfer exists | one row, COMPLETED, idempotency key `d29c029e-…` |
| recipient credited exactly once | `fm65`: **1** credit of 500 000 since install |
| sender debited exactly once | `fidel`'s account has **exactly two entries in its life** — the grant and this debit |
| double tap → no duplicate | **1** transfer on that idempotency key; **1** transfer on that posting |
| reference correlates | **`5AD6BEA0`** (= transfer id, first 8, uppercased) |
| history exists | the transfer row and both ledger entries |
| ledger balanced | posting sums to 0; whole AOA ledger sums to **0** |

```
APP_001_DEVICE_RUNTIME=PASS   APP_001_STATUS=VALIDATED   APP_001_BLOCKING_ISSUES=0
```

**Stated limitation, recorded in the item.** The consumer API stores no
user-agent and nothing reads the `X-Device-Id` header the app sends, so no
server-side record distinguishes an iPhone from a script. Device origin rests on
the install and launch performed in this session, the human-paced 24 seconds
between registration and send, and the owner's attestation — not on a server
attestation. That gap is a real property of the product and is written down
rather than glossed.

The 8-character consumer transaction reference is **not** the SECURE_V1 public
receipt/proof contract. They are distinct and are not conflated anywhere here.

---

## 5. The 22 authorized dispositions

Approved under diff hash `3c51d53e2606781f`; every fingerprint re-verified
against `SHA256(item|diff)[0:16]` before a byte was written, and each item
carries its own append-only `history[]` entry.

| Item | From → To | Why |
|---|---|---|
| **BW-004** | IN_PROGRESS → **VALIDATED** | the read surface exists; 6/6 + 4/4 against runtime |
| **APP-001** | VALIDATED → **VALIDATED** | device criterion met and independently verified |
| **SEC-001** | VALIDATED → **VALIDATED** | TLS floor fixed; criterion now describes the real policy |
| **API-003** | VALIDATED → **VALIDATED** | the "blocker" was a scope note about another item |
| **QR-003** | VALIDATED | screen renamed, capability intact; added the route that pays |
| **PL-002** | VALIDATED | files moved under `/pay/<slug>` and to `consumer_pay_link_handler.go` |
| **BM-001** | VALIDATED | payment-requests screen went with RA-057; criterion removed with its retirement evidence |
| **SDK-003** | VALIDATED | stale `banza_client.dart` twin removed |
| **SDK-005** | VALIDATED | stale `sdk/python/banza` twin removed |
| **API-001** | VALIDATED | merchant `/v1/transfers` removed under SEC-015/018; capability re-pointed |
| **API-002** | VALIDATED | `POST /payment-requests` criterion removed with RA-057 evidence; title corrected |
| **KYC-001** | IN_PROGRESS | the SEND gate it cited went with SEC-015; enforcement is the compliance engine |
| **P2P-002** | VALIDATED → **RETIRED** | Split Sessions superseded by Collections; `/v1/splits*` answers 410 |
| **PR-001** | VALIDATED → **RETIRED** | RA-057, removed 2026-09-01 as critical |
| **PR-002** | VALIDATED → **RETIRED** | same withdrawal |
| **BANZA-L0-001/002/003/005/ROADMAP-001** | VALIDATED | report moved to its dated canonical run directory |
| **BANK-001 / BANK-002** | BLOCKED | asserted on no evidence; now cite ADR-018 and the blockers dossier |

**The retirements are the substance, not bookkeeping.** `POST
/v1/payment-requests` and `/{id}/pay` never read the principal — both
participants came from the request body, so any merchant could create and execute
a money request between two consumers it had no relationship with. Confirmed
against the deployed Sandbox with a victim debited. Removed rather than patched.
Three matrix items had been VALIDATED on it ever since.

---

## 6. The gate, fail-closed

The first version reported twenty dead references and two VALIDATED-with-blockers
rather than failing on them, reasoning that failing on inherited mess makes a gate
unrunnable. That was wrong: **a finding printed and not enforced survives every
future run.**

```
MATRIX_DEAD_EVIDENCE_GATE=FAIL_CLOSED
MATRIX_MISSING_EVIDENCE_GATE=FAIL_CLOSED
MATRIX_VALIDATED_WITH_BLOCKERS_GATE=FAIL_CLOSED
MATRIX_VALIDATED_WITH_UNMET_CRITERION_GATE=FAIL_CLOSED
MATRIX_RETIRED_EVIDENCE_GATE=FAIL_CLOSED
MATRIX_STATUS_ENUM_GATE=FAIL_CLOSED
```

Each of the six mutation-proved. **Retired items must carry evidence of the
retirement itself** — not merely evidence that opens — which is what stops RETIRED
becoming the bin awkward items get swept into. The missing-evidence rule is the
one that found BANK-001/002.

At `c059b7ce`, globally:

```
IMPLEMENTATION_MATRIX_DEAD_EVIDENCE_REFERENCES=0   (336 path refs resolved)
IMPLEMENTATION_MATRIX_MISSING_EVIDENCE=0
IMPLEMENTATION_MATRIX_VALIDATED_WITH_BLOCKERS=0
IMPLEMENTATION_MATRIX_VALIDATED_WITH_UNMET_CRITERION=0
IMPLEMENTATION_MATRIX_RETIRED_WITHOUT_RETIREMENT_EVIDENCE=0
IMPLEMENTATION_MATRIX_UNRESOLVED_ITEMS=0
```

---

## 7. Readiness — internal vs external, kept apart

```
ACTIVE_REQUIRED=71
ACTIVE_VALIDATED=61
ACTIVE_IMPLEMENTED=2
ACTIVE_IN_PROGRESS=3
ACTIVE_BLOCKED=5
RETIRED=5            ROADMAP=10   BASELINE=1

ACTIVE_INTERNAL_BLOCKERS=0
ACTIVE_EXTERNAL_DEPENDENCIES=10
```

**Internal blockers: none.**

**External dependencies — ten, none of them ours to unblock:**

| Item | Status | Dependency |
|---|---|---|
| WAL-004 | IMPLEMENTED | funding provider |
| KYB-001 | IMPLEMENTED | KYB identity vendor |
| KYC-001 | IN_PROGRESS | Angolan KYC partner decision |
| KYC-002 | IN_PROGRESS | Angolan KYC partner decision |
| PAY-001 | IN_PROGRESS | withdrawal/cash-out provider |
| PAY-002 | BLOCKED | settlement rail |
| EMS-001 | BLOCKED | EMIS operator certification |
| EMS-002 | BLOCKED | BNA certification (via EMS-001) |
| BANK-001 | BLOCKED | partner bank (funding) |
| BANK-002 | BLOCKED | partner bank (payout) |

**Retired — reported separately, counted in nothing:** BW-001, BW-002 (merchant
dashboard), P2P-002 (Split Sessions → Collections), PR-001, PR-002 (RA-057).

```
RETIRED_COUNTS_AS_INTERNAL_BLOCKER=0
RETIRED_COUNTS_AS_MISSING_IMPLEMENTATION=0
RETIRED_ITEMS_REPORTED_SEPARATELY=PASS
```

A test asserts retiring an item does not move the launch-ready percentage
(3/3 → 2/2, both 100%).

---

## 8. Acceptance residue

Ten synthetic consumers retired through the canonical lifecycle — value returned
by a balanced posting to transit, then the consumer suspended. **Nothing deleted,
no row edited, no balance touched directly.**

`@fidel` was selected **by its exact id, never by a shape**: a handle a person
chose must not be matched by a pattern, because the pattern that caught it once
would catch somebody else later. Its value went back the same way as any other
synthetic value; `@fm65` remains the canonical identity and keeps the 5 000 Kz the
device sent it.

```
APP001_TEST_CONSUMER_ACTIVE=0        APP001_FIXTURE_CONSUMERS_ACTIVE=0
APP001_TEST_BALANCE_STRANDED=0       APP001_IMMUTABLE_EVIDENCE_PRESERVED=PASS
```

Preserved and verified after retirement: the registration grant entry, transfer
`5ad6bea0`, its posting's two entries, its idempotency key.

```
SYNTHETIC_RESIDUE_ACTIVE=0           APP001_FIXTURE_RESIDUE=0
UNCLASSIFIED_ACTIVE_IDENTITIES=0     UNCLASSIFIED_ACTIVE_WORKSPACES=0
UNCLASSIFIED_ACTIVE_PROJECTS=0       UNCLASSIFIED_ACTIVE_KEYS=0
```

The only consumers still ACTIVE are the three real people: `fm65`, `oxfannio`,
`priscila`.

---

## 9. Ledger

```
BOOK_SUMS_TO_ZERO=PASS      LEDGER_BALANCED=PASS
AOA total = 0               DEBIT=1842  CREDIT=1842
```

Ten retirement postings were added after the device run; the book still sums to
zero, which is the point of retiring value by posting rather than by edit.

---

## 10. Regression at the final SHA

| Suite | Result |
|---|---|
| Rust workspace (real DB) | **671 passed, 0 failed** |
| Go — gateway, public-api, admin-api, developer-api, sandbox-operator | **all PASS** |
| Website (Console + docs) | **1068 passed** |
| validation-studio | **114 passed** |
| Flutter app / SDK | **262 / 200 passed**, `analyze` 0 issues |
| Operator guards (`tests/ops`, no DB) | **110 passed** |
| Console: rbac-matrix · cross-project-isolation · refund-rbac | **22 · 15 · 31** |
| Console: route-suite · accessibility · responsive · locale · click-audit | **16 · 35 · 44 · 30 · 263 controls, 0 dead CTA** |
| Docs: audit · sweep · quickstart E2E | **50 · 314 · PASS**, residue 0 |
| Consumer P2P sandbox E2E | **PASS** — 7 negatives, balances intact |
| 33 `tools/check-*` gates | **all PASS** |
| **CI** | **GREEN at `c059b7ce`** |

**Deployment.** `check-deploy-parity` is green at HEAD: every deployed component
runs the source in this tree. Everything changed since the last deploy
(`badf5dc6`) is governance, evidence, tooling, tests and `apps/validation-studio`
— which is not a deploy target. **No product-serving source changed, so no
redeploy was performed**, and the parity gate proves that by comparing
artefact-bound files against the working tree rather than trusting image tags.

**Documentation.**

```
PUBLIC_DOC_SINGLE_TRUTH=PASS    PUBLIC_DOC_STALE_CLAIMS=0
PUBLIC_DOC_LEGACY_CONTRACTS=0   PUBLIC_DOC_REAL_SECRETS=0
DOCS_CURRENT_API_VERSION=v1     DOCS_V2_REFERENCES=0
DOCS_PT_EN_PAGE_PARITY=PASS     DOCS_PT_EN_CONTRACT_PARITY=PASS (12 pages, endpoint-for-endpoint)
DOA_REFERENCE_IMPLEMENTATION=PASS   DOA_DOC_SPECIAL_CASES=0
BROKEN_INTERNAL_DOC_LINKS=0     BROKEN_DOC_ANCHORS=0
DOCS_ACCESSIBILITY=PASS         DOCS_RESPONSIVE=PASS
```

**Financial LIVE.** All six fail-closed invariants hold. A `bz_live_` key at the
deployed gateway → **401**. `api.banzami.com` → **503**. No production key is
issued by any path.

---

## 11. Final counters

```
ACTIVE_INTERNAL_BLOCKERS=0
KNOWN_RELEASE_BLOCKING_DEFECTS=0
KNOWN_UNRESOLVED_ACTIVE_PRODUCT_DEFECTS=0
KNOWN_CONTRACT_CONTRADICTIONS=0

IMPLEMENTATION_MATRIX_DEAD_EVIDENCE_REFERENCES=0
IMPLEMENTATION_MATRIX_MISSING_EVIDENCE=0
IMPLEMENTATION_MATRIX_VALIDATED_WITH_BLOCKERS=0

SYNTHETIC_RESIDUE_ACTIVE=0
BLOCKED_ACCEPTANCE_STEPS=0
FAILED_ACCEPTANCE_STEPS=0

SEC_001_STATUS=VALIDATED    APP_001_STATUS=VALIDATED    BW_004_STATUS=VALIDATED
```

---

## 12. Verdict

**BANZAMI PUBLIC SANDBOX — READY FOR PUBLIC RELEASE**
— zero known release-blocking defects
— zero known unresolved active product defects
— zero known contract contradictions
— zero internal implementation-matrix blockers
— ten externally dependent capabilities, reported separately in §7

**BANZAMI DEVELOPERS CONSOLE — READY FOR PUBLIC RELEASE**

**BANZAMI DEVELOPERS DOCUMENTATION — READY FOR PUBLIC RELEASE**
— one canonical public truth
— Public API v1 only; zero v2 references
— DOA canonical reference implementation, zero doc special cases
— zero known stale public contracts
— zero known documentation/product contradictions

**DOA PUBLIC SANDBOX — READY** (`2612573`)

**Financial LIVE — NOT READY / FAIL-CLOSED**

No freeze. No tag.

---

## 13. What is honestly outside this verdict

Stated so the verdict is not read as covering more than it does.

- **Device origin is not server-attested.** §4's limitation is a property of the
  product: the consumer API records nothing that distinguishes a device from a
  script. Closing it would mean capturing and storing a client attestation, which
  is a product decision, not a defect fixed here.
- **The ten external dependencies are real.** The Sandbox verdict is about the
  currently declared Sandbox scope. Money In and Money Out cannot be launched on
  this evidence, and nothing here claims otherwise.
- **The Cloudflare control plane was audited on 2026-09-13** — see §14. It is no
  longer pending.
- **`sandbox-operator.banzami.com` is intentionally offline** and answers 503
  from the Stage B routing guard. The BANZA L0 conformance evidence remains a
  valid record of the run of 2026-06-26; it is not a claim that those endpoints
  are served today, and the L0 README now says so.


---

## 14. Cloudflare control plane — audited 2026-09-13

Audited end to end on the authenticated account, zone `banzami.com`
(`474867913af985e647cfcf09da452f9e`). Every finding below was confirmed by
external probe, not by reading the dashboard.

### What the zone actually holds

| Surface | State |
|---|---|
| DNS records | 22 after the change (23 before) |
| Zone-owned rulesets | **one** — Origin Rules, three rules, port-only |
| Redirect rules | **none** (`http_request_dynamic_redirect`: no ruleset) |
| Transform rules | **none** (request, late-request and response phases) |
| Cache rules | **none** (`http_request_cache_settings`: no ruleset) |
| Rate-limit rules | **none** (`http_ratelimit`: no ruleset) |
| Custom WAF rules | **none** (`http_request_firewall_custom`: no ruleset) |
| Page rules · Worker routes | **none** · **none** |
| Access | not enabled on the account |
| Certificates | universal, `banzami.com` + `*.banzami.com`, Google (active) + Let's Encrypt (backup). No custom or origin-auth certs |
| SSL mode | **Full (strict)** — the origin certificate is validated |

Redirects and rate limits are therefore **the application's**, not the edge's.
Nothing at Cloudflare can rewrite a destination, so §8's requirement that edge
limits must not contradict an application contract is satisfied by there being
no edge limits at all. No new public limit was invented and none is documented.

### DNS, classified

| Class | Records |
|---|---|
| **CANONICAL_PRODUCT** (proxied) | `banzami.com`, `www`, `developers`, `developer-api`, `api`, `sandbox-api`, `sandbox-operator`, `sandbox-webhook`, `pay`, `checkout`, `admin` — all A/CNAME → the origin, all proxied |
| **EXTERNAL_PROVIDER** (unproxied) | `mail` (mail provider), `imap`/`pop`/`smtp` → `mail`, `banzami.com` MX, `send` MX + SPF (Amazon SES / Resend), SPF, DKIM, `resend._domainkey`, DMARC |
| **INFRASTRUCTURE_REQUIRED** | the certificate the universal pack covers; no separate validation records needed |
| **STALE** | **`ftp.banzami.com`** — removed, see below |
| **UNKNOWN** | none |

```
CLOUDFLARE_UNKNOWN_PRODUCT_RECORDS=0     CLOUDFLARE_STALE_PRODUCT_RECORDS=0
```

The mail statement from the TLS audit is **verified**: `mail`, `smtp`, `imap`,
`pop` are unproxied provider records outside the web TLS boundary. They are not
removed — the MX, SPF, DKIM and DMARC set is live and nothing proves them
unused; SMTP/IMAP ports are unreachable from this network, which is not evidence
of disuse. No provider credential or mail configuration detail appears here.

### Two things were wrong, and both are fixed

**`ftp.banzami.com` disclosed the origin.** A zone-import leftover from
2026-06-21, a CNAME to the apex, unproxied — which Cloudflare flattened to
`217.160.9.248`, publishing the address of the machine behind the proxy. It is
referenced nowhere in the repository, nothing listens on 21 or 990 at the origin,
and port 21 is closed from outside. Proven stale and actively harmful: **deleted**.
No other public name resolves to the origin.

**Plain HTTP returned 400 on every host.** `always_use_https` was off and the
Origin Rules point at TLS ports, so `http://` produced an error rather than a
redirect. **Turned on.** All eleven hosts now `301` to their own HTTPS URL.

Both are Cloudflare-only. **No application source changed and nothing was
redeployed** — §16 respected.

### Routing

Three Origin Rules, each naming its hosts with `eq` and overriding **only the
port**, never the origin host:

```
banzami.com, www.banzami.com                → :8443   (website)
developers.banzami.com                       → :8443   (Console)
sandbox-api, developer-api, sandbox-webhook,
pay, checkout, admin                         → :2053   (sandbox edge)
```

`api.banzami.com` and `sandbox-operator.banzami.com` are in no rule and fall to
:443, where the Stage B guard answers 503. No rule can route one hostname to
another's origin, and there is no rule, record or route of any kind for a
retired dashboard — `dashboard.banzami.com` is NXDOMAIN, as are `docs`,
`staging`, `app`, `business`, `console`, `webhook` and `status`.

```
CLOUDFLARE_RETIRED_DASHBOARD_ROUTES=0    CLOUDFLARE_UNKNOWN_ORIGIN_ROUTES=0
```

### Redirects

There are no Cloudflare redirect rules, so the audit was run against the
behaviour instead. Only two hosts canonicalise to another; both resolve in a
single HTTPS hop, and no query parameter steers a destination:

```
https://www.banzami.com/       → 1 hop → https://banzami.com/      200
https://checkout.banzami.com/  → 1 hop → https://pay.banzami.com/  200
?redirect= / ?next= / ?returnTo=https://evil.example  → no Location header
Host: evil.example                                    → 403
```

Terminal status is **per host**, not universally 200 — see the expectation
matrix below. An earlier draft of this section said "every chain terminates at
200", which contradicted this same report's two deliberate 503s. The claim was
wrong, the runtime was not, and the check now encodes the difference.

```
CLOUDFLARE_OPEN_REDIRECT_RULES=0   CLOUDFLARE_REDIRECT_LOOPS=0
CLOUDFLARE_REDIRECTS_TO_RETIRED_SURFACES=0
```

### Security rules

The managed WAF ruleset has **31 rules, every one enabled and every one
`block`**, with no override, no skip and no exception. The DDoS L7 ruleset is
Cloudflare-managed; its one disabled rule and its `blockme=` signature are
Cloudflare's own shipped defaults, present in every zone, not operator
additions. There is no custom firewall ruleset, so there is nowhere for a
temporary bypass, a test IP exception or a stale developer allowance to live.
`development_mode` is **off**.

```
CLOUDFLARE_TEMPORARY_SECURITY_BYPASSES=0   CLOUDFLARE_RETIRED_HOST_SECURITY_RULES=0
```

*(The legacy `waf` zone toggle reads `off`. That is the deprecated pre-ruleset
switch; the modern managed ruleset above is what is active. Naming it here so
the value is not read later as a disabled protection.)*

### Cache

Probed with real requests rather than inferred from `cache_level`:

| Surface | Result |
|---|---|
| Console `/dashboard` | `cf-cache-status: DYNAMIC` · `private, no-cache, no-store` |
| `developer-api /auth/me` | `DYNAMIC` |
| gateway `/v1/me` with a bearer token | `DYNAMIC` |
| consumer `/v1/me` | `DYNAMIC` |
| BANZADMIN, pay, docs | `DYNAMIC` · `private, no-cache, no-store` |
| published OpenAPI | `DYNAMIC` · `public, max-age=0` |

```
AUTHENTICATED_PRIVATE_RESPONSE_PUBLIC_CACHE=0   SECRET_BEARING_RESPONSE_CACHE=0
```

### Host exposure — the expectation matrix

Every canonical host redirects plain HTTP to **its own** HTTPS URL, and then
answers the status that host is supposed to answer. Six end at 200, three at
404 because their root path is not a route, and two at 503 on purpose.

| Host | HTTP | HTTPS | Terminal | Why |
|---|---|---|---|---|
| `banzami.com` | 301 → self | 200 | 200 | institutional website |
| `www.banzami.com` | 301 → self | 301 | **200** at `banzami.com` | canonicalises to the apex |
| `developers.banzami.com` | 301 → self | 200 | 200 | Developer Console |
| `developer-api.banzami.com` | 301 → self | 404 | 404 | Console-internal API; the root path is not a route |
| `api.banzami.com` | 301 → self | **503** | **503** | **Financial LIVE, held fail-closed** |
| `sandbox-api.banzami.com` | 301 → self | 404 | 404 | gateway root is not a route; `/v1/*` is |
| `sandbox-operator.banzami.com` | 301 → self | **503** | **503** | **operator identity host, intentionally offline** |
| `sandbox-webhook.banzami.com` | 301 → self | 404 | 404 | assurance webhook sink; root is not a route |
| `pay.banzami.com` | 301 → self | 200 | 200 | hosted payer surface |
| `checkout.banzami.com` | 301 → self | 308 | **200** at `pay.banzami.com` | canonical alias to pay (ADR-052) |
| `admin.banzami.com` | 301 → self | 200 | 200 | BANZADMIN |

```
HTTP_TO_HTTPS_CANONICAL_HOSTS=11/11
UNEXPECTED_HTTP_TERMINAL_STATUS=0     UNEXPECTED_HTTPS_TERMINAL_STATUS=0
LIVE_FAIL_CLOSED=PASS                 SANDBOX_OPERATOR_OFFLINE_EXPECTATION=PASS
ORIGIN_IP_EXPOSED_HOSTS=0
```

The two 503s are different things and both are deliberate: `api.banzami.com`
serves the Stage B maintenance page as the LIVE fail-closed response, and
`sandbox-operator.banzami.com` is an offline subdomain named in that same guard.
The L0 README now states the operator host's offline status rather than
implying it is live.

This matrix lives in `tools/check-tls-floor.mjs`, with the reason beside each
status, and is mutation-proved three ways: claiming LIVE should be 200 fails,
claiming checkout's chain ends at 404 fails, and requiring every host to
redirect somewhere other than itself fails ten of eleven. A status nobody can
explain is a status nobody can defend when it changes.

### Financial LIVE

No rule, record or route sends `api.banzami.com` to a Sandbox origin: it is in
no Origin Rule, reaches :443, and gets the maintenance 503. A `bz_live_`
credential at the deployed gateway is refused **401**.

```
LIVE_TO_SANDBOX_ROUTING_PATHS=0    LIVE_FAIL_CLOSED=PASS
```

### TLS, re-confirmed after the changes

```
TLS_1_0_ACCEPTED_HOSTS=0          TLS_1_1_ACCEPTED_HOSTS=0
TLS_1_2_REQUIRED_HOSTS=11/11      TLS_1_3_SUPPORTED_HOSTS=11/11
PLAIN_HTTP_NOT_REDIRECTED_HOSTS=0 ORIGIN_IP_EXPOSED_HOSTS=0
min_tls_version=1.2  tls_1_3=on  ssl=strict
```

`tools/check-tls-floor.mjs` holds all of it by external probe — the floor, the
redirect to self, each host's canonical terminal status, and the origin's
privacy — so a dashboard change cannot quietly undo any of them.

**Cloudflare control-plane audit: PASS.**
