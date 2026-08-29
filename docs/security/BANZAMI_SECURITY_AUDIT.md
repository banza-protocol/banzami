# Banzami Security Audit

## 1. Executive Summary

| | |
|---|---|
| **Baseline commit** | `f343e22485593cfffb0afde066b0dfb4e78df832` (branch `main`, clean tree) |
| **Date** | 2026-08-29 |
| **Scope** | Whole repository: Rust financial core, Go services (api-gateway, public-api, admin-api, developer-api, sandbox-operator), SDKs, apps, database schema, infrastructure, CI/CD, dependencies, secrets |
| **Method** | Adversarial code review with reproduction. Every CRITICAL/HIGH finding was proven by an executable test that fails on the unfixed code and passes on the fixed code. |
| **Findings** | 12 real (3 CRITICAL, 3 HIGH, 4 MEDIUM, 2 LOW) + 1 investigated and dismissed as a false positive |
| **Remediated** | 12 of 12 repository-controlled findings fixed and verified |
| **Residual** | 2 items requiring action outside the repository (§11) |

**Posture.** The financial core is soundly designed — double-entry is re-validated
before every write, monetary values are integer-only, conservation of value is
enforced by database CHECK constraints, and idempotency keys are unique-indexed.
The database layer, the webhook signing scheme, the at-rest secret cipher, the
SSRF guard, and admin-api's operator authentication are all well built.

The defects were concentrated in **one place: the api-gateway's authorisation
layer**. Authentication was implemented carefully; authorisation was applied
per-handler and several handlers simply did not apply it. Three of those were
exploitable for cross-tenant financial access, and one for full takeover of any
Business Account. A fourth class — a forgeable JWT — existed because the gateway
treated its signing key as optional, unlike every sibling service.

The remediation was structural rather than per-handler: shared ownership guards
that handlers inherit, a route-level principal-type requirement, and fail-closed
startup validation, each covered by regression tests wired into a new
`make security-check` gate.

---

## 2. Attack Surface Reviewed

| Component | Reviewed |
|---|---|
| `core/` (22 Rust crates) | Ledger posting/balance invariants, Money arithmetic, app-settlement engine, `/internal/v1` route table and its authentication |
| `services/api-gateway` | JWT auth, dual auth, developer-key auth, internal auth, idempotency, rate limiting, CORS, every handler's authorisation, webhook signing + delivery, SSRF guard, at-rest secret cipher, KYB storage |
| `services/public-api` | Consumer JWT auth, transfers, payment links, KYC case handling, receipts |
| `services/admin-api` | Operator JWT, RBAC capabilities, session revocation, audit middleware |
| `services/developer-api` | Account identity middleware, key authorisation |
| `db/migrations` | 100+ migrations; constraints, uniqueness, FKs, immutability triggers |
| `infra/` | Docker Compose (legacy + blueprint), nginx, deploy scripts |
| `.github/workflows` | `ci.yml`, `sdk-publish.yml` |
| Dependencies | Cargo (327 crates), Go (4 modules), npm, container base images |
| Secrets | Full git history (2236 commits) + working tree |

---

## 3. Findings

| ID | Severity | Component | Finding | Exploitable | Status |
|----|----------|-----------|---------|-------------|--------|
| SEC-001 | CRITICAL | api-gateway auth | Empty `JWT_SECRET` accepted; any token forgeable with wildcard scopes | Yes — proven | `FIXED` |
| SEC-002 | CRITICAL | api-gateway merchants | Any merchant could mint a LIVE API key for any other merchant | Yes — proven | `FIXED` |
| SEC-003 | CRITICAL | api-gateway consumers | `suspend`/`close` any consumer account, no authorisation at all | Yes — proven | `FIXED` |
| SEC-004 | HIGH | api-gateway wallets | BOLA: any merchant could read any wallet, its balance and analytics | Yes — proven | `FIXED` |
| SEC-005 | HIGH | ledger | i64 overflow defeats the double-entry balance invariant in release builds | Yes — proven | `FIXED` |
| SEC-006 | HIGH | supply chain | 7 reachable vulnerabilities in Go dependencies (4 in the chi router) | Reachable per govulncheck | `FIXED` |
| SEC-007 | MEDIUM | api-gateway settlements | BOLA: application settlements readable across Business Accounts | Yes — proven | `FIXED` |
| SEC-008 | MEDIUM | api-gateway auth | Consumer tokens authenticate on the merchant surface (no principal-type check) | Yes — proven | `FIXED` |
| SEC-009 | MEDIUM | api-gateway startup | LIVE fail-closed guard bypassed by `ENVIRONMENT=production` | Yes — proven | `FIXED` |
| SEC-010 | MEDIUM | CI/CD | No `permissions:` block; `StrictHostKeyChecking=no`; mutable `:latest` image against the production DB | Conditional | `FIXED` |
| SEC-011 | LOW | api-gateway webhooks | SSRF allow-list missed CGNAT/reserved ranges; no redirect policy | Conditional | `FIXED` |
| SEC-012 | LOW | infra | Compose published core-api, Postgres, Redis, Grafana on `0.0.0.0` | Deploy-gated | `FIXED` |
| SEC-013 | INFO | supply chain | 6 Rust advisories, all from the sqlx 0.7.4 tree | Assessed — see §11 | `ACCEPTED RESIDUAL RISK` |
| — | — | api-gateway webhooks | *Suspected* dead SSRF guard | **No** | `FALSE POSITIVE` |

