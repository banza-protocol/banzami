# 22 — Owner decision review

Version: 1.0
Status: `OWNER_DECISION_REVIEW=READY` · `PHASE_B_AUTHORIZED=NO`
Canonical system name: **Banzami Validation Studio** (`apps/validation-studio`)

> **Terminology note (resolved in Phase B).** Phase A documents 01–21 were
> written before the owner fixed the canonical name. **D12 was approved and
> executed in Phase B step B1**: the documents were `git mv`d into
> `docs/validation/studio/` (history preserved) and every occurrence of the
> former name was rewritten. The canonical name is **Banzami Validation Studio**
> and the existing implementation is `apps/validation-studio`. A permanent guard
> (`tools/check-validation-studio-naming.mjs`) now holds
> `VALIDATION_STUDIO_NAMING_DRIFT=0`.

---

## ⚠ Correction to Phase A — D1 is materially different from what was reported

Phase A reported VL-001 as a **P0 imminent brick**: the Sandbox consuming a
one-way lifetime volume budget that would, at 100 %, permanently fail every
merchant payment.

**The measurement was right. The consequence was wrong.**

`aggregate_volume_minor` and every merchant-side pilot limit are computed by
functions that **production code never calls**:

```
grep -rn 'check_volume|check_merchant_receipt|pilot_enforce' --include='*.rs' core services
  (excluding tests and the defining module)

→ core/api/src/routes/consumer_wallets.rs:235  check_test_payer_funding
→ core/api/src/routes/consumer_wallets.rs:243  check_funding(Party::Consumer)
→ nothing else
```

And no payment-producing route consults compliance at all:

```
wallet_payments transfers payment_sessions payment_links qr_pay
consumer_pay_links collections splits acquiring
  → 0 references to `compliance` or `pilot` in every one
state.compliance usages outside routes/compliance.rs  → none
```

### What is actually enforced

| ADR-048 limit | Value | Enforcement site | Enforced on the payment path? |
|---|---:|---|---|
| Consumer per payment | Kz 25 000 | `engine.rs::authorize_operation` | **No** — reachable only via `POST /internal/v1/compliance/customers/{id}/authorize`, which no payment route calls |
| Consumer daily | Kz 50 000 | same | **No** |
| Consumer max balance | Kz 50 000 | `pilot_enforce::check_funding` | **YES** — on consumer funding |
| **Aggregate funds** | **Kz 500 000** | `pilot_enforce::check_funding` | **YES** — on consumer funding |
| Merchant per receive | Kz 25 000 | `check_merchant_receipt` | **No call site** |
| Merchant daily receive | Kz 100 000 | `check_merchant_receipt` | **No call site** |
| Merchant max balance | Kz 100 000 | `check_merchant_receipt` | **No call site** |
| **Aggregate volume** | **Kz 2 000 000** | `check_volume` | **No call site — dead code** |

Historical data cannot contradict this: the highest merchant-day ever recorded
is 1 100 000 minor and the highest merchant balance 938 620, both an order of
magnitude below caps that were never approached. Non-enforcement is therefore
established by call-graph evidence, which is unambiguous — **a function nothing
calls cannot enforce anything.** A runtime probe belongs to Phase B.

### What this changes, and what it does not

- **There is no impending brick.** The Sandbox will not start refusing merchant
  payments at 46.5 %, because nothing reads the counter.
- **The hazard is latent, not absent.** `check_volume` is obviously-dead policy
  code sitting beside live policy code. The natural "tidy up the unused
  functions" change is to *wire them in* — and the moment anyone does, the
  Sandbox is instantly capped at a level it has already half-consumed. It is a
  loaded gun with the safety on, and the safety is an accident.
- **A new, sharper finding replaces the old one (VL-001-R).** ADR-048 states:
  *"The pilot limits are enforced by the system under test (not merely by a test
  harness), because the test plan defines them as automatic system controls."*
  For five of eight limits that is **not true**. For a programme whose entire
  product is trustworthy statements about what the platform does, a governance
  document asserting enforcement the code does not perform is a first-order
  defect.

  In fairness, ADR-048's own Decision section is more careful than its Rationale:
  it says the balance, merchant and aggregate caps are *"provided as deterministic
  policy functions **to be enforced at the data layers that own the relevant
  balance/aggregate context**"* — future tense. Two of those were wired
  (consumer balance, aggregate funds). Three were not, and `check_volume` never
  was. The ADR and the code diverged and nothing detected it.

**D1 is therefore no longer an emergency. It remains a Phase B blocker**, because
the Validation Studio cannot be built on a limit model whose enforcement status
is unknown to its own governing ADR — and because the owner is right that a
lifetime counter is structurally wrong for a permanent repeatable system.

---

## Decision table

