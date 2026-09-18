# 19 — Gap, contradiction and uncovered-capability report

Version: 1.0
Scope: findings only. **Nothing here was fixed** — Phase A establishes the
universe before changing it (§115). Each entry names an owning milestone.

Severity: **P0** blocks Phase B · **P1** must be fixed before the Golden Run ·
**P2** should be fixed during Phase D · **P3** record and schedule.

---

## VL-001 · P0 · The Sandbox has a one-way lifetime volume budget, 46.5 % spent

**Evidence.** `core/compliance/src/pilot_enforce.rs`:

```sql
-- funds: SIGNED sum, retirement reduces it
SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END)
-- volume: CREDITS ONLY, monotonic
SUM(amount_minor) WHERE entry_type='CREDIT'
```

Fund retirement posts `DR owner / CR transit` — a **debit**, which a
credits-only sum ignores. `aggregate_volume_minor` can only increase, forever.

Measured on the deployed Sandbox, 2026-09-18:

```
aggregate_volume_minor   92 988 840 / 200 000 000  = 46.5 %   IRREVERSIBLE
aggregate_funds_minor     6 532 600 /  50 000 000  = 13.1 %   reversible
```

Burn: 2026-09-14 alone consumed 31 165 620 minor (509 entries) — **15.6 % of the
lifetime cap in one day**. Headroom Kz 1 070 111 ≈ **3.4 heavy harness days**.

**Consequence.** At 100 % every merchant payment in the Sandbox fails with
`PILOT_LIMIT_AGGREGATE_VOLUME_EXCEEDED`, permanently, for self-service
developers (ADR-060) and DOA as well as the Lab. There is no reset that
preserves history.

**Why it blocks Phase B.** The programme requires *repeatable* Full and Golden
Runs over every payment capability. As specified it would consume the Sandbox it
exists to certify.

**Affected:** every `financial-money-movement` capability; the whole premise of
§10 persistent actors and §24 non-destructive runs.
**Owning milestone:** Phase B, first task. **Owner decision D1**,
[21](21-owner-decisions.md).

Pilot limits are operator-local policy (ADR-048: Sandbox-only, config-gated,
never Live), so a change needs **no BANZA ADR**.

---

## VL-002 · P1 · 1 158 of 1 159 merchants are terminally SUSPENDED

**Evidence.** `merchants`: 1 158 SUSPENDED, 1 ACTIVE (`@doa`).
`developer.dev_projects`: 625 ARCHIVED, 213 DELETED, 1 ACTIVE. 785 consumers,
overwhelmingly synthetic handles (`e2ebrp…`, `e2ecol…`, `rcamtw…`).

The `create → test → suspend` pattern, repeated. Suspension is terminal — there
is no sanctioned reactivation lifecycle — so each run leaves permanent residue,
consumes the 30/24h application-submit quota, and (VL-001) spends irreversible
volume.

**Owning milestone:** Phase B — persistent Validation Actors
([05](05-actor-spec.md)). Historical residue needs a **separate** owner-approved
retirement pass; it is not the Lab's to delete.

---

## VL-003 · P1 · Three deployed components are not running this tree's source

`make check-deploy-parity`, 2026-09-18:

```
✗ developer-api (d2098e7b)   services/common/documents/receipt.html
✗ admin-api     (bc9080ec)   services/common/documents/receipt.html
✗ website-frontend (f0a14634) apps/website/components/site/Footer.tsx
```

The existing gate is working correctly; the deployment is stale. `receipt.html`
is the Document Engine template — a receipt divergence between what the tree
says and what two services render.

**Owning milestone:** Phase D (deploy before the first Full Run).

---

## VL-004 · P1 · `CAP-COLLECT-001` contradicts the runtime in five ways

| Manifest says | Runtime shows |
|---|---|
| `api_surface: none (frozen)` | **10 mounted gateway routes** (`/v1/collections*`, `/v1/collection-shares/{id}/surface`) |
| `implementation: db/migrations.phase2 (frozen)` | migrations **0156–0159 in the tracked chain**, applied (head 0159) |
| `tests:` all four lists empty | proofs **19 and 20**, plus `core/collections` (7 files) |
| `status: blocked`, `disposition: quarantined` | 15 collections, 33 shares, 23 payment intents |
| `launch_scope: excluded` | `app-web-collections` is a Make target; last commit is a Collections E2E |