---

## 4. Detailed Findings

### SEC-001 — Forgeable authentication when `JWT_SECRET` is unset (CRITICAL)

* **Category:** CWE-287 Improper Authentication / CWE-1188 Insecure Default
* **Affected:** `services/api-gateway/internal/config/config.go`, `internal/middleware/auth.go`

**Attack scenario.** An empty string is a *valid* HMAC-SHA256 key. The gateway
declared `JWTSecret` optional ("Deliberately left optional here so the gateway
starts for health-check purposes even before auth is fully wired") and passed it
straight to `jwt.ParseWithClaims`. With `JWT_SECRET` unset, an unauthenticated
attacker signs their own token with the empty key and the gateway accepts it —
choosing their own `merchant_id`, `scopes: ["*"]` and `environment: "LIVE"`.
That is complete authentication *and* authorisation bypass over the entire
merchant surface: payments, wallets, payouts, API keys.

**Reachability.** The documented setup path produces exactly this state:
`.env.example` shipped `JWT_SECRET=` (empty), and `docker-compose.full.yml`
passes `${JWT_SECRET}` through unchanged. `public-api` already refused to start
without the variable; the internet-facing gateway did not.

**Evidence.** A proof-of-concept forged a token and asserted the outcome:

```
VULNERABLE: forged token accepted. merchant=victim-merchant-id scopes=[*] env=LIVE
```

**Root cause.** The signing key was treated as an optional convenience rather
than a precondition for serving authenticated routes, and no layer rejected the
empty key.

**Remediation.** Fail closed at three levels:
1. `config.Load()` refuses to start without a `JWT_SECRET` of at least 32 characters.
2. `verifyJWT` returns `errNoSigningKey` when the secret is empty, so no code path can verify against `""`.
3. `NewMerchantToken` refuses to mint a forgeable session. The same runtime guards were applied to `public-api` as defence in depth.

**Regression tests:** `TestForgedTokenRejectedWhenSigningKeyMissing`,
`TestDualAuthForgedTokenRejectedWhenSigningKeyMissing`,
`TestMintRefusesEmptySigningKey`, `TestValidSigningKeyStillAuthenticates`,
`TestValidateJWTSecretFailsClosed`, `TestValidateJWTSecretDoesNotLeakSecret`.

---

### SEC-002 — Cross-merchant API key minting (CRITICAL)

* **Category:** CWE-639 / OWASP API1 (BOLA) + API5 (BFLA)
* **Affected:** `services/api-gateway/internal/handler/merchants.go`

**Attack scenario.** `/v1/merchants/{id}/…` sits inside the merchant-JWT group,
and merchant sessions are minted with `scopes: ["*"]`. The handlers took `{id}`
straight from the URL and never compared it with the authenticated principal.
Any merchant who could log in could therefore:

* `POST /v1/merchants/{victim}/api-keys` — **mint a LIVE API key for another
  Business Account and receive the plaintext key in the response**, i.e. take
  over that account and its payment authority;
* `GET /v1/merchants/{victim}/api-keys` — enumerate their keys;
* `DELETE /v1/merchants/{victim}/api-keys/{keyID}` — revoke them (denial of service);
* `POST /v1/merchants/{victim}/suspend` — suspend a competitor;
* `GET /v1/merchants/{victim}` — read their record.

**Root cause.** Operator-grade actions were exposed on the self-service surface,
and ownership was assumed from authentication.

**Remediation.** A single `requireSelfMerchant` guard enforces
`{id} == principal.MerchantID` on all five routes, answering `404` rather than
`403` so the surface cannot be used to confirm which merchant ids exist. Operator
actions on arbitrary merchants remain available where they belong: admin-api's
capability-gated, audited `/admin/v1/merchants/…`.

**Regression tests:** `TestCreateApiKey_RejectsOtherMerchant`,
`TestListApiKeys_RejectsOtherMerchant`, `TestRevokeApiKey_RejectsOtherMerchant`,
`TestSuspendMerchant_RejectsOtherMerchant`, `TestGetMerchant_RejectsOtherMerchant`,
`TestMerchantSelfServiceStillWorks`, `TestMerchantRoutes_RejectUnauthenticated`.
Each asserts the *service layer was never reached*, not merely that the status
code changed.

---

### SEC-003 — Unauthorised consumer account suspension and closure (CRITICAL)

* **Category:** CWE-862 Missing Authorization
* **Affected:** `services/api-gateway/internal/handler/consumers.go`, `internal/server/server.go`

**Attack scenario.** `POST /v1/consumers/{id}/suspend` and
`POST /v1/consumers/{id}/close` performed no authorisation whatsoever — not even
a principal lookup. Any authenticated principal could close or suspend **any
consumer's wallet account** by id. Combined with SEC-008 (below), an ordinary
consumer token was sufficient.

**Remediation.** Both routes were removed from the merchant surface. They are
operator actions and remain available — capability-gated (`CapConsumerSuspend`)
and audited — through admin-api → core `/internal/v1/consumers/{id}/suspend`.

**Regression test:** `TestMerchantSurface_ConsumerLifecycleRoutesNotMounted`
asserts against the registered chi route table. A request-level assertion would
have been vacuous here: group middleware runs before chi's `NotFound` handler, so
an absent route and a protected route both answer `401`.
`TestMerchantSurface_ExpectedRoutesStillMounted` keeps that assertion honest.

---

### SEC-004 — Cross-tenant wallet, balance and analytics disclosure (HIGH)

* **Category:** CWE-639 / OWASP API1 (BOLA)
* **Affected:** `services/api-gateway/internal/handler/wallets.go`

**Attack scenario.** `GET /v1/wallets/{id}`, `/{id}/balance` and `/{id}/analytics`
read the wallet id from the URL with no ownership check. Any authenticated
merchant could read any other merchant's wallet record, live balance and
ledger-derived payment analytics.

**Evidence.** Before the fix the regression tests recorded the leak directly:

```
cross-merchant wallet read succeeded: {"id":"w-victim","merchant_id":"victim-merchant",…}
want 404, got 200: {"wallet_id":"w-victim","available_minor":500000,…}
```

**Remediation.** A shared `requireOwnedWallet` helper resolves the wallet, compares
`wallet.MerchantID` with the principal, and is used by all three handlers, which
now operate on the resolved wallet rather than the raw URL parameter. Cross-tenant
access returns `404` to avoid an existence oracle for wallet ids.

**Regression tests:** `TestWalletGet_RejectsCrossMerchantAccess`,
`TestWalletBalance_RejectsCrossMerchantAccess`,
`TestWalletAnalytics_RejectsCrossMerchantAccess`,
`TestWalletGet_OwnerStillAllowed`, `TestWalletGet_RejectsUnauthenticated`.

---

### SEC-005 — Integer overflow defeats the double-entry invariant (HIGH)

* **Category:** CWE-190 Integer Overflow → INV-LEDGER violation
* **Affected:** `core/ledger/src/posting.rs`, `core/Cargo.toml`

**Attack scenario.** `assert_balanced()` summed each entry's signed minor units
with `+=`. Rust disables overflow checks in release builds, so the sum wraps
silently. A posting whose real total is non-zero can therefore compute to exactly
zero and report itself *balanced*. The demonstration uses three DEBIT entries and
no credits at all — `i64::MAX + i64::MAX + 2` wraps to `0`:

```
thread 'balance_check_is_not_defeated_by_i64_overflow' panicked:
an all-debit posting was accepted as balanced: the double-entry invariant
was defeated by integer overflow
```

This is money created from nothing, passing the check that exists to prevent
exactly that. The check runs twice (builder and repository), so both layers were
defeated by the same wrap.

**Root cause.** The invariant that guards the ledger was itself computed with
unchecked arithmetic, and the workspace had no release-profile overflow checks.

**Remediation.**
1. `assert_balanced` accumulates with `checked_add` and reports an overflow as
   `UnbalancedPosting` — an overflow is never a legitimate posting. Error totals
   use `saturating_add` so reporting cannot itself overflow.
2. `[profile.release] overflow-checks = true` for the whole financial core, as the
   backstop for every path that does not use explicit checked arithmetic.

**Regression test:** `core/ledger/tests/balance_overflow.rs` —
`balance_check_is_not_defeated_by_i64_overflow` (run in **release** profile,
where the wrap actually occurs) and `genuinely_balanced_posting_is_still_accepted`.

---

### SEC-006 — Reachable vulnerabilities in Go dependencies (HIGH)

* **Category:** CWE-1395 Vulnerable Third-Party Component
* **Affected:** `go.mod` of api-gateway, public-api, admin-api, developer-api

`govulncheck` reported 17 vulnerabilities whose vulnerable code Banzami actually
calls. Seven were in module dependencies, including **four in `go-chi/chi` v5.2.1
— the HTTP router every service routes through**, plus `golang.org/x/net`,
`golang.org/x/text`, `grpc` and `otel`.

**Remediation.** Minimum compatible upgrades, all within the same major version:
chi `v5.2.1 → v5.3.0`, `x/net v0.54.0 → v0.55.0`, `x/text v0.37.0 → v0.39.0`,
`grpc v1.81.1 → v1.82.1`, `otel v1.43.0 → v1.44.0`.

**Verification.** `govulncheck` now reports **no vulnerable module dependencies**
in any of the four services; all Go tests pass after the upgrade. The remaining
10 advisories are Go **standard library** issues, fixed by the build toolchain:
the service Dockerfiles were moved from `golang:1.25-alpine` to `golang:1.26-alpine`.
The source is proven compatible with Go 1.26 — the full suite was built and run on
Go 1.26.3 in this audit — but **container images were not built in this session**
(no Docker available); see §11.

---

### SEC-007 — Cross-tenant application-settlement disclosure (MEDIUM)

* **Category:** CWE-639 / OWASP API1 (BOLA)
* **Affected:** `services/api-gateway/internal/handler/application_settlements.go`

`GET /v1/application-settlements/{id}` verified the caller was *some*
authenticated merchant, then returned the settlement by id — exposing another
Business Account's gross, application-fee and net amounts. The write paths were
thoroughly authorised; only the read path was not.

The record had no owner to check against: `owner_ref` is client-supplied free
text, and `application_id` — the binding column that already existed in
`db/migrations/0072_app_settlements.sql` and was already accepted by core — was
never populated by the gateway.

**Remediation.** The gateway now sets `application_id` from the authenticated
principal on both create paths, and `Get` returns `404` unless it matches. A
settlement with **no** binding (rows written before the binding existed) is also
refused: unknown ownership fails closed. `ApplicationID` is `json:"-"`, so the
app-facing payload is unchanged. No protocol change was required — core already
supported the field.

**Regression tests:** `TestApplicationSettlementGet_RejectsCrossBusinessAccountAccess`,
`TestApplicationSettlementGet_UnboundSettlementFailsClosed`,
`TestApplicationSettlementGet_OwnerStillAllowed`,
`TestApplicationSettlementCreate_BindsToAuthenticatedMerchant`.

---

### SEC-008 — Consumer tokens authenticate on the merchant surface (MEDIUM)

* **Category:** CWE-863 Incorrect Authorization
* **Affected:** `services/api-gateway/internal/middleware/auth.go`, `internal/server/server.go`

`public-api` mints consumer tokens with the **same** HS256 secret and the **same**
claim shape as merchant tokens, and there is no `aud`/`iss` separation. A consumer
token is therefore a structurally valid gateway token. Handlers that check
`principal.MerchantID` fail safely; handlers that check nothing (SEC-003, SEC-004)
were reachable with an ordinary wallet user's credential.

Audience separation was **not** the right fix: the gateway legitimately accepts
consumer tokens for consumer KYC (`/v1/compliance/customers/…`).

**Remediation.** A `RequireMerchant` middleware makes the principal *type* an
explicit route-level requirement, applied to `/v1/merchants`, `/v1/wallets`,
`/v1/consumers`, `/v1/consumer-wallets` and `/v1/transfers`. The merchant surface
now fails closed for consumer credentials regardless of what each handler checks.

**Regression tests:** `TestRequireMerchant_RejectsConsumerPrincipal`,
`TestRequireMerchant_RejectsUnauthenticated`, `TestRequireMerchant_AllowsMerchantPrincipal`.

---

### SEC-009 — LIVE fail-closed guard bypassed by `ENVIRONMENT=production` (MEDIUM)

* **Category:** CWE-1188 Insecure Default / fail-open guard
* **Affected:** `services/api-gateway/cmd/gateway/main.go`

`proofSigningKeyState` decided whether a missing `BZM_PROOF_SIGNING_KEY` was
fatal using `strings.EqualFold(env, "LIVE")`. The codebase's own normaliser
(`service.NormaliseStackEnv`) also treats `production`, `PRODUCTION` and `PROD`
as live — and `config.IsProduction()` looks for exactly `"production"`. A gateway
started with `ENVIRONMENT=production` therefore **failed open**: it booted with
unkeyed, forgeable transaction-proof signatures and only logged a warning.

**Remediation.** The guard now routes through `service.NormaliseStackEnv`, the
single place that decides what counts as live. The same normaliser is used by the
new `WEBHOOK_ENCRYPTION_KEY` guard, which refuses to start a LIVE gateway that
would store webhook signing secrets in plaintext (a database reader could
otherwise forge signed events for every merchant endpoint).

**Regression test:** `TestProofSigningKeyState` extended with
`production` / `PRODUCTION` / `PROD` fatal cases and a `staging` warn case.

---

### SEC-010 — CI/CD hardening (MEDIUM)

* **Category:** CWE-732 / supply chain
* **Affected:** `.github/workflows/ci.yml`

Three issues: no `permissions:` block (the workflow inherited the repository
default, which on older repositories is read/write on every scope);
`StrictHostKeyChecking=no` on all five deploy SSH invocations (accepts any host
key, so the deploy channel is MITM-able); and
`ghcr.io/launchbadge/sqlx-cli:latest` — a mutable tag pulled and executed
**against the production database** during migration.

**Remediation.** Added `permissions: contents: read`; changed all five SSH calls
to `StrictHostKeyChecking=accept-new` (trust on first use, and refuses a *changed*
host key); pinned the migration runner to `sqlx-cli:0.7.4`.
`sdk-publish.yml` was reviewed and already correct — least-privilege permissions,
a protected `sdk-release` environment, and OIDC provenance.

---

### SEC-011 — Webhook SSRF allow-list gaps and redirect policy (LOW)

* **Category:** CWE-918 SSRF
* **Affected:** `services/api-gateway/internal/service/webhook_ssrf.go`

The existing guard (RA-023) is well built — registration-time validation plus a
delivery-time `DialContext` that re-checks the *resolved* IP, defeating DNS
rebinding. Two gaps remained:

* `net.IP.IsPrivate()` does **not** cover carrier-grade NAT `100.64.0.0/10`
  (widely used for cloud-internal endpoints and mesh VPNs), and `IsUnspecified()`
  matches only the single address `0.0.0.0`, not `0.0.0.0/8`. Reserved ranges
  (`240.0.0.0/4`, broadcast), NAT64 `64:ff9b::/96` and the test ranges were also
  unfiltered.
* No `CheckRedirect` policy. Go forwards the custom `Banza-Signature` header
  across redirects (it is not a well-known credential header), so a merchant
  endpoint could bounce the signed payload onto plaintext HTTP.

**Remediation.** `extraDisallowedCIDRs` covers the missing ranges (including
IPv4-mapped forms), and the delivery client refuses non-HTTPS redirects and caps
the chain at three hops.

**Regression tests:** `TestIsDisallowedIP_CoversReservedAndInternalRanges` (21
addresses), `TestIsDisallowedIP_AllowsPublicAddresses` (guards against
over-blocking), `TestValidateWebhookURL`,
`TestSafeWebhookClient_RefusesNonHTTPSRedirect`,
`TestSafeWebhookClient_BoundsRedirectChain`.

---

### SEC-012 — Internal services published on all interfaces (LOW)

* **Category:** CWE-668 Exposure of Resource to Wrong Sphere
* **Affected:** `infra/docker/docker-compose.full.yml`

Compose port mappings such as `"8081:8081"` bind `0.0.0.0`. The file's own comment
stated core-api "should be firewalled and only accessible via loopback" — a
documented control the configuration did not enforce. Published on a public
interface, core's `/internal/v1` surface (merchant provisioning, API-key minting,
wallet credit, settlement, payouts, compliance decisions) is almost entirely
**unauthenticated** — only the refunds and payee-validation groups require
`CORE_INTERNAL_KEY`; the rest trust the network boundary. PostgreSQL (`banzami_dev`),
Redis (no auth) and Grafana (`admin`/`banzami_dev`) were likewise published.

