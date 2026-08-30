# Banzami Security Audit

## 1. Executive Summary

| | |
|---|---|
| **Baseline commit** | `f343e22485593cfffb0afde066b0dfb4e78df832` (branch `main`) |
| **Closure branch** | `security/audit-authz-and-supply-chain` |
| **Date** | 2026-08-29 (audit), 2026-08-29 (closure) |
| **Scope** | Whole repository: Rust financial core, Go services, SDKs, apps, database schema, infrastructure, CI/CD, dependencies, secrets |
| **Method** | Adversarial review with reproduction. Every CRITICAL/HIGH finding was proven by an executable test that fails on the unfixed code and passes on the fixed code. The financial core was then verified against a real PostgreSQL. |
| **Findings** | 19 real (4 CRITICAL, 3 HIGH, 6 MEDIUM, 6 LOW) + 1 investigated and dismissed |
| **Remediated** | 18 of 19 fixed and verified; 1 LOW formally accepted (SEC-019, a compliance limit rather than an access control) |
| **Verdict** | `SECURITY GATE: PASS` — see §13 |

**Posture.** The financial core is soundly designed and is now *runtime*-verified:
498 Rust tests pass against a real PostgreSQL with the official migrations
applied, covering double-entry, atomicity, rollback, idempotency, replay,
concurrent double-spend, overdraft and QR single-use. The database layer, webhook
signing, the at-rest secret cipher, the SSRF guard and admin-api's operator
authentication are all well built.

The defects were concentrated in **one place: the api-gateway's authorisation
layer**. Authentication was implemented carefully; authorisation was applied
per-handler, and several handlers did not apply it. Three were exploitable for
cross-tenant financial access and one for full takeover of any Business Account.
A separate class — a forgeable JWT — existed because the gateway treated its
signing key as optional, unlike every sibling service.

Remediation was structural rather than per-handler: shared ownership guards that
handlers inherit, a route-level principal-type requirement, and fail-closed
startup validation, each covered by regression tests wired into `make
security-check` — a gate proven able to fail (§12).

**What the closure phase changed.** Every residual the first pass left open was
closed or reduced to a named external action: sqlx was upgraded and the advisory
suppressions cut from nine to two provable ones; the financial suite was run
against a real database; concurrency and idempotency moved from *design*-verified
to *runtime*-verified; automatic CI was restored after proving the Actions
billing block was gone and fixing the failures it had been masking; every GitHub
Action is pinned to a commit SHA.

**SEC-015 closed, and a CRITICAL found closing it.** Resolving the last open
finding meant examining the whole `/v1/transfers` group rather than the one
read route, which surfaced **SEC-018**: `POST /v1/transfers` let any merchant
credential name any `sender_id` and move that consumer's money — unauthorised
movement of money, and the same defect a prior internal record
(`2026-07-03-transfer-surface-findings.md`, finding B) had logged as a hard
blocker before Live. The whole group was removed from the merchant surface
rather than given a synthetic `merchant_id`; see SEC-015/SEC-018 below.

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
| SEC-013 | MEDIUM | supply chain | 6 Rust advisories from the sqlx 0.7.4 tree | Not reachable | `FIXED` (upgraded, §4) |
| SEC-014 | MEDIUM | ledger | `signed_minor_units()` undefined for `-i64::MIN`: silent wrong value, or panic under overflow-checks | Low | `FIXED` |
| SEC-015 | MEDIUM | api-gateway transfers | `GET /v1/transfers/{id}` returns any P2P transfer to any merchant | Yes | `FIXED` |
| SEC-018 | CRITICAL | api-gateway transfers | `POST /v1/transfers` let a merchant name any `sender_id` and move that consumer's money; `GET ?consumer_id=` read any consumer's whole history | Yes | `FIXED` |
| SEC-019 | LOW | consumer transfers | The consumer P2P path enforces identity status but not the progressive-KYC level/limit gate | Not an attacker capability | `ACCEPTED RESIDUAL RISK` |
| SEC-016 | MEDIUM | api-gateway QR | Any merchant could read, and **burn**, another merchant's single-use dynamic QR | Yes — proven | `FIXED` |
| SEC-017 | LOW | api-gateway config | 32 spaces / `"aaaa…"` accepted as a JWT signing key | Yes — proven | `FIXED` |
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