| Decision | Subject | Recommendation | Blocks Phase B? |
|---|---|---|---|
| **D1** | Sandbox volume/limit policy | **Option A+B**: rolling windows (24h + 30d), global and per-merchant; wire enforcement honestly; correct ADR-048 | **YES** |
| **D2** | Historical residue (1 158 suspended merchants) | (a) retire synthetic residue before actors are provisioned | No |
| **D3** | Mail domain for actors | Do **not** provision `e2e.banzami.com`; reuse `@banzami-e2e.test` + Resend readback | No |
| **D4** | Autonomous SDK publication | Configure **npm Trusted Publishing (OIDC)**; keep required reviewers | No |
| **D5** | SDK scope and licensing | (a) publish Go first; fix `LICENSE` enumeration **before** any publication | No |
| **D6** | `sandbox-operator.banzami.com` (503) | Retire the host unless the service is being deployed | No |
| **D7** | Actor roster (9 actors) | Approve as proposed; no `DOA01`/`DOA02` | **YES** |
| **D8** | Handles and display names | Approve `@e2ec01…`, `@e2eb01…`, "Validation Actor Cnn" | **YES** |
| **D9** | Evidence retention classes | Approve operational periods; financial evidence never expires | No |
| **D10** | Studio route + navigation in BANZADMIN | `/validation`, section **Validação** | No |
| **D11** | Native device coverage | (a) `OUT_OF_SCOPE` for routine runs + periodic manual device pass | No |
| **D12** | Canonical naming reconciliation | Rename Phase A wording/path to **Validation Studio** before Phase B | **YES** |
| **D13** | Registry consolidation | **One canonical source + generated views**; no fourth registry | **YES** |
| **D14** | Registry drift gate | Add `RUNTIME_EXTERNALLY_REACHABLE_BUT_UNREGISTERED`; adopt via a shrinking ledger | **YES** |
| **D15** | `app-frontend` deploy parity | **Implementation gap, not a decision** — must invalidate a Golden Run | No (do it) |
| **D16** | Engine vs control surfaces | One engine, four control surfaces (BANZADMIN, CLI, Claude, CI) | No |
| **D17** | Cash-In / Cash-Out classification | Adopt the more precise Phase A truth; not a Phase B blocker | No |

---

# D1 — Sandbox volume and limit policy

**ID** D1 · **Title** Replace the lifetime aggregate-volume model with rolling
windows, and make pilot-limit enforcement match its ADR.

### Why the decision exists

A permanent, repeatable validation system needs a limit model with a *steady
state*. A lifetime cumulative counter has none: every run spends budget that
never returns, so the system is guaranteed to stop working at some point, and
the only question is when. Separately, the enforcement status of the current
model does not match its governing ADR.

### Current runtime / repository evidence

Deployed Sandbox, read 2026-09-18. `BANZAMI_PILOT_LIMITS=1` on all four
services.

**Daily merchant-credit volume (complete history — 12 active days):**

| Day | Volume (minor) | Credits | Accounts |
|---|---:|---:|---:|
| 2026-09-07 | 4 760 000 | 59 | 47 |
| 2026-09-08 | 10 750 000 | 133 | 108 |
| 2026-09-09 | 7 250 000 | 88 | 61 |
| 2026-09-10 | 3 884 000 | 55 | 33 |
| 2026-09-11 | 16 460 000 | 229 | 148 |
| 2026-09-12 | 4 625 100 | 96 | 49 |
| 2026-09-13 | 255 000 | 2 | 2 |
| **2026-09-14** | **31 165 620** | **509** | **220** |
| 2026-09-15 | 544 000 | 6 | 3 |
| 2026-09-16 | 8 170 000 | 25 | 25 |
| 2026-09-17 | 4 690 600 | 31 | 21 |
| 2026-09-18 | 434 520 | 7 | 1 |
| **Total** | **92 988 840** | **1 240** | |

**Distribution:** p50 4 725 300 · p90 15 889 000 · p95 23 077 529 ·
p99 29 548 002 · max 31 165 620 · mean 7 749 070.

**Windows:** rolling 24h **4 950 120** · rolling 7d **66 340 840** ·
rolling 30d **92 988 840** (the entire history falls inside 30 days).

**Weekly:** 2026-09-07→13 = 47 984 100 · 2026-09-14→18 (5 days) = 45 004 740.

**Attribution — who generates the volume:**

| Origin | Volume | Share | Credits | Merchants |
|---|---:|---:|---:|---:|
| E2E / harness (named prefixes) | 86 114 220 | 92.6 % | 1 113 | 626 |
| E2E / harness (numeric fixtures `M…`, `Recibo …`) | 3 346 000 | 3.6 % | 83 | 54 |
| Unclassified (`Loja`, `QR`, `Docs`, `BRP`, `BS`, `E…`) — also harness-shaped | 2 384 000 | 2.6 % | 27 | 17 |
| **DOA (canonical tenant)** | **1 144 620** | **1.2 %** | 17 | 1 |
| **Genuine third-party developer usage** | **0** | **0 %** | 0 | 0 |

The `Sandbox · …` prefix (48 648 240, the largest single group) resolves to
`cleanroom-*`, `acc-scn-*` and `External Cleanroom Sandbox` — harness tenants,
not self-service developers.

**Largest historical validation day (2026-09-14, 31 165 620):** `Sandbox ·`
cleanroom 29 061 620 / 473 credits; `smoke-sandbox-reference` 800 000;
`smoke-sandbox-default` 800 000; `smoke-none` 200 000;
`smoke-smoke-settle-only` 200 000; `money-model` 104 000.

**Individual payment size:** p50 78 400 · p90 150 000 · max 420 000 ·
mean 74 991 minor. Every observed payment is far below the Kz 25 000
per-receive cap, which is why history cannot reveal cap enforcement.

**Per-run volume estimates** (mean payment 74 991; calibrated against observed
days):

| Run type | Merchant credits | Estimated volume | Basis |
|---|---:|---:|---|
| **TARGETED** (one suite) | 2–15 | 45 200 – 1 100 000 | S06 proof 19 = 45 200; cleanroom tenant = 1 100 000 |
| **FULL SANDBOX** | ~200 | **~15 000 000 – 20 000 000** | ≈ 40 % of ~315 journeys × ~1.6 credits; matches 2026-09-11 (16 460 000 / 229) |
| **FULL — worst observed** | ~509 | **31 165 620** | 2026-09-14, heavy repeated suites |
| **GOLDEN** | ~200 | **~20 000 000** | = FULL with no repair reruns |

