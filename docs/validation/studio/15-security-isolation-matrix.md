# 15 — Security, authority and isolation validation matrix

Version: 1.0

---

## 1. The authority model being tested

> **A client-supplied identifier selects among resources the caller is already
> authorized for. It never creates authority.**

Every negative below is an attempt to make an identifier grant access, and every
one must fail closed — `404` where existence itself is privileged, `403` where
it is not.

## 2. Isolation matrix

| # | Actor | Attempts | Expected |
|---|---|---|---|
| 1 | `C01` | read `C02`'s transfer by id | 404 |
| 2 | `C01` | read `C02`'s wallet / balance | 404 |
| 3 | `C03` | pay a Collection share already settled | no second effect |
| 4 | `C03` | transfer from `C01`'s wallet by supplying its id | 403 |
| 5 | `B02` | read `B01`'s collection | 404 |
| 6 | `B02` | surface a share of `B01`'s collection | 404 |
| 7 | `B02` | read `B01`'s payment link by id | 404 |
| 8 | `B02` | refund `B01`'s payment | 404 |
| 9 | `B02` | read `B01`'s Receive Point slug as owner | 403 |
| 10 | `D02` | read `D01`'s project | 404 |
| 11 | `D02` | use `D01`'s project key | 401 |
| 12 | `D02` | create a payment link naming `D01`'s merchant id | 403 |
| 13 | `D02` | read `D01`'s wallet account | 404 |
| 14 | `D02` | transfer between `D01`'s wallet accounts | 403 |
| 15 | `D02` | replay `D01`'s webhook delivery | 404 |
| 16 | any | use a `bz_live_…` key against Sandbox | refused |
| 17 | any | use a Sandbox key against a Live route | refused (Live not provisioned) |
| 18 | any | **publishable key attempts a write** | 403 — read-only (ADR-053) |
| 19 | `C01` | reuse a session after logout | 401 |
| 20 | `C01` | use an expired session | 401 |
| 21 | `C01` | Consumer token on a Business route | 401/403 |
| 22 | Business | Business token on a Consumer route | 401/403 |
| 23 | web | Business logout does not end the Consumer context (same cookie) | Consumer survives |
| 24 | web | `active_context` header does not confer authority | ignored |
| 25 | any | forge `merchant_id` / `wallet_id` / `project_id` in a body | ignored or 403 |
| 26 | any | internal route from the public edge | 404 |
| 27 | any | `/admin/v1/**` without an operator session | 401 |
| 28 | `SUPPORT` operator | a `SUPER_ADMIN` route | 403 |
| 29 | operator | a step-up route without recent TOTP | 403 |
| 30 | suspended Business | receive a payment | fails closed |
| 31 | retired project | use its key | 401 |
| 32 | deleted project | resolve a payment session it created | 404 |

## 3. Cross-cutting security assertions

- **No secret in a response body** — keys are revealed once, at creation, and
  never again.
- **No secret in a log** — nginx proof/query redaction guards already exist.
- **No enumeration signal** — a foreign id and a nonexistent id are
  indistinguishable in status, body and timing class.
- **Rate limits engage** — credential endpoints at 15/min/IP,
  `application-submit` at 30/24h, and each returns the documented code, not a
  generic 500.
- **Fail-closed under rail failure** — see S23; nothing is created, credited or
  confirmed when the rail is down.
- **Environment isolation** — a Sandbox webhook never reaches a Live endpoint.

## 4. Existing coverage to orchestrate

`tools/e2e/console/{cross-project-isolation,rbac-matrix,refund-rbac}.mjs` ·
`tools/e2e/security/{ra-054-authority,proof-reference-canonicality}.mjs` ·
`tests/phase0/{business-tenant-isolation,retired-authority-denied}.sh` ·
`tools/e2e/sandbox/realtime-isolation-e2e.mjs` ·
proofs 12 (web session security), 14 (fail-closed), 16 (UX security),
17 (dual-context) · `tests/ops/{core-internal-routes-gated,
environment-writers-guard,client-ip-trust}.test.mjs` ·
`tests/security/{gitleaks-mutations,firebase-key-restrictions}.test.sh`.

Roughly two thirds of the matrix is already covered; rows 3, 9, 14, 18, 24, 29,
31 and 32 are the notable gaps.

## 5. The Lab as a security surface

The Validation Studio is itself security-sensitive and is treated as such:

- RBAC-gated in BANZADMIN ([07](07-banzadmin-validation-studio.md) §8);
- secret **references** only, never values;
- evidence access audited;
- actor lifecycle audited;
- SDK publication step-up gated;
- no product privilege of any kind, enforced by the actor-leakage guard.

A validation system that can do things a real user cannot has stopped
validating the product.
