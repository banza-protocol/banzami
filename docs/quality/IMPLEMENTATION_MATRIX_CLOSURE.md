# Implementation Matrix — Closure Report

**Version:** 1.0
**Date:** 2026-09-12
**Commit:** `5dfab820` (CI red at `a70339c2` — deliberately; see §9)
**Deployed:** developer-api + website-frontend at `badf5dc6`; deploy parity verified at HEAD

---

## 0. The short version

BW-004 is fixed by building the thing, not by withdrawing the criterion: the
Developer Console now has **Workspace Settings → Atividade**, reading the
`developer.audit_events` rows that have been written since the domain shipped and
that no route had ever read. 6/6 acceptance criteria and 4/4 tenant/privacy
properties hold against the deployed system.

All 20 dead evidence references are classified and resolved. Both
VALIDATED-with-blockers are resolved. The matrix gate now **fails** on six states
it used to print, each mutation-proved. The readiness model reports
`ACTIVE_*`/`RETIRED` instead of one moving ratio.

**Two things did not come out where the mandate asked, and both are findings, not
excuses:**

| Required | Actual | Why |
|---|---|---|
| `ACTIVE_INTERNAL_BLOCKERS=0` | **2** | SEC-001 and APP-001 were VALIDATED on evidence that does not support it. Making them honest creates two blockers that were always there. |
| `IMPLEMENTATION_MATRIX_*` all green | **green only after the §11 approval** | The matrix writes need the §16 phrase. The proposal is prepared and gate-verified; nothing was written. |

The mandate says *"Do not optimize the score. The goal is not 74/74. The goal is
truthful current-product readiness."* Both outcomes above follow that instruction
rather than the counters beside it.

---

## 1. BW-004 — the product gap, closed by building the product

### What was wrong

`developer.audit_events` (migration 0089) is written on every invite, accept,
role change, removal, revocation, workspace rename/archive/delete, project
lifecycle event and key lifecycle event. **No route had ever read it.** That is
worse than not recording: "who removed this person" had an answer sitting in a
table and nobody outside the database could reach it.

### What exists now

`GET /workspaces/{wsID}/activity` — **Console-internal**, session-authenticated,
no `/v1` prefix. The public Developer API stays at **v1** and gains nothing: an
integrator has no business reading who was removed from a workspace. No second
audit system, no new table, no invented events.

Rendered at **Configurações · Atividade**, beside Projeto and Workspace, as
sentences — *"Ana mudou o papel de João de Programador para Leitor"* — with a
filter strip (Tudo / Membros / Workspace / Projetos / Chaves), a text search, a
per-member selector, and "Ver atividade mais antiga". Not a JSON dump.

### The four properties, each mutation-proved

| Property | How it is held | Mutation |
|---|---|---|
| One workspace only | `WHERE a.workspace_id = $1` — a predicate on the indexed column, and the id comes from a membership already authorised | dropping the filter → the cross-tenant test fails naming B's event |
| Managers only | non-member and VIEWER get the **identical** `ErrForbidden`, so an id cannot be used to discover somebody else's workspace | allowing any member → VIEWER reads it, test fails |
| Action allow-list | an action appears by being named in the projection, never by being written | dropping the list → a planted `account.otp_verified` is served, test fails |
| Metadata allow-list | `role` and `previous_role` only; `request_ip`/`request_id` are never selected | adding `prefix` → the planted `bz_test_sk_…` reaches the projection, test fails |

`member.role_changed` and `member.removed` now also record the role that was
**held**. "Changed to VIEWER" does not say whether somebody was demoted from
OWNER, which is the question a reader of an audit trail usually arrives with.

### Runtime, against the deployed Console

```
BW_004_CRITERIA=6/6
BW_004_TENANCY=4/4
WORKSPACE_AUDIT_CROSS_TENANT_DISCLOSURE=0
WORKSPACE_AUDIT_SECRET_DISCLOSURE=0
WORKSPACE_AUDIT_PERSONAL_SESSION_DISCLOSURE=0
BW_004_BLOCKING_ISSUES=0
```

The proof creates an owner and a workspace, invites a member by email, accepts
with a real OTP, proves a VIEWER is refused by the **service**, promotes to
DEVELOPER, removes, then reads the record back from the real Console surface,
finds the affected member by filtering, and has a **second owner of a second
workspace** ask for the first workspace's activity — 403.