One sub-claim is substantively correct: `/v1/splits` **does** return
`410 SPLIT_SESSIONS_SUPERSEDED` (the 401 seen unauthenticated is auth ordering).
The wording "at edge" is imprecise — the 410 comes from the gateway handler and
`core/api/src/routes/splits.rs`, not from nginx.

**`make check-assurance` passes anyway**, which is the real finding: the gate
proves *declared ⊆ mounted*, never *mounted ⊆ declared*. See VL-006.

**Owning milestone:** Phase B (manifest correction + drift gate).

---

## VL-005 · P1 · `app-frontend` is outside the deploy-parity gate

`tools/check-deploy-parity.mjs` `COMPONENTS` lists eight components.
`app-frontend` — which serves `app.banzami.com`, the surface §26/§27 designates
as the **primary** functional E2E target — is not among them. Neither is
`banzami-webhook-sink`.

A Full Run could therefore validate a stale Consumer/Business app and the §88
deployment gate would report clean. Today `app-frontend` is `2fbdd20f` while
`HEAD` is `0cdc05a2`.

**Owning milestone:** Phase B (extend `COMPONENTS`; add to Health).

---

## VL-006 · P1 · ~145 externally reachable routes are claimed by no capability

361 externally reachable routes across the four Go services; the assurance check
parses 216 public routes for 24 capabilities. Roughly **145 routes have no
capability, no journey, no owner and no deprecation path**.

This is `CAPABILITY_REGISTRY_DRIFT` at route granularity, and it is the gate
asymmetry VL-004 exposed.

**Owning milestone:** Phase B ([03](03-capability-registry-spec.md) §4).

---

## VL-007 · P1 · Nine capability areas have zero deployed-Sandbox E2E

disputes · risk/freeze · compliance cases · pricing & fee-policy UI · push
topics · team members · beta testers · public profiles
(`/public/profiles/{handle}`) · **rail-simulator fail-closed**.

The last is the most valuable: ADR-061's rail table — *internal movements keep
working, rail-dependent operations fail closed with `503
PROVIDER_UNAVAILABLE` and nothing is created, credited or confirmed* — is
documented and unit-tested but **never proven end to end** against the deployed
Sandbox. It is the single most consequential untested claim in the platform.

**Owning milestone:** Phase C (S16, S22, S23).

---

## VL-008 · P1 · `CAP-APP-001` / `CAP-APP-005` say `blocked` while the web proofs pass

Both mobile-app capabilities are `preview-disabled` / `status: blocked`, yet
proofs 01–18 exercise the **same Flutter source tree** on `app.banzami.com` and
pass. There is no capability for App Banzami Web (ADR-064/066) at all.

The registry cannot currently express *this source is proven on web, gated on
native*, which is exactly the §27 position the platform has adopted.

**Owning milestone:** Phase B (`CAP-APPWEB-*` capabilities; split web from
native).

---

## VL-009 · P2 · `sandbox-operator.banzami.com` resolves to nothing

DNS resolves, TLS terminates, nginx serves a 503 maintenance page. **No
container serves it** — `sandbox-operator` is in `deploy.sh`'s `ALL_SERVICES`
and in `services/`, but is not running. A published host with no backend.

**Owning milestone:** Phase B — decide: deploy it, or retire the host through
`check-retired-surfaces`.

---

## VL-010 · P2 · `sdk/README.md` documents two of seven SDKs

Contents lists only `flutter/` and `typescript/`. Missing: `dart-client`
(the **published public client SDK**), `go`, `php`, `python`, `checkout-web`.

**Owning milestone:** Phase D (documentation reconciliation).

---

## VL-011 · P2 · `banzami_client` publication is unverified

`CAP-SDK-002` is `status: verified` and `public_status: public-sandbox`, but
there is no published-artifact proof for it — `check-sdk-dual-package.mjs` is a
source-boundary check. Only `@banzami/sdk` has
`tools/sdk-public-install-proof.mjs`.