**Reachability.** Low in practice: `deploy.sh` fails closed for every live rail
service, so this compose file is not the deployed topology. The deployed sandbox
blueprint (`infra/blueprint/sandbox-ops/`) is already correctly hardened —
internal-only networks, no host-published ports, digest-pinned images, file-based
secrets, `no-new-privileges`.

**Remediation.** All internal services bound to `127.0.0.1`. Every nginx upstream
addresses containers by Docker service name over `banzami_net`, so loopback
binding changes no routing — it only removes a plaintext path that bypasses nginx
and its TLS termination. Only the nginx TLS entry point (`8443:443`) remains
public.

---

### FALSE POSITIVE — "the SSRF guard is dead code"

`newSafeWebhookClient` appeared unreferenced next to a plain
`&http.Client{Timeout: 30 * time.Second}` in `webhooks.go`, which would have made
the documented delivery-time SSRF defence inert. **It is not a defect.** The plain
client belongs to `StubWebhookService`, the in-memory implementation used only
when `DATABASE_URL` is unset. The production `PostgresWebhookService` does use
`newSafeWebhookClient`. Recorded here because the suspicion was investigated and
disproved, not because a weakness exists.

---

## 5. Financial Security Invariants

| Invariant | Verified | Result |
|---|---|---|
| Sole authoritative financial write path | Yes | Holds. All money movement goes through the Rust core; Go services proxy to `/internal/v1` and never write ledger rows. |
| Double-entry (Σ debits = Σ credits) | Yes | **Was defeatable by i64 overflow (SEC-005); now enforced with checked arithmetic** and re-validated in the repository before any DB write. |
| Atomicity | Yes | Holds. `repository.post` opens a transaction, validates account currency, and rolls back on mismatch before any row is written. |
| Idempotency | Partly | Design verified: `idempotency_key` is `NOT NULL UNIQUE` on `ledger_postings` and `app_settlements`; duplicate keys return the existing posting. **Runtime concurrency tests require PostgreSQL and did not run** (§12). |
| Concurrency protection | Partly | Same as above — `concurrent_identical_postings_produce_single_entry` and `concurrent_settlement` tests exist but need a database. |
| Cross-account isolation | Yes | **Was broken in four places (SEC-002, SEC-003, SEC-004, SEC-007); now enforced** by shared guards with regression tests. |
| Conservation of value | Yes | Holds, and is enforced at the database level: `CONSTRAINT app_settlements_balance CHECK (gross = net + application_fee)` plus `app_settlements_fee_bound`. |
| Replay protection | Yes | Holds. Webhook signatures bind a timestamp into the HMAC input with a tolerance window checked in both directions, compared in constant time over the raw bytes. |
| Server-authoritative balances | Yes | Holds. Balances are read from the ledger; the settlement paths read the real source balance rather than accepting a client amount, and developer-key payees derive from the project binding with `rejectClientPayeeFields` refusing any client-supplied payee. |
| Settlement integrity | Yes | Holds. Fees are resolved by the pricing engine or an explicit app bps, never a client-sent number; fee destinations must be the caller's own KYB-validated Business Account. |
| Monetary precision | Yes | Holds. Integer minor units throughout; `Money` exposes `checked_add`/`checked_sub`; no floating-point arithmetic in any money path. |