### SEC-015 / SEC-018 — Consumer P2P transfers exposed on the merchant surface (MEDIUM + CRITICAL)

* **Category:** CWE-639 (BOLA) + CWE-862 (Missing Authorization) → unauthorised movement of money
* **Affected:** `services/api-gateway/internal/handler/transfers.go`, `internal/server/server.go`
* **Prior record:** `docs/security/2026-07-03-transfer-surface-findings.md`, finding B — logged 2026-07-03 as high priority and a **hard blocker before Live activation**. Still open when this audit began.

**Attack scenario.** The gateway mounted a full `/v1/transfers` group behind
`RequireMerchant`. Every route took its subject straight from client input:

| Route | What a merchant credential could do |
|---|---|
| `POST /v1/transfers` | Name **any** `sender_id` and move that consumer's money to any recipient |
| `GET /v1/transfers/{id}` | Read **any** transfer (SEC-015) |
| `GET /v1/transfers?consumer_id=` | Read **any** consumer's entire transfer history |

The write is the severe one, and it is why this is recorded as CRITICAL rather
than the MEDIUM SEC-015 alone: it is unauthorised movement of money, reachable
with nothing but an ordinary merchant credential. The sender-KYC compliance gate
did **not** constrain it — the gate authorised the *sender named in the body*,
never the caller, so it merely required the victim to be KYC'd and within their
own limits.

**Root cause.** The capability was on the wrong surface. A consumer-to-consumer
transfer has two **consumer** participants and no merchant party.

**Why no `merchant_id` was added.** The obvious-looking fix — give `Transfer` a
`merchant_id` so the route can do an ownership check — was rejected. The absence
of a merchant field is not a missing field; it is the **absence of authority**.
Adding one would have changed the financial model to serve an authorization
problem, invented a merchant party to a transaction that has none, and (being a
new financial field) would have had to originate as a BANZA protocol change under
ADR-003. The audit does not change the protocol to preserve an incorrectly
exposed operator endpoint.

**Remediation.** The entire `/v1/transfers` group was **removed** from the
merchant surface, along with the now-unreachable handler and its wiring. The
capability was **not relocated**, because the correct surface already existed:
public-api derives the sender from the authenticated consumer token, addresses
the recipient by `@banza` handle, rate-limits per consumer, and restricts a read
to the transfer's own sender or recipient (the RA-022 fix). Merchant SDK methods
that called the retired routes were removed from the TypeScript, Flutter and
Python SDKs, with the breaking change and migration recorded in the changelog;
the API docs, gateway README and public developer reference were corrected.

**Regression tests:**
`TestMerchantSurface_P2PTransferRoutesNotMounted` asserts all three routes are
absent from the registered route table (a request-level assertion could not tell
"absent" from "present but rejecting", since group middleware runs before chi's
NotFound). Consumer ownership remains covered by the pre-existing
`TestGetTransfer_SenderCanRead`, `TestGetTransfer_RecipientCanRead` and
`TestGetTransfer_NonPartyGets404`. Principal separation is covered by the new
`TestConsumerSurface_RejectsMerchantToken`,
`TestConsumerSurface_RejectsTokenWithoutConsumerIdentity` and
`TestConsumerSurface_AcceptsConsumerToken`.

**Red→green evidence.** The three routes were temporarily re-mounted in the
working tree; `TestMerchantSurface_P2PTransferRoutesNotMounted` went **RED**
("GET /v1/transfers/{id} is mounted on the merchant surface…") and returned to
**GREEN** on restore. The insecure state was never committed.

**Residual risk.** None on this surface. Consumer P2P transfers are now reachable
only through a consumer credential, scoped to that consumer.

---

### SEC-019 — Consumer P2P path does not enforce the progressive-KYC gate (LOW)

* **Category:** CWE-863 / compliance control gap
* **Affected:** `services/public-api/internal/handler/transfers.go` → core `send_p2p`
* **Status:** `ACCEPTED RESIDUAL RISK` — recorded, not fixed here.