So a Full Run costs roughly **10 % of the current 200 000 000 cap**, and the
worst observed day **15.6 %**.

### Available options

| | Option | Mechanism |
|---|---|---|
| **A** | Global rolling windows | replace the lifetime sum with 24h + 30d windows (`created_at >= now() - interval …`) |
| **B** | Per-merchant rolling windows | add per-merchant 24h + 30d caps alongside the global ones |
| **C** | Exclude Validation Actors from counters | actors stop counting toward aggregates |
| **D** | Net volume | credits minus retirement debits |
| **E** | Raise the lifetime cap | larger constant |
| **F** | Leave it dead | delete `check_volume`, keep no volume control |
| **G** | Periodic Sandbox rebuild | let it fill, rebuild |

### Recommended option

**A + B, with enforcement wired honestly and ADR-048 corrected.**

```
GLOBAL   rolling 24h   50 000 000 minor   (Kz  500 000)   ~1.6× worst observed day
GLOBAL   rolling 30d  400 000 000 minor   (Kz 4 000 000)  ~20 Full Runs / 30d
MERCHANT rolling 24h   25 000 000 minor   (Kz  250 000)
MERCHANT rolling 30d  100 000 000 minor   (Kz 1 000 000)
KEEP     per-payment, consumer daily, consumer/merchant balance, aggregate funds
```

### Why I recommend it

**A gives the model a steady state.** Old volume ages out, so the Sandbox
recovers on its own and the system has no scheduled death. Today's 92 988 840
would sit at 23 % of a 400 000 000 30-day cap and fall as the September burst
ages out.

**B is newly necessary because of D7, and this is not obvious.** With disposable
merchants, per-merchant caps never bound — 626 merchants absorbed 86 M, and the
largest merchant-day was 1 100 000, a tenth of the existing Kz 100 000 cap. With
**three persistent Businesses** absorbing a 20 M Full Run, each takes ~6 700 000
in a day — two thirds of the current merchant daily cap, and over it the moment a
run concentrates on `B01` or a repair rerun doubles the day. **Persistent actors
convert a dormant limit into a binding one.** Choosing D7 without B would
produce a Full Run that fails halfway through for a reason unrelated to the
product.

**The numbers are derived, not guessed.** Global 24h is ~1.6× the worst day ever
recorded; global 30d is ~20 Full Runs; per-merchant 24h is ~3.7× the per-merchant
load of a single Full Run concentrated on one Business.

Options rejected: **C** makes actors non-ordinary, which is the one property
[05](05-actor-spec.md) refuses to trade, and it is unnecessary once windows
roll. **D** keeps a lifetime cap and makes "volume" stop meaning volume.
**E** postpones without solving and the owner has explicitly excluded it.
**F** removes a control the pilot plan deliberately specified. **G** destroys
economic history, contradicting §23/§97 and the ledger's append-only design.

### Trade-offs

Rolling windows cost a `created_at` index scan per check rather than a full-table
sum — cheaper, not dearer, but it does change a stated V1.0 pilot control and
should be recorded as a superseding ADR rather than an edit. Wiring the merchant
caps means payments can now be refused for policy reasons they previously never
were; every harness must handle `PILOT_LIMIT_*` as a first-class outcome.

### Security impact

Positive, on balance. Removing dead policy code eliminates a latent hazard
(§ correction above). Wiring merchant caps restores an abuse control the ADR
already claims. No authentication, authority or isolation surface changes.
Risk: a newly-enforced cap is a new denial surface — mitigated by making the
codes deterministic (already true) and by the D1 preflight below.

### Financial / ledger impact

**None to the ledger.** This is a policy overlay evaluated *before* posting;
it refuses operations, it never edits postings, balances or history. No
migration touches `ledger_entries`, `ledger_postings` or `ledger_accounts`.
Double-entry, append-only and immutability are untouched. The counters are
derived by query from canonical history and are not stored state.

### Validation Studio impact

Decisive. It converts capacity from "finite and shrinking" to "a rate", which is
what makes repeatable Full and Golden Runs possible at all. It also creates the
`VALIDATION_VOLUME_BUDGET_PREFLIGHT` requirement below.

### Migration / compatibility impact — the historical counter

**Nothing is migrated, because nothing is stored.** Both counters are derived by
`SELECT` over `ledger_entries` at evaluation time. Changing the policy changes
the *predicate*, not the data:

```sql
-- before: lifetime
SUM(amount_minor) WHERE entry_type='CREDIT' AND account_id IN (…)

-- after: rolling
SUM(amount_minor) WHERE entry_type='CREDIT' AND account_id IN (…)
                    AND created_at >= now() - interval '30 days'
```

Therefore: **no ledger history is deleted, no completed transaction is
rewritten, no immutable economic history is altered.** The 92 988 840 already
credited stays exactly where it is, and simply stops being counted once it ages
out of the window.

*Rollout.* Ship the predicate change behind the existing `BANZAMI_PILOT_LIMITS`
gate; it remains Sandbox-only and never activates on Live. Deploy Core, then
verify by reading the counters through the operator role before any run.

*Rollback.* Revert the predicate. Because nothing is persisted, rollback is
immediate and total — the previous policy resumes computing the identical number
it would have computed had the change never shipped. This is the property that
makes the change safe to try.

*Sequencing.* Wire the merchant caps **in the same change** as the window
predicate. Wiring them under the current lifetime model would cap the Sandbox at
a level it has already half-consumed — the exact hazard the correction describes.

### Validation volume preflight (owner §5)

New required capability, part of Health:

