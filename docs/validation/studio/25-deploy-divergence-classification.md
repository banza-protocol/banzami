# 25 — Deploy divergence classification

Version: 1.0
Date: 2026-09-18 · Tree `79460b66`
Rule applied: deploy only what Phase B requires or what would invalidate a
Validation Studio journey. Nothing was deployed to make a gate green.

---

## Authorised and deployed

| Component | Was | Now | Why |
|---|---|---|---|
| `core-api-staging` | `82283af0` | **`79460b66`** | activates the D1 rolling policy (owner-authorised) |
| `banzami-webhook-sink` | `:local` (unknowable) | **`79460b66`** | its revision is material to webhook journeys (owner-authorised) |
| `admin-api` | `bc9080ec` | **`28913242`** | the Phase B RBAC foundation (owner-authorised, audited first — [27](27-runtime-acceptance.md) §9) |
| `admin-frontend` | `5ce51b5b` | **`28913242`** | the console had no brand icon; deployed with the icon fix |

## Not deployed — classified on evidence

### `developer-api` (`d2098e7b`) — `SAFE_STALE_FOR_CURRENT_SCOPE`

Divergent file: `services/common/documents/receipt.html`, from commit
`ab07a0c3` *"comprovativo fits on a single A4 page"*.

`services/common` is vendored into every Go service, so developer-api **ships**
the template. It does not **render** it: the importers of
`services/common/documents` are api-gateway, public-api and admin-api only —
developer-api is not among them. The divergence is therefore inert bytes in the
artefact with no reachable behaviour.

→ **`MUST_DEPLOY_BEFORE_GOLDEN_RUN`** (a Golden Run requires parity clean
everywhere, on principle rather than because of this file).

### `admin-api` — ~~`MUST_DEPLOY_BEFORE_PHASE_C`~~ → **DEPLOYED** (`28913242`)

Resolved 2026-09-18 under owner authorisation. The audit that preceded it found
exactly the two expected commits and nothing else; details in
[27](27-runtime-acceptance.md) §9. The original classification is kept below
because the reasoning is what justified the deploy.

<details><summary>Original classification</summary>

#### `admin-api` (`bc9080ec`) — `MUST_DEPLOY_BEFORE_PHASE_C`

Two divergent files:

1. `services/common/documents/receipt.html` — and admin-api **does** render it
   (`internal/service/receipts.go`, `internal/handler/documents.go`, serving
   `GET /admin/v1/transactions/{id}/receipt.pdf`). A stale template emits a
   receipt that spills onto a blank second A4 page. Phase C's S15 journeys
   capture the receipt PDF as evidence and hash it, so this would be baked into
   the evidence record.
2. `services/admin-api/internal/auth/rbac.go` — the six `CapValidation*`
   capabilities added in B8. They are unreachable until the BANZADMIN
   `/validation` pages exist, which is Phase C work.

Neither is required *now*: no Phase B gate depends on admin-api's runtime, and
the RBAC grants nothing anyone can use yet.

</details>

### `website-frontend` (`f0a14634`) — `SAFE_STALE_FOR_CURRENT_SCOPE`

Divergent file: `apps/website/components/site/Footer.tsx`, from commit
`9bad98ed` *"restore the 3-column footer form with the red CTA card"* — a
two-column grid becoming three, plus a decorative CTA card.

Public institutional content. It touches no validation surface, no actor, no
capability and no financial path.

→ **`MUST_DEPLOY_BEFORE_GOLDEN_RUN`**, because S19 includes public-site truth
journeys and a Golden Run certifies the platform as deployed.

### `app-frontend` (`2fbdd20f`) — `PASS`

`APP_FRONTEND_DEPLOY_PARITY=PASS`, verified against the actual Sandbox
deployment: every file that reaches the artefact —
`apps/app-banzami`, `apps/mobile`, `sdk/flutter` — matches the tree.

This is the component that matters most for Phase C: App Banzami Web and App
Banzami Business Web are the primary functional E2E surfaces, and until B5 this
gate could not see them at all.

## Summary

```
DEPLOYED (owner-authorised)   core-api-staging ✓   webhook-sink   ✓
                              admin-api        ✓   admin-frontend ✓
SAFE_STALE_FOR_CURRENT_SCOPE  developer-api, website-frontend
MUST_DEPLOY_BEFORE_GOLDEN_RUN developer-api, website-frontend
PASS (parity clean)           8 of 10 components
```

`developer-api` and `website-frontend` stay **deliberately undeployed**.
Unrelated source divergence is not itself a reason to deploy; a Golden Run must
record the exact deployed revision of every relevant component, which it can do
whether or not that revision is `HEAD`.

`make check-deploy-parity` will keep reporting the three outstanding components
as divergent. That is the gate working: it reports what is true, and the
classification above is the decision about what to do with it — not a reason to
silence it.