`evidence/assurance/matrix/bw-001-004-runtime-proof.json`

### Criterion count

The matrix listed five acceptance criteria; the proposal lists **six**. The added
one is *"um papel pode ser alterado e a alteração produz efeito"* — the mandate's
own §5 requires proving it, the proof was silently not exercising it (the member
was only ever invited and removed, so no transition existed to read back), and
the item's title is "Gestão de equipa e **permissões**". The bar went up, not
down. No criterion was removed from BW-004.

### Documentation

PT `/docs/console#atividade` and EN `/docs/en/console#activity`, with the
distinction stated where it is needed:

> **Atividade não é Registos.** Atividade responde a «quem tem autoridade aqui, e
> quem lha deu». `Registos` responde a «o que é que a minha aplicação pediu à
> API». São páginas diferentes porque são perguntas diferentes.

No implementation table name appears in either. `DOCS_AUDIT: PASS=50 FAIL=0`,
`DOCS_SWEEP: PASS=314 FAIL=0`, `DOC_QUICKSTART_E2E=PASS`.

---

## 2. The 20 dead evidence references — every one classified

Classification per the mandate: **A** capability moved · **B** capability retired ·
**C** still required, not implemented · **D** path changed, behaviour did not.

| Item | Dead reference | Class | Resolution |
|---|---|---|---|
| QR-003 | `sdk/flutter/…/structured_qr_pay_screen.dart` | D | → `qr_pay_screen.dart`; added the route that actually pays (`public-api/…/qr_pay.go`) and `tests/phase0/qr-payment-e2e.sh` |
| P2P-002 | `split_pay_screen.dart`, `split_create_screen.dart` | **B** | Split Sessions superseded by Collections (ADR-016); `/v1/splits*` answers **410** at the gateway. Item → **RETIRED** |
| PL-002 | `consumer_pay_links.go` | D | → `consumer_pay_link_handler.go` |
| PL-002 | `apps/pay/app/[slug]/pay-client.tsx` | D | → `apps/pay/app/pay/[slug]/pay-client.tsx` (the bare `/<slug>` is now a 308) |
| PR-001 | `handler/payment_requests.go`, `payment_requests_screen.dart` | **B** | Withdrawn 2026-09-01 as **RA-057**, critical. Item → **RETIRED** |
| PR-002 | `handler/payment_requests.go` | **B** | Same withdrawal. Item → **RETIRED** |
| BM-001 | `payment_requests_screen.dart` | **B** | The screen went with RA-057; that criterion removed with its retirement evidence, item stays VALIDATED on the rest |
| SDK-003 | `sdk/flutter/…/banza_client.dart` | D | `banzami_client.dart` was already cited beside it; the stale twin removed |
| SDK-005 | `sdk/python/banza/client.py` | D | `sdk/python/banzami/client.py` was already cited; stale twin removed |
| API-001 | `handler/transfers.go` | **B+A** | The merchant `/v1/transfers` group was removed under **SEC-015/SEC-018** (it named the sender in the body). The capability lives at `wallet_account_transfers.go` and, for consumers, `public-api/…/transfers.go` |
| API-002 | `handler/payment_requests.go` | **B** | RA-057. The `POST /payment-requests` criterion removed with its retirement evidence; title → "API REST — QR e links de pagamento" |
| KYC-001 | `handler/transfers.go` | **B** | The SEND gate this cited went with SEC-015. Enforcement is `core/compliance/src/engine.rs`. Item stays IN_PROGRESS, externally blocked |
| SEC-001 | `infra/nginx/banzami.conf` | **C** | See §4 — this one was hiding a real security gap |
| BANZA-L0-001/002/003/005/ROADMAP-001 | `…/l0/banzami-sandbox-l0-report.json` (×5) | D | → `…/l0/20260626-2246-sandbox-operator-banzami-com/banzami-sandbox-l0-report.json`, the canonical run; the earlier one is marked SUPERSEDED |

**`IMPLEMENTATION_MATRIX_DEAD_EVIDENCE_REFERENCES = 0` under the proposal, globally
— 335 path references resolved, 76 narrative references correctly not treated as
paths.**

Two capabilities were genuinely retired, and both for the same reason, worth
stating plainly: `POST /v1/payment-requests` and `/{id}/pay` **never read the
principal**. Both participants came from the request body, so any merchant could
create and execute a money request between two consumers it had no relationship
with — confirmed against the deployed Sandbox, victim debited. It was removed
rather than patched. Three matrix items had been VALIDATED on it ever since.