```
VALIDATION_VOLUME_BUDGET_PREFLIGHT

  estimated_worst_case_run_volume
+ current_window_usage
≤ policy_headroom            for EVERY window and EVERY participating merchant

  → HEALTHY   : proceed
  → DEGRADED  : proceed, warn, record in the Run Manifest
  → UNHEALTHY : refuse to START a financial Full/Golden Run
```

Estimates come from each journey's `financial_expectations` — already in the
journey schema — summed over the selected set, times a worst-case repair factor.

This is **capacity planning, not a financial bypass**: it decides *whether to
begin*, and has no power to permit an operation the policy would refuse. The
Studio never calls the limit functions, never receives an exemption, and a run
that exhausts a window mid-flight still fails closed exactly like any other
caller. Refusing to start a run that will predictably die halfway is the
difference between a capacity check and a bypass.

Recorded in the Run Manifest as `budgets_at_start` / `budgets_at_end`, already
specified in [10](10-run-resource-retention.md) §2.

### Policy properties (owner §4)

`SANDBOX ONLY` — gated by `BANZAMI_PILOT_LIMITS`, never Live (unchanged).
`OPERATOR-LOCAL` — ADR-048 is operator policy; **no BANZA ADR required**.
`AUDITABLE` — deterministic `PILOT_LIMIT_*` codes; thresholds never exposed.
`FAIL-CLOSED` — refuse before posting; a counter that cannot be read refuses.
`NO VALIDATION-ACTOR BYPASS` — Option C rejected precisely for this.
`NO SPECIAL CORE FINANCIAL SEMANTICS` — a pre-posting overlay, nothing else.

### If deferred

No outage: the caps are not enforced, so nothing breaks tomorrow. But the
Validation Studio would be built on a limit model whose enforcement nobody can
state, with `check_volume` still armed for the next person who tidies up dead
code. And ADR-048 keeps asserting a control the platform does not apply.

### Blocks Phase B

**YES.**

---

# D2 — Historical residue

**Why it exists** 1 158 of 1 159 merchants are terminally SUSPENDED; 625
projects ARCHIVED, 213 DELETED, 785 mostly-synthetic consumers.
**Evidence** Direct counts, 2026-09-18. Attribution shows ~98.8 % of all volume
is harness-generated and DOA is 1.2 %; genuine third-party usage is **zero**.
**Options** (a) retire synthetic residue before provisioning actors ·
(b) leave it, start clean-forward · (c) retire in stages during Phase D.
**Recommend** (a). **Why** It frees the *enforced* aggregate-funds headroom
(13.1 % used), makes actor health legible against a quiet baseline, and the zero
real-usage finding means the blast radius is as small as it will ever be.
**Trade-offs** One owner-approved operation; irreversible in the sense that
retired value must be re-issued to be reused.
**Security** None. **Financial/ledger** Retirement is the canonical reverse
posting (`DR owner / CR transit`); **no history is deleted, no balance edited**.
**Studio impact** Clean baseline for `pre_balance + Σ delta = post_balance`.
**Migration** None. **If deferred** Residue grows; noise in every actor-health
read. **Blocks Phase B** No.

---

# D3 — Mail domain for Validation Actors

**Why it exists** The original design proposed provisioning `@e2e.banzami.com`
with catch-all mailboxes and a provider integration.
**Evidence** `accountidentity.FixtureEmailDomain = "banzami-e2e.test"` is
already enforced in code, with `MintFixtureSession` (no OTP created, read,
derived or bypassed; audited `session.fixture_minted`) and a
`FIXTURE_EMAIL_DAILY_BUDGET` of 40/day. `tools/e2e/console/mint-session.mjs`
already reads genuine OTPs back through the **Resend sent-message API** using
the `resend_api_key` docker secret, never touching the peppered-and-hashed
`identity_otp_codes`. Consumer registration (`POST /v1/auth/register`) takes
handle + full name + PIN and **no email at all**.
**Options** (a) reuse both existing mechanisms · (b) provision
`e2e.banzami.com` anyway · (c) hybrid.
**Recommend** (a) — do **not** provision a new domain.
**Why** The platform already has both a no-email path and a genuine-email path.
A new domain would add a DNS zone, an MX configuration, a catch-all and a second
provider integration to obtain a capability that exists and is already audited.
**Trade-offs** Fixture addresses read as test addresses — which is the point.
**Security** Positive: fewer credentials, no new mail surface, and the existing
path is explicitly forbidden from tampering with authentication records.
**Financial/ledger** None. **Studio impact** Removes a Phase B work item.
**Migration** None. **If deferred** Phase B may provision infrastructure it does
not need. **Blocks Phase B** No.

---

# D4 — Autonomous SDK publication

**Why it exists** Routine validation must not require a human, but publication
today requires the owner at a terminal.
**Evidence** `.github/workflows/sdk-publish.yml` already triggers only on an
`sdk-v*` tag or explicit dispatch, runs in the protected `sdk-release`
environment, and **already requests `id-token: write` (OIDC)**.
`tools/sdk-release.mjs` fail-closes on clean tree, contract gate, tarball content
inspection, export-surface match and a clean-install E2E. Its header states the
blocker: publication fails closed *"until the Banzami owner provisions @banzami
org publish access"*. The owner-run path works only through npm's browser auth
flow (`--otp` is rejected for this account) and therefore produces **no
provenance attestation**.
**Options** (a) npm Trusted Publishing (OIDC) · (b) granular `NPM_TOKEN` on the
protected environment · (c) keep owner-run publication.
**Recommend** (a), keeping `sdk-release` required reviewers.
**Why** It is the mechanism npm built for this case: short-lived OIDC token, **no
stored secret anywhere**, no 2FA prompt, and provenance attestation the current
path cannot produce. With reviewers kept, the owner *approves* a publication
without *executing* it — autonomy without surrendering control.
**Trade-offs** One registry-side configuration; reviewers add latency to a
Repair Run that must ship an SDK fix.
**Security** Strictly better than (b) and (c): removes the only proposal that
involves a long-lived write token, and adds attestation.
**Financial/ledger** None. **Studio impact** Without it a Repair Run cannot ship
an SDK fix and must stop — a valid stop condition that should not exist.
**Migration** None; publishing stays one-way, so published versions freeze the
source. **If deferred** SDK defects block Repair Runs. **Blocks Phase B** No —
it blocks Phase D.