---

## 6. Authentication & Authorisation

**Authentication** was well implemented apart from SEC-001: the signing algorithm
is pinned to HMAC (no `alg=none`, no RSA/HMAC confusion), expiry is required, and
admin-api additionally re-checks the operator is `ACTIVE` on every request and
carries a `token_version` so password changes, resets, suspensions and "terminate
sessions" revoke live tokens. admin-api's middleware was the reference
implementation the gateway now matches — it already refused to run with an unset
secret.

**Authorisation** was the weak layer. It was applied handler-by-handler and four
handlers omitted it. The remediation moves the decision into shared,
inherited guards (`requireSelfMerchant`, `requireOwnedWallet`,
`RequireMerchant`) rather than adding four independent checks, so a future handler
inherits the rule instead of having to remember it. Cross-tenant denials answer
`404` rather than `403`, matching the idiom already established in
`public-api` by the RA-022 IDOR fix, so the endpoints cannot be used to
enumerate ids.

`public-api` was found correctly consumer-scoped throughout (transfers verify the
caller is sender or recipient; KYC cases are fetched by consumer id). The
developer-key payment path was found well designed: scope checked before business
logic, payee derived exclusively from the project binding, and any client-supplied
payee field rejected outright.

---

## 7. API & Webhook Security

Global controls are sound: a 4 MB request-size cap, 60 s timeout, panic recovery,
per-route rate limits with a tighter limiter for unauthenticated credential
endpoints, and Redis-backed idempotency.