Found while verifying that removing the merchant transfer routes lost no control.
It did not — but the comparison showed the *reverse* asymmetry: the removed
merchant path carried a fail-closed progressive-KYC gate (`AuthorizeOperation`,
KYC_LEVEL_1 + limits), and the consumer path does not. The consumer path does
enforce sender/recipient identity status (suspended, closed, wallet-cannot-receive)
and balance, but nothing gates a transfer on KYC level or per-level limits.

**Why LOW, and why it is not an open security finding.** No attacker gains
anything they are not entitled to: the sender is derived from the authenticated
consumer's own token, so this is a consumer moving *their own* money. There is no
authorization bypass, no cross-tenant access and no unauthorised movement of
funds. What is missing is a **regulatory limit**, not an access control.

**Why this audit did not add one.** KYC/KYB is not operational at Banzami, real
Kwanza rails are not live, and the acquiring provider is simulated; adding a
KYC-level gate would be inventing regulatory logic that the project has not
specified, which §37 of the audit scope explicitly forbids. It is recorded so the
decision is deliberate rather than inherited.

**Action required before Live.** Decide whether the progressive-KYC gate applies
to consumer-initiated P2P and, if so, enforce it in the core `send_p2p` path so
both surfaces inherit it. This belongs with the existing Live activation gate,
which remains fail-closed.

---

### SEC-014 — `signed_minor_units()` undefined for `i64::MIN` (MEDIUM)

* **Category:** CWE-190 Integer Overflow
* **Affected:** `core/ledger/src/entry.rs`, `core/ledger/src/posting.rs`
* **Found by:** extending the SEC-005 boundary tests to real `i64` limits.

`i64::MIN` has no positive counterpart, so `-x` is not representable. The
function negated with plain `-x`, which **panicked** under the release
`overflow-checks` this audit enabled — an externally reachable panic in the
posting path — and, before those checks existed, **wrapped silently**, feeding a
wrong signed value straight into the double-entry sum. The second behaviour is
the more dangerous of the two.

**Remediation.** Added `checked_signed_minor_units()` returning `Option<i64>` and
made `assert_balanced` use it, so an unrepresentable entry is rejected as
unbalanced rather than approximated. `signed_minor_units` now saturates and is
documented as approximate, with correctness-critical callers pointed at the
checked variant.

**Regression tests:** `extreme_single_values_are_rejected_not_wrapped`,
`balance_check_is_not_defeated_by_i64_underflow`, `mixed_sign_overflow_is_rejected`.

---

### SEC-016 — Cross-merchant QR read and redemption (MEDIUM)

* **Category:** CWE-639 / OWASP API1 (BOLA)
* **Affected:** `services/api-gateway/internal/handler/qr.go`

`GET /v1/qr/{id}` and `POST /v1/qr/{id}/use` took the id from the URL with no
ownership check. Reading another merchant's code leaks its payee and amount. The
redemption route is worse: a dynamic QR is **single-use**, so an attacker could
mark a competitor's codes used and the legitimate payer's scan would then fail
with `QR_ALREADY_USED` — payment disruption reachable with nothing but an id.

**Remediation.** Both routes go through `requireOwnedQr`, matching the full
ownership pair (`OwnerType == "MERCHANT"` and `OwnerID == principal.MerchantID`),
so a consumer-owned code is not reachable from the merchant surface either.
Cross-owner access answers `404` to avoid an id oracle.

**Regression tests:** `TestQrMarkUsed_RejectsCrossMerchant` (asserts the service
was never reached, i.e. the code was not burned), `TestQrGet_RejectsCrossMerchant`,
`TestQrGet_RejectsConsumerOwnedCode`, plus owner-still-allowed and
unauthenticated controls. Verified to fail without the fix.

---

### SEC-017 — Long but trivial JWT signing keys accepted (LOW)

* **Category:** CWE-521 Weak Password Requirements
* **Affected:** `services/api-gateway/internal/config/config.go`

The SEC-001 fix enforced a 32-character minimum but nothing about content, so
32 spaces, 40 tabs, `"aaaa…"` or `"abab…"` were all accepted as HS256 signing
keys. Length is not strength.