**Owner setup, exactly:** on npmjs.com → `@banzami/sdk` → Settings → Trusted
Publisher: repository `banza-protocol/banzami`, workflow
`.github/workflows/sdk-publish.yml`, environment `sdk-release`. Nothing is
stored in GitHub. The same model extends to PyPI and pub.dev; `pkg.go.dev`
needs nothing at all — a version tag *is* the release.

---

# D5 — SDK scope and licensing

**Why it exists** CLAUDE.md §13 mandates six SDKs; four have no release path,
and their licences disagree with `LICENSE`.
**Evidence** Release tooling exists only for TypeScript. `sdk/go` (7 files),
`sdk/php` (11), `sdk/python` (59) declare **MIT in their own manifests**, while
`LICENSE` enumerates only `sdk/typescript` and `sdk/dart-client` as separately
licensed MIT packages — everything else proprietary, All Rights Reserved.
`sdk/README.md` documents two of seven SDKs.
**Options** (a) publish all four, fix `LICENSE` · (b) publish Go only, mark
PHP/Python preview · (c) reclassify as future and amend §13.
**Recommend** (a), sequenced Go → Python → PHP; **fix the licence enumeration
first**.
**Why** (a) is what §13 already says, and Go is nearly free. Publishing a
package whose repository licence and package licence disagree is the one
ordering that must not happen.
**Trade-offs** Each published SDK becomes a maintained public contract and joins
the external-consumer acceptance suite.
**Security** Publishing under an unresolved licence is a legal exposure, not a
technical one; the tarball content gate already blocks secret leakage.
**Financial/ledger** None. **Studio impact** Adds S12 journeys.
**Migration** None. **If deferred** §13 stays unmet and VL-013 stays open.
**Blocks Phase B** No.

---

# D6 — `sandbox-operator.banzami.com`

**Why it exists** A published host with no backend.
**Evidence** DNS resolves, TLS terminates, nginx returns **503**; no container
serves it. `sandbox-operator` is in `deploy.sh` `ALL_SERVICES` and exists in
`services/` (4 Go files) but is not running.
**Options** (a) deploy it · (b) retire the host through
`check-retired-surfaces` · (c) leave as-is.
**Recommend** (b) unless the service is genuinely being deployed.
**Why** A permanently-503 public host is indistinguishable from an outage, and
the repository already has a mechanism that makes retirement explicit and
enforced.
**Trade-offs** If the service is wanted later, the host must be re-added.
**Security** Reduces public attack surface. **Financial/ledger** None.
**Studio impact** Health stops reporting a permanent red. **Migration** DNS
removal. **If deferred** Cosmetic, but it trains operators to ignore a red.
**Blocks Phase B** No.

---

# D7 — Validation Actor roster

**Why it exists** Persistent actors are the core of the design, and three
departures from the original proposal need approval.
**Evidence** 1 158 terminally suspended merchants prove the disposable pattern's
cost. `POST /v1/auth/register` needs no email. `application-submit` is
30/24h/IP. BANZADMIN RBAC has 5 roles and 38 capabilities. DOA's users are
Supabase identities.
**Options** (a) the proposed nine · (b) add `DOA01`/`DOA02` · (c) one operator
per RBAC role · (d) keep disposable actors.
**Recommend** (a): `C01–C03`, `B01–B03`, `D01–D02`, `A01`.
**Why** No `DOA01`/`DOA02` because registering DOA users as Banzami actors would
encode the very coupling `S14-DOA-011` exists to disprove. No email for
consumers because the product does not ask for one. One operator, creating
short-lived operators through the product's own lifecycle for RBAC negatives,
because that turns a fixture requirement into a tested journey.
**Trade-offs** Shared, financially stateful actors force serialized Full Runs —
and, per D1, make per-merchant caps bind.
**Security** Actors are ordinary by construction, enforced by the
`ACTOR_LEAKED_INTO_PRODUCT` guard.
**Financial/ledger** Balances accumulate; managed by reverse-posting retirement,
never by reset. **Studio impact** Foundational.
**Migration** One-time provisioning through product doors; 3 of 30 daily
application slots, once. **If deferred** Phase B cannot begin.
**Blocks Phase B** **YES.**

---

# D8 — Handles and display names

**Why it exists** These appear on public profiles and on receipts.
**Evidence** Constraints verified against `POST /v1/auth/register`: 3–30 chars,
lowercased; `handle_registry` holds 43 reserved `SYSTEM` handles and none of the
proposed names collide. Full name required since migration 0151.
**Options** (a) `@e2ec01…` / `@e2eb01…` + "Validation Actor Cnn" · (b) a
different scheme · (c) realistic names.
**Recommend** (a). **Why** The `e2e` prefix already matches what the cleanup
tooling recognises, and an actor must be unmistakable in BANZADMIN, on a public
profile and on a receipt. (c) is actively unsafe — a synthetic account with a
realistic name is exactly what §11 exists to prevent.
**Trade-offs** None material. **Security** Reduces mistaken-identity risk.
**Financial/ledger** Appears as the payee on receipts — which is the intent.
**Studio impact** Attribution legibility. **Migration** Handles are permanent
once registered; changing later means new identities. **If deferred** Phase B
cannot provision. **Blocks Phase B** **YES.**