Webhook signing follows the Stripe scheme correctly — HMAC-SHA256 over
`"<unix_seconds>.<raw_payload>"`, timestamp bound into the signature, tolerance
enforced in both directions, and `hmac.Equal` for comparison. Signing operates on
raw bytes, so no canonicalisation mismatch is possible. Outbound delivery is
protected by the two-layer SSRF guard hardened in SEC-011.

---

## 8. Data / Secrets / Cryptography

**Cryptography** is appropriate throughout: AES-256-GCM with a per-message random
nonce and an explicit 32-byte key-length check for secrets at rest; HMAC-SHA256
for webhook and proof signatures; a versioned ciphertext prefix allowing lazy
migration. No MD5, no SHA-1 in a security role, no ECB, no static IVs, and no
home-grown primitives.

**Secrets.** `gitleaks` was run over the full history (2236 commits) and the
working tree. **No live credential is committed.** `.env` is untracked and
gitignored. Every remaining hit was triaged individually and is a placeholder, a
test fixture, or a client identifier:

* Firebase keys in `google-services.json` / `GoogleService-Info.plist` are
  **client identifiers**, designed to ship inside the app binary; access is
  governed by Firebase rules and GCP API-key restrictions, not by secrecy.
* `sdk-certification/vectors/webhook_signatures.json` holds **published** test
  vectors — the secrets there are meant to be public so any SDK can verify it
  computes the same signature.