---

## 3. The 2 VALIDATED-with-blockers

**API-003** — the "blocker" was never one. *"Execução da liquidação bancária é
rastreada em Money Out (PAY-002 / EMS-001/002 / BANK-002) — fora do scope da API
REST"* is a scope note about another item. Moved into `requirement`,
`blockingIssues: []`, status unchanged, routes re-verified (`payouts.go`,
`refunds.go`, `disputes.go`, ownership tests).

**APP-001** — a real contradiction. The item read **VALIDATED** while its own
blocker said *"Runtime não verificado em dispositivo real — **obrigatório antes
de VALIDATED**"*.

- Blocker 2 (*"sem testes de integração contra API sandbox"*) is **resolved with
  evidence**: `tools/e2e/transfer-sandbox-e2e.mjs` exercises the same
  `POST /v1/transfers` the app's own `ConsumerPublicClient` posts to, end to end
  against the deployed Sandbox — exact debit and credit, idempotent replay,
  receipt PDF, seven negatives refused with balances intact.
  *(That harness had been silently pointed at `/v1/wallet-account-transfers`, the
  merchant surface, which the consumer API does not mount. It 404'd on every call
  and nothing had run it. Fixed and passing.)*
- Blocker 1 is **still true and I cannot clear it**: verification of the binary on
  real hardware needs your iPhone. Code and tests re-proved today —
  `flutter analyze` 0 issues, 262 app tests, 200 SDK tests.

Proposed: **VALIDATED → IMPLEMENTED**, one blocker, precisely worded.

`IMPLEMENTATION_MATRIX_VALIDATED_WITH_BLOCKERS = 0` under the proposal.

---

## 4. Two findings nobody asked for

### SEC-001 — every public host completes a TLS 1.0 handshake

SEC-001 has read **VALIDATED** since June on *"Zero comunicação não encriptada.
TLS 1.3 obrigatório"*, with two pieces of evidence: an nginx file that no longer
exists, and `infra/terraform/cloudflare/` — a directory containing a README that
says *"Placeholder — configuration to be added"*. Nobody had asked a server.

```
TLS_FLOOR_REQUIRED=1.2
TLS_FLOOR_OBSERVED=1.0
TLS_BELOW_FLOOR_HOSTS=6
```

banzami.com · developers.banzami.com · sandbox-api.banzami.com ·
sandbox-operator.banzami.com · admin.banzami.com · **pay.banzami.com** — all
negotiate TLS 1.0, and TLS 1.1 serves a 200 with `ECDHE-ECDSA-AES128-SHA`.

The origin nginx is correct (`ssl_protocols TLSv1.2 TLSv1.3`). The floor is the
**Cloudflare zone setting "Minimum TLS Version"**, which is what a client meets
first — reading the origin file is exactly how this went unnoticed.

`tools/check-tls-floor.mjs` makes the claim checkable and keeps it checkable. I
have not changed the zone: it needs your Cloudflare access, and raising the floor
cuts off old clients, which is your call, not mine.

Proposed: **VALIDATED → IN_PROGRESS**, with the runtime evidence and the exact fix.

### BANK-001 and BANK-002 assert BLOCKED on nothing

Neither has a single piece of evidence. The new missing-evidence rule found them.
Proposed evidence: ADR-018 (provider-agnostic money in/out — why a partner bank
is pluggable), the launch-blockers dossier (where the blockage is recorded), and
the engine on each side that is waiting for a rail. Status unchanged.

---

## 5. The gate now fails on what it used to print

The first version reported 20 dead references and 2 VALIDATED-with-blockers on
the reasoning that failing on inherited mess makes a gate unrunnable. That was
wrong in a specific way: **a finding that is printed and not enforced survives
every future run.**

Six rules, all fail-closed, each mutation-proved:

```
MATRIX_DEAD_EVIDENCE_GATE=FAIL_CLOSED
MATRIX_MISSING_EVIDENCE_GATE=FAIL_CLOSED
MATRIX_VALIDATED_WITH_BLOCKERS_GATE=FAIL_CLOSED
MATRIX_VALIDATED_WITH_UNMET_CRITERION_GATE=FAIL_CLOSED
MATRIX_RETIRED_EVIDENCE_GATE=FAIL_CLOSED
MATRIX_STATUS_ENUM_GATE=FAIL_CLOSED
```