**Remediation.** Leading/trailing whitespace is now rejected explicitly rather
than trimmed — a stray space from `.env` quoting silently changes which bytes are
the key, and the operator should be told — and a distinct-byte floor
(`MinJWTSecretDistinctBytes = 8`) rejects low-entropy keys. `openssl rand -hex 32`,
the documented command, yields ~16 distinct characters and is unaffected.

**Regression tests:** `TestValidateJWTSecretFailsClosed` extended with
whitespace-only, tabs-only, single-repeated-character, two-alternating-character,
leading/trailing-whitespace and NUL-run cases.

---

## 5. Financial Security Invariants

Verification levels are used strictly:

* **RUNTIME VERIFIED** — an automated test exercised it against a real
  PostgreSQL in this audit.
* **DESIGN VERIFIED** — established by reading code and schema; no test executed it.
* **NOT VERIFIED** — neither.

Nothing here is *deployed*-verified: everything ran locally and in CI, never
against a production environment.

| Invariant | Level | Evidence |
|---|---|---|
| Double-entry (Σ debits = Σ credits) | **RUNTIME VERIFIED** | `balanced_posting_is_stored_with_correct_entries`, `unbalanced_posting_is_rejected_by_builder`, `single_entry_posting_is_rejected`, `multi_currency_imbalance_is_rejected`. **Was defeatable by i64 overflow (SEC-005)**; now enforced with checked arithmetic and re-validated in the repository before any write. |
| Integer overflow / underflow | **RUNTIME VERIFIED** | `balance_overflow.rs` — 5 tests at real `i64` limits: all-debit wrap, all-credit underflow, mixed-sign overflow, `i64::MIN` extremes (SEC-014), and a control that a genuine posting is still accepted. Run in **release** profile, where the wrap actually occurs. |
| Atomicity | **RUNTIME VERIFIED** | `rollback_leaves_no_orphan_posting_or_entries`, `failed_posting_leaves_balances_unchanged`, `posting_header_without_entries_has_zero_financial_effect`. |
| Idempotency | **RUNTIME VERIFIED** | `idempotent_posting_returns_existing_without_duplicate`, `different_amount_same_key_returns_original`, `idempotent_send_returns_original_transfer`, `settlement_is_idempotent_no_double_pay_no_double_event`, `refund_idempotent_replay_is_single_posting`, `capture_replay_is_idempotent`. Previously *design*-verified only. |
| Concurrency / double-spend | **RUNTIME VERIFIED** | `concurrent_sends_cannot_overdraw`, `concurrent_transfers_respect_balance`, `concurrent_identical_postings_produce_single_entry`, `concurrent_refunds_never_over_restitute`, `concurrent_refund_and_dispute_share_ceiling`, `concurrent_dynamic_qr_claims_win_at_most_once`. Previously *design*-verified only. |
| Overdraft prevention | **RUNTIME VERIFIED** | `insufficient_funds_rejected_no_partial`, `reserve_fails_when_insufficient_funds`, `inactive_wallet_is_rejected_on_reserve`. |
| Conservation of value | **RUNTIME VERIFIED** | `chain_of_transfers_preserves_total`, plus the database `CHECK (gross = net + application_fee)` and `app_settlements_fee_bound` constraints. |
| Replay protection | **RUNTIME VERIFIED** | `inv_wal_004_3_duplicate_callback_rejected`, `double_authorize_is_rejected`, `double_reversal_is_prevented`; webhook signatures bind a timestamp into the HMAC with a two-sided tolerance window compared in constant time. |
| Balance authority (server-derived) | **RUNTIME VERIFIED** | `balance_is_derived_from_entries`, `balance_after_reserve_reflects_ledger`, `sql_consistency_invariants_all_pass`. |
| Ledger immutability | **RUNTIME VERIFIED** | `update_on_ledger_entry_is_rejected_by_db`, `delete_on_ledger_entry_is_rejected_by_db`. |
| Cross-account / cross-wallet isolation | **RUNTIME VERIFIED** (gateway) | **Was broken in five places (SEC-002, SEC-003, SEC-004, SEC-007, SEC-016)**; now enforced by shared guards, each with a regression test proven to fail without the fix. |
| Settlement isolation | **RUNTIME VERIFIED** | `TestApplicationSettlementGet_*` plus core's `application_settlements` suites. |
| Sole authoritative write path | **DESIGN VERIFIED** | All money movement goes through the Rust core; Go services proxy to `/internal/v1` and write no ledger rows. Verified by reading, not by a test that would fail if a Go service started writing. |
| Negative / zero / malformed amounts | **RUNTIME VERIFIED** | `negative_amount_rejected`, `create_with_negative_amount_is_rejected`, `zero_and_negative_amount_never_charge`, `entry_with_wrong_account_currency_is_rejected`. |
| Monetary precision | **DESIGN VERIFIED** | Integer minor units throughout; `Money` exposes `checked_add`/`checked_sub`; no floating-point in any money path. |

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