Per §43 a published SDK is accepted only by installing the **published**
artifact into a clean external consumer.

**Owning milestone:** Phase C (S12).

---

## VL-012 · P2 · Four of six mandatory SDKs have no release path

CLAUDE.md §13 mandates TypeScript, PHP, Python, Go (server) and Flutter, browser
JS (client) for v1. Only TypeScript has release tooling
(`tools/sdk-release.mjs` + `sdk-publish.yml`). Go, PHP and Python have CI jobs
but no publication mechanism; `@banzami/checkout` is `UNLICENSED` and
unpublished.

Go is the cheapest to close — a `pkg.go.dev` release is a version tag.

**Owning milestone:** Phase D.

---

## VL-013 · P2 · Licensing is inconsistent across SDKs

`LICENSE` enumerates `sdk/typescript` and `sdk/dart-client` as the separately
licensed published packages (both MIT); everything else is proprietary, All
Rights Reserved. But `sdk/go`, `sdk/php` and `sdk/python` declare **MIT in their
own manifests** while not appearing in that enumeration.

Must be resolved **before** any of them is published, not after.

**Owning milestone:** Phase B (decision), Phase D (execution).

---

## VL-014 · P3 · `apps/validation-studio/README.md` is stale

Dated 2026-06-13. It references `apps/dashboard` and `apps/checkout` as current
— both are **retired** and enforced-absent by `check-retired-surfaces` — and
`apps/merchant`, which does not exist. It also warns that the matrix contains
VALIDATED items whose evidence points at removed `apps/docs/**` files.

That last warning is itself outdated: **all 96 evidence paths in
`BANZAMI_IMPLEMENTATION_MATRIX.json` resolve** (checked 2026-09-18). The matrix
was cleaned; the README was not.

**Owning milestone:** Phase D.

---

## VL-015 · P3 · `split_sessions` tables exist though the code says they cannot

`core/api/src/routes/splits.rs` states migration 0042 is "recorded but never
materialised — the tables are absent by design", and reasons from that to
explain why the handler cannot produce a missing-table 500. The tables
`split_sessions` and `split_contributions` **exist** in the Sandbox (both empty;
migration 42 is recorded as applied).

No functional risk — the handler touches no table and returns 410 — but the
stated justification does not match the database.

**Owning milestone:** Phase D (correct the comment, or drop the tables).

---

## VL-016 · P3 · Consumer phone onboarding is a stub on a live route

`POST /v1/consumer/onboarding/{start,verify-otp,complete}` is mounted and
public. There is **no SMS layer** (the handler says so), and the only way
through is `otp_plaintext_for_test`, a Sandbox-only field. The Consumer app does
not use this path — it uses `POST /v1/auth/register` (handle + name + PIN, no
email, no OTP, no KYC).

Classify `NOT_IMPLEMENTED` at the external boundary, with a negative journey
proving the test field is refused outside Sandbox.

---

## VL-017 · P3 · Two undocumented Sandbox surfaces

- `POST /v1/debug/push-test` — inside the authenticated consumer group, 403 in
  production, no-op without FCM. **Correctly guarded**; simply unregistered.
- `banzami-webhook-sink` — running six days, serving `/admin/configure`,
  `/admin/requests`, `/admin/reset`, `/receive/{run}` on
  `sandbox-webhook.banzami.com`. This is exactly the §45 deterministic receiver
  the programme asks for, and it is in no registry and no asset inventory.

---

## VL-018 · P3 · Build residue on the Sandbox host

Five `buildx_buildkit_bzrunnerlab-*` containers up 4–6 hours from prior lab
runs. Harmless, but it is unattributed residue on the host the Lab will
measure.

---

## Summary

| Severity | Count | Findings |
|---|---:|---|
| **P0** | 1 | VL-001 |
| **P1** | 7 | VL-002…VL-008 |
| **P2** | 5 | VL-009…VL-013 |
| **P3** | 5 | VL-014…VL-018 |

**Two candidate findings were investigated and dismissed** rather than filed:
`/v1/debug/push-test` is properly guarded, and the implementation matrix's
evidence paths all resolve. Both are recorded above as corrections so they are
not re-raised.
