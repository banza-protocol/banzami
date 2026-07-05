# ADR-047 — Project→Merchant Binding for Developer Payment Capabilities

- **Status:** Accepted — implemented (RT04/04B); controlled Sandbox deployment + public release pending deployed E2E (RT04C). See **Implementation status** below.
- **Date:** 2026-07-05
- **Programme:** BANZAMI-SANDBOX-RELEASE-ASSURANCE-001 / Release Train 03
- **Layer:** Banzami operator policy (how the operator maps its own Console
  projects to merchant/payee accounts). **Not** BANZA protocol; never present as
  BANZA-normative.

## Context

Release Train 03 set out to release Payment Sessions (CAP-PAY-001), Payment
Links (CAP-PAY-002) and Pay/Checkout (CAP-APP-004) **for external developers via
Console-issued keys**. Discovery established the deployed reality:

- Payment sessions/links **function end-to-end for merchant-JWT holders** — real
  core, real ledger postings, real proof (not stubs). `core/api/src/routes/
  payment_sessions.rs`, `services/api-gateway/internal/handler/payment_sessions.go`.
- **Developer keys cannot reach any payment route.** The ADR-046 dev-key path
  mounts only `GET /v1/me`. Payment routes sit behind the merchant-JWT `Auth`
  group and require `principal.MerchantID`. A `DeveloperPrincipal` has no
  merchant identity.
- ADR-046 **explicitly deferred** the Project→Merchant binding: a dev key
  resolves to `{workspace, project, scopes}` — there is no payee merchant/wallet.

So the E2E the train requires (§5/§6: "create a Payment Session/Link through the
deployed public Gateway with a Console-issued key" and settle it) **cannot run**
today. This ADR resolves the missing design so a future train can implement it,
and records why it is deferred rather than corner-cut in RT03.

## Decision (design)

A **Console Project MAY be bound to exactly one SANDBOX Merchant + payee wallet**
(operator-provisioned). This binding is what lets a developer key act as a payee
for payment capabilities.

1. **Provisioning.** On demand (first payment-capability use) or explicitly via a
   Console action, the operator provisions a SANDBOX `Merchant` + wallet in core
   for the project and stores `merchant_id` on `developer.dev_projects`
   (new nullable column + a mapping migration). One merchant per project; no
   sharing across projects/workspaces.
2. **Resolution.** `developer-api` key introspection returns the bound
   `merchant_id` (when present) alongside `{environment, project, scopes}`. The
   Gateway `DeveloperPrincipal` gains a resolved `MerchantID` used ONLY for
   payment authorization — never exposed on `/v1/me` (which stays minimal).
3. **Scopes.** Payment routes require explicit, capability-matched scopes —
   `payment_sessions:read|write`, `payment_links:read|write` — granted only for
   released capabilities. No broad payment authority by default.
4. **Route wiring.** Payment-session/link create/read routes are mounted behind
   `DeveloperKeyAuth` (in addition to the existing merchant-JWT path), resolving
   the payee from the bound merchant and enforcing scope + SANDBOX + tenant
   isolation (Project A's key can never act as Project B's merchant).
5. **Settlement (Sandbox).** The payer settles via the existing sandbox confirm
   path (`/public/pay/{slug}/…`); no real rail. Ledger posting + proof are
   produced by core exactly as for the merchant-JWT flow.
6. **Isolation & separation.** The bound merchant is a SANDBOX payee only; it is
   NOT the legacy merchant-key identity and gets no new public key issuance. Dev
   key ≠ merchant JWT ≠ internal credential ≠ webhook secret (ADR-046 table).

## Why deferred (not corner-cut in RT03)

This is a **money-path** build — core merchant/wallet provisioning, a schema
migration, introspection + gateway-principal changes, payment-route wiring, and
a full financial E2E (create → pay → ledger → proof → audit, plus tenant/scope/
idempotency/concurrency/negative matrices). The assurance programme forbids
rushing money-path changes; a half-wired payee binding could misroute funds or
break tenant isolation. It must be its own controlled train with complete
deployed E2E — exactly what RT03's own rule requires ("resolve ambiguity first
in an ADR"). Until then CAP-PAY-001/002/APP-004 remain `pending-e2e`.

## Consequences

- The design is fixed; the next train implements steps 1–6 and runs the RT03
  §5/§6/§7 E2E matrices, then flips the three capabilities to `released`.
- `make assure-payments-foundation` HOLDs until that evidence exists.
- Merchant-JWT payment flows are unaffected and continue to function.

## Implementation status (RT04 / 04B / 04C)

The design above is implemented, with one refinement to step 1: the binding lives
in a **dedicated `developer.dev_project_sandbox_binding` table** (migration 0100),
not a `merchant_id` column on `dev_projects`. This gives the binding its own
identity, state, provenance and audit surface, and a DB-enforced one-ACTIVE-per-
project constraint. As-built:

- **Binding authority:** `developer-api` is the single authority
  (`BindProjectSandbox`); it validates the merchant→wallet→wallet_account
  relationship against **Core** (independently authoritative, dedicated
  least-privilege credential — RT04C §3) **before** persisting, and **fails
  closed** on any inability to validate.
- **Resolution:** key introspection returns the resolved payee (internal-only ids
  + `Bound`); a valid key with no binding is `Bound=false` — never a default
  merchant.
- **Gateway:** dual-credential auth on the canonical routes derives the payee
  ONLY from the binding, rejects client-supplied merchant/wallet/payee, enforces
  scope + `Bound` + tenant isolation, and never falls back between credentials.
- **Deploy vs release (RT04C §1):** deploying the code does not make payment
  scopes public; a fail-closed, sandbox-only, operator-controlled release control
  gates public scope issuance, separate from deployment.

### Binding immutability — decision (RT04C §2)

For the current Sandbox release scope, a Project Sandbox payment binding is
**immutable once created**:

- **No operator rebind endpoint exists** in this release.
- **No binding disable endpoint exists** in this release.
- Concurrent bind attempts leave **exactly one** ACTIVE binding (DB partial
  unique index `dev_project_sandbox_binding_one_active`; concurrency-tested).
- Payment Sessions persist an immutable payee snapshot (`merchant_id`,
  `wallet_id`, `wallet_account_id`) at creation; Payment Links persist the
  equivalent. Because bindings are immutable and there is no rebind/disable path,
  an artifact's settlement interpretation is fixed forever **by construction** —
  no route can alter a binding used by an existing artifact.

A future rebind/disable capability (with reason, controlled action and immutable
audit, plus a transactional artifact seal) is **explicitly out of scope** here and
will be designed in its own ADR + release train — it is deliberately *absent*,
not a partial/incomplete implementation. A per-artifact `binding_id`/`version`
provenance column is a possible future enhancement; it is not required for
correctness while bindings are immutable and single-active.

## Alternatives considered

- *Expose merchant creation to any dev key with no binding model*: rejected —
  unbounded payee creation + no tenant model.
- *Reuse the legacy merchant-key path for developers*: rejected — conflates
  external-developer keys with merchant identity (ADR-046 separation).
- *Ship read-only payment methods without settlement*: rejected — the release
  criteria require the full pay + ledger + proof flow.