---

# D9 — Evidence retention

**Why it exists** Evidence is the product; retention cannot be improvised.
**Evidence** `evidence/` holds 146 curated files (3.5 MB);
`tools/e2e/lib/assurance-output.mjs` already writes generated evidence outside
the worktree; R2 is already in use for KYB storage.
**Options** (a) the proposed classes · (b) uniform retention · (c) defer.
**Recommend** (a): Golden indefinite; failed-run binaries 180 d; Repair 90 d;
Targeted 30 d; **financial evidence always indefinite**.
**Why** Two asymmetries earn their complexity: a failure's video is what you
want six months later while a green run's is not, and a receipt is a record of a
financial operation rather than a debugging aid.
**Trade-offs** Storage cost; class-based expiry is more code than a single TTL.
**Security** Evidence access is audited and RBAC-gated; redaction is enforced at
the writer with a post-run re-scan.
**Financial/ledger** None — evidence describes history, it is not history.
**Studio impact** Bounds storage growth. **Migration** New R2 bucket.
**If deferred** Storage grows unbounded; no correctness risk.
**Blocks Phase B** No.
**Note** These are **operational** periods for synthetic Sandbox data. No legal
retention policy exists in the repository and none is invented here; a Live
programme would need one separately.

---

# D10 — Studio route and navigation in BANZADMIN

**Why it exists** The Studio needs an operator surface, and BANZADMIN has a
settled information architecture.
**Evidence** `nav-config.ts`: 5 sections, single-segment domain routes
(`/merchants`, `/proofs`, `/settlements`, `/platform-mode`), Portuguese labels,
role gating, `attentionKey` integration. BANZADMIN defaults to SANDBOX via
`lib/admin-env.ts`.
**Options** (a) `/validation`, section **Validação** · (b) `/validation-studio` ·
(c) surface it inside an existing section.
**Recommend** (a). **Why** Every existing route is a single domain-named
segment; a hyphenated compound would be the only one. The section carries the
product name in documentation while the sidebar speaks the operator's language,
as the rest of the portal does.
**Trade-offs** None. **Security** Whole section hidden — not merely disabled —
when the environment is LIVE; `CapValidation*` gated.
**Financial/ledger** None. **Studio impact** Control surface only, not the
engine (see D16). **Migration** Additive nav entry. **If deferred** Phase C has
no operator surface. **Blocks Phase B** No.

---

# D11 — Native device coverage

**Why it exists** Routine validation must be zero-human, but one capability is
genuinely device-bound.
**Evidence** `tools/e2e/mobile/app-001-device-journey.mjs` and the iOS assurance
targets exist because the simulator cannot run `mobile_scanner`/MLKit on arm64.
Proofs 01–20 exercise the **same Flutter source tree** on the web build.
**Options** (a) `OUT_OF_SCOPE` for routine runs + periodic manual device pass ·
(b) require a device pass every Full Run · (c) device farm.
**Recommend** (a). **Why** The web build runs the same source, so functional
coverage is not lost; only native camera capture is truly device-bound. (b)
would make zero-human validation impossible for one capability out of ~70.
**Trade-offs** A native-only camera regression could reach a release; mitigated
by the periodic manual pass and the build/compile gates.
**Security** None. **Financial/ledger** None. **Studio impact** Preserves the
zero-human goal. **Migration** None. **If deferred** Full Runs would block on a
human. **Blocks Phase B** No.

---

# D12 — Canonical naming reconciliation

**Why it exists** The owner has fixed the canonical name as **Banzami
Validation Studio**; Phase A documents 01–21 say *Validation Studio* and live under
`docs/validation/studio/`.
**Evidence** `apps/validation-studio` exists (32 files: Next.js governance
workstation over the implementation matrix, local-only). Phase A introduced no
code, so the divergence is purely documentary. `apps/validation-studio/README.md`
is itself stale (VL-014): dated 2026-06-13, referencing `apps/dashboard` and
`apps/checkout`, both retired and enforced-absent.
**Options** (a) rename wording + move to `docs/validation/studio/` ·
(b) rename wording only, keep the path · (c) leave as-is.
**Recommend** (a), as the first Phase B commit, together with refreshing the
Studio README. — **APPROVED AND EXECUTED (B1).**
**Why** One system, one name. Two names for one thing is precisely the
ambiguity CLAUDE.md §15 exists to prevent, and leaving it produces documents
that describe a system nobody can find.
**Trade-offs** A path change invalidates any external links to Phase A docs;
there are none outside this repository.
**Security** None. **Financial/ledger** None.
**Studio impact** Removes the risk of a parallel `apps/validation-studio` ever
being created by someone reading the Phase A documents literally.
**Migration** `git mv` plus a wording pass; no code, no route, no schema.
**If deferred** Every Phase B artefact inherits the wrong name.
**Blocks Phase B** **YES** — cheap, and everything downstream inherits it.
**Status** DONE in B1: `git mv` preserved history, all links updated, guard added.

---

# D13 — Registry consolidation