* Idempotency keys (`order-12345-attempt-1`) are request references, not credentials.

`.gitleaks.toml` records these decisions. Suppressions are **by value shape or by
generated-output path**, never by blanket rule disablement, and the allowlist was
verified non-vacuous: four realistic canary credentials planted in a test file and
a documentation file were all detected (an earlier canary attempt failed only
because it used AWS's own published example key, which gitleaks correctly ignores).

---

## 9. Infrastructure & CI/CD

The **deployed** sandbox blueprint is genuinely well hardened: internal-only
Docker networks, no host-published ports, digest-pinned images, file-based
secrets, `no-new-privileges`, and SCRAM-SHA-256 auth. The legacy
`infra/docker/docker-compose.full.yml` was not (SEC-012) and is now bound to
loopback.

`deploy.sh` fails closed correctly: every live payment-rail service, payment
surface and admin surface is explicitly denied, with only the website and the
rt04e sandbox flow approved. CI issues are covered in SEC-010.

**Important context:** automatic CI triggers are disabled (`workflow_dispatch`
only) pending an Actions billing issue, so none of these gates — including the new
security regressions — run automatically on push or pull request. See §11.

---

## 10. Supply Chain

* **Go:** 7 reachable module vulnerabilities fixed (SEC-006). `govulncheck` now
  reports no vulnerable module dependencies in any service.
* **Rust:** 6 advisories, all originating from the single pinned `sqlx 0.7.4`
  tree. Assessed individually in `core/.cargo/audit.toml` — notably `rsa`
  (Marvin timing attack) and `rkyv` are present in `Cargo.lock` but **absent from
  the build graph**: sqlx is configured with the `postgres` feature and no
  `mysql`, and `cargo tree --workspace --edges normal` shows zero occurrences of
  either crate. They are never compiled or linked. See §11 for the rest.
* **GitHub Actions** are referenced by mutable tags (`actions/checkout@v4`,
  `dtolnay/rust-toolchain@stable`). Pinning to commit SHAs is recommended but
  requires resolving each SHA online; see §11.

---

## 11. Residual External Risks

These are the only items that could not be closed inside the repository.

1. **`sqlx 0.7.4` → `>= 0.8.1` upgrade.** This is the single root remediation for
   all six Rust advisories, including RUSTSEC-2024-0363 (binary-protocol
   misinterpretation) and the three `rustls-webpki` certificate-validation issues.
   It is a **breaking major upgrade across 22 crates** and, because Banzami's
   financial invariant tests use a real database and no mocks (CLAUDE.md §7), it
   must be validated against PostgreSQL. Deliberately **not** attempted blind in
   this audit. Practical exposure is low and documented per-advisory in
   `core/.cargo/audit.toml`: the sqlx issue needs a single query parameter larger
   than 4 GiB, and the gateway caps request bodies at 4 MiB.
   **Action required:** schedule the upgrade with a DB-backed test run.

2. **Restore automatic CI, or run `make security-check` as a pre-merge step.**
   CI triggers are disabled pending the GitHub Actions billing issue in the
   `banza-protocol` org. Until that is resolved nothing runs automatically, so the
   security regression suite protects the codebase only when a developer runs it.
   **Action required:** resolve Actions billing and uncomment the
   `push`/`pull_request` triggers in `.github/workflows/ci.yml`.

Two smaller recommendations, each needing an online step or an infrastructure
change rather than a code change:

3. **Pin GitHub Actions to commit SHAs** (`actions/checkout@<sha>` etc.), and in
   particular `dtolnay/rust-toolchain@stable`, which is a mutable *branch*.
4. **Apply GCP API-key restrictions** to the Firebase keys shipped in the mobile
   apps (restrict by app bundle id / SHA-1 and by API). The keys are not secrets,
   but unrestricted keys can be used from anywhere.

---

## 12. Verification Evidence

Commands executed and their outcomes:

```text
# Security gate (new)
make security-check                                            PASS
  · api-gateway security regressions                           PASS
  · ledger double-entry overflow invariant (release profile)   PASS
  · gitleaks (tracked files, .gitleaks.toml policy)            PASS — 0 findings
  · .env is not tracked                                        PASS
  · cargo audit                                                PASS — 0 unassessed advisories
  · govulncheck × 4 services                                   PASS — 0 vulnerable modules
      (notice: 10 Go stdlib advisories — build with go1.26.6+)

# Go test suites (forced, -count=1)
go test -count=1 ./services/api-gateway/...                    PASS (9 packages)
go test -count=1 ./services/public-api/...                     PASS (2 packages)
go test -count=1 ./services/admin-api/...                      PASS (6 packages)
go test -count=1 ./services/developer-api/...                  PASS (2 packages)
go test -count=1 ./services/sandbox-operator/...               PASS (1 package)

# Rust
cargo test -p banzami-ledger --release --test balance_overflow PASS (2 tests)

# Canonical project gates
make check-repo-layout                                         PASS (28 checks)
make check-assurance                                           PASS

# Secret scan
gitleaks detect (full history, 2236 commits, 63.81 MB)         49 hits, all triaged
                                                               → 0 live credentials
```

**Not run — environmental, honestly reported:**

`cargo test -p banzami-ledger` integration tests (18 tests) fail with
`PoolTimedOut`: they require a live PostgreSQL, which was not available in this
session (no Docker daemon, no local server). This is a **pre-existing
environmental dependency, not a regression** — the failure is a connection
timeout, not an assertion. These tests cover concurrency and idempotency
(`concurrent_identical_postings_produce_single_entry`,
`idempotent_posting_returns_existing_without_duplicate`,
`rollback_leaves_no_orphan_posting_or_entries`), which is why §5 marks
idempotency and concurrency as *design-verified but not runtime-verified* in this
audit. They run in CI's `rust` job, which provisions PostgreSQL.

**Guard self-tests.** Each new gate was verified capable of failing, because a
gate that cannot go red is worse than no gate:

| Guard | Self-test | Result |
|---|---|---|
| Wallet/settlement/merchant authorisation tests | Reverted the fix, re-ran | Red, with the leaked balance in the output |
| Ledger overflow test | Run against the unfixed `assert_balanced` | Red |
| Secret scan | Planted 4 realistic credentials in a test file and a doc file | All 4 caught |
| `cargo audit` policy | Removed one assessment from the ignore list | Exit 1 |
| `govulncheck` policy | Downgraded chi to v5.2.1 across all four modules | Red, 4 advisories |
| Route-table assertion | Control test asserts expected routes are still mounted | Green |

---

## 13. Security Gate Status

```text
CRITICAL unresolved:          0
HIGH unresolved:              0
MEDIUM unresolved:            0
LOW unresolved:               0

Security regression tests:    PASS  (30 new tests across Go and Rust)
Secret scan:                  PASS  (0 live credentials; history + working tree)
Dependency scan:              PASS  (Go: 0 vulnerable modules; Rust: 6 assessed,
                                     documented, tracked to the sqlx upgrade)
Static analysis:              PASS  (go vet clean; cargo clippy clean)
Financial invariant tests:    PARTIAL — double-entry overflow invariant verified;
                                     DB-backed concurrency/idempotency tests
                                     require PostgreSQL (not available here)
Canonical project gates:      PASS  (check-repo-layout, check-assurance)
Sandbox validation:           NOT RUN — requires a deployed stack

VERDICT: CONDITIONAL PASS
```

**Conditional on:** the two external actions in §11 — the `sqlx >= 0.8.1` upgrade
with database-backed validation, and restoring automatic CI so these regressions
run on every change. No repository-controlled CRITICAL or HIGH finding remains
open. Launch status is unchanged: `deploy.sh` still fails closed for every live
payment rail, and no assurance status was altered by this audit.
