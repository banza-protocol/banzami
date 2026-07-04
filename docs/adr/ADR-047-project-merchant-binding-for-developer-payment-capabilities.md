# ADR-047 — Project→Merchant Binding for Developer Payment Capabilities

- **Status:** Accepted (design) — implementation deferred to its own controlled release train
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

## Alternatives considered

- *Expose merchant creation to any dev key with no binding model*: rejected —
  unbounded payee creation + no tenant model.
- *Reuse the legacy merchant-key path for developers*: rejected — conflates
  external-developer keys with merchant identity (ADR-046 separation).
- *Ship read-only payment methods without settlement*: rejected — the release
  criteria require the full pay + ledger + proof flow.
