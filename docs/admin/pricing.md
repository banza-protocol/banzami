# BANZADMIN — Pricing Rules management

**ADRs:** Banzami ADR-021 · BANZA ADR-039
**Version:** 1.0
**Scope:** Increment 5.5 (part 1) — Pricing Rules, end-to-end (core-api · admin-api · BANZADMIN).

---

## What this is

The single operator surface for managing **pricing rules** — the *only* place a
fee percentage lives in the whole stack. Apps (Consumer, Business, DOA, Mongo,
Marketplace…) never touch pricing; they send only references
(`business_category` / `pricing_profile` / `fee_policy_ref`) and the operator
resolves every fee internally (see [pricing domain](../domains/pricing/README.md)).

Managed under **BANZADMIN → Finanças → Regras de preço**.

---

## The chain

```
BANZADMIN (apps/admin)                admin-api (Go)                    core-api (Rust)
/pricing-rules            ──Bearer──▶ /admin/v1/finance/pricing-rules ─▶ /internal/v1/pricing-rules
  AdminApi client                       JWT + RequireCapability             PostgresPricingRuleAdminRepository
                                        + Audit middleware                  (the only write path)
```

- **core-api** owns the invariants and is the sole writer of `pricing_rules`.
- **admin-api** authenticates the operator (JWT), gates by capability, audits
  every mutation, and forwards to core-api. It adds no business logic.
- **BANZADMIN** is the UI: list, filter, create, edit, disable/enable, duplicate,
  version history.

---

## Invariants (enforced in core-api)

| Rule | Behaviour |
|------|-----------|
| **Never delete** | Rules are disabled, never removed. |
| **Never edit a *used* rule** | A rule referenced by an `operator_fees` / `app_settlements` row has priced real money. Editing it creates a **new version** (and disables the old one); the old version + its snapshots stay intact and auditable. |
| **Edit an *unused* rule** | Edited in place (still version 1). |
| **Create** | New `rule_key` at version 1; a duplicate key in the same environment is rejected. |
| **Duplicate** | Copies all fields into a brand-new `rule_key` (version 1). |
| **Validation** | `rate_bps ≥ 0`, `flat_minor ≥ 0`, `min ≤ max`, valid `rounding`/`currency`/`environment`, `effective_to > effective_from`. |

A rule is **used** ⇔ its id appears in `operator_fees.pricing_rule_id` **or**
`app_settlements.pricing_rule_id`.

---

## API

### core-api (operator-internal)
| Method & path | Action |
|---|---|
| `GET /internal/v1/pricing-rules` | list (filters: `environment`, `business_category`, `pricing_profile`, `currency`, `rule_key`, `status`, `limit`) |
| `GET /internal/v1/pricing-rules/{id}` | get |
| `GET /internal/v1/pricing-rules/{id}/versions` | version history |
| `POST /internal/v1/pricing-rules` | create |
| `PATCH /internal/v1/pricing-rules/{id}` | edit (auto-versions if used) |
| `POST /internal/v1/pricing-rules/{id}/disable` · `/enable` | toggle |
| `POST /internal/v1/pricing-rules/{id}/duplicate` | duplicate into a new key |

### admin-api (operator JWT)
Same verbs under `/admin/v1/finance/pricing-rules…`. Mutations are audited as
`CREATE_PRICING_RULE`, `UPDATE_PRICING_RULE`, `DISABLE_PRICING_RULE`,
`ENABLE_PRICING_RULE`, `DUPLICATE_PRICING_RULE` (who / when / IP / before+after).

---

## RBAC

| Capability | Roles |
|---|---|
| `pricing.view` | SUPER_ADMIN, OPERATIONS, COMPLIANCE, SUPPORT, READ_ONLY |
| `pricing.manage` | **SUPER_ADMIN only** |

Reading pricing is broad; **changing** it is restricted to SUPER_ADMIN. No app or
non-admin principal can reach the surface (it lives behind the admin-api JWT).

---

## Security

- The percentage (`rate_bps`) is operator policy and is set **only** here; it
  never crosses an app or protocol boundary.
- No secrets are logged: the audit captures rule references + rate/flat (operator
  policy, intentionally accountable) — never API keys, tokens or storage keys.
- The list endpoint forwards only whitelisted filters; arbitrary query params are
  dropped.

---

## Tests

- **core-api** (`banzami-pricing`, real-DB): create/get/list, duplicate-key
  rejected, edit-unused-in-place, **edit-used → new version + old disabled**,
  disable/enable, duplicate, filters, validation (8 tests).
- **admin-api** (Go): create forwards + audits, list forwards only whitelisted
  filters, update audits, RBAC matrix (view broad / manage SUPER_ADMIN-only).
- **BANZADMIN**: `tsc` + `next build` green (the admin app has no unit-test
  runner configured — a real limitation, see below).

---

## Pricing Profiles & Fee Policies (catalogs, increment 5.8)

`pricing_profile` and `fee_policy_ref` are now operator-managed **reference
catalogs**, not free strings — **BANZADMIN → Finanças → Perfis de preço** and
**Políticas de fee**.

- **Catalogs carry NO percentages.** They name and describe a profile / a fee
  policy. Fee values live ONLY in `pricing_rules`. A `FeePolicy` merely *identifies*
  a commercial policy (code + internal note); the numbers behind it stay in rules.
- Tables `pricing_profiles` / `fee_policies` (migration 0073), `UNIQUE(environment,
  code)`. **Not** FK-linked to `pricing_rules`, so existing free-string refs never
  break.
- CRUD: create / list+filter (env, status, code search) / get / update (code &
  environment are immutable identity) / enable / disable. Never deleted.
- API: core-api `/internal/v1/pricing-profiles…` + `/fee-policies…`; admin-api
  `/admin/v1/finance/pricing-profiles…` + `/fee-policies…` — read `pricing.view`,
  mutations `pricing.manage` (SUPER_ADMIN), audited
  (`CREATE/UPDATE/DISABLE/ENABLE_PRICING_PROFILE` / `…_FEE_POLICY`).
- **Pricing Rules integration:** the rule form's profile / fee-policy inputs are
  datalists populated from the **enabled** catalog codes, with manual entry still
  allowed (so old rules with arbitrary string refs keep working). No hard
  validation is enforced on rule create, to avoid breaking historical refs.

## Deferred (next increments)

Settlement **reprocess** and finance **dashboards** beyond the current set remain
for later parts. BANZADMIN has **no unit-test runner** configured, so frontend
behaviour is covered by type-check + build only; adding a runner (vitest/RTL) is a
separate task.
