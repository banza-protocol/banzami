# 05 — Validation Actor specification

Version: 1.0
Status: Proposed (Phase A) — `VALIDATION_ACTORS_PROVISIONED = 0`

---

## 1. Why actors must be persistent

The evidence is in the Sandbox, not in theory. Today:

- **1 158 of 1 159 merchants are SUSPENDED**, one is ACTIVE (`@doa`);
- 625 projects ARCHIVED, 213 DELETED, one ACTIVE;
- 785 consumers, nearly all synthetic.

That is the accumulated cost of `create → test → suspend`, repeated for months.
Four reasons it cannot be the Full Run pattern:

1. `application-submit` is limited to **30 per 24h per IP**; a Full Run needs
   several Businesses and would compete with real self-service developers.
2. **Suspension is terminal.** There is no sanctioned reactivation lifecycle,
   so every run leaves permanent residue.
3. Onboarding is the slowest and most brittle part of any journey; making every
   run depend on it maximises flakiness for no coverage gain — onboarding gets
   its *own* journeys instead.
4. Repeated onboarding consumes the irreversible aggregate volume budget
   ([16](16-external-dependency-matrix.md) §3) that the Sandbox cannot get back.

**Validation Actors are therefore long-lived and reserved.**

## 2. Proposed roster

Identity requirements are derived from the actual auth models
([06](06-auth-email-automation.md)), not assumed.

| ID | Type | Credential the product actually requires | Purpose |
|---|---|---|---|
| `C01` | Consumer | `@handle` + PIN | primary payer |
| `C02` | Consumer | `@handle` + PIN | counterparty (P2P, second Collection share) |
| `C03` | Consumer | `@handle` + PIN | isolation / negative authority |
| `B01` | Business | `@handle` + PIN | primary merchant (Receive Point, Collections, links) |
| `B02` | Business | `@handle` + PIN | cross-tenant isolation target |
| `B03` | Business | `@handle` + PIN | ordinary Business backing DOA |
| `D01` | Developer | email + OTP → session; project keys | primary Console identity |
| `D02` | Developer | email + OTP → session; project keys | cross-project isolation |
| `A01` | Operator | email + password + **TOTP** | BANZADMIN validation operator |

### Changes from the prompt's starting proposal

**`DOA01` / `DOA02` are not Banzami actors.** DOA is an independent application
with its own Supabase-backed identity; its users are not Banzami identities.
DOA journeys need a *DOA-side* test identity, which belongs to the DOA
repository, plus `B03` and `C01` on the Banzami side. Listing DOA users as
Banzami Validation Actors would encode exactly the special-tenant coupling
[13](13-doa-validation-plan.md) exists to disprove. See doc 13 §4.

**Consumers need no email address.** `POST /v1/auth/register` takes
`handle`, `display_name`, `pin` — no email, no OTP, no KYC
(Sandbox performs none). `consumer01@e2e.banzami.com` would be an unused field.

**One operator, not one per role.** BANZADMIN RBAC has five roles
(`SUPER_ADMIN`, `COMPLIANCE`, `OPERATIONS`, `SUPPORT`, `READ_ONLY`) and 38
capabilities. RBAC negatives need *more than one* operator — but they can be
`A01` plus short-lived operators that `A01` creates and terminates through the
product's own `/admin/v1/operators` lifecycle, which is itself a journey. A
standing low-privilege `A02` is proposed only if that proves fragile.

## 3. Identities

### Handles (the credential that matters)

```
@e2ec01  @e2ec02  @e2ec03          consumers
@e2eb01  @e2eb02  @e2eb03          businesses
```

Constraints verified against `POST /v1/auth/register`: 3–30 characters,
lowercased, must not collide with the 43 `SYSTEM` reserved handles in
`handle_registry`. The proposed handles satisfy all three and are absent from
the registry today.

The `e2e` prefix is deliberate: it matches the existing synthetic naming the
cleanup tooling already recognises, and it makes a Validation Actor
unmistakable in BANZADMIN, in a receipt and on a public profile page.

### Email addresses (only where the product requires one)

```
d01@banzami-e2e.test        Developer primary
d02@banzami-e2e.test        Developer isolation
a01+validation@<operator domain>   BANZADMIN operator
```

**`@banzami-e2e.test` is the existing, enforced fixture domain**
(`accountidentity.FixtureEmailDomain`), already understood by the Console
identity service, already budget-limited, already sweepable by
`tools/ops/sweep-console-fixtures.mjs`. The prompt's proposed
`e2e.banzami.com` would require provisioning a new mail domain, a catch-all and
a provider integration to obtain a capability the platform already has.
**Recommendation: do not provision `e2e.banzami.com`.**