| Rule | Mutation | Result |
|---|---|---|
| dead evidence | (no mutation needed) | fails **live** on the 20 real references |
| missing evidence | (no mutation needed) | fails **live** on BANK-001/002 |
| VALIDATED with blocker | (no mutation needed) | fails **live** on APP-001, API-003 |
| VALIDATED declaring a gap | planted a `gap` evidence entry | `= 1`, failed |
| RETIRED without retirement evidence | replaced a retired item's evidence with something that merely opens | `= 1`, failed |
| unknown status | set one item to `PROBABLY_FINE` | `= 1`, failed |
| retired surface cited | added an `apps/dashboard/…` reference | `= 1`, failed |

**Retired items must still carry evidence of the retirement itself** — not merely
evidence that opens. The rule looks for the record of the withdrawal (a repair-log
entry, a superseding decision, the test that keeps a route unmounted). This is
what stops RETIRED becoming the bin awkward items get swept into.

---

## 6. Readiness: named buckets, not one moving ratio

`63/74` was doing two jobs badly. It hid what the eleven non-validated items
actually *are*, and its denominator moved every time something was retired — so
deleting a product changed the score and nobody could say why.

```
RETIRED_COUNTS_AS_INTERNAL_BLOCKER=0
RETIRED_COUNTS_AS_MISSING_IMPLEMENTATION=0
RETIRED_ITEMS_REPORTED_SEPARATELY=PASS
```

| | Now | Under the proposal |
|---|---|---|
| `ACTIVE_REQUIRED` | 74 | **71** |
| `ACTIVE_VALIDATED` | 63 | **59** |
| `ACTIVE_IMPLEMENTED` | 2 | **3** |
| `ACTIVE_IN_PROGRESS` | 4 | **4** |
| `ACTIVE_BLOCKED` | 5 | **5** |
| `ACTIVE_EXTERNALLY_BLOCKED` | 10 | **10** |
| `ACTIVE_INTERNAL_BLOCKERS` | 1 (BW-004) | **2 (APP-001, SEC-001)** |
| `RETIRED` | 2 | **5** — BW-001, BW-002, P2P-002, PR-001, PR-002 |
| `ROADMAP` / `BASELINE` | 10 / 1 | 10 / 1 |

Retired items are listed by name in the dashboard, outside every count. A test
asserts that retiring an item does not move the launch-ready percentage (3/3 →
2/2, both 100%).

**`ACTIVE_INTERNAL_BLOCKERS` goes from 1 to 2, not to 0.** BW-004 is closed; two
items that were never honestly VALIDATED are now visible. The alternative was to
leave a security item reading VALIDATED while every public host speaks TLS 1.0.

---

## 7. Regression

| Suite | Result |
|---|---|
| Rust workspace (real DB) | **671 passed, 0 failed** (68 suites) |
| Go — gateway, public-api, admin-api, developer-api, sandbox-operator | **all PASS** |
| Website (Console + docs) | **1068 passed** (85 files) |
| validation-studio | **114 passed** |
| Flutter app / SDK | **262 / 200 passed**, `analyze` 0 issues |
| Console: rbac-matrix | **22/22** |
| Console: cross-project-isolation | **15/15** |
| Console: refund-rbac | **31/31** |
| Console: route-suite · accessibility · responsive · locale · click-audit | **16 · 35 · 44 · 30 · 263 controls, 0 dead CTA** |
| Docs: audit · sweep · quickstart E2E | **50 · 314 · PASS**, residue 0 |
| Consumer P2P sandbox E2E | **PASS** — 7 negatives, balances intact |
| 30 `tools/check-*` gates | all PASS except the two below |

`check-schema-reality` (needs `DATABASE_URL`, runs on the VM) and
`check-schema-manifest` (takes arguments) are not standalone gates here.
**`check-implementation-matrix` fails by design** — see §9.

`/settings/activity` was added to all five Console sweeps. A page nothing sweeps
is a page whose accessibility, responsiveness, locale and dead-CTA state nobody
knows.

**Canonical resources, after the acceptance work:**

```
UNCLASSIFIED_ACTIVE_IDENTITIES=0   UNCLASSIFIED_ACTIVE_WORKSPACES=0
UNCLASSIFIED_ACTIVE_PROJECTS=0     UNCLASSIFIED_ACTIVE_KEYS=0
SYNTHETIC_RESIDUE_ACTIVE=0
```