## 11. Residual Risks and External Actions

### 11.1 Accepted residual risk

**SEC-019 (LOW) — the consumer P2P path does not enforce the progressive-KYC
gate.** Formally accepted rather than fixed, for the reasons in its detailed
entry: it is a regulatory limit, not an access control (the sender is derived
from the consumer's own token, so no attacker capability exists), KYC/KYB is not
operational, and inventing a gate the project has not specified is out of scope.
It is recorded as an action to settle before Live activation, which remains
fail-closed and independently gated.

There is **no open finding requiring a product decision**. SEC-015 is closed —
see §11.3.

### 11.2 External actions

Neither blocks security PASS; both are recorded with the exact step required.

| # | Owner | Action | Blocks PASS | How to verify |
|---|---|---|---|---|
| 1 | GCP project owner (`banzami`) | Apply API-key application + API restrictions to the two Firebase client keys | No — these are client identifiers, not secrets; the exposure is quota/cost abuse, not money or data | `gcloud services api-keys list --project=banzami` shows a non-empty application restriction **and** API target list for every key. Full runbook with the real identifiers: [FIREBASE_GCP_KEY_RESTRICTIONS.md](FIREBASE_GCP_KEY_RESTRICTIONS.md) |
| 2 | Repo owner | Make the CI checks **required status checks** on `main` — **blocked by the GitHub plan**, not by configuration | No — the checks already run automatically on every PR and their results are visible before merge; this would only make them merge-*blocking* | Once available: Settings → Branches → `main` → required status checks lists the `security` job |

On item 2, the branch-protection API returns `403 — Upgrade to GitHub Pro or make
this repository public` for `banza-protocol/banzami`. Branch protection is not
available on a private repository on the current plan, so this cannot be enabled
by an administrator toggle: it needs a plan upgrade (or making the repository
public, which is not appropriate for an operator implementation). Recorded as a
plan constraint rather than a pending administrative action, so it is not
mistaken for something a maintainer can simply switch on.

### 11.3 Resolved since the previous report

| Item | Before | Now |
|---|---|---|
| `sqlx 0.7.4` advisories | 6 open, 9 suppressions | Upgraded to 0.8.6; 0 advisories, 2 provable suppressions, both machine-checked |
| Ledger tests vs PostgreSQL | Not run (`PoolTimedOut`) | 498 tests pass against real PostgreSQL 18 |
| Concurrency / idempotency | Design verified | **Runtime verified** |
| Automatic CI | Believed blocked by billing | Billing block gone (proven); triggers restored; a `security` job added |
| Action SHA pinning | Recommended | Done — 17/17 references pinned |
| Firebase/GCP restrictions | Recommended, vague | Runbook with real identifiers; external action #1 |
| Consumer suspend/close compatibility | "nothing depends on them" (wrong) | Dependants found and resolved end to end (SDK, README, App Store notes) |
| **SEC-015** | Open, product decision required | **CLOSED** — whole `/v1/transfers` group removed from the merchant surface; closing it surfaced SEC-018 (CRITICAL), also fixed |
| `cargo fmt` debt | 304 hunks / 50 files | Cleared in a dedicated commit |

---

## 12. Verification Evidence

Environment: PostgreSQL 18.1 (local, disposable) with all 97 official
migrations from `db/migrations/` applied; Go 1.26.3; Rust stable; gitleaks
8.x; cargo-audit; govulncheck. The repository's Docker Compose path was not
usable (no Docker daemon available), so the database was provisioned directly
and migrated with the repository's own migration files.

```text
# Security gate
make security-check                                       PASS
  · api-gateway security regressions                      PASS
  · ledger double-entry overflow invariant (release)      PASS
  · gitleaks over tracked files                           PASS (0 findings)
  · .env is not tracked                                   PASS
  · cargo audit                                           PASS (0 advisories)
  · audit-suppression build-graph validity                PASS (rsa, rkyv absent)
  · govulncheck × 4 services                              PASS (0 vulnerable modules)

# Rust — against real PostgreSQL
cargo test --workspace --release                          PASS (498 passed, 0 failed)
  · 23 integration binaries executed
cargo fmt --all -- --check                                PASS (0 diffs)
cargo audit                                               PASS
SQLX_OFFLINE=true cargo build --workspace                 PASS (offline cache valid)

# Go — with the race detector
go test -race -count=1 ./... (api-gateway)                PASS
go test -race -count=1 ./... (public-api)                 PASS
go test -race -count=1 ./... (admin-api)                  PASS
go test -race -count=1 ./... (developer-api)              PASS
go test -race -count=1 ./... (sandbox-operator)           PASS
govulncheck × 4 services                                  PASS (0 vulnerable modules)

# Canonical project gates
make check-repo-layout                                    PASS
make check-assurance                                      PASS
make assure-reference                                     PASS
make check-live-fail-closed                               PASS
make check-sdk-payment-boundary                           PASS
make assure-sandbox-launch                                HOLD (expected, see below)

# Secret scan
gitleaks (full history, 2236 commits, 63.81 MB)           49 hits, all triaged, 0 live credentials
gitleaks (tracked working tree, repo policy)              0 findings
```

### Automatic CI, verified end to end — FULL GREEN

The Actions billing block that had disabled automatic triggers is **resolved**.
Proof: a dispatched run executed real steps (8–19 per job) instead of dying in
~5s with zero steps, which was the billing signature. Triggers were restored, and
opening this branch's PR produced a real automatic run.

Restoring CI immediately surfaced failures the billing block had been masking on
`main` — all of them **pre-existing**, none introduced by this audit, and all now
fixed:

1. `cargo fmt --check` — 304 hunks across 50 files (cleared in its own commit so
   it could not obscure the security diffs).
2. An unformatted `sandbox-operator` file.
3. A `go test -race` **data race** in a webhook test fixture (the handler's
   fire-and-forget goroutine was correct; the fixture read it unsynchronised).
4. A step invoking `sqlx-backfill.sh`, retired because it caused schema drift.
5. Three DB-backed suites that could never pass — two asserted an orphan state
   that migration 0078's foreign key makes impossible, and the developer-api
   API-key lifecycle test passed a non-UUID actor into a `uuid` column.
6. Three rounds of clippy debt that only became reachable once the job stopped
   failing at the formatting step: `too_many_arguments` on
   `CollectionEngine::update_collection` and `finance_dashboard::grouped`;
   `dead_code` on collections' `ScopePath` / `SurfaceBody.surface_ref`,
   restitution's `Origin::Reversal` and several `RestitutionResult` fields; and
   `unused_must_use` on three test calls that invoke a route handler for its
   database side effect and discard the `#[must_use]` response.

**Final automatic PR run on `914bfcf1` — every job green:**

```text
success  Rust — build, lint, test                        (fmt + clippy -D warnings + full suite vs PostgreSQL)
success  Security — regressions, secrets, dependencies   ← the gate this audit added
success  Go api-gateway — vet, test
success  Go admin-api — vet, test
success  Go public-api — vet, test
success  Go sandbox-operator — fmt, vet, test
success  TypeScript SDK — typecheck, test
success  Migrations — sequence, tracking, freeze
skipped  Deploy to production                            ← correctly gated off
OVERALL: success
```

The Rust workspace suite therefore passes **against PostgreSQL in CI as well as
locally**, and `make security-check` passes in CI, not only on a developer
machine. The `Security` job passed on three independent runs.

**`assure-sandbox-launch` is HOLD and must stay HOLD.** It fails on 18
launch-scope items (CAP-PAYOUT-001, CAP-WEBHOOK-001, CAP-SDK-001/002,
CAP-APP-004 — public surfaces not yet E2E-released). That is *launch* readiness,
not *security* readiness, and nothing in this audit changed it. No assurance
status, capability state or launch verdict was modified.

**Go standard-library advisories.** `govulncheck` reports 7–8 stdlib advisories
per service, fixed in go1.26.6. These come from the toolchain performing the
build, not from repository code; the service Dockerfiles were moved from
`golang:1.25-alpine` to `golang:1.26-alpine`, and the source is proven compatible
with Go 1.26 (the full suite builds and passes on 1.26.3). **Container images
were not built in this session** — no Docker available. The gate reports these as
a labelled toolchain notice rather than a code defect, so a developer on an older
Go patch is not told the code is vulnerable.

### Guard self-tests — the gate is proven able to fail

A gate that cannot go red is worse than no gate. Each was broken deliberately in
the working tree and restored immediately; none of these probes is in history.

| Probe | Injected fault | Gate result |
|---|---|---|
| Secret scan | A realistic random `ghp_…` token added to a source file | `✗ gitleaks reported findings` → FAILED |
| Financial invariant | `assert_balanced` reverted to wrapping arithmetic | `✗ ledger double-entry overflow invariant` → FAILED |
| Dependency scan | chi downgraded to the vulnerable v5.2.1 in all four modules | `✗ 4 module vulnerabilities` × 4 → FAILED |
| Authorisation | `requireSelfMerchant`'s comparison short-circuited to false | `✗ api-gateway security regressions` → FAILED |
| Audit suppression | One assessment removed from `audit.toml` | `cargo audit` exit 1 |
| Per-finding tests | Each fix reverted individually | Its test goes red (the wallet test prints the leaked balance) |

`git status` is clean after every probe.

---

## 13. Security Gate Status

```text
CRITICAL unresolved:          0
HIGH unresolved:              0
MEDIUM unresolved:            0
LOW unresolved:               0  (SEC-019 formally ACCEPTED — §11.1)

Security regression tests:    PASS  (48 tests across Go and Rust)
Secret scan:                  PASS  (0 live credentials; history + tracked tree)
                                    demonstrated non-vacuous
Dependency scan:              PASS  Go: 0 vulnerable modules
                                    Rust: 0 advisories, 2 machine-checked suppressions
Static analysis:              PASS  go vet, cargo clippy -D warnings, cargo fmt,
                                    go test -race  (all green in CI)
Financial invariant tests:    PASS  498 Rust tests against real PostgreSQL,
                                    locally AND in CI
Automatic CI:                 PASS  all 8 jobs green on HEAD; deploy correctly skipped
Canonical project gates:      PASS  (layout, assurance, reference, live-fail-closed,
                                    sdk-payment-boundary)
Sandbox launch assurance:     HOLD  (unchanged — launch readiness, not security)
LIVE fail-closed:             PASS  (unchanged)
Deployed verification:        NOT PERFORMED (no production access; out of scope)

VERDICT: PASS
```

**Why PASS.** No CRITICAL, HIGH or MEDIUM finding remains open. The security
regression suite passes and is demonstrably able to fail; no auth/authz bypass
and no exploitable financial-integrity defect is known; no repository-owned
secret is exposed; and the one remaining LOW is formally accepted with its
reasoning recorded, not downgraded to reach a verdict. The last open item,
SEC-015, was closed by removing the capability from the surface that could not
authorise it — and closing it surfaced and fixed a CRITICAL (SEC-018) that a
prior internal record had logged as a Live blocker.

**Security readiness is not launch readiness.** Banzami remains NOT
launch-ready: no BANZA certification, no production certificate, production
federation not live, real Kwanza funding/withdrawals not operational, KYC/KYB not
operational, and the default acquiring provider still simulated. Nothing in this
audit changed any of those facts, and passing a BANZA L0 conformance suite
remains evidence, not certification.