`A01` is the exception — BANZADMIN operators are not fixture identities and its
address must be a real mailbox the owner controls, because operator invitation
and password reset are real email flows. See [06](06-auth-email-automation.md) §4.

### Full names (required since migration 0151)

`POST /v1/auth/register` rejects a nameless account. Proposed:
`Validation Actor C01`, etc. — human-readable, obviously synthetic, and never
mistakable for a customer name on a receipt.

## 4. Actors are ordinary — the non-negotiable part

A Validation Actor receives:

- **no** Core bypass;
- **no** authorization or RBAC exception;
- **no** payment, pricing, fee or settlement special case;
- **no** ledger behaviour of any kind that a real account would not get;
- **no** exemption from KYB, suspension, rate limits or **pilot limits**.

Their Validation-Lab identity exists in exactly three places, all outside
product logic:

1. `quality/validation/actors.yaml` (the registry);
2. BANZADMIN Validation Lab labels (presentation);
3. run/evidence attribution (`actor_id` on a Validation Resource).

A grep-able guard enforces this, in the spirit of the repository's existing
`check-*` gates:

```
no occurrence of an actor id, actor handle or actor email
may appear in services/**, core/**, apps/** outside *_test files
→ ACTOR_LEAKED_INTO_PRODUCT = FAIL
```

This is the same technique that proves DOA has no special behaviour today
([13](13-doa-validation-plan.md) §2), and it is the reason that proof is
credible.

## 5. Safety against mistaken identity

| Risk | Control |
|---|---|
| Actor mistaken for a customer | `e2e`-prefixed handle, `Validation Actor` display name, fixture email domain |
| Actor appears in Live | Sandbox-only provisioning; no Live migration path; `environments.live: false` |
| Actor receives real money | Live is not provisioned; payouts fail closed at the rail |
| Actor used by a person | BANZADMIN RBAC (`validation.manage_actors`); credentials only in the secret backend |
| Actor action untraceable | every mutation carries `run_id` + `journey_id`; BANZADMIN audit log |
| Actor silently broken | preflight actor-health check, doc 07 §6 |

## 6. Financial baseline, not reset

Actors persist, so balances accumulate. The Lab must never reset to zero — that
would delete economic history. The assertion form is:

```
pre_balance  +  Σ expected_delta  =  post_balance      (per actor, per run)
Σ debits     =  Σ credits                              (system, per run)
```

Between runs, surplus synthetic value is **retired**, not deleted, through the
canonical mechanism already in Core:

```
funding    DR transit            CR owner available
retirement DR owner available    CR transit            ← exact reverse posting
```

`core/api/src/routes/sandbox_funds.rs`. Nothing is deleted; no balance is
edited; the history stays intact. This is how actors stay under
`CONSUMER_MAX_BALANCE` (Kz 50 000) and `MERCHANT_MAX_BALANCE` (Kz 100 000)
across runs.

**It does not solve the aggregate volume budget** — retirement is a debit and
`aggregate_volume_minor` sums credits only. See
[16](16-external-dependency-matrix.md) §3 and
[19](19-gap-contradiction-report.md) VL-001.

## 7. Provisioning ceremony (Phase B — not performed here)

Each step uses the product's own door. Nothing is inserted into a database.

1. **C01–C03** — `POST /v1/auth/register` (handle, name, PIN). No email, no
   approval. *Self-service; Lab can do it unattended.*
2. **B01–B03** — public application → BANZADMIN approve → activation → PIN.
   Consumes 3 of the 30/24h application-submit allowance **once, ever**.
   *Requires `A01`, so it follows step 4.*
3. **D01–D02** — Console sign-in at `@banzami-e2e.test`, then workspace +
   project + keys. *Self-service.*
4. **A01** — **owner ceremony.** Create the operator in BANZADMIN, enrol TOTP,
   capture the one-time seed into the secret backend. This is the only step
   that cannot be automated, and it is performed once.
5. Record every resulting id in `quality/validation/actors.yaml`; record every
   credential *reference* (never a value) in the secret backend.

## 8. Concurrency

Actors are shared, persistent and financially stateful, and the Sandbox has
per-actor daily caps. **Full Validation Runs must be serialized**, enforced by a
lock the runner takes and BANZADMIN displays. Actor pools for parallelism are
explicitly deferred: they would multiply the scarcest resource in the system
(the aggregate volume budget) for a wall-clock gain nobody has asked for.
Targeted Runs on disjoint capability sets may run concurrently only when their
actor sets are disjoint.