Nothing the BW-004 proof or the sweeps created survives. `deploy.sh developer-api`
and `deploy.sh website-frontend` both ran at `badf5dc6`; product-serving code
changed, so it was redeployed, and `check-deploy-parity` confirms every deployed
component runs the source in this tree.

---

## 8. What is NOT claimed

- **APP-001 is not verified on a real device.** I cannot do that. Everything
  around it is proved; the binary on hardware is not.
- **SEC-001 is not fixed.** The gap is proved and the fix is named. Changing a
  production edge setting that cuts off old clients is your decision.
- **The matrix is not written.** §16 needs your phrase; see §11.
- **BW-001 and BW-002 remain RETIRED**, unchanged — `dashboard.banzami.com` does
  not resolve and `/v1/analytics` is 404, as the runtime proof says again today.

---

## 9. CI

**CI is red at `a70339c2`, on the `Implementation-matrix gate` step, for exactly
the right reason:** the hardened gate fails on the 25 findings this report
describes. I verified the proposal turns every rule green — all six pass against
the proposed file, with 335 path references resolved.

Leaving it red was the choice. Softening the gate until the data is fixed is the
behaviour this whole exercise exists to stop.

---

## 10. Verdict

**NOT GREEN — and that is the honest answer.**

BW-004 is genuinely closed: the capability exists, is documented, is swept, and
holds 6/6 plus 4/4 against the deployed system. The dead references, the
VALIDATED-with-blockers, the gate and the readiness model are all resolved in the
proposal.

What stops a green verdict is the pair of items that were reading VALIDATED
without support. Finding them is the work; hiding them again would be the only
way to reach `ACTIVE_INTERNAL_BLOCKERS=0` today.

No freeze. No tag.

---

## 11. What needs you

**One decision, then two governance phrases.**

**(a)** Cloudflare — raise **Minimum TLS Version** to 1.2 (or 1.3) on the
`banzami.com` zone. Then `node tools/check-tls-floor.mjs` goes green and SEC-001
can be re-proposed as VALIDATED. Tell me if you want it at 1.3 and I will set the
gate's floor there.

**(b)** APP-001 — either run the consumer flow on your iPhone and tell me, or
tell me the device-runtime criterion is a release-QA step rather than an
engineering criterion and I will propose it differently. I will not decide that
for you.

**(c)** The matrix writes. Per CLAUDE.md §16, each needs its exact phrase. The
proposal is generated and gate-verified; nothing is written until you send these.

```
APPROVE VALIDATION BW-004                 71fcde8e41f48d50
APPROVE VALIDATION APP-001                797e2c633e846ec8
APPROVE VALIDATION API-003                7fbcc6f100c8581a
APPROVE VALIDATION QR-003                 7a603bbb19c83495
APPROVE VALIDATION P2P-002                5b410d29bd6ba843
APPROVE VALIDATION PL-002                 2fecda55066dc722
APPROVE VALIDATION PR-001                 34628ea441262b8f
APPROVE VALIDATION PR-002                 6903e0fdb53e9da8
APPROVE VALIDATION BM-001                 dd4b451af4140582
APPROVE VALIDATION SDK-003                94c8e4be1ae200c8
APPROVE VALIDATION SDK-005                1e3a2123f517f554
APPROVE VALIDATION API-001                1b1c22521657bac0
APPROVE VALIDATION API-002                e8b7f98348648659
APPROVE VALIDATION KYC-001                b7cb822b68e0861a
APPROVE VALIDATION SEC-001                4a11efcff1235689
APPROVE VALIDATION BANZA-L0-001           71dfb2bfa23b54ca
APPROVE VALIDATION BANZA-L0-002           a3c1c35b4d7b1340
APPROVE VALIDATION BANZA-L0-003           1eb48e5447a44996
APPROVE VALIDATION BANZA-L0-005           497ff5ef07c2a482
APPROVE VALIDATION BANZA-L0-ROADMAP-001   7b2062e4f11ad4c3
APPROVE VALIDATION BANK-001               bb566e25f2cd7a7f
APPROVE VALIDATION BANK-002               e3b69e6df4887c35
```

Send them all, or send the ones you agree with — each item is applied
independently, with its own append-only `history[]` entry carrying its
fingerprint and its reason. If the matrix changes before you approve, the
fingerprints stop matching and I will generate a new proposal rather than write
against a stale one.