**Why it exists** Three capability-shaped registries already exist and a fourth
must not appear.
**Evidence** `quality/operator-assurance-manifest.yaml` (24 capabilities,
`make check-assurance`, generates `docs/quality/BANZAMI_OPERATOR_ASSURANCE.md`) ·
`docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json` (87 items, §16 approval
phrases; **all 96 evidence paths resolve**) ·
`quality/deployed-component-coverage.json` (`make check-component-coverage`).
CLAUDE.md §17 freezes governance primitives absent operational need.
**Options** (a) one canonical source + generated views · (b) multiple
intentionally distinct registries with explicit ownership · (c) a new canonical
registry · (d) status quo.
**Recommend** **(a) for capability truth, (b) for the rest** — precisely:

```
CANONICAL   quality/operator-assurance-manifest.yaml
            the single source of CAPABILITY truth, extended with the 9
            Validation Studio fields

GENERATED   docs/quality/BANZAMI_OPERATOR_ASSURANCE.md      (already generated)
            BANZADMIN /validation/capabilities               (a view)
            coverage + drift reports                         (computed)

DISTINCT    docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json
            DIFFERENT QUESTION — governance of implementation items under §16
            approval phrases. Keep; do not merge; cross-reference by capability_id.

DISTINCT    quality/deployed-component-coverage.json
            DIFFERENT QUESTION — deployed components, not capabilities. Keep.

NEW, NARROW quality/validation/{actors,journeys,suites,resources}.yaml
            concepts with no existing home; NOT capability truth
```

**Why** The three registries are not duplicates — they answer *is this assured*,
*is this item validated under governance*, and *is this component deployed and
covered*. Merging them would destroy the §16 approval gate, which is a
deliberate governance primitive. What must not be duplicated is **capability
status**, and the manifest already declares itself the single authority for it.
The new files carry actors and journeys, which no existing registry models.
**Trade-offs** Four files instead of one; mitigated by each answering a
different question and by cross-referencing on `capability_id`.
**Security** None. **Financial/ledger** None.
**Studio impact** Determines where the coverage invariant reads from.
**Migration** Additive fields; existing consumers unaffected.
**If deferred** Phase B risks creating the fourth registry by accident.
**Blocks Phase B** **YES.**

---

# D14 — Registry drift gate

**Why it exists** `CAP-COLLECT-001` says `api_surface: none (frozen)`,
`status: blocked`, `disposition: quarantined`, with all four test lists empty —
while Collections runs live with 10 mounted gateway routes, migrations
0156–0159 applied, 15 collections / 33 shares / 23 payment intents, proofs 19–20
and a `make app-web-collections` target. **`make check-assurance` passes.**
**Evidence** The gate verifies *declared ⊆ mounted* (its own output:
"api_surface routes are mounted exactly (216 public routes parsed)"). It has no
inverse check. 361 externally reachable routes exist, so **~145 are claimed by
no capability** — no owner, no journey, no deprecation path.
**Options** (a) add the inverse check with a shrinking `unclassified_routes`
ledger · (b) add it strictly, all 361 at once · (c) defer.
**Recommend** (a).
**Why** The inverse is the check that would have caught Collections. Strict
adoption would fail the build on day one across ~145 routes and get switched
off; an explicit ledger that must shrink — and must be **empty for a Golden
Run** — converts an unbounded gap into a tracked number.

**Phase B design:**

```
RUNTIME_EXTERNALLY_REACHABLE_BUT_UNREGISTERED

  reachable := routes from the four Go routers
               minus /internal/**, /health, /metrics, /readyz
               (read from source, as check-openapi-route-drift already does —
                no Sandbox and no key required, so it runs in CI)

  claimed   := union of every capability's api_surface
  excused   := unclassified_routes[] with reason + owning_milestone

  reachable \ (claimed ∪ excused)  ≠ ∅   →  FAIL
  |excused| > 0                          →  reported; FAIL for a GOLDEN run
```

Paired with the existing forward check, this makes the relation an equality
rather than an inclusion, and `CAP-COLLECT-001` becomes impossible to keep.
**Trade-offs** Someone must classify ~145 routes; the ledger makes that
incremental. **Security** Positive — an unregistered reachable route is an
unreviewed surface. **Financial/ledger** None. **Studio impact** Implements the
coverage invariant. **Migration** Additive gate + a manifest block.
**If deferred** The registry keeps drifting silently and no Golden Run can be
trusted. **Blocks Phase B** **YES.**

---

# D15 — `app-frontend` deploy-parity gap

**This is an implementation gap, not an owner decision.** No option is
defensible.

**Evidence** `tools/check-deploy-parity.mjs` `COMPONENTS` lists eight:
developer-api, api-gateway-staging, admin-api, public-api-staging,
core-api-staging, admin-frontend, pay-frontend, website-frontend.
**`app-frontend` is absent** — the container serving `app.banzami.com`, which is
the primary Full-E2E surface for both App Banzami Web and App Banzami Business
Web. `banzami-webhook-sink` is absent too. Today `app-frontend` is `2fbdd20f`
while `HEAD` is `0cdc05a2`.

Consequence: a Full Run could exercise a stale Consumer and Business app while
the deployment gate reported clean — every UI-first verdict in S02, S03, S04 and
S06 would describe code that is not this tree's.

**Required, per the owner's framing:** stale `app-frontend` **must invalidate a
Golden Validation Run**. Implemented as: add both containers to `COMPONENTS`;
Health surfaces parity per component; the Golden Run precondition requires
parity clean across **all ten**, and a mid-run parity change voids certification.

**Security** None. **Financial/ledger** None. **Studio impact** Without it,
UI-first acceptance is unsound. **Migration** Two array entries plus an
asset-inventory entry. **If deferred** Golden Run results are not trustworthy.
**Blocks Phase B** No — but it must land before the first Full Run in Phase D.

---

# D16 — One engine, multiple control surfaces

**Why it exists** BANZADMIN, CLI, Claude and CI must not each grow their own
validation path.
**Evidence** `tools/e2e/run-assurance.mjs` is already the engine in embryo: it
runs canonical suites remote and local, emits one machine-readable result,
trusts exit status → anchored summary → **UNKNOWN, never PASS**, writes evidence
outside the worktree keyed by revision, and **reads the served revision from the
containers rather than assuming it**. The repository has 236 `make` targets and
every gate is reached that way.
**Options** (a) one engine, four thin control surfaces · (b) BANZADMIN executes
independently · (c) per-surface implementations.
**Recommend** (a):

```
ENGINE (one)      tools/validationctl.mjs, extending run-assurance.mjs
                  + the canonical registries (D13)

CONTROL SURFACES  BANZADMIN  → server-side call into the engine module
                  CLI        → make validation-*
                  Claude     → the same make targets
                  CI         → the same make targets

GUARD             exactly one runner entry point exists (checkable)
```

**Why** Control and observability are cheap to duplicate and expensive to keep
consistent; an execution engine duplicated once is duplicated forever, and the
two copies disagree exactly when it matters. BANZADMIN's *Executar validação*
must invoke the same module, not shell out to a different script.
**Trade-offs** BANZADMIN gains a server-side dependency on the engine module.
**Security** One audited, RBAC-gated path rather than several.
**Financial/ledger** None. **Studio impact** Architectural foundation.
**Migration** Extends existing tooling. **If deferred** Phase C may build a
BANZADMIN-only runner. **Blocks Phase B** No — but it must be settled before
Phase C.

---

# D17 — Cash-In / Cash-Out classification

**Why it exists** The owner asked to preserve
`CASH_IN=EXTERNAL_DEPENDENCY_NOT_AVAILABLE` and
`CASH_OUT=EXTERNAL_DEPENDENCY_NOT_AVAILABLE` **unless Phase A found more precise
truth**. It did, and they are not symmetrical.
**Evidence**
*Cash-Out*: full payout lifecycle (`POST /v1/payouts` + admin
process/sent/confirm/returned/fail); 0.75 % withdrawal fee with two paired
postings; `CAP-PAYOUT-001` verified with `payout-sandbox-e2e.sh`; ADR-061 names
payout submission and confirmation as rail-crossing.
*Cash-In*: **no public deposit route among the 361 external routes**, while the
internal substrate exists (`consumer_deposits`,
`core/consumer-wallets/src/funding.rs`, boundary reconciliation classifies
`CASH_IN` under ADR-063).
**Options** (a) adopt the precise classification · (b) keep the uniform label.
**Recommend** (a):

```
CASH_OUT = EXTERNAL_DEPENDENCY at the rail boundary
           PASS at the operator boundary   (lifecycle + fee proven in Sandbox)
CASH_IN  = NOT_IMPLEMENTED at the external boundary, with an absence proof
           (internal ledger/reconciliation substrate present)
```

**Why** A single `EXTERNAL_DEPENDENCY_NOT_AVAILABLE` on Cash-Out hides a
fully working, fee-bearing, Sandbox-proven capability; the same label on Cash-In
implies a surface that does not exist. The registry field
`external_dependency.operator_side_status` exists for exactly this.
**Trade-offs** Two fields instead of one label.
**Security** None. **Financial/ledger** Reporting only; nothing changes.
**Studio impact** Prevents a reader concluding Angola can fund a wallet.
**Migration** Registry fields. **If deferred** Reports misstate the platform.
**Blocks Phase B** **No** — and per the owner's instruction these are explicitly
**not** blockers for unrelated Sandbox Validation Studio work.

---

## Preserved invariants

```
DOA_SPECIAL_BANZAMI_TENANT_BEHAVIOR = 0
```
Re-verified: every `doa` / `@doa` / `Doa-Sandbox` occurrence in `services/**` and
`core/**` is a comment or a `_test.go` fixture name. **No executable branch on a
DOA identifier.** DOA is served by generic primitives (APPLICATION account type,
sealed binding, segregated wallet accounts, application settlements, webhooks).
No decision here weakens this, and `S14-DOA-011` — `B03` performing the same
journeys with no DOA code path — is what keeps proving it.

```
apps/validation-studio  PRESERVED.  No apps/validation-studio. No parallel platform.
```

---

## Summary

```
DECISIONS_REQUIRING_OWNER_APPROVAL_BEFORE_PHASE_B = [D1, D7, D8, D12, D13, D14]

DECISIONS_SAFE_TO_DEFER = [D2, D3, D4, D5, D6, D9, D10, D11, D16, D17]

PHASE_B_BLOCKERS = [
  D1   Sandbox volume/limit policy — rolling windows + honest enforcement + ADR-048 correction
  D7   Validation Actor roster (9 actors, no DOA01/DOA02)
  D8   Actor handles and display names
  D12  Canonical naming reconciliation to Banzami Validation Studio
  D13  Registry consolidation — one capability source + generated views
  D14  Registry drift gate — RUNTIME_EXTERNALLY_REACHABLE_BUT_UNREGISTERED
]

IMPLEMENTATION_GAPS_NOT_REQUIRING_A_DECISION = [
  D15  app-frontend + webhook-sink absent from deploy parity;
       stale app-frontend must invalidate a Golden Validation Run
]
```

```
BANZAMI_VALIDATION_STUDIO_PHASE_A = COMPLETE
OWNER_DECISION_REVIEW             = READY
PHASE_B_AUTHORIZED                = NO
IMPLEMENTATION_STARTED            = NO
REAL_LIVE_TESTS_EXECUTED          = 0
```
