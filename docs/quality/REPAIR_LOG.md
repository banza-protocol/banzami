# Banzami Sandbox Release Assurance — Repair Log

Programme: **BANZAMI-SANDBOX-RELEASE-ASSURANCE-001** · started 2026-07-04
Canonical capability registry: [`quality/operator-assurance-manifest.yaml`](../../quality/operator-assurance-manifest.yaml)
Asset inventory: [`ops/asset-inventory.yaml`](../../ops/asset-inventory.yaml)

Each finding records: severity, root cause, remediation, environment, tests,
deployment evidence, cleanup result, final disposition.

Severity: CRITICAL / HIGH / MEDIUM / LOW.
Disposition: fixed / blocked(owner+decision) / accepted-justified / open.

---

## RA-046 — Core returned 500 for a non-positive payment-session amount (Stage E1.1)

- **Severity:** MEDIUM (validation gap on a money field; wrong status, no data risk)
- **Environment:** `core/api` payment sessions
- **Finding:** `amount_minor` was bound straight into the INSERT with no
  validation. A zero or negative value violated the database CHECK and the
  resulting error surfaced as an internal error, so a caller sending
  `amount_minor = 0` was told the server had failed rather than that their amount
  was invalid.
- **Why it stayed hidden:** before RA-043 was fixed, a core 400 and a core 500
  reached the client identically as 502. Fixing the gateway is what made this
  visible — the CAP-PAY-001 suite went to 17/19 with both remaining failures being
  zero/negative amounts still answering 502, correctly this time.
- **Remediation:** core rejects an explicitly non-positive amount with 400 before
  the insert. An OMITTED amount stays valid: that is an open-amount session, which
  the interface logic already treats as a distinct case.
- **Verification:** deployed Sandbox — zero and negative amounts both **400**.
- **Disposition:** fixed.

---

## RA-049 — A merchant could create a QR owned by another merchant (Stage E1.3)

- **Severity:** HIGH (cross-tenant creation of a payment instrument)
- **Environment:** `POST /v1/qr/dynamic` and `/v1/qr/static`, deployed Sandbox
- **Finding:** `owner_id` arrived in the request body and was trusted. Merchant B
  naming merchant A returned **201**: a live payment instrument collecting into
  A's wallet, with an amount and reference chosen by B, presented under A's
  identity.
- **The pattern is now worth naming.** This is the third time a client-supplied
  ownership identifier has been believed on this API — SEC-015 (merchant naming an
  arbitrary transfer sender), RA-047 (payment links), and now QR. Each was found
  the same way: reading the handler suggested it, and two real merchants proved it.
- **Remediation:** a MERCHANT-owned QR must name the authenticated merchant (403
  otherwise). A CONSUMER-owned QR is deliberately left to its own authority rather
  than forced through a merchant check that does not apply to it.
- **Verification:** deployed Sandbox — B naming A now **403**; the victim's QR is
  unchanged after every attempt.
- **Disposition:** fixed.

---

## RA-050 — QR surface reported client rejections as 500 (Stage E1.3)

- **Severity:** LOW (wrong status; no data or security impact)
- **Finding:** the QR handler mapped every failure to `INTERNAL_ERROR` 500, so an
  unsupported currency, an invalid `owner_type` and a malformed payload were all
  reported as server faults. The RA-043 class on a third handler.
- **Remediation:** deliberate core rejections keep their status; genuine failures
  stay 500. Verified on the deployed Sandbox: all three now **400**.
- **Disposition:** fixed.

---

## RA-051 — Sandbox-only endpoints were disabled inside the Sandbox (Stage E1.3)

- **Severity:** MEDIUM (blocked all payment assurance requiring a funded payer)
- **Finding:** `POST /v1/sandbox/fund` answered *"403 SANDBOX_ONLY: this endpoint
  is only available in sandbox mode"* — from the Sandbox. The deployment sets
  `ENVIRONMENT=sandbox`; the gate demanded the exact string `"SANDBOX"`. It failed
  on case alone. A consumer registering through the real public flow starts at zero
  and had no authorised route to a balance.
- **Second effect:** the same comparison drove the boot summary, so a service
  running in the Sandbox logged *"LIVE mode — sandbox routes disabled, real rails
  active"*. That line had been in every public-api startup log for weeks. Nothing
  depended on it, but a payment service announcing live rails while in the Sandbox
  is precisely the signal an operator should be able to trust — and it was read and
  set aside during Stage E0.
- **Remediation:** case-insensitive comparison, matching developer-api. Exact
  equality after folding case, never prefix or substring: a LIVE deployment sets a
  different word and must keep failing. Tests assert the safety half explicitly.
- **Verification:** funding returns 200 and the boot log now says
  `SANDBOX mode — fake funding enabled, no real rails`.
- **Disposition:** fixed.

---

## RA-052 — No canonical route to a KYC-approved Sandbox consumer (Stage E1.3)

- **Severity:** MEDIUM (blocks CAP-PAY-003 execution assurance; not a runtime defect)
- **Finding:** QR payment execution requires the payer to pass the compliance gate,
  which answers `422 KYC_REQUIRED`. No consumer can reach an approved state in the
  Sandbox: a case is created (201, `WAITING_DOCUMENTS`), evidence upload returns
  **503 STORAGE_NOT_CONFIGURED**, and submit therefore returns 409
  EVIDENCE_INCOMPLETE. There is no sandbox auto-approval equivalent to the
  merchant KYB path, and the admin surface is not served.
- **Assessment:** the gate is behaving correctly — it is fail-closed on an
  unverified payer, which is what it is for. The gap is the absence of an
  authorised route to a payer it will accept. Manufacturing one (direct SQL, an
  internal approval call, or weakening the gate) would remove the control that
  protects a payer's money, so none was attempted.
- **Consequence:** CAP-PAY-003 cannot be released. Money movement, ledger balance,
  replay, concurrency and insufficient-funds behaviour are all unproven.
- **Disposition:** open — requires a canonical Sandbox consumer KYC mechanism.

---

## RA-054 — Merchant-JWT routes accepting identity fields in the body (inventory, Stage E1.3A)

- **Severity:** MEDIUM as an inventory; each unverified route is a candidate defect
- **Context:** four confirmed occurrences of one pattern — SEC-015 (arbitrary
  transfer sender), RA-047 (payment links), RA-049 (QR owner), RA-053 (QR payer).
  A focused sweep of merchant-JWT handlers for client-supplied identity fields:

  | Handler | Fields in body | Status |
  |---|---|---|
  | `payment_links.go` | merchant_id, wallet_id | **bound** (RA-047) |
  | `qr.go` | owner_id, wallet_account_id | **bound** (RA-049); payer route removed (RA-053) |
  | `payment_sessions.go` | wallet_account_id | **verified** — core refuses a foreign wallet account (403), proven by CAP-PAY-001 |
  | `payouts.go` | wallet_id | **NOT VERIFIED** — money movement |
  | `transactions.go` | wallet_id | **NOT VERIFIED** — money movement |
  | `wallet_accounts.go` | wallet_id | **NOT VERIFIED** |
  | `consumer_wallets.go` | consumer_id | **NOT VERIFIED** |
  | `disputes.go` | consumer_id | **NOT VERIFIED** |

- **Deliberately not claimed:** the five unverified rows are NOT asserted to be
  defective. Each was found by grep, and every confirmed instance so far needed two
  real merchants to settle. They are recorded so the pattern is tracked rather than
  rediscovered one capability at a time.
- **Disposition:** open — verify each before its capability is assured. `payouts`
  and `transactions` move money and should come first.

---

## RA-055 — Environment mode is decided by raw string comparison in 14 places (Stage E1.3A)

- **Severity:** MEDIUM (two live functional defects already traced to it)
- **Finding:** environment behaviour is decided by ad-hoc string comparison across
  services, with at least four different conventions: `!= "SANDBOX"`,
  `== "sandbox" || == "SANDBOX"`, `!= "sandbox" && != "live"`, and
  `== "production"`. Deployments set `ENVIRONMENT=sandbox`.
- **Two live consequences already found and fixed:** Sandbox wallet funding was
  refused inside the Sandbox (RA-051), and the registration test-balance grant
  never fired, so every Sandbox consumer registered at zero — silently, because a
  skipped grant is indistinguishable from a grant of nothing.
- **Remaining sites** (unfixed, exact-match against `"SANDBOX"` while deployments
  send `sandbox`): admin-api `merchant_setup.go`, gateway `merchant_onboarding.go`,
  gateway `sandbox.go`, `developer_auth.go`, `core_client.go` (×2),
  `merchant_applications.go`, `merchant_application_admin.go`. Some compare a
  request/response field rather than deployment config and may be correct; each
  needs checking against what it actually reads.
- **Not done here:** a single canonical typed environment with fail-closed parsing,
  which is the real fix. What was done is the audit and the two functional
  repairs. Scattering `EqualFold` further would spread the pattern rather than
  close it.
- **Disposition:** open.

---

## RA-053 — CONFIRMED and CLOSED. A merchant JWT was not authority to debit a consumer (Stage E1.3 → E1.3A)

> **Confirmed 2026-08-31, and no longer undetermined.** The authority question had
> a documented answer: the Flutter SDK's `ConsumerPublicClient` states
> *"[payer] is the authenticated consumer's @banza handle"* and targets the
> consumer surface — which has no such route. The only implementation sat in the
> gateway behind `RequireMerchant`, took `payer` as free text, and neither layer
> proved the caller could spend that consumer's money. The QR payload does not
> close the gap: core makes the QR owner the RECIPIENT, so possessing it says
> nothing about the payer's consent.
>
> Exploitation was blocked only by `KYC_REQUIRED`, which is an ELIGIBILITY
> control. It answers whether a customer may transact at all, never whether this
> caller may spend that customer's money — and using the first as evidence for the
> second is how the gap survived a whole stage as "undetermined".
>
> **Closed by removing the route from the merchant surface**, following SEC-015,
> where the same shape was resolved by withdrawing a wrongly-exposed merchant
> surface rather than inventing a `merchant_id` on the financial model. Inventing
> a consent capability to justify this endpoint would have been the same mistake:
> the protocol defines no such delegation. Guarded by a route-table assertion, not
> a status check. Verified on the deployed Sandbox: the arbitrary-payer call is
> unreachable and the victim's balance is unchanged.
>
> Consequence: QR execution has no correct surface until the consumer-side route
> is implemented per the SDK contract. CAP-PAY-003 stays HOLD for that reason.

## RA-053 (original) — QR payer identity is not bound to the caller (UNVERIFIED, Stage E1.3)

- **Severity:** UNDETERMINED — recorded as a concern requiring verification, not a
  confirmed defect
- **Finding:** `POST /v1/qr/pay` accepts `payer` from the request body and passes
  it through unbound; core resolves it as a handle to a wallet with no check that
  the caller may spend from it. On the surface that is the SEC-015 shape: a
  merchant-authenticated caller naming an arbitrary payer.
- **Why it is unverified:** the attack was attempted on the deployed Sandbox — a
  merchant created its own QR and named an unrelated funded consumer as payer. It
  was refused, but by `422 KYC_REQUIRED` (a compliance gate on the payer), NOT by
  an authorisation check. The victim was not debited. Whether a KYC-approved payer
  would have been debited could not be established, because RA-052 makes such a
  payer unobtainable.
- **Why it is recorded anyway:** the only thing observed standing between a
  merchant and an unrelated consumer's funds was a gate that is about identity
  verification, not authority. If RA-052 is resolved, this must be the first thing
  re-tested, before any CAP-PAY-003 promotion.
- **Disposition:** open — MUST be resolved before CAP-PAY-003 is released.

---

## RA-047 — Any merchant could read, create and CANCEL another merchant's payment links (Stage E1.2)

- **Severity:** HIGH (cross-tenant destructive mutation on a payment surface)
- **Environment:** `/v1/payment-links`, deployed Sandbox
- **Finding:** measured with two independently provisioned merchants, before the fix:

  | Attempt by merchant B | Result |
  |---|---|
  | create a link **payable to A** | **201** — payee A, amount and description B's |
  | read A's private link | **200** — full internal record |
  | list A's links | **200** — by naming A in the query |
  | **cancel A's link** | **200** — and A's link became `CANCELLED` |

- **Impact:** not fund theft — money still flows toward the victim. It is
  unauthorized destructive mutation: any merchant could kill any other merchant's
  payment links, so the victim's customers find the links dead and the victim
  cannot attribute it. It also allowed minting links under another merchant's
  identity with an attacker-chosen amount and description.
- **Root cause:** coherent rather than careless. When ADR-047 introduced
  developer-key authority, THAT path was given tenant isolation — `Get` already
  refused a cross-tenant read for a developer key and create derived the payee
  from the Project binding. The older merchant-JWT path was left trusting
  `merchant_id` from the request body and the query string. The newer credential
  got the isolation; the one that predated it did not.
- **Remediation:** all five operations bind to the principal. Create refuses a body
  naming another merchant (403) and uses the caller's identity when the field is
  omitted; List is scoped to the caller (403 on a foreign id); Get, Cancel and
  MarkUsed check ownership BEFORE mutation and answer 404 rather than 403, because
  403 confirms the id exists and makes links enumerable — matching the
  payment-session surface and the developer-key path already here. MarkUsed
  matters twice: marking another merchant's link paid would dispatch
  `payment_link.paid` to THEIR webhook endpoints.
- **Tests:** six handler tests asserting the SERVICE IS NEVER REACHED for a foreign
  resource — asserting the status alone would pass even if the mutation had already
  happened. Proven non-vacuous by reverting the Cancel check and watching the test
  fail on exactly that assertion. Deployed E2E adds
  `PAY002.neg.victim-link-unchanged`, which confirms the target link is still
  ACTIVE after every cross-tenant attempt.
- **Disposition:** fixed and verified on the deployed Sandbox.

---

## RA-048 — Invalid payment-link state transition returned 500 (Stage E1.2)

- **Severity:** LOW (wrong status; no data or security impact)
- **Finding:** cancelling an already-cancelled link returned 500. Core answers
  **422 LINK_NOT_ACTIVE** and the handler already had a branch mapping exactly
  that, but the service never produced the sentinel the branch tests for, so the
  error fell through to the default. The correct answer was sitting unused beside
  the wrong one.
- **Note:** predates RA-043 rather than being caused by it — the old client's 422
  case returned a formatted string the sentinel could not match either. Typing the
  core errors made the gap addressable, not new.
- **Remediation:** one mapping helper shared by cancel and mark-used, which had the
  same gap. An unrelated core rejection is deliberately not laundered into a
  state-transition error; a test asserts a 400 INVALID_AMOUNT survives as a 400.
- **Disposition:** fixed.

---

## RA-043 — CLOSED. Gateway reported client errors as 502 (Stage E1 → E1.1)

> **Closed 2026-08-31.** The core client now returns a typed `CoreError` carrying
> the upstream status and core's safe reason code, and a `TransportError` for a
> failure to complete the exchange at all. Handlers map a deliberate core 4xx to
> that status; core 5xx and transport failures remain 502. `ErrNotFound` is kept
> as the 404 sentinel (38 call sites branch on it), so whether a route hides
> existence stays that route's privacy decision. Five regression tests cover 4xx
> preservation, 5xx, transport, the sentinel and an unparsable 4xx body. Verified
> on the deployed Sandbox: cross-merchant create 502 → **403**, unsupported
> currency 502 → **400**.

## RA-043 (original) — Gateway reports client errors as 502 on the payment surface (Stage E1)

- **Severity:** MEDIUM (API correctness + access-control legibility; no data exposure)
- **Environment:** `POST /v1/business/payment-sessions`, deployed Sandbox
- **Finding:** the handler maps EVERY error from core to
  `502 UPSTREAM_ERROR`, because the core client returns an untyped
  `fmt.Errorf("core-api error %d: …")` that carries no status a handler can
  branch on. Core's 400s and 403s therefore reach the client as 502.
- **Measured on the deployed Sandbox** (CAP-PAY-001 suite, 4 of 5 failures):

  | Request | Core | Client sees | Should be |
  |---|---|---|---|
  | `amount_minor = 0` | 400 | **502** | 400 |
  | `amount_minor = -1` | 400 | **502** | 400 |
  | unsupported currency | 400 | **502** | 400 |
  | merchant B naming merchant A's wallet account | 403 | **502** | 403/404 |

- **Why it matters beyond tidiness:** the last row is an authorization failure
  presented as a server fault. A 502 also invites retry, where a 400 does not, so
  an integrator's client library will hammer a request that can never succeed.
  It cost this programme real time too: it masked the `purpose` defect below and
  every validation error during Stage E1 diagnosis.
- **Note:** the boundary itself holds — cross-merchant creation IS refused, and
  no internal detail leaks in any response. This is the wrong status code on a
  correct refusal, not a broken control.
- **Disposition:** open — the core client needs to carry the upstream status so
  handlers can map 4xx to 4xx.

---

## RA-044 — CLOSED. Idempotency key reuse with a different payload (Stage E1 → E1.1)

> **Closed 2026-08-31.** Requests are fingerprinted and a mismatch returns **409**
> instead of replaying the original. Canonicalisation ignores key order,
> whitespace and explicitly empty/null optional fields, so a differing serialiser
> does not cause false conflicts, while any value change — including nested — is
> visible. Scoping was already correct (principal + method + path + key) and is
> proven on the deployed Sandbox: the same raw key used by two merchants yields
> two distinct sessions. Four concurrent identical requests produced exactly one
> session. Entries cached before the change carry no fingerprint and replay as
> before, so the rollout could not reject in-flight keys.
>
> Stated limitation, asserted by a test so it stays deliberate: transport-level
> canonicalisation cannot know an endpoint's SEMANTIC defaults, so omitting a
> field and sending its default explicitly still conflict. That direction is the
> safe one — a false conflict refuses the request, a missed conflict returns the
> wrong resource.

## RA-044 (original) — Idempotency key reuse with a different payload is not rejected (Stage E1)

- **Severity:** MEDIUM (financial-API correctness)
- **Environment:** `POST /v1/business/payment-sessions`, deployed Sandbox
- **Finding:** replaying an idempotency key with the SAME payload correctly
  returns the original session (201, same `session_id`) — that half works. But
  reusing the same key with a materially different payload (`amount_minor`
  changed) also returns **201 with the original session** instead of a conflict.
  The stored response is returned without comparing the request.
- **Why it matters:** an integrator who reuses a key by accident — a loop
  variable, a retry after editing the amount — silently gets the wrong session
  and believes the new amount was accepted. On a money surface, a request
  fingerprint is what makes idempotency safe rather than merely deduplicating.
- **Measured:** CAP-PAY-001 suite, `PAY001.idempotency-conflict-rejected`.
- **Disposition:** open — the idempotency middleware should store a payload
  fingerprint and reject a mismatch per the API contract.

---

## RA-045 — CLOSED. Omitting `purpose` made session creation fail (Stage E1 → E1.1)

> **Closed 2026-08-31.** The gateway omits the field when empty, exactly as it
> already did for `reference_type`, `reference_id`, `currency` and `description`,
> so core's documented default applies. Verified on the deployed Sandbox: an
> omitted purpose returns **201** with `purpose = GENERIC`; an unknown purpose
> returns **400**.

## RA-045 (original) — Omitting `purpose` makes payment-session creation fail (Stage E1)

- **Severity:** LOW (the documented default is unreachable)
- **Finding:** core defaults an ABSENT `purpose` to `GENERIC`, but the gateway
  always sends the field, so omitting it transmits `""`, which core rejects as an
  invalid purpose. The simplest valid request therefore fails, and — because of
  RA-043 — fails as a 502.
- **Remediation:** omit the field when empty, mirroring how the same function
  already treats `reference_type`, `reference_id`, `currency` and `description`.
- **Disposition:** open.

---

## RA-040 — account_identity was never added to the runtime grant list (Stage E0.2)

- **Severity:** HIGH (Developer Console non-functional in Sandbox for seven weeks)
- **Environment:** sandbox `banzami_staging`, `infra/blueprint/sandbox-ops/scripts/sandbox-migration.sh`
- **Finding:** the canonical migration tooling enables the runtime role on the
  exact schemas the services use, and its own comment states the rule: *"New
  schemas must be added here explicitly; there is no blanket cross-schema
  grant."* It granted `public` and `developer`. Migration 0088 created
  `account_identity` in July and that list was never extended, so
  `bl_app_runtime` had no `USAGE` on the schema. Every Console account, OTP,
  session and audit write failed with permission denied, which the service
  correctly reported as a fail-closed 503.
- **Root cause:** a documented rule was not followed when a schema was added.
  Nothing was corrupt; no migration failed; the ledger was accurate throughout.
- **Remediation:** four statements added to the tooling following the existing
  convention — USAGE, DML on existing tables, sequence usage, default privileges
  for future tables. Least-privilege: no GRANT ALL, no DDL, no ownership. Applied
  to the Sandbox executing the merged definition verbatim
  (`has_schema_privilege` f → t).
- **Detection gap closed:** `tools/check-schema-reality.mjs` /
  `make check-schema-reality`. It deliberately does **not** check that tables
  exist — an existence check would have passed every day of the outage. It asks
  whether the runtime role can read and write the critical tables, connecting as
  that role, and reports existence and access as separate failures because they
  have separate repairs. Proven on a disposable database: objects-without-grants
  FAILs, granted PASSes, dropped-table FAILs with a different message.
- **Verification:** `POST /auth/request-otp` 503 → **200**; OTP persisted; verify
  returns a session; account and session rows created.
- **Disposition:** fixed.

---

## RA-041 — Canonical migration tooling cannot target the serving sandbox (Stage E0.2)

- **Severity:** LOW (operational friction; no runtime impact)
- **Finding:** `make sandbox-migration-apply` refuses with *"no bootstrapped
  Sandbox (run sandbox-bootstrap apply first)"*. It targets a
  blueprint-bootstrapped project, while the sandbox actually serving is the rt04e
  project. Grants and migrations therefore cannot be applied to the live sandbox
  through the canonical entry point.
- **Consequence:** the RA-040 grant had to be applied with the superuser
  credential, executing the merged tooling statements verbatim. Defensible —
  grants are not tracked in `_sqlx_migrations` and merged code is the forward
  source of truth — but it means a canonical path exists that does not reach the
  environment it names.
- **Disposition:** open.

---

## RA-042 — Operator fixture endpoint returns 503 (Stage E0.2)

- **Severity:** MEDIUM (blocks the intended E2E fixture path; not on any product flow)
- **Finding:** `POST /internal/v1/fixture-projects` returns 503 on the internal
  network with a valid internal key, after the account_identity grant repair. A
  different code path from account identity with a different root cause, not yet
  diagnosed.
- **Impact:** Stage E does not depend on it — both the merchant and developer
  credential paths work — but the mechanism built for isolated E2E fixtures is
  unavailable.
- **Disposition:** open.

---

## RA-038 — WITHDRAWN. The migration ledger was accurate (Stage E0.1 → E0.2)

> **This finding was wrong and is retracted.** See RA-040 for the real cause.
> The four `account_identity` tables exist, all twelve indexes exist, and the
> `_sqlx_migrations` row for version 88 is accurate with its checksum intact. The
> evidence used was `information_schema.tables` queried **as the runtime role** —
> a privilege-filtered view, which showed nothing because the role had no rights.
> `pg_indexes` listing four primary keys was the tell: an index cannot exist
> without its table. This is the same error as RA-035/SE-001 — inferring absence
> from a filtered view — made twice in the same investigation.

## RA-038 (original text, retained) — Migration ledger records a schema that does not exist (Stage E0.1)

- **Severity:** HIGH (the canonical migration record is wrong, and the tooling
  cannot self-heal)
- **Environment:** sandbox `banzami_staging`
- **Finding:** `_sqlx_migrations` records version 88 ("account identity") as
  `success = true`, but none of the four tables that migration creates exist —
  `identity_users`, `identity_otp_codes`, `identity_sessions`, `audit_events`.
  Only the empty `account_identity` schema is present.
- **Why it is worse than ordinary drift:** because 88 is marked applied,
  `sandbox-migration plan` reports nothing pending and will never re-run it, so
  the tables cannot appear through the canonical path. Every migration check in
  this repository reports the database as current — 97 of 97 applied at version
  100, zero failures — and it is not. This is the same record-versus-reality
  failure this programme has hit repeatedly, now in the schema ledger, which is
  the layer every other check trusts.
- **Impact:** the entire Developer Console identity product (accounts, OTP,
  sessions, audit) has no storage in Sandbox, so `POST /auth/request-otp` fails
  closed with 503 and the operator fixture-key path fails for the same reason.
  Not only a testing obstacle: developer onboarding advertised to external
  integrators cannot work.
- **Detection:** structured diagnostics added to the OTP failure path named
  `account identity unavailable` within minutes of deployment; the pepper, Redis
  and database were each eliminated by measurement, leaving persistence.
- **Remediation:** NOT applied here. The options are editing `_sqlx_migrations`
  to force a re-run or hand-applying DDL; fabricating migration records and
  manual schema mutation are both forbidden by the governing brief, and this is a
  data-layer repair on a shared environment. Migration 0088 uses
  `CREATE TABLE IF NOT EXISTS` throughout, so re-application is idempotent once
  authorised.
- **Disposition:** **open** — requires an explicit authorised migration action.

---

## RA-039 — Client-caused check violation answered as 500 (Stage E0.1)

- **Severity:** LOW (wrong status code; no data or security impact)
- **Environment:** `POST /v1/merchant/applications`
- **Finding:** an unrecognised `business_account_type` violates
  `merchant_applications_business_account_type_check` (SQLSTATE 23514) and is
  mapped to `INTERNAL_ERROR` 500. The value is client-supplied and the allowed set
  is known (MERCHANT, APPLICATION, PLATFORM, NGO, MARKETPLACE, DELIVERY, OTHER),
  so the correct answer is the `VALIDATION_ERROR` 400 the handler already returns
  for other invalid input. A caller sending a wrong enum is told the server broke.
- **Cost, measured rather than assumed:** every onboarding probe across Stage E
  and Stage E0 sent `business_account_type: "COMPANY"`, a value this product does
  not define. The resulting 500 was reported as a deployment blocker in two
  assurance stages. The flow was never broken; the payload was mine, and the
  status code made a client error look like a server fault.
- **Disposition:** open — map 23514 on this constraint to the existing 400
  contract.

---

## RA-035 — SE-001 withdrawn: secrets were provisioned all along (Stage E0)

- **Severity:** n/a — this is the retraction of a finding, not a defect
- **Finding as reported (Stage E):** deployed api-gateway and developer-api were
  "missing required configuration" — `DATABASE_URL`, `OTP_PEPPER`,
  `SESSION_SECRET`, `DEVELOPER_INTERNAL_KEY` — rated HIGH.
- **Why it was wrong:** the evidence was `docker inspect .Config.Env`, which is
  the wrong place to look in this architecture *by design*. Every secret is
  mounted as a file at `/run/secrets/*` and exported in-process by the entrypoint
  precisely so it never appears in container config, image metadata or
  `docker inspect`. All eight are present and non-empty; the gateway's new real
  database probe now proves the DSN works by opening a connection.
- **Correct reading of the same evidence:** "absent from container env", which
  here is the expected state. Absence of configuration was inferred from absence
  in one metadata view, and the claim was repeated in two reports before the
  mounts were checked.
- **Disposition:** **withdrawn**, not downgraded. The credential failures it was
  offered to explain are real and remain open with a different cause.

---

## RA-036 — Sandbox deploy could not survive its own container startup (Stage E0)

- **Severity:** HIGH (a deploy left the financial core down until restarted by hand)
- **Environment:** sandbox deploy path, `infra/blueprint/sandbox-ops/scripts/`
- **Finding:** deploying current `main` failed repeatedly. public-api exited and
  core-api panicked (exit 101) at boot with `server misbehaving` /
  `Temporary failure in name resolution` for a hostname that resolves correctly
  seconds later — `docker restart` of the same container succeeded every time.
  A freshly created container can run its first instruction before Docker's
  embedded resolver is serving for it.
- **Why it mattered more than a slow start:** the deploy detected the unhealthy
  container and rolled back correctly, but the rolled-back container booted
  through the same window, so the service stayed down until a human restarted it.
  This happened three times during Stage E0. The gateway and developer-api
  survived the identical path only because neither hard-fails on a boot-time
  ping — which is how a generic startup race gets misattributed to the one strict
  service.
- **Remediation:** (a) deploy now creates the container, attaches every network,
  then starts it, instead of attaching a network to a running container;
  (b) public-api and core-api retry the boot database probe six times over ~10s,
  each attempt individually timed out, then still fail — an absent database must
  still stop the process.
- **Tests:** confirmed in production — core-api logged
  `database not reachable yet, retrying attempt=1 of=6` on its next deploy and
  came up healthy; all four services then deployed cleanly at one commit.
- **Note:** (a) was a genuine fix but did not close (b). The container now starts
  with both networks attached and still loses the first lookup; the remaining
  window belongs to container creation itself.
- **Disposition:** fixed.

---

## RA-037 — Build identity froze on the first deploy that used it (Stage E0)

- **Severity:** HIGH (would have certified stale deployments as current)
- **Environment:** `sandbox-deploy.sh` `cmd_deploy_one`
- **Finding:** the redeploy path clones the running container's configuration and
  swaps only the image. It therefore re-applied the previous container's
  `BANZAMI_BUILD_COMMIT` as an explicit `-e`, shadowing the ENV baked into the new
  image. The container was created from image `:9c2d0f428fec`, whose ENV says
  `9c2d0f428fec`, while `/readyz` answered `4a924e764024`.
- **Detection:** the runtime gate, on the first deploy after build identity
  landed. Cloudflare caching and a wrong image were ruled out first —
  origin-direct and cache-busted requests both returned the stale value, and the
  container's `.Image` matched the new tag's id exactly.
- **Why it matters:** build identity that silently freezes is worse than none,
  because it looks like an answer. It would have kept reporting the first commit
  ever deployed and certified every later deployment as current — the exact
  failure Stage E discovered had already happened once by other means.
- **Remediation:** the new image is the authority on its own build; that variable
  is excluded from the clone and inherited from the image.
- **Disposition:** fixed and verified — `/readyz` now reports the deployed commit
  and the gate matches it against the revision under assurance.

---

## RA-033 — Internal operator endpoints reachable from the Internet (Stage E)

- **Severity:** MEDIUM (unnecessary public exposure of an authenticated control
  plane; not a breach)
- **Environment:** sandbox — `developer-api.banzami.com` via `bzsbedge-sandbox-edge`
- **Finding:** developer-api mounts `/internal/v1/fixture-projects`,
  `/internal/v1/projects/{id}/fixture-keys` and
  `/internal/v1/fixture-keys/{id}/revoke`. The Stage C edge forwarded every path,
  so these operator endpoints answered on the public Internet.
- **Root cause:** mine. The Stage C `sandbox-edge` config routes `/` to
  developer-api with no path restriction; nothing distinguished the public
  developer surface from the internal control plane.
- **Mitigating fact:** the internal-key guard held — no key and a wrong key both
  returned 401 "internal auth required", failing closed. Exposure, not breach.
- **Remediation:** the edge now refuses `/internal/` with **404** before the
  request reaches the service. 404 rather than 403, because a 403 confirms the
  path exists.
- **Tests:** both endpoints return 404 post-fix; `developer-api/health`,
  `sandbox-api/health`, `/readyz` and the `/consumer` route all still 200;
  production `banzami.com` and `developers.banzami.com` unchanged at 200;
  `make assure-sandbox-runtime` still PASS.
- **Disposition:** fixed.

---

## RA-034 — `/readyz` "database: ok" never checked a database (Stage E)

- **Severity:** MEDIUM (assurance vacuity — a health signal that cannot fail)
- **Environment:** `services/api-gateway/internal/handler/health.go` (in `main`)
- **Finding:** the readiness handler computes
  `"database": checkStub(cfg.DatabaseURL != "")` and
  `"redis": checkStub(cfg.RedisURL != "")`. `checkStub` returns `"ok"` when a
  **config string is non-empty**; it never opens a connection. The handler's doc
  comment claims "Returns 200 when all critical dependencies are reachable", and
  the code still carries `TODO: replace stubs with real connection probes`.
- **Why it matters:** every Stage C/D report in this repository — mine included —
  cited `{"database":"ok","redis":"ok"}` as evidence the Sandbox was healthy.
  That claim was vacuous the whole time. It is the same failure this programme
  has now hit repeatedly: a record standing in for a measurement.
- **What survives:** the conclusion, not that reason. The runtime gate's other
  assertions are real — live 200s, `environment=sandbox`, and
  `/consumer/v1/consumers/search` returning data from an actual query through
  public-api → core → PostgreSQL, which a dead database could not produce.
- **Remediation (partial):** `tools/check-sandbox-runtime.mjs` no longer credits
  the readyz db/redis fields as dependency evidence, and records why at the call
  site so the next reader does not re-derive the same false comfort.
- **Disposition:** **open** for the root cause — replacing the stubs requires
  injecting DB/Redis clients into the gateway, a service change out of scope for
  Stage E recon. Tracked here rather than left in a report.

---

## RA-031 — `ufw status` does not describe this host's perimeter (Stage D)

- **Severity:** MEDIUM (misleading security signal; one real LOW exposure)
- **Environment:** VM 217.160.9.248
- **Finding:** ufw does not govern any Docker-published port on this host.
  `DOCKER-USER` and `DOCKER-FORWARD` sit at the top of `FORWARD` with 22M packets
  each; the ufw forward chains below them show **zero**. Port **8443** is
  reachable from the Internet and appears in no ufw rule at all. Reading
  `ufw status` and concluding "only 22/80/443 are open" is therefore wrong, and
  was wrong before Stage D touched anything.
- **Root cause:** Docker inserts its own netfilter rules ahead of ufw's. RA-005
  measured exactly this in July and tracked restricting `:8443` to Cloudflare
  ranges as a recommendation needing a careful ops window. Stage D re-derived it
  independently, which is itself the finding: the misleading signal survived
  because nothing failed while it stood.
- **Remediation (Stage D scope):** implemented `infra/security/origin-ingress-restrict.sh`
  in `DOCKER-USER` — the chain Docker guarantees is traversed first and never
  flushes — restricting the sandbox origin port 2053 to Cloudflare ranges with a
  default DROP, persisted by `banzami-origin-ingress.service` (no
  `iptables-persistent` exists here, so unpersisted rules would vanish on reboot).
- **Tests:** proven with an isolated network namespace, because host-local and
  container-sourced tests never traverse `DOCKER-USER` (Docker's userland proxy
  answers them on `INPUT`) — the first attempt "passed" against a rule that had
  not been consulted. DROP leg: blocked, counter 0 → 6. ACCEPT leg: HTTP 200,
  `environment=sandbox`, counter unchanged. Allowlist restored and re-verified.
- **Disposition:** **fixed for `:2053`**. `:8443` remains as RA-005 recorded it —
  the same rule shape now exists and is proven, but 8443 carries live production
  traffic and RA-005's own guidance is not to apply it blind. Ready to apply in an
  ops window; not applied in Stage D, whose brief forbids risking a production
  incident.

---

## RA-032 — Origin ingress rule would have dropped every reply (caught pre-exposure)

- **Severity:** HIGH if shipped (self-inflicted outage at the moment of exposure)
- **Environment:** VM 217.160.9.248, `DOCKER-USER`
- **Finding:** the first working version of the Stage D ingress rule matched
  `-m conntrack --ctorigdstport 2053` without `--ctdir ORIGINAL`. That matches a
  property of the CONNECTION, so it is true of packets in **both** directions: the
  container's replies also entered the chain, were source-matched against the
  Cloudflare allowlist, did not match, and were dropped. Measured as `RETURN` 6
  packets against `DROP` 8, the extra 8 being replies.
- **Why it matters:** requests would have arrived and responses vanished. The
  visible symptom would have been a **Cloudflare 522 appearing the instant the
  provider opened the port**, above an origin that tests perfectly healthy from
  the host — days after this change, and attributed to the wrong one.
- **Also found:** an earlier draft matched `--dport 2053`, which matches nothing
  in `DOCKER-USER` at all, because `nat/PREROUTING` rewrites the port to the
  container's 443 before `filter/FORWARD` runs. A rule that reads correctly in
  `iptables -S` and protects nothing.
- **Remediation:** `--ctorigdstport 2053 --ctdir ORIGINAL`, plus an idempotent
  cleanup that deletes the direction-blind form if an earlier run installed it.
- **Disposition:** fixed and verified before the port was ever exposed. Recorded
  because both defects are invisible to inspection and only a forwarded-path test
  distinguishes them.

---

## RA-030 — Sandbox public surfaces unrouted (Stage C: sandbox-edge implemented)

- **Severity:** HIGH (blocked 8 of 9 Sandbox launch capabilities)
- **Environment:** sandbox (vm-ionos-main)
- **Finding:** `sandbox-api.banzami.com` and `developer-api.banzami.com`
  answered **503**. The earlier assurance record inferred from this that the
  Sandbox application containers were down. **They were not** — all four rt04e
  services had been `Up (healthy)` continuously. What was missing was routing:
  the only process on host `:443` is the website-only edge, which serves
  `banzami.com` / `www` / `developers` and answers every other host with the
  deliberate Stage B guard. The sandbox hosts had no server block anywhere.
- **Root cause:** `sandbox-edge` — the dedicated proxy approved in Stage C
  Decision 2 to carry sandbox public routes — was `APPROVED DESIGN, NOT
  IMPLEMENTED`. No runtime artifact was permitted before an approved Stage C
  implementation, so healthy services stayed unreachable by design.
- **Remediation:** implemented `sandbox-edge` as a dedicated nginx proxy on its
  own host port, its own networks and its own config. The website edge is not
  reloaded, reconfigured or depended upon, so independence holds in both
  directions. Two failure modes were designed against explicitly: upstreams are
  resolved at request time via Docker DNS (the `banzami.com` 522 incident was
  caused by literal `proxy_pass` names failing at config load), and the
  `/consumer` prefix is stripped with an explicit `rewrite` (a variable
  `proxy_pass` does not perform trailing-slash URI replacement — caught by
  testing the deployed proxy, not by reading it).
- **Tests:** `tools/check-sandbox-runtime.mjs` (`make assure-sandbox-runtime`),
  proven in three directions: PASS against the real runtime, FAIL when
  unreachable/503, FAIL when a healthy stack reports `environment=live`.
- **Deployment evidence:** verified from the host against the running runtime —
  `/health` 200, `/readyz` 200 `environment=sandbox` (db+redis ok),
  `/consumer/v1/consumers/search` 200, developer-api 200 `env=sandbox`,
  unauthorised Host 503, no internal service exposed on the host, and
  `banzami.com` origin 200 unchanged throughout.
- **Cleanup result:** new asset `bzsbedge-sandbox-edge` recorded in
  `ops/asset-inventory.yaml`; operations doc at
  `docs/operations/SANDBOX_EDGE_RUNTIME.md`.
- **Disposition:** **fixed at the origin**; public routing blocked(owner) on one
  external step — a Cloudflare Origin Rule sending the two hostnames to port
  2053, plus a Cloudflare-IP-restricted firewall rule. `ufw` was deliberately
  NOT opened to the world: a world-reachable origin port bypasses Cloudflare's
  WAF and DDoS protection, so it must be opened only alongside the Origin Rule.

---

## RA-029 — `assure-sandbox-launch` depended on a target that never existed

- **Severity:** MEDIUM (launch gate could never pass)
- **Environment:** repo tooling
- **Finding:** `assure-sandbox-launch` listed `check-asset-inventory` as a
  prerequisite. That target has never existed; the real one is
  `assure-inventory`. Latent, because make stops at the first failing
  prerequisite and the capability gate fails earlier — it would have surfaced
  only when the last capability blocker cleared and the gate was expected to
  answer GO.
- **Root cause:** naming drift introduced with the two-gate assurance split; the
  *script* is named `check-asset-inventory.mjs`, which masked the mismatch.
- **Remediation:** corrected the prerequisite. Verified that the four
  prerequisites it had been shadowing all pass.
- **Disposition:** fixed.

---

## RA-001 — `canonical` git remote pointed at the PUBLIC protocol repo

- **Severity:** CRITICAL (data-exposure hazard)
- **Environment:** local repo config (`~/banzami`)
- **Finding:** The remote `canonical` (`git@github.com:banzami/banzami.git`)
  resolves via GitHub rename-redirect to **`banza-protocol/banza`** — the
  public BANZA protocol repository. Any `git push canonical` would have
  published the private operator codebase publicly.
- **Root cause:** `github.com/banzami/banzami` was never created; the
  `banzami/banzami` name is a rename residue that redirects to the old home of
  the protocol repo. The planned org transfer (BANZAMI-INSTITUTIONAL-
  SEPARATION-001) was never executed on GitHub.
- **Remediation:** Removed the `canonical` remote (2026-07-04). `origin`
  (`banza-protocol/banzami`, private) is the only remote.
- **Tests/evidence:** `git remote -v` shows only origin; `gh api
  /repos/banzami/banzami` documented as redirecting to `banza-protocol/banza`.
- **Disposition:** **fixed** (local hazard). Residual item tracked as RA-002.

## RA-002 — GitHub org transfer not executed; docs claim it is

- **Severity:** HIGH (provenance/documentation integrity)
- **Environment:** GitHub + repo docs
- **Finding:** CLAUDE.md §15.7 states `github.com/banzami/banzami` is
  "active (post-transfer)". Reality: the repo lives at
  `banza-protocol/banzami` (private) and no `banzami` org repo exists.
- **Remediation:** Docs corrected to state the transfer is **pending manual
  GitHub action** (this programme). The transfer itself requires the owner's
  GitHub account action.
- **Disposition:** docs **fixed**; org transfer **blocked**
  (owner: fm65; decision: execute GitHub org creation/transfer manually;
  safe fallback: continue on `banza-protocol/banzami` private).

## RA-003 — `dashboard-frontend` container unhealthy in production

- **Severity:** HIGH (reliability, merchant-facing)
- **Environment:** VM 217.160.9.248, container `banzami-dashboard-frontend-1`
- **Finding:** Container flagged `unhealthy` for ~3 days; unrouted
  (dashboard.banzami.com is NXDOMAIN, no nginx route) so serving nobody.
- **Root cause:** pre-existing build break — apps/dashboard depends on
  `"@banzami/sdk": "file:../../sdk/typescript"`, but `_deploy_frontend` only
  rsyncs `apps/dashboard/`, so the SDK is absent from the Docker build
  context and `next build` fails "Cannot resolve @banzami/sdk". `npm ci` also
  failed separately until the lockfiles were regenerated (RA-025).
- **Remediation:** container stopped (reversible) to clear unhealthy noise;
  CAP-APP-002 reclassified `launch_scope: excluded`, status `blocked` — the
  merchant dashboard is NOT part of the sandbox launch surface.
- **Concrete fix (tracked, out of sandbox scope):** give dashboard a
  sibling build context (mirror public-api's common/ pattern): rsync
  sdk/typescript alongside apps/dashboard and COPY it in the Dockerfile, or
  publish/vendor the built SDK. Owner: web.
- **Disposition:** **accepted-justified for Sandbox (excluded surface)**;
  deploy-pipeline fix tracked.

## RA-004 — Host disk 80% full; 85.5 GB reclaimable Docker build cache

- **Severity:** MEDIUM (operational risk → HIGH if disk fills)
- **Environment:** VM 217.160.9.248
- **Finding:** `/` at 80% (92G/116G); build cache 88.55 GB (85.48 GB
  reclaimable); 73 images (17 active).
- **Disposition:** open — prune with retention in Phase 6 (after image-tag
  consolidation RA-008), keep `:rollback` tags.

## RA-005 — Docs frontend port 3005 exposed publicly, bypassing edge

- **Severity:** HIGH (security — bypasses nginx/Cloudflare/WAF/TLS controls)
- **Environment:** VM 217.160.9.248, container `banza-docs`
- **Finding:** `0.0.0.0:3005->3005` published directly on the host; all other
  app traffic flows through the nginx edge. Also `8443` is a second public
  TLS entry (website-nginx) — necessity to be verified.
- **Update 2026-07-04 (measured):** ufw allows only 22/80/443. Direct
  `http://IP:3005` **times out** from the internet (blocked) — not an active
  exposure. The main API origin (`:443` direct-IP with spoofed Host) is
  **refused** (Cloudflare-locked). The one real origin exposure is
  **`:8443`**, directly reachable and serving the **static marketing site**
  (banzami.com) — Docker's iptables bypasses ufw for published ports. Low
  severity (static, no auth/secrets), but it permits a Cloudflare bypass.
- **Recommended fix (tracked, needs a careful ops window — not executed blind
  on the live host):** restrict `:8443` and `:3005` to Cloudflare IP ranges
  (or bind them to the docker network and route via the main nginx). Do NOT
  change ufw/iptables without SSH-lockout safeguards.
- **Disposition:** downgraded to LOW; `:3005`/API origins already
  effectively protected; `:8443` static-site origin exposure tracked.

## RA-006 — No database backup automation found on the host

- **Severity:** CRITICAL (data-integrity/disaster recovery)
- **Environment:** VM 217.160.9.248 (`/srv/banzami/data/postgres` bind mount)
- **Finding:** No crontab, no backup service, no backup directory found.
  A payments ledger with no automated backups is a launch blocker.
- **Disposition:** open — implement automated `pg_dump` (all databases) with
  rotation + off-host copy in Phase 6; verify provider-level snapshots
  (IONOS) as defense in depth.

## RA-007 — GitHub Actions auto-CI disabled (org billing)

- **Severity:** HIGH (quality gates not enforced on push)
- **Environment:** GitHub `banza-protocol` org
- **Finding:** `.github/workflows/ci.yml` is manual-dispatch only; automatic
  push/PR triggers commented out due to unresolved org Actions billing.
- **Remediation:** Assurance checks wired into local `make` gates (which do
  run) and into the workflow for when billing is restored.
- **Disposition:** **blocked** (owner: fm65; decision: resolve GitHub Actions
  billing or move CI; safe fallback: local `make check-all` + deploy.sh
  rollout gates, both active).

## RA-008 — Staging container image-tag discipline violations

- **Severity:** MEDIUM (environment provenance)
- **Environment:** VM sandbox stack
- **Finding:** `public-api-staging` runs `:latest` (a live-stack tag);
  gateway-staging runs feature tag `:payment-session-staging`; core/admin
  staging run `:adr021-staging`. Four ad-hoc compose overlay files
  (staging-kyb/kyc/collections/payment-session) accumulate drift.
- **Disposition:** open — consolidate to one canonical staging tag + one
  staging compose file in Phase 6; align deploy.sh.

## RA-009 — 23 stale local git branches

- **Severity:** LOW (hygiene)
- **Disposition:** open — verify merged, then delete (Phase 6).

## RA-010 — BanzAI deployment state inconsistent with its docs

- **Severity:** MEDIUM (inventory truth)
- **Finding:** BanzAI repo/docs describe it as self-hostable and not
  deployed, but container `banzai-api` (port 4001, internal) has been running
  on the VM for 3 weeks.
- **Disposition:** open — reconcile in Phase 5 (identify what serves it,
  whether routed, and either register properly or decommission). Related
  obsolete-candidate image: `banzami/banzamia-api:latest`.

## RA-011 — `refund_source` is an operator extension; ADR-018 still draft

- **Severity:** MEDIUM (protocol governance / docs truthfulness)
- **Finding:** Banzami ships `refund_source` on paid events/LINK GET.
  BANZA ADR-018 (draft, submitted by the operator) proposes standardising it;
  governance has not decided. Public docs must present this as a
  **Banzami operator extension**, never as BANZA-standard.
- **Disposition:** open — Phase 1 verifies public docs/SDK wording;
  protocol decision itself is **blocked** (owner: BANZA governance;
  safe fallback: keep as documented operator extension — already
  backward-compatible).

## RA-012 — EMIS/Multicaixa acquiring is stubbed (expected pre-authorization)

- **Severity:** MEDIUM (must fail closed in Live)
- **Finding:** `core/acquiring/src/providers/emis.rs` contains TODO stubs.
  Correct for Sandbox scope; Phase 3 must prove the Live path fails closed
  (no phantom success) rather than simulating success.
- **Disposition:** open — verify fail-closed behavior + negative tests
  (Phase 2/3). Real rail activation is out of scope (regulatory).
  **Update 2026-07-04:** fail-closed VERIFIED by Phase 3 audit — EMIS provider
  errors without credentials (core/acquiring/src/providers/emis.rs:70-86);
  test-confirm endpoints reject in LIVE env; core defaults to LIVE when
  ENVIRONMENT unset (safe). Remaining: negative E2E + RA-017.

## RA-013 — nginx config drift between repo and server

- **Severity:** MEDIUM (provenance)
- **Finding:** Server has `zz-developer-api.conf` (developer-api.banzami.com)
  and `banzami.conf.bak.preadmin_20260626_012959` not present in
  `infra/nginx/`; repo config lacks the developer-api host.
- **Disposition:** open — import server config into repo (repo becomes source
  of truth), delete stale .bak (Phase 6).

## RA-014 — Git-history secret scan: no credible active exposure

- **Severity:** LOW (verified clean)
- **Finding:** gitleaks over 2433 commits: 47 hits, all triaged as
  docs/test placeholders, removed historical example pages, a Podfile.lock
  checksum, and Firebase Android **client** config keys
  (`google-services.json` — designed to ship in app binaries).
- **Remediation:** none required; recommendation: confirm Firebase API key
  restrictions (package name + SHA-1) in Firebase console.
- **Disposition:** **accepted-justified** (evidence:
  scratchpad gitleaks-banzami.json, redacted).

## RA-015 — Pay frontend sandbox-link routing needs deployed E2E

- **Severity:** MEDIUM
- **Finding:** apps/pay routes sandbox links server-side to
  STAGING_GATEWAY_URL (apps/pay/lib/api.ts:126) — architecture is sound
  (client only calls its own /api routes), but no deployed E2E proves a
  staging payment link resolves+pays via pay.banzami.com. CSP connect-src
  allows only api.banzami.com, which is correct iff all data flows through
  the pay app's own routes.
- **Disposition:** open (Phase 7 E2E).

## RA-016 — Sandbox email delivery is convention-only

- **Severity:** MEDIUM
- **Finding:** EmailDryRun exists but staging deploys don't enforce it; a
  staging stack with the live Resend key and dry-run unset would email real
  recipients.
- **Disposition:** **accepted-justified with control.** Server has
  EMAIL_DRY_RUN=false intentionally — the Developer Console requires REAL OTP
  delivery to real developer inboxes for sandbox signup (Phase 5 verifies
  this flow). Since no live plane exists (only banzami_staging), there is no
  cross-env recipient leakage today. Control for Live activation: when the
  live stack is created it MUST use a distinct sender identity/domain; tracked
  as a Live-activation gate item, not a Sandbox blocker.

## RA-017 — ACQUIRING_WEBHOOK_SECRET per-environment uniqueness unverified

- **Severity:** MEDIUM
- **Finding:** callback HMAC secret separation between environments is not
  enforced by any check; identical secrets would allow sandbox→live callback
  replay once rails activate.
- **Disposition:** open — add boot/deploy guard (Phase 6/7). Not exploitable
  today (rails stubbed, fail-closed).
- **Update 2026-09-11 (RA-084):** LIVE core refuses to boot without the secret;
  an unset Sandbox secret is random per process and never exported, so the two
  environments cannot share it. A configured Sandbox value is not yet compared
  with LIVE's (no deploy check reads both) — that part stays open.

## RA-018 — Platform-mode propagation drift unmonitored

- **Severity:** MEDIUM
- **Finding:** admin-api propagates platform_mode to both DBs; a propagation
  failure would leave stacks in different modes with no alert.
- **Disposition:** open — startup/periodic consistency check (Phase 6/7).

## RA-019 — Audit log was mutable at DB level (Phase 2 defect D1)

- **Severity:** HIGH (audit integrity)
- **Root cause:** 0025 declared audit_log append-only but only by convention.
- **Remediation:** migration `0099_audit_log_immutability.sql` — fail-closed
  UPDATE/DELETE triggers (same pattern as ledger 0033).
- **Tests/evidence:** full migration run from scratch passes (assurance_check
  DB); UPDATE and DELETE both raise. No legitimate code path mutates
  audit_log (grep verified).
- **Disposition:** **fixed** locally; deploy to sandbox via
  `./deploy.sh staging` rollout gate (pending in Phase 6 batch).

## RA-020 — Phase 2 test-coverage gaps (defects D3–D6, D9)

- **Severity:** HIGH (assurance completeness — core code itself audited SOUND)
- **Gaps:** concurrent refund+dispute ceiling race test; proof REVERSED after
  full restitution test; gateway timeout/replay semantics test; deployed
  webhook-delivery E2E; unauthorized-refund E2E.
- **Disposition:** open — implemented under Phase 7 unified E2E methodology.

## RA-021 — QR payload lacks BANZA-SBX: prefix (protocol L2 gap)

- **Severity:** MEDIUM (no false claim exists — operator is L0)
- **Finding:** INV-QR-ENV-001 mandates environment prefixes; Banzami QR uses
  operator-native base64url/deep-link format. Adopting the prefix breaks
  printed QR compatibility.
- **Disposition:** **blocked** (owner: BANZA governance + Banzami product;
  decision: adopt prefix vs. protocol amendment; safe fallback: claim only
  L0/L1 conformance — currently true). See
  docs/quality/PROTOCOL_CONFORMANCE_MATRIX.md governance item 1.

## RA-022 — IDOR: GET /v1/transfers/{id} lacked owner scoping (Phase 4 CRITICAL)

- **Severity:** CRITICAL (tenant isolation)
- **Root cause:** handler explicitly deferred the ownership check
  (`_ = consumer // deferred`), fetching any transfer by id.
- **Exploit:** an authenticated consumer could read any P2P transfer by id
  (amounts, counterparties, status).
- **Remediation:** services/public-api/internal/handler/transfers.go — after
  fetch, require the authenticated consumer to be sender or recipient; a
  non-party gets 404 (non-enumerable). Core-side scoping recommended as
  defence in depth.
- **Tests:** TestGetTransfer_SenderCanRead / _RecipientCanRead / _NonPartyGets404
  (all pass).
- **Deployed:** public-api:latest rebuilt; banzami-public-api-staging-1
  recreated & healthy 2026-07-04; api.banzami.com/health ok.
- **Disposition:** **fixed + deployed to sandbox**.

## RA-023 — SSRF: webhook endpoint URL unvalidated (Phase 4 CRITICAL)

- **Severity:** CRITICAL (SSRF)
- **Root cause:** merchant-supplied webhook URL stored and later POSTed with no
  scheme/host validation.
- **Exploit:** register a webhook at http://169.254.169.254/... or an internal
  RFC1918/loopback host and have the gateway make requests into internal
  infrastructure (cloud metadata, internal services).
- **Remediation:** services/api-gateway/internal/service/webhook_ssrf.go —
  (1) `ValidateWebhookURL` at registration (https only; reject
  loopback/private/link-local/ULA/metadata + internal name suffixes;
  IPv4-mapped-IPv6 unwrapped); (2) `safeWebhookTransport` DialContext re-checks
  the resolved IP at delivery time (defeats DNS rebinding). Handler returns
  400 INVALID_WEBHOOK_URL.
- **Tests:** TestValidateWebhookURL_RejectsNonPublic / _AllowsPublicHTTPS (pass).
- **Deployed:** api-gateway:latest rebuilt; banzami-api-gateway-staging-1
  recreated via canonical sandbox-gateway overlay (ENVIRONMENT=SANDBOX) &
  healthy 2026-07-04. Auth-before-body confirmed (unauth probe → 401).
- **Disposition:** **fixed + deployed to sandbox**.

## RA-024 — Go service containers ran as root (Phase 4 HIGH)

- **Severity:** HIGH (container hardening)
- **Remediation:** added non-root `banzami` user + `USER banzami` to
  api-gateway, public-api, admin-api, developer-api, sandbox-operator
  Dockerfiles.
- **Disposition:** **fixed**; takes effect on next image build/deploy.

## RA-025 — Next.js CVEs in web apps (Phase 4 HIGH)

- **Severity:** HIGH
- **Finding:** all 5 Next.js apps pinned 14.2.0 with multiple advisories
  (middleware/proxy bypass GHSA-36qx-fr4f-26g5, WebSocket SSRF
  GHSA-c4j6-fc7j-m34r, several DoS).
- **Remediation:** pinned all apps to 14.2.35 (latest patched 14.2.x, no
  breaking migration) + refreshed lockfiles. Clears the exploitable
  bypass/SSRF advisories.
- **Residual:** DoS-class advisories (image optimizer, RSC deserialization,
  rewrite smuggling, image cache) require a Next 14→15/16 major migration.
  Mitigated by Cloudflare edge (WAF + rate limiting) and immaterial for a
  no-real-money sandbox. **Accepted-justified for Sandbox**; tracked as a
  Live-activation prerequisite (schedule Next 15 migration with per-app
  verification before Live).
- **Disposition:** **fixed** (patched line) + residual documented.

## RA-026 — Dashboard JWT stored in localStorage (Phase 4 HIGH)

- **Severity:** HIGH (XSS → token theft, conditional on an XSS existing)
- **Finding:** apps/dashboard/lib/session.ts persists the merchant JWT in
  localStorage.
- **Mitigation present:** strict nonce CSP reduces XSS likelihood.
- **Remediation plan:** move to `__Host-` HttpOnly/Secure/SameSite=Strict
  cookie set by the gateway on login (mirrors developer-api's proven session
  model) + CSRF token for state-changing calls.
- **Disposition:** **accepted-justified for Sandbox** (no real money;
  CSP-mitigated), **tracked HIGH** — implement before Live. Requires running
  the dashboard app to verify the auth flow; not done blind in this pass.

## RA-027 — Docker build cache 85GB + superseded images (Phase 6)

- **Severity:** MEDIUM (operational — disk was at 80%)
- **Remediation:** `docker builder prune` (freed ~85GB) + removed 13
  superseded/non-running images (staging-<sha>, non-running
  payment-session-staging, banzamia-api, banzami/docs-frontend). Kept all
  running images and `:rollback` tags.
- **Evidence:** disk 80%→10% (24G→105G free); images 40→27.
- **Disposition:** **fixed**.

## RA-028 — Stale local git branches (Phase 6)

- **Severity:** LOW
- **Remediation:** 23 divergent local-only branches deleted; SHAs snapshotted
  in ops/deleted-branches-snapshot.txt (restore: `git branch <name> <sha>`).
- **Disposition:** **fixed** (reversible).

## RA-029 — Overstated single "GO" gate (integrity correction)

- **Severity:** HIGH (assurance integrity — the gate must not conceal the gap)
- **Finding:** the first pass issued one "GO" and a single release gate that
  passed with only 3 capabilities verified, understating that most public
  surfaces lacked deployed E2E.
- **Remediation:** two-gate model. `assure-reference` (reference path) passes;
  `assure-sandbox-launch` FAILS unless every `surface: public` capability is
  `released` with deployed E2E. Added per-capability `surface`/`disposition`.
  Launch package + README rewritten to Reference-GO / Full-launch-HOLD.
- **Disposition:** **fixed** — the gate now enforces the honest HOLD.

## RA-030 — Mobile: static review is not launch evidence

- **Severity:** HIGH (mobile launch claim)
- **Finding:** mobile was "static-verified" without deployed iOS E2E.
- **Remediation:** split into CAP-APP-001 (Consumer) + CAP-APP-005 (Merchant),
  both **quarantined**. Authored MOBILE_E2E_REQUIREMENTS.md (consumer/merchant/
  cross-app matrices), `check-mobile-sandbox-config.mjs` (static guard, CI+gate),
  and `tools/mobile/run-ios-e2e.sh` + `make assure-mobile-*` (fail-closed until
  integration_test suites + registered evidence exist). Proved the iOS Simulator
  build is feasible (consumer sandbox build exit 0 — no MLKit/arm64 blocker;
  neither app uses camera QR scanning). Bundle contains the prod host string
  literal, so only runtime E2E can prove isolation.
- **Disposition:** apps **quarantined**; deployed iOS E2E matrices + macOS
  release runner are the tracked path to `released-sandbox`.

## RA-031 — Live activation envelope sealed

- **Severity:** HIGH (real-money safety)
- **Remediation:** docs/operations/LIVE_ACTIVATION_GATE.md (fail-closed 12-step
  protocol; no single flag/deploy enables Live) + `check-live-fail-closed.mjs`
  guarding the code-level invariants (core LIVE default, requireSandbox,
  EnvGate/ENVIRONMENT_MISMATCH, bz_live/bz_test binding, EMIS fail-closed).
- **Disposition:** **fixed** (guard passes; wired into CI + deploy gate).

## RA-032 — Backup DR hardened (restore-verified)

- **Severity:** was CRITICAL (RA-006)
- **Remediation:** pg-backup.sh now restore-VERIFIES each run (restore latest
  dump into a scratch DB, assert schema materializes — 85 tables, then drop) +
  asymmetric encryption + off-host hooks, both fail-loud when unset.
  BACKUP_DR_RUNBOOK.md documents restore + Live prerequisites.
- **Disposition:** **fixed** for sandbox; encrypted off-host bucket is a tracked
  Live prerequisite (ops provisioning).

## RA-033 — Deploy-time enforcement (not local-only)

- **Severity:** HIGH (RA-007 follow-through)
- **Remediation:** deploy.sh runs the assurance gates before every deploy and
  ABORTS on failure (manifest, layout, inventory, live-fail-closed). Enforcement
  no longer depends on GitHub-hosted Actions. Emergency override documented.
- **Disposition:** **fixed**.

## RA-034 — Origin stale branches removed

- **Severity:** LOW
- **Remediation:** 18 stale origin branches deleted (no open PRs; SHAs in
  ops/deleted-branches-snapshot.txt). Origin now has only `main`.
- **Disposition:** **fixed**.

## RT01 — Release Train 01: Developer Integration Foundation

- **Scope:** CAP-DEV-001 Console, CAP-DEV-002 API-key lifecycle, CAP-DOCS-001
  Docs, CAP-SDK-001 TypeScript SDK. No payments/mobile/Live work.
- **Deployed:** developer-api + website-frontend redeployed to sandbox at
  commit 63e1ab8b (deploy-time assurance gate ran). Evidence matches deployed
  revision.
- **RELEASED (deployed-Sandbox E2E, 29/29 green):**
  - CAP-DEV-001 Developer Console — auth/OTP-single-use/invalid-OTP/session/
    `__Host-` cookie/CSRF-block/workspace+project create/cross-tenant-403/
    logout-invalidates/no-secret-in-storage/mobile+keyboard a11y.
  - CAP-DOCS-001 Developer Docs — static/no-auth/no-management-API-fetch/
    #conceitos+#glossario anchors/no-internal-host-leak/legacy-route-safe +
    badge reconciliation (cobranca/webhooks/reembolsos downgraded to
    "Em validação"; only released caps show "Disponível em Sandbox").
- **HOLD (pending-e2e, precise blockers):**
  - CAP-DEV-002 API-key lifecycle — management lifecycle (create/reveal-once/
    list-no-secret/rotate/revoke/cross-tenant/audit-no-secret) E2E-PROVEN, but
    dev-console keys (`developer.dev_api_keys`, bz_test_sk_/pk_) have NO deployed
    consumption path: the gateway authenticates a SEPARATE merchant-key system
    and developer-api's `AuthorizeKey` is mounted nowhere. "Revoked key rejected
    by the Gateway" (#6) / "active key works at Gateway" (#7) are unprovable and
    a developer cannot yet integrate with these keys. Owner: developer-platform.
    Safe fallback: keys manageable but non-consumable; released once a gateway
    consumption path exists + is E2E-verified.
  - CAP-SDK-001 TypeScript SDK — ships public methods for UNRELEASED
    capabilities (sessions/links/QR/refunds/payouts/webhooks) without deployed
    E2E, and is NOT published to npm (404). Env-safety/build/no-secret pass.
    Owner: developer-platform. Safe fallback: source-vendored only; released
    once its public surface is limited to released caps (or those are E2E'd)
    AND it is distributable. Enforced by tools/check-sdk-contract.mjs.
- **New gates:** make assure-developer-foundation (HOLDs 2/4);
  check-docs-claims + check-sdk-contract wired into deploy gate + CI +
  assure-sandbox-launch. Controlled OTP via server-side HMAC recovery (no
  inbox provisioned); no OTP/pepper/session/CSRF/raw-key ever printed.
- **Verdict:** Developer Integration Foundation: HOLD (2/4 released).
  assure-sandbox-launch remains HOLD.

## RT02 — Release Train 02: Unified Developer Key Authority + SDK Distribution

- **Scope:** CAP-DEV-002 (API-key lifecycle), CAP-SDK-001 (TypeScript SDK).
- **ADR:** docs/adr/ADR-046 — developer-api is the single external key authority;
  the Gateway delegates verification; merchant keys retained as legacy compat
  (DOA), no new public issuance.
- **Implemented + deployed (63e1ab8b→bbe831f7 range; developer-api + gateway-staging):**
  - developer-api: POST /internal/v1/keys/authorize (X-Internal-Key guarded)
    resolving env/workspace/project/scopes; identity:read scope added.
  - gateway: DeveloperKeyAuth middleware (additive, feature-flagged on
    DEVELOPER_API_URL) + released GET /v1/me consumption surface.
- **CAP-DEV-002 → RELEASED:** dev-key-gateway E2E 19/19 green against deployed
  Sandbox — Console key authenticates the Gateway (/v1/me) with resolved context;
  scope-deny (403); cross-tenant deny; dev key can't hit internal/merchant-JWT
  routes; rotate/revoke rejected at the Gateway; bz_live/malformed/unknown fail
  closed; no-mutation-on-denied; audit has 0 raw secrets. Fixtures cleaned.
- **CAP-SDK-001 → HOLD (external decision):** code-ready. Added BanzamiClient.me()
  and a curated @banzami/sdk/sandbox entry exposing ONLY the released surface
  (no unreleased-capability methods). Clean tarball-install E2E → me() against the
  deployed Gateway with a Console key is GREEN; bz_live rejected. **Sole blocker:
  registry publication requires a Banzami-owned registry** — npm publish
  unavailable (whoami=ENEEDAUTH, @banzami scope inaccessible), gh token lacks
  write:packages. **DECISION REQUIRED (owner: fm65/Banzami):** provision npm
  @banzami publish access (or GitHub Packages write:packages under banza-protocol),
  then publish the reduced sandbox package from a controlled workflow.
- **Gates:** check-sdk-contract upgraded (validates ./sandbox surface + me() +
  distribution). assure-developer-foundation: HOLD (3/4 released).
  assure-sandbox-launch: HOLD. Public released surfaces 4→5/14.
- **Verdict:** Developer Integration Foundation: HOLD (SDK publication external).

## RT02.1 — Developer Key Hardening + SDK Publication Readiness

- **Scope:** harden the RT02 developer-key path; make CAP-SDK-001 publication-ready.
- **Dev-key activation hardened (fail-closed):** explicit DEVELOPER_KEY_AUTH_ENABLED
  flag + Config.DeveloperKeyAuthActive() startup validation (SANDBOX only,
  non-empty internal credential, canonical Sandbox Developer API host). A URL
  variable alone no longer activates the path; malformed/wrong-host/wrong-env/
  missing-credential fail closed; bz_live_ rejected before introspection. Config
  tests cover all negative configs. Deployed with DEVELOPER_KEY_AUTH_ENABLED=true.
- **/v1/me contract hardened:** returns only {environment, project (safe slug),
  scopes, key_status} — NO workspace/project/key UUIDs, PII, service topology or
  internal ids. Rate-limited on the non-secret key id. Re-E2E 20/20 (incl.
  me-no-internal-ids-leak). Fixtures cleaned; audit 0 raw secrets.
- **SDK publication readiness (CAP-SDK-001 → blocked-external):**
  - docs/operations/SDK_REGISTRY_OWNERSHIP_AND_RELEASE.md — exact npm-org
    ownership + least-privilege publisher action package (owner: fm65/Banzami).
  - .github/workflows/sdk-publish.yml + tools/sdk-release.mjs — guarded release
    (release tag / approved dispatch only) that FAILS CLOSED without npm auth;
    runs contract gate + tarball inspection + clean-install E2E before publish,
    provenance + external re-verify after.
  - Packaging fix (caught by the release gate): excluded .d.ts.map + test files
    from the published tarball.
  - check-sdk-contract extended: SDK↔Gateway route + docs↔distribution divergence.
- **External blocker (unchanged, now documented + tooled):** publication needs a
  Banzami-owned registry (npm @banzami org publish access or GitHub Packages
  write). npm whoami=ENEEDAUTH; gh token lacks write:packages.
- **Gates:** assure-developer-foundation HOLD (3/4 released; SDK blocked-external).
  assure-sandbox-launch HOLD. Public released 5/14 (unchanged).
- **Verdict:** Developer Integration Foundation: HOLD (SDK publication external).

## RT03 — Payment Sessions, Links, Checkout (Payments Foundation: HOLD)

- **§1 dev-key resilience (precondition) — PASS:** fault-injection at the
  Gateway→Developer-API seam (timeout/DNS/5xx/malformed/incomplete/invalid-env/
  concurrent-unavailable) all fail closed (neutral 401, business handler never
  runs, no legacy-merchant/anonymous fallback, no internal-detail leak); per-IP
  pre-introspection rate limit added (auth-amplification protection); ADR-046
  addendum documents the no-cache/immediate-revocation model. Deployed.
- **Discovery:** Payment sessions/links function end-to-end for merchant-JWT
  holders (real core/ledger/proof). **Developer keys CANNOT reach payment
  routes** — the ADR-046 dev-key path mounts only /v1/me; payment routes require
  principal.MerchantID which a dev key lacks. No Project→Merchant binding exists.
- **§4 security fix (deployed):** the public payer view (GET /public/pay/{slug})
  leaked internal DB UUIDs (merchant_id/wallet_id/wallet_account_id/link-id) to
  unauthenticated payers. Replaced with a payer-safe DTO (slug/amount/currency/
  description/status/expiry/paid_at/merchant_name only). Verified clean; edge healthy.
- **Blocker (ADR-047):** releasing the three capabilities for external developers
  requires a per-project sandbox merchant/wallet binding + payment_sessions:*/
  payment_links:* scopes + payment-route dev-key wiring + full financial E2E — a
  money-path build deferred to its own controlled train (RT03 rule: resolve
  ambiguity in an ADR first; do not corner-cut money paths).
- **Deliverables:** ADR-047 (binding design), PAYMENTS_CONTRACT_AUDIT.md (§2/§3/§4),
  make assure-payments-foundation (HOLD 0/3), UUID-leak fix deployed.
- **Gates:** assure-payments-foundation HOLD; assure-sandbox-launch HOLD; public
  released 5/14 (unchanged). Verdict: Payments Foundation: HOLD.

## RA-054

- **Title:** Merchant-JWT routes trusting client-supplied identity — systemic
- **Status:** OPEN (umbrella) — scoped inventory complete, all confirmed instances FIXED
- **Found:** Stage E1.3A inventory; audited and closed out in Stage E1.4

One shape, now seven confirmed instances: SEC-015, RA-047, RA-049, RA-053, and
three found in this stage (RA-056, RA-057, RA-058). A merchant credential proves
the caller is *a* merchant; it never proves any relation to the resource the
request names.

Every merchant-authenticated public route is now classified in
[docs/security/MERCHANT-AUTHORITY-MATRIX.md](../security/MERCHANT-AUTHORITY-MATRIX.md),
with the binding site cited per route, and the money-moving subset is checked on
every run by `tools/e2e/security/ra-054-authority.mjs`.

The prediction made when this was opened held: `payouts` and `transactions` were
named as the routes to audit first, and both were defective.

**Two rows are not SAFE and are recorded as such rather than rounded down:**

- `GET /v1/consumers/{id}` — any merchant may read any consumer's handle, status
  and creation date (verified 200). No financial data, no mutation, and the
  sibling handle lookup is deliberately a public directory. A design question to
  withdraw, not a security defect.
- `POST /v1/disputes` — `consumer_id` is unbound, and whether a dispute can be
  opened against another tenant's transaction is **unproven**: it needs a settled
  transaction owned by the victim, and CAP-PAY-003 execution is unavailable. A
  probe returned 500 carrying "resource not found", which is separately wrong
  (RA-050 shape). **Not counted as SAFE.**

The umbrella stays OPEN because of that one unproven row. Closing it would be
claiming coverage the evidence does not support.

## RA-055

- **Title:** Environment decided by raw string comparison across services
- **Status:** CLOSED (2026-09-01) — proven on the deployed runtime, not from unit tests
- **Deployed proof:** `/readyz` reports `environment: sandbox`; boot log reads `boot: environment environment=SANDBOX sandbox_routes=true` followed by `SANDBOX mode — fake funding enabled, no real rails, no real settlement` — the old build announced `LIVE mode — real rails active` here. Sandbox funding works (`0 → 25000`). Fail-closed confirmed against the deployed image: `""`, `staging`, `production` and `SANDB0X` each refuse to boot with *refusing to start — ENVIRONMENT is missing or unrecognised*, while `sandbox` boots into SANDBOX mode. `make check-live-fail-closed` PASS.
- **Consumer auto-grant — two separate claims, only one of which is proven:**

  **(A) Environment branch selection — PROVEN.** The Sandbox branch is entered and
  the grant is attempted. Under the RA-051 defect the comparison failed and the
  branch was *never taken*, producing no call and no log line at all. The deployed
  log now shows the call being made, which is positive proof that the defect
  ("Sandbox branch not entered due to environment string comparison") is fixed.

  **(B) The credit itself — NOT completed in the observed test.** Core refused it
  with `PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED` (HTTP 422), the Phase-0
  funds-in-circulation cap working exactly as designed, and the consumer's balance
  stayed at 0. A refused grant is not a successful grant and is not described as
  one here. Observing a completed credit would require raising or disabling that
  cap, which is a deliberate control and was not touched.

  RA-055 closes on (A), which is what the finding was about. (B) is a separate,
  correct system behaviour that happens to sit on the same code path, and the only
  reason the two can be told apart at all is RA-059 — before it, the refusal was
  discarded and a blocked credit was indistinguishable from a skipped branch.
- **Fixed:** Stage E1.4

14 comparisons, five services, four vocabularies. Two live defects came from it
(Sandbox funding refused inside the Sandbox; the consumer grant silently skipped),
plus a boot line announcing "LIVE mode — real rails active" from a Sandbox.

`services/common/env` parses once. Unknown is the zero value and grants nothing;
both casings are accepted because both are already deployed and stored;
"production"/"development" are deliberately *not* read as Live/Sandbox, since
that inference is the failure mode itself. public-api parses at startup and
refuses to boot on an unrecognised value, and its boot line is derived from the
same parsed value as the behaviour it describes.

The typed environment is not a Live gate — `IsLive()` reports configuration only,
and Live activation stays behind its existing independent gates
(`make check-live-fail-closed` unchanged and passing).

**Not claimed:** every raw comparison is gone. The remaining ones are
non-security topology words (`IsProduction`, `SecureCookies`, `IsDevelopment`) and
are intentionally left in their own vocabulary. One further pattern was found and
is **not** fixed: `core/compliance/src/pilot.rs` decides "liveish" by
`env.contains("live") || env.contains("prod")` — a substring match on
environment. It fails safe today (it only disables the Phase-0 caps), but it is
the same class and should move to the typed model when the Rust side is done.

## RA-056

- **Title:** Payout/transaction accepted a wallet the caller did not own
- **Status:** CLOSED (2026-09-01) · **Severity: critical** (cross-tenant fund withdrawal)
- **Deployed proof:** runtime `866c1cfe9b2c`, edge containment REMOVED. Merchant B naming merchant A's wallet → **404** `NOT_FOUND`; A's balance `50000 → 50000`; A holds exactly 1 payout (own), none from B; B reading A's payout by id → **404**; owner still creates and reads their own (201/200). Oracle ordering verified: a 999 000 000 minor request on a foreign wallet returns 404, never `INSUFFICIENT_FUNDS`.
- **Two follow-ups were needed after deployment** (PR #95, #96): the authority check was correct from the start, but the refusal surfaced first as 500 then 502 before reaching 404. Both were found only by exercising the fix against the real runtime.
- **Deployed state (2026-08-31):** corrected code is in PR #94 and NOT merged — CI cannot allocate runners. Public routes contained at the sandbox edge (`POST /v1/payouts`, `GET /v1/payouts/{id}` → 404); the caller's own scoped list stays up. The application behind the proxy is still vulnerable. CLOSE only after the corrected build is deployed AND the negative tests pass with containment REMOVED.
- **Fixed:** Stage E1.4

`merchant_id` came from the principal, `wallet_id` from the body, and nothing
compared them. Confirmed on the deployed Sandbox: merchant B queued a payout of
10 000 minor from merchant A's wallet to B's own bank account — **HTTP 201**,
B's `merchant_id` and A's `wallet_id` on one record. The payout was left PENDING
and was not processed; the debit occurs at processing, which is an operator step,
not a second authorization.

Before A was funded the same call returned **422 INSUFFICIENT_FUNDS** — the
sharper result, because the endpoint was answering questions about a stranger's
balance. `GET /v1/payouts/{id}` was worse still: the gateway passed the
principal's merchant id to a core client that declared the parameter `_` and
dropped it, so any merchant could read any payout including its bank destination
(verified 200).

Fixed in the engine, not only at the edge, and **before** the balance check so
the endpoint cannot be used as a balance oracle. Foreign wallets and payouts are
reported as not-found: a caller with no authority should not learn that an id
exists. Transactions received the same invariant.

## RA-057

- **Title:** Payment requests moved money between two arbitrary consumers
- **Status:** CLOSED (2026-09-01) · **Severity: critical**
- **Deployed proof:** runtime `866c1cfe9b2c`, containment REMOVED. Create → **404**, execute → **404** (surface unmounted, verified directly against the gateway with nginx bypassed). Victim consumer balance and totals unchanged at 0; no ledger effect.
- **Deployed state (2026-08-31):** unmerged (PR #94). `/v1/payment-requests*` contained at the sandbox edge → 404, still reachable in the application. CLOSE only after deployment AND post-containment-removal verification.
- **Fixed:** Stage E1.4

`POST /v1/payment-requests` and `/{id}/pay` never read the principal at all.
Both participants came from the body. Confirmed on the deployed Sandbox: an
unrelated merchant created a request between two consumers it had no relationship
with and executed it — **status PAID, victim debited 1 000 000 → 995 000 minor.**

Worse than RA-053, which KYC happened to block: this path has **no KYC gate**, so
it was a missing authorization and a compliance bypass at once. It is the
`/v1/transfers` surface removed under SEC-015, re-implemented under another name.

Removed rather than patched. There is no ownership relation to scope against —
two consumer parties, no merchant party. The correct consumer-side route does not
exist yet, and the Python SDK exposes this model with `requester_id`/`payer_id`
parameters, which is tracked as an SDK mismatch, not a reason to keep it mounted.

## RA-058

- **Title:** Any merchant could read any consumer's wallet and balance
- **Status:** CLOSED (2026-09-01) · **Severity: high** (financial disclosure)
- **Deployed proof:** runtime `866c1cfe9b2c`, containment REMOVED. Resolve by `consumer_id` → **404**; read wallet by id → **404**; read balance by id → **404**. The consumer still reads their own wallet (200), so the capability moved rather than disappeared.
- **Deployed state (2026-08-31):** unmerged (PR #94). `/v1/consumer-wallets*` contained at the sandbox edge → 404, still reachable in the application. CLOSE only after deployment AND post-containment-removal verification.
- **Fixed:** Stage E1.4

`RequireMerchant` established the caller was a merchant, never that it had any
relation to the named consumer. Verified on the deployed Sandbox: an unrelated
merchant resolved a consumer's wallet by `consumer_id` and read its balance —
**HTTP 200** on both. A merchant has no legitimate need for a customer's balance.

Removed. The capability exists correctly on the consumer surface, where
public-api derives the wallet from the authenticated consumer token. `@banzami/sdk`
and `banzami_flutter` still call these paths; the fix is to withdraw those helpers,
not to re-expose the surface.

**Follow-up closed (2026-09-05):** `@banzami/sdk` 0.7.0 withdraws the four
consumer-wallet helpers (and the six payment-request helpers of RA-057). A
route-drift test now reads the gateway's router and fails any SDK method pointing
at an unmounted route, so a withdrawn surface cannot silently survive in the
client again. `banzami_flutter` remains outstanding.

## RA-059

- **Title:** Sandbox registration grant failure was discarded
- **Status:** FIXED (made visible) — underlying 422 is correct behaviour
- **Found/Fixed:** Stage E1.4

The grant was called as `_, _ =`. Consumers registered at zero and nothing said
why — the same silent-zero failure as RA-051, reached by a different route, under
a comment that already warned "a skipped grant looks identical to a grant of
nothing".

It is failing right now, legitimately: `BANZAMI_PILOT_LIMITS=1` is set on the
deployed core and the Phase-0 funds-in-circulation cap returns 422 once the
aggregate is reached — this stage's own testing consumed it. The cap works as
designed and was not touched. Registration still succeeds; the failure is now
logged with its reason.

This weakens some Stage E1.4 balance assertions, and the authority suite reports
that itself rather than looking stronger than it is.

## RA-060

- **Title:** Every posting in the Sandbox ledger was single-legged
- **Status:** FIXED in source (2026-09-05) · **Severity: high** (ledger invariant)
- **Found:** while building the campaign-payment E2E, which could not fund a consumer
- **Fixed:** `core/api/src/routes/wallets.rs` — `sandbox_credit`

`sandbox_credit` wrote a lone `CREDIT` entry with no counter-`DEBIT`. A credit
with no debit is money created from nothing. The reconciliation balance checker
had been logging `LEDGER INVARIANT VIOLATION` for these, correctly, and nothing
acted on it.

**Corrected scope (2026-09-05).** This entry first said "91 of 91 postings were
unbalanced". That was wrong, and the error was mine: the query summed
`amount_minor` without signing by `entry_type`, so every *correct* posting —
DEBIT 50000 + CREDIT 50000 — summed to 100000 and was counted as broken. Signing
the sum gives the real figure:

| | |
|---|---|
| Postings | 97 |
| Balanced | 87 |
| **Unbalanced** | **10** |
| All ten | `[SANDBOX] Merchant wallet top-up`, exactly 1 leg each |
| Total net | +475,000 minor |
| Window | 2026-08-31 → 2026-09-01 |
| Postings with zero entries | 0 |
| Single-leg postings after the fix deployed | 0 |

The defect was real and is confirmed independently — by reading the handler and
by these ten single-leg rows — but its scope was overstated roughly ninefold.
The measurement that found it was wrong even though its conclusion was right,
which is its own lesson: a check that reports everything as broken should be
suspected before it is believed.

The consumer top-up beside it (`consumer_wallets.rs`) was balanced from the start
— DR transit / CR consumer available — so this was one path, not a design.

It also wrote the posting and the entry as two statements with no transaction. A
failure between them leaves a posting with **no entries at all**, which a
per-posting balance check cannot see: there is nothing to sum. The regression
covers that case separately for exactly that reason.

Now: DR transit (ASSET) / CR merchant available (LIABILITY), in one transaction.
Mutation-verified — removing the DEBIT leg again fails the test.

**Remediation path:** `tools/sandbox-financial-reset.sh`. The ledger is
append-only, so the ten rows cannot be edited and correcting them individually is
what append-only forbids. The script instead performs the authorised clean
pre-launch Sandbox reset: it exports the full ledger and the failing postings to
a timestamped forensic directory on the VM, then clears `ledger_entries` and
`ledger_postings` in one transaction, keeping every structural entity —
merchants, wallets, wallet accounts, consumers, developer projects and bindings.
The canonical DOA project and its campaign accounts survive; only the money
returns to zero. It refuses to run unless core reports a Sandbox environment.

**Relation to RA-059:** these credits contributed 475,000 minor to
funds-in-circulation, which stood at 49,175,000 against the 50,000,000 cap. They
are a contributor to the exhaustion RA-059 describes, not its main cause —
accumulated legitimate E2E balances are. The reset clears both.

## RA-061

- **Title:** A refund debits the merchant's general account, not the account that received the payment
- **Status:** FIXED (2026-09-05) — deployed proof 15/15
- **Severity: high** (financial segregation)
- **Environment:** Sandbox. No real money.

Segregation holds on the way in and breaks on the way out.

A payment into a campaign credits that campaign's own wallet account. The refund
of that same payment debits the **merchant's general ledger account** instead:

```
payment  CREDIT 200000  LIABILITY  WalletAccount <campaign>
refund   DEBIT   50000  LIABILITY  Merchant <merchant-id>      ← wrong account
         CREDIT  50000  LIABILITY  Consumer <payer>
```

The posting is balanced, so no ledger invariant fires — this is not a
double-entry fault. It is the wrong account.

**Why it matters.** The campaign account keeps the full amount after a partial
refund, so a campaign settles money that was already given back, while the
operating balance silently absorbs the loss. For DOA that means a refunded
donation still counts toward the campaign at close. The whole point of ADR-042
segregation is that a campaign's balance is the truth about that campaign; a
refund that lands elsewhere makes it a half-truth.

**Root cause.** The refund path is merchant-scoped (`CreateRefundRequest` carries
`MerchantID` and no account), so Core has no sub-account to debit and falls back
to the merchant's default. The information exists: the settling transfer records
the destination account it credited, which is exactly the account the refund
should reverse.

**Fix.** The refundable object now records the account it credited
(`wallet_payments.wallet_account_id`, migration 0101), the session/link settle
path populates it, and the resolver debits that account's ledger account instead
of the wallet default.

Two deliberate constraints:

- The lookup is scoped by wallet as well as id, so a mis-recorded row cannot
  redirect a refund into a different owner's account.
- The column is nullable and pre-existing rows keep the old behaviour. They
  genuinely do not know their destination, and guessing one for a historical
  payment would be worse than admitting it.

The client still supplies only the payment identity. The owner comes from the
project binding and the debit account from the payment record, so a refund
request cannot choose where the money comes from.

**Deployed proof:** `tests/phase0/refund-devkey-e2e.sh` — **15/15**. A 200,000
payment into a campaign account, refunded 50,000, leaves that account at 150,000.

**Non-vacuity:** the pre-fix build is the mutation. The identical harness against
it failed exactly one assertion, `BALANCE_REDUCED` (got 200,000, want 150,000),
while every other assertion passed — the account was wrong and nothing else was.
The migration was applied through the sanctioned rollout gate
(`tools/migrate-and-verify.sh`): 101 applied, schema manifest satisfied, no
drift.

**Related:** RA-060 (ledger invariants), ADR-042 (segregated accounts),
ADR-050 (project-bound sub-accounts).

---

## RA-063

- **Title:** The operator's withdrawal fee was not in effect — every Sandbox payout was free
- **Status:** FIXED (2026-09-05) — deployed proof 28/28
- **Severity: medium** (operator revenue; no customer loss, no ledger imbalance)
- **Environment:** Sandbox. No real money.

`pricing_rules` was **empty** on the deployed Sandbox, and `core/payouts`
resolves the withdrawal fee from the Pricing Engine with a deliberate
fail-safe: no matching enabled rule → fee 0. Both halves are individually
reasonable. Together they meant the documented ADR-031 0.75% withdrawal fee
silently charged nothing, and nothing anywhere reported a problem — no error,
no warning, a perfectly balanced ledger. A payout of 80,000 debited 80,000 and
credited the bank 80,000, with no fee posting at all.

This is the failure mode a fail-safe default invites: the system cannot tell
"this transaction is genuinely free" from "the rule that would have priced it
is missing". It was found by asserting the fee rather than the endpoint —
`FEE_IS_0_75_PERCENT` measured 0 against an expected 600 while every other
assertion in the payout harness passed.

**Fix.** The rule was restored through core's own
`POST /internal/v1/pricing-rules` — the route the admin portal calls — as
`wallet_withdrawal_default`, SANDBOX, `transaction_type=wallet_withdrawal`,
`rate_bps=75`. No row was hand-written.

**Deployed proof:** `tests/phase0/payout-sandbox-e2e.sh` — **28/28**. Gross
80,000 = net 79,400 + fee 600; the fee is its own paired posting
(`<key>:process:fee`, two legs) crediting a REVENUE account, never a third leg
on the net posting.

**Non-vacuity:** the pre-fix environment is the mutation. The identical harness
against it failed exactly the five fee assertions — `FEE_POSTING_IS_SEPARATE`,
`FEE_POSTING_IS_A_PAIR`, `FEE_IS_0_75_PERCENT`, `FEE_CREDITS_REVENUE` and the
net/fee split — while the 23 assertions about the money, the KYB gate, the
refusals and idempotency all passed. The fee was missing and nothing else was.

**What is NOT fixed by this.** A missing pricing rule is still indistinguishable
from a deliberate zero fee at runtime. The gap is now covered by a deployed
assertion rather than by the code, which is weaker than the code knowing. If
the same absence occurs in another environment, this harness is what would
catch it.

**Related:** ADR-031 (pricing dimension), RA-056 (payout wallet ownership),
CAP-PAYOUT-001.

---

## RA-064

- **Title:** A payment link paid on its own left no receipt and could not be refunded
- **Status:** FIXED (2026-09-05) — deployed proof 21/21
- **Severity: high** (financial correctness; money in with no refundable record)
- **Environment:** Sandbox. No real money.

RA-061 fixed the same class of hole one level in: a payment settled through a
Payment Session records the refundable `wallet_payments` row. A link created
**directly** — `merchant_id` + `wallet_id`, no session — had no writer at all.
It settled the transfer, marked itself used, and recorded nothing.

So for that merchant: the money arrived, `/v1/merchant/wallet-payments`
returned `{"items":[]}`, no receipt reference existed, and
`refund_source` resolved to `None` — the payment was **unrefundable**, on a
public capability the documentation describes as refundable.

It was found by running a deployed E2E rather than by reading the code: the
balance assertions passed and the receipt assertion returned an empty list.
Money moved and nothing recorded it. Two earlier "failures" in the same harness
were red herrings pointing here — they had been attributed to routes removed
under RA-053/RA-057.

**Fix.** `POST /internal/v1/payment-links/{id}/mark-used` now accepts the
transfer that settled the link and records the merchant interface payment
against it, crediting the link's own `wallet_account_id` when it has one so a
later refund reverses THAT account rather than the wallet default (RA-061).
public-api passes the transfer it just executed.

The write is best-effort and idempotent on `transfer_id`, so a session-backed
link records exactly once from whichever path runs first, and a failure here can
never fail a payment that has already settled.

**Deployed proof:** `tests/phase0/online-platform-sdk.sh` — **21/21**. Receipt
`BZM-D8F1-AB9B`, status COMPLETED, payer shown handle-only (`@…`), then a
10,000 refund of that payment which actually returns the money: merchant
balance falls by exactly 10,000.

**Non-vacuity:** the pre-fix deployed build is the mutation. The identical
harness against it failed `F0-031-state` and `F0-031-privacy` with an empty
receipt list while every balance assertion passed — the recording was missing
and nothing else was.

**Related:** RA-061 (refund debits the credited account), RA-053/RA-057 (the
removed routes that used to be the only writer of `wallet_payments`),
CAP-PAY-002.

---

## RA-065

- **Title:** The published SDK's refunds could not be called with the only credential it documents
- **Status:** FIXED and PUBLISHED (2026-09-05) — @banzami/sdk 0.8.1 on npm; operator half deployed; 0.7.0 and 0.8.0 deprecated
- **Severity: high** (advertised capability unreachable; DOA's production refund path)
- **Environment:** Sandbox. No real money.

`createRefund`, `getRefund` and `listRefunds` targeted `/v1/refunds`. That route
is mounted under merchant-JWT authentication, and the only credential
`@banzami/sdk`'s README documents is a Developer Platform project key
(`bz_test_sk_…`). Every refund call through the SDK therefore answered **401
INVALID_TOKEN**.

Measured on the deployed Sandbox with a real project key:

```
POST /v1/refunds           → 401 INVALID_TOKEN
POST /v1/business/refunds  → 404 refund source not found   (authorised)
```

DOA's production refund path (`lib/refunds/banzami-refund.ts`) calls exactly
this method, so the golden integration could not refund a donation. The deployed
refund E2E did not catch it because it exercises the route directly rather than
through the published client — the same blind spot that let the documented
`purpose` value ship wrong.

`getBusinessMe()` failed identically, and that half is the operator's:
`/v1/business/me` exists specifically for an integrating application's
Integration Health view — DOA is the named example in the handler's own comment
— and was mounted merchant-only. DOA's health view reported *"a chave não
autentica a conta Business"*, which was true of the route and false of the key.

**Fix.** SDK refund methods now target `/v1/business/refunds` (0.8.1).
`/v1/business/me` moved into the dual-credential group, resolving the merchant
from the project binding like every other route there. No signature changed.

**Deployed proof:** with the corrected client against the deployed Sandbox,
`getBusinessMe()` → 200 and `createRefund()` → 404 *refund source not found*
(authorised, and correctly refusing a fabricated source id) where both were 401.

**Non-vacuity:** re-pointing `createRefund` back at `/refunds` fails the new
`route-drift` reachability test, which asserts the credential can reach the
route rather than only that the path exists.

### Outcome

`@banzami/sdk@0.8.1` is published. Verified through the **published package**
with a real project key against the deployed Sandbox — the exact call DOA's
production refund path makes:

```
createRefund(fabricated source) → 404 refund source not found   (authorised; was 401)
createRefund(real wallet payment, 15 000) → SUCCEEDED
  replay with the same idempotency_key → the same refund id
  getRefund() reads it back
getBusinessMe() → 200                                            (was 401)
```

DOA moved to `^0.8.1`, so donations can be refunded again.

### Decision on @banzami/sdk@0.7.0 — deprecated, on evidence

The decision below stands as reasoning and has now been executed for the reason
it names, not for version order. **0.7.0 and 0.8.0 are both deprecated**, because
both carry this defect and the fix is published. 0.8.1 is the only supported
version.

### Why 0.7.0 was NOT deprecated merely for being older

Re-derived rather than assumed. 0.7.0's method surface is identical to 0.8.0's
minus `createTransfer`; its path set is identical minus `/business/transfers`.
0.7.0 is the release that **removed** the withdrawn-route methods for which
0.5.1 and 0.6.0 were deprecated — it is the fix, not a carrier.

The refund defect above is present in 0.7.0 **and** in 0.8.0 equally, so it is
not a reason to deprecate 0.7.0 specifically. A previous valid release does not
become defective because a later one adds a feature.

Once 0.8.1 is published, both 0.7.0 and 0.8.0 carry an identified, proven defect
(refunds unreachable) and deprecating **both** would then be justified — for
that reason, recorded here, and not for the existence of a newer version.

**Related:** RA-061, RA-064 (the refundable object itself), CAP-SDK-001.

---

## RA-066

- **Title:** The Console's Logs screen answered a different question than the one it was opened to ask
- **Status:** FIXED and DEPLOYED (2026-09-05) — migration 0104, ADR-054, CAP-DEV-003
- **Severity: medium** (documented workflow had no implementation)
- **Environment:** Sandbox. No real money.

The Logs screen showed webhook events and delivery attempts. That data is real
and correctly project-scoped, and it is not what a developer means by "logs":
they open the screen to find *the request they just made*.

The docs made the gap worse rather than hiding it. They tell integrators to keep
the `request_id` from an error envelope and quote it in support — and nothing
persisted a per-request row, so neither the developer nor support could resolve
one. The page said so plainly instead of inventing a table, which was the right
answer to not having the feature and was never the feature.

**Fix.** The api-gateway records one row per Developer API request that
authenticated with a project credential (`developer.dev_api_request_logs`,
migration 0104); developer-api serves them back scoped to one project.

Attribution happens in `resolveDeveloperPrincipal` — the single place a
developer key is ever accepted — so no handler can forget, and the row is
written after the response completes, so failures are logged for the same reason
successes are. A request that fails *authentication* is not written: there is no
project to attribute it to, and attributing it to a guess would let an
unauthenticated caller write rows into a stranger's log.

What the table cannot hold is the point. No `Authorization`, no key, no webhook
secret, cookie, OTP or body — and no JSONB column, so a later handler has
nowhere to put one without a migration and a review. The stored path drops its
query string and redacts any `bz_*_(sk|pk)_…` token.

**Deployed proof:** `tools/e2e/dev-console/api-logs-correlation-e2e.mjs`, 15/15
against the deployed Sandbox — a real project key makes a real Gateway request,
its `request_id` is read off the response, and the same id is found through the
Console with matching method, path and status, then pasted into the real search
box and seen on screen. Isolation both ways; A's `request_id` inside B's own
project answers exactly as an id that never existed.

**Retention:** 30 days, pruned hourly, proved against a real database — rows
past the window deleted, rows inside it kept, because deleting everything would
satisfy half the claim. `developer.audit_events` is immutable and governed
separately; the pruner never names it.

---

## RA-067

- **Title:** A real `request_id` could not be found by pasting it into the Logs search
- **Status:** FIXED and DEPLOYED (2026-09-05)
- **Severity: medium** (the one workflow the feature exists for)
- **Environment:** Sandbox.

The docs' error envelope showed `"request_id": "req_XXXXXXXX"`. The gateway
emits 32 hex characters with no prefix (`services/common/obs` `newID`). The
Console's search decided "is this an id or a path?" by looking for that `req_`
prefix, so pasting a **real** `request_id` searched the path instead and found
nothing.

Found by the correlation E2E on its first run — the browser half failed while
the API half passed, which is exactly the split a placeholder-vs-reality bug
produces.

**Fix.** The search recognises an id by shape. Every documented sample — both
docs languages and both OpenAPI copies — now carries the shape the operator
actually emits, and `apps/website/app/developers/request-id-shape.test.ts` reads
the generator so docs and reality cannot drift apart again.

---

## RA-068

- **Title:** The published SDK's types demanded a Node global, and its documented import path did not exist
- **Status:** FIXED and PUBLISHED (2026-09-05) — @banzami/sdk 0.8.2 on npm
- **Severity: low** (both invisible to every in-repo consumer)
- **Environment:** npm registry.

Two defects a consumer meets before writing a line of business code:

1. `webhooks.d.ts` typed the raw body as `string | Buffer`. `Buffer` is a Node
   global the package neither supplies nor requires, so a project with
   `skipLibCheck: false` and no `@types/node` got five errors out of a file it
   never imported.
2. `exports` declared no `./webhooks` subpath, so
   `import { constructEvent } from '@banzami/sdk/webhooks'` — the import the
   module's own example teaches — failed with **TS2307** under `NodeNext`.

Both were invisible in-repo because our own projects have `@types/node` and
import from the package root. The broken path was the documented one.

**Fix (0.8.2).** Public signatures take `string | Uint8Array` (`Buffer` extends
it, so every existing caller still compiles; the implementation is unchanged),
and `./webhooks` is exported for ESM, CJS and types.

**Non-vacuity:** `tests/phase0/sdk-types-cleanroom.sh` builds the consumer that
would have caught both — fresh project outside both repositories, strict,
`skipLibCheck: false`, deliberately without `@types/node`, plus a second pass
*with* `@types/node` proving a `Buffer` caller still compiles. It fails against
the published 0.8.1 on both counts and passes on 0.8.2.

---

## RA-069

- **Title:** A deployed Doa environment had no supported way to make its first admin
- **Status:** FIXED (2026-09-05) — `scripts/bootstrap-admin.ts`, documented in `OPERATIONS.md`
- **Severity: medium** (operational gap; the workaround was unaudited)
- **Environment:** Doa (github.com/…/doa), pre-launch.

Doa promotes admins through the Console (`adminPromoteToAdmin`), which requires
an existing admin — correct for every admin after the first, and unable to
produce the first. `supabase/seed.sql` creates one, but it is a local dev seed
that must never run against a deployed database. What remained was editing
`profiles.role` by hand in the SQL editor: no email confirmation, no audit row,
no attribution.

**Fix.** A bootstrap that is deliberately not a general privilege tool. It
refuses once **any** admin exists — promotion then belongs in the Console, where
it is authorised and audited, and a second path that skips it is a back door
however carefully written. It promotes only an already-registered user, looked
up by email, creates no account, sets no password, and writes its own
`audit_log` row (`admin.bootstrap`).

The refusals are the safety, so the decision lives in `lib/ops/admin-bootstrap.ts`
and is tested without a database, including the non-vacuity check that the
promote path is genuinely reachable.

---

## RA-070

- **Title:** "The site works" was standing in as evidence of the Supabase credential migration
- **Status:** PARTIALLY CLOSED (2026-09-05) — deployed diagnostic shipped; control-plane confirmation is an owner reading
- **Severity: low** (evidence quality, not a live exposure)
- **Environment:** Doa production.

A working site proves the credentials currently configured are **valid**. It
says nothing about which key model they belong to, and a legacy key that still
works is precisely the state a migration is meant to end. The inference was
being used as if it closed the incident.

**Fix.** `GET /api/ops/credential-model` (admin-only) reports the key model of
the environment **actually running** — `sb_publishable_…` / `sb_secret_…` versus
legacy JWT — as a classification, never a value. The classifier is shared with
`scripts/check-supabase.ts` so the local check and the deployment cannot
disagree about what "current" means.

**What it cannot answer, and says so in its own response:** whether the
previously issued legacy keys were *deactivated* in the Supabase Dashboard.
That is control-plane state the application cannot see. It is read under
**Supabase → Project Settings → API Keys → Legacy API keys**, and that reading
is what will close this entry.

---

## RA-071

- **Title:** The Console Overview was invented data behind a label
- **Status:** FIXED and DEPLOYED (2026-09-05) — CAP-DEV-001
- **Severity: medium** (the first screen a developer sees described nothing)
- **Environment:** Sandbox.

`/developers/dashboard` rendered hard-coded constants: **1.482** transações,
**12.450.000** AOA of volume, **128** comerciantes, a **95.3%** success donut,
and an activity table of `payment.succeeded` / `payment.failed` /
`transfer.created` / `invoice.paid` against `INV-2025-…` references — event
names Banzami does not emit, for a shop that does not exist.

It carried an `IllustrativeDataNotice`. That label was honest and it did not
stop the page being the first thing a developer sees, or stop the figures
describing nothing.

**Fix.** Every figure now derives from what the operator recorded for the
**active project**: the API request log (ADR-054) and the project's own webhook
events and keys — requests, errors, success rate, median latency, events emitted,
active keys; a per-day chart that includes days with no traffic, because dropping
empty days overstates how busy a quiet project is; and a recent-activity table of
real requests.

The summary is aggregated **in SQL over the same window**, not over the returned
page. The list is capped at 200, so a total computed client-side would be a page
size wearing the clothes of a metric.

An empty project reads as empty.

**Deployed proof:** `LOG.overview-summary-counts-real-requests` — two calls to
the deployed Gateway raise the project's own request count by two — and
`LOG.overview-has-no-invented-figures`, which loads the deployed page and checks
none of the old constants render. Source alone cannot tell "wired" from "wired
to something".

The `ILLUSTRATIVE` list in `illustrative-data.test.ts` is now empty, and that
emptiness is the assertion.

---

## RA-072

- **Title:** The Supabase credential rotation had not actually been performed
- **Status:** OPEN — owner action; evidence tooling shipped (2026-09-05)
- **Severity: high** (an exposed credential class believed retired is still in use)
- **Environment:** Doa production.

The release evidence recorded the Supabase migration and legacy-key revocation
as complete. Control-plane state says otherwise.

Vercel writes a new record when an environment variable is edited, so the
listing's age is the age of the **current value**. In Doa Production:

```
NEXT_PUBLIC_SUPABASE_URL         125d ago
NEXT_PUBLIC_SUPABASE_ANON_KEY    125d ago
SUPABASE_SERVICE_ROLE_KEY        125d ago
SUPABASE_JWT_SECRET              125d ago

BANZAMI_API_KEY                   13h ago
BANZAMI_WEBHOOK_SECRET            17h ago
```

The BANZAMI_* entries prove this project's variables *do* carry a fresh
timestamp when they are changed. The Supabase values have not been changed in
125 days.

It follows that the legacy keys cannot have been deactivated: the site is up and
answering 200, and it is using them. `/api/ops/credential-model` would say the
same from inside the running deployment, and could not be read here — see the
access note below.

**What shipped:** `scripts/check-credential-rotation.mjs` reads names,
environments and ages from the control plane — never a value — and exits
non-zero when a matched variable is older than a given window, so a rotation is
gated on evidence rather than on a claim. Documented in `OPERATIONS.md`.

**What is still required (owner):** issue `sb_publishable_…` / `sb_secret_…`
keys, set them in the deployment environment, deactivate the legacy keys under
**Supabase → Project Settings → API Keys → Legacy API keys**, then re-run the
checker and `/api/ops/credential-model`.

**Access note.** Neither the rotation nor the admin bootstrap could be executed
here: `vercel env pull` returns variable names with **empty values** for this
scope, no Keychain item holds the Supabase credential, and the IONOS mailbox
password in the Keychain now fails IMAP authentication (`authentication failed`
at LOGIN, reproduced twice), so the authorised OTP path is also unavailable.

---

## RA-073

- **Title:** DOA was bound to an E2E fixture merchant, and there was no way to correct it
- **Status:** FIXED (2026-09-05) — @doa provisioned, project rebound, pricing restored, webhook re-registered
- **Severity: high** (donations settled to the wrong business; the operator fee destination could not resolve)
- **Environment:** Sandbox. Synthetic money.

DOA's admin card reported:

> A chave resolve `@e2edoa17885371237909198`, mas o DOA espera `@doa`.

The key was not wrong. A Developer project resolves its payee through its
ACTIVE binding (ADR-047), and DOA's binding pointed at a merchant an E2E run
had created on 2026-09-04. **There was no `@doa` merchant on the Sandbox at
all** — it did not survive the financial reset and was never recreated. So every
DOA donation settled into a throwaway fixture, and DOA's own fee destination
(`@doa`) could not resolve either.

Three things had gone wrong together, and each hid the next:

1. **No `@doa` account.** The reset removed it; nothing recreated it.
2. **The binding could not be corrected.** `CreateBinding` conflicts on the
   one-ACTIVE-per-project index, and although the schema has a `DISABLED` state,
   nothing ever set it. A project was bound once, forever, correctly or not.
3. **The fixture's taxonomy masked a missing pricing rule.** The E2E merchant
   was `retail`/`general`, which maps to no pricing category, so the
   `PRICING_MISSING` gate never fired. `pricing_rules` had been empty since the
   reset; RA-063 restored only `wallet_withdrawal`. The DONATION rule was still
   missing, and the card read "settlement READY" because the check was vacuous.

**Fix.**

- `tools/ops/provision-doa-business.mjs` creates `@doa` through the same public
  onboarding flow a merchant uses — application → activation → auth — not by
  writing rows. Category `donation` → pricing category `DONATION`; Sandbox
  auto-approves KYB. Result: KYB APPROVED, wallet ACTIVE/AOA, primary account.
- `RebindProjectSandbox` is the missing correction path. Core validates the new
  payee exactly as it does a first binding; a **sealed** binding is refused
  (once a payment artifact exists the payee can never change, ADR-047 §3.2);
  the swap is one transaction so the project is never unbound; both binding ids
  are audited; and it is opt-in (`supersede: true`) so a caller binding a fresh
  project cannot replace a payee by omission.
- The `donation-standard` rule (DONATION, 200 bps) was restored through core's
  own `POST /internal/v1/pricing-rules` — the same sanctioned route RA-063 used.
- DOA's webhook endpoint was re-registered under `@doa`, and
  `BANZAMI_WEBHOOK_SECRET` updated to the new signing secret.

**Deployed proof.** `/v1/business/me` through DOA's project now resolves
`handle=doa`, `kyb=APPROVED`, `category=donation`, `pricing_category=DONATION`,
`settlement_ready=true`, **no blockers, no warnings** — where it previously
resolved the fixture.

The webhook half was measured, not assumed: immediately after the rebind the
delivery harness reported `PENDING|401` — DOA correctly rejecting a signature
made with the new endpoint's secret against its old one. After the env update
and redeploy, `SUCCESS|200`, 11/11.

**Non-vacuity.** The seal refusal is enforced in the service *and* in the SQL;
the test fails only when both are removed.

**Adjacent finding, not fixed here.** `SealBindingArtifact` exists, is
documented as the ADR-047 §3.2 immutability guarantee, and is **never called** —
no route, no caller. No binding has ever been sealed, which is why this
correction was permissible at all. The guarantee is currently documented and
unenforced.

---

## RA-074 — ADR-055 was deployed, and nothing said so

- **Found:** 2026-09-06
- **Status:** VERIFIED (deployed proof)

RA-073 closed with an adjacent finding: `SealBindingArtifact` existed, was
documented as the ADR-047 §3.2 immutability guarantee, and was never called. "No
binding has ever been sealed, which is why this correction was permissible at
all."

That is no longer true, and the record did not say so. The Sandbox stack's
database is at migration 105; `0105_binding_seal_enforcement` is applied; both
guard functions and both triggers exist; `dev_project_sandbox_binding` carries
`artifact_created`. DOA's own project binding is `ACTIVE` against `@doa`
(`050b68c2`) with `artifact_created = true` — sealed by its own payment
artifacts — and the superseded binding to the E2E fixture merchant is `DISABLED`
and unsealed, exactly as RA-073's correction left it.

**Deployed proof.** `tests/phase0/adr055-binding-seal-e2e.sh` walks the lifecycle
on the running Sandbox, 16 checks:

    a fresh project binds, unsealed
    the operator corrects it before any artifact          → allowed
    the first payer-facing payment session                 → seals it
    the same correction, after the seal                    → 409, payee unmoved
    a direct UPDATE at the database, service bypassed      → refused by trigger
    a direct DELETE at the database, service bypassed      → refused by trigger
    five concurrent first artifacts                        → one ACTIVE, sealed

The two database checks are the ones a service-level test cannot make. The
service guard is an UPDATE with `WHERE artifact_created = false`; were that the
only defence, anything reaching the row another way — a migration, a console, a
future code path — would pass straight through it.

### Migration state, while we were there

There is no 0097 drift. All 105 migrations apply cleanly to an empty database
and `tools/schema-manifest.json` is satisfied — the from-zero migration proof.

What exists is a **stale legacy database**: `banzami_staging` on
`banzami-postgres-1`, stopped at migration 99, which the Sandbox stack does not
use. The stack runs its own Postgres, and that one is current. Nothing was
repaired because nothing is broken; the legacy database should be retired rather
than migrated.

---

## RA-075 — 156 live API keys on DOA's project, left by end-to-end runs

- **Found:** 2026-09-06
- **Status:** FIXED (2026-09-06) — 156 revoked, 15 remain

DOA's Developer project carried **171 active API keys** against 175 ever issued.
All but fifteen have names generated by E2E harnesses — `refund-e2e-…`,
`transfer-e2e-…`, `wh-deliver-…`, `seg-…`, `wa-e2e-…`, `sdk-public-…` — each
ending in a run id. Every one is a live credential on a real project and several
carry `wallet_accounts:create`. Nothing revoked them because nothing was
responsible for revoking them: the harnesses mint and never clean up.

`tools/ops/prune-doa-fixture-keys.sh` revokes them. Two things about how it
selects, both deliberate:

It matches the **generated name patterns**, not "everything except the keys we
keep". An earlier version did the latter, and that is the wrong direction on a
project holding live credentials — a keeper name slightly wrong revokes the key
that takes donations. This way a mistake leaves a key alive.

It **refuses to run at all** unless both canonical keys are present and active.
If they are not there, the script does not know what it is looking at.

Dry run confirms 156 selected, 15 human-named keys untouched — including
`DOA Sandbox server key` and `DOA production (final)`, which may still be
configured somewhere and are therefore not this script's business.

    bash tools/ops/prune-doa-fixture-keys.sh            # dry run
    bash tools/ops/prune-doa-fixture-keys.sh --apply    # revoke

The work happens on the Sandbox VM, since the credentials it needs are docker
secrets there; the script copies itself over and re-runs when the containers are
not local. The first version reported "containers not found" when run from the
repository root, which is true, useless, and named a symptom rather than a host.

**Executed 2026-09-06.** 156 revoked, 15 active remain — every one
human-named, including `DOA Sandbox server key` and `DOA production (final)`,
which are not this script's business.

Verified afterwards, against the deployed product rather than the database:
two campaigns created end to end through www.doadoa.app, each provisioning a
fresh Banzami wallet account, which is `wallet_accounts:create` succeeding on
the surviving web key; and the full admin access-control matrix still passing on
admin.doadoa.app. Revoking 156 credentials moved nothing that was in use.

**The harnesses should revoke what they mint.** Pruning after the fact is the
repair; the fix is that a fixture key outlives its run only by accident.

---

## RA-076 — the hosted payer surface was deployed as a Node REPL

- **Found:** 2026-09-06
- **Status:** FIXED (2026-09-06)

`pay.banzami.com` answered 502 to every payer for twelve hours. Its container
had been created with `exec node` — no script — so it started, found stdin was
not a terminal, and exited 0 in under a second.

The exit code is why nobody noticed. Nothing crashed, nothing restarted, no log
line was written; the container sat there `Exited (0)` while Cloudflare reported
a bad gateway to anyone opening a payment link. A crash loop would have been
visible in a minute.

The service table in `sandbox-deploy.sh` carries the binary each entrypoint
execs. For the Go services that is a binary name; `pay-frontend` is a Next.js
standalone server whose own Dockerfile says `CMD ["node", "server.js"]`. The
table said `node`. Under `docker compose` the image's CMD applies and it works,
which is how it was ever seen running — the single-service deploy path overrides
the entrypoint and dropped the argument.

**Worth noticing about the shape of this.** Both this and RA-074's Vault finding
are the same failure: an operation that does not work and does not say so. A
502 from a container that exited cleanly, and a contact hash computed with an
empty pepper. The loud failures get fixed the day they happen.

## RA-077 — 169 live merchant keys and 55 webhook endpoints, left by the harnesses

- **Found:** 2026-09-06
- **Status:** FIXED (2026-09-06)

RA-075 revoked 156 API keys on DOA's Developer project. That was one population
of harness residue. The merchant-side population is larger and nothing had
looked at it: 288 merchants on the sandbox operator database, 276 of them
fixtures created by end-to-end runs, holding 169 unrevoked API keys, 55 active
webhook endpoints and 169 unlocked application PINs.

One of those endpoints posts to `https://www.doadoa.app/api/webhooks/banzami`.
A fixture merchant named `E2E doa b3b8e76f` holds a live signing secret for the
real product's webhook route — created by a harness that needed a webhook to
exist, and never withdrawn because nothing was responsible for withdrawing it.

`tools/ops/prune-fixture-authority.sh` revokes the keys, deactivates the
endpoints and locks the PINs in one transaction. It selects fixtures positively,
by the name shapes the harnesses generate, and prints every merchant it does not
match so a wrong pattern leaves a credential alive rather than killing the one
that takes donations — the same correction RA-075's script needed. Nothing is
deleted: an audit needs to see that a credential existed and when it stopped
working.

Applied 2026-09-06: 169 keys revoked, 55 endpoints deactivated, 169 PINs locked,
in one transaction. What remains live on the whole database is one API key and
one webhook endpoint, both the canonical `Doa` merchant's. A second dry run
reports zero fixture authority of any kind.

Then the donation path was run again end to end, because a mass revocation is
only safe if the credential that had to survive still works — not as a row, as a
working key. Two campaigns, two settlements, correct wallets, replay refused,
webhook delivered, DOA confirming: 11/11 each.

**Worth noticing about the shape of this.** Every harness in this repository
creates authority and none of them removes it, so residue accumulates in
proportion to how much the system is tested. The prune scripts are a cure. The
fix is for the harnesses to withdraw what they mint, and that is not yet done.

## RA-078 — the public docs told developers not to install the packages that were published

- **Found:** 2026-09-06
- **Status:** FIXED (2026-09-06)
- **Severity: high** (the recommended integration path was documented as unavailable)
- **Environment:** `developers.banzami.com/docs`, public.

`@banzami/sdk` has been on npm since 2026-09-04 and `banzami_client` on pub.dev
since 2026-09-05, each proven by a clean-room install from the public registry
outside every Banzami repository. `published-packages.ts` — the canonical list —
recorded both. The documentation did not.

The `/docs` landing said "Outros SDKs — pré-visualização controlada, não
publicados". The SDK page said the packages were "não publicados publicamente em
npm, PyPI, Packagist ou pub.dev" and that the documentation therefore "não
apresenta comandos de instalação pública". The per-family table marked all four
families `não publicado publicamente`, install command `não disponível`, and
recommended use **"não instale de registos públicos ainda"** — for
JavaScript/TypeScript and Flutter included. The risk matrix repeated it as
`Pacotes SDK não publicados publicamente → Não instalar de registries públicos`.

That last one is the damaging half. It does not merely misinform; it steers a
reader away from an install that works and toward hand-rolled HTTP, which the
SDK-first policy exists to prevent. `sdk-publication-claim.test.ts` was written
for exactly this defect on the landing page, and it held there — the same claim
simply survived one directory over, in the docs content, where no test looked.

**Two more claims had been overtaken by their own evidence.** The docs described
the Console dashboard as a "pré-visualização demo, não operacional" with
"dados ilustrativos", and the trust matrix carried `Developer Console (páginas
visuais) → documented_preview`. `illustrative-data.test.ts` already asserts the
opposite — the ILLUSTRATIVE list is empty, and the Overview derives every figure
from the project's own request log. The deployed Console shows real Sandbox
traffic. Understating a capability is as much a false claim as overstating one.

**Fixed.** PT and EN now name the two published packages with their real install
commands, keep the controlled-preview language only for Python and PHP, which are
genuinely source-only, and describe the Console as operational in Sandbox with no
illustrative data anywhere.

**The tests were the reason it survived.** Six of them pinned the stale
wording — `p2c` asserted "não instale de registos públicos ainda" as a required
value, `p1` blanket-forbade `pub add banzami` after `banzami_client` had shipped
under that very prefix, and `p0` required the demo-Console sentence. Each was
enforcing the false claim. They now assert the corrected one, with negative
assertions so the old wording cannot come back: 231 tests in `app/developers`,
393 across the app, all passing.

**Worth noticing about the shape of this.** A claim-safety test that pins a
literal string protects the claim, not the truth. When the world moves, the test
holds the page still — and the more thorough the suite, the more confidently it
does so. The narrowed assertions here name the families rather than the phrase,
so the next publication breaks the test instead of being contradicted by it.

## RA-078 — stateful harnesses leak operator authority (the cause behind RA-075 and RA-077)

- **Found:** 2026-09-06
- **Status:** FIXED (2026-09-06)

RA-075 and RA-077 were the same finding twice, swept by hand both times: 156
developer keys, then 169 merchant keys, 55 webhook endpoints, 169 application
PINs, 276 merchants, 93 projects and 207 open payment links. Neither entry
recorded a defect in the product. The defect is here, in the harnesses: every
one of them mints operator authority and none of them gave it back, so residue
accumulated in proportion to how much the system was tested.

**The fix.** `tests/phase0/lib/e2e-run.sh` gives a run an identity and a
manifest. Every object is recorded by exact id at the moment it exists, and
retired on the way out through the canonical operator route — keys revoked,
endpoints deactivated, links cancelled, projects archived, merchants suspended.
Nothing is deleted with SQL; the domain model keeps history on purpose. Cleanup
runs from a trap on EXIT, INT and TERM, because the runs that leaked were the
ones that failed. Ownership is by id and never by name pattern.

Thirteen harnesses were instrumented. Three create nothing and were left alone.

**Two operator gaps made self-cleaning impossible, and both are closed.** There
was no way to retire a fixture project; there is now, and it archives the
project and revokes the keys still live on it in one transaction. And a
suspended merchant could still sign in to the merchant app with handle and PIN,
because the login query read the credential row and never the merchant's status
— so the operator's own retirement left a working login. Both are in
`bc0b86b3`.

ADR-055 is untouched. A sealed binding stays sealed and there is deliberately no
route that unseals one: the disposable unit is the project that holds the
binding, not the payee.

**What proves it stays fixed.** `fixture-hygiene-gate.sh` counts operator
authority around a single harness and requires a zero delta, checked even when
the harness fails. `fixture-hygiene-suite.sh` does the same around all thirteen
at once — 13/13 pass, zero delta, on the deployed Sandbox.
`tools/check-harness-hygiene.mjs` runs in CI and fails a harness that mints
authority without wiring up cleanup, with a self-test that writes each violation
class into the tree and requires the gate to fail. Mutation-proved:
`E2E_NO_CLEANUP=1` produced 5 leaked objects and the gate failed with exit 1.
`cleanup-e2e-run.sh` finishes a run a killed machine interrupted, from its
manifest, by id.

**Worth noticing about the shape of this.** The gate found three leaks in
harnesses I had already instrumented and believed done: an unpaid payment
session leaves an ACTIVE payment link, and those links have no expiry. Reading
the code and believing it is what produced the first two sweeps.

**And one mistake this work made.** The extended prune archived the canonical
DOA project, because it matched projects through ANY binding to a fixture
merchant and DOA's project keeps the retired binding it was corrected away from.
Nothing broke — key authorisation reads the key's status and never the
project's — but that is luck rather than design. The rule now asks only about
ACTIVE bindings, and the canonical project is excluded by name as well.

## RA-079 — an unmanaged container holding every operator secret, running for five days

- **Found:** 2026-09-06
- **Status:** FIXED (2026-09-06)

A container named `silly_swirles` was running on the Sandbox host. Docker
generates that kind of name when `docker run` is given none, so it was started
by hand, on 2026-09-01, and never stopped.

It held the full operator secret set as mounted files: `db_url`, `jwt_secret`,
`core_internal_key`, `api_key_pepper`, `developer_internal_key`,
`session_secret`, `otp_pepper`. It ran an old `public-api` image
(`7d680db65049`) on the data network, with no host port — unreachable from
outside, and able to reach Postgres and Core with real credentials from inside.
It was answering its own health checks the whole time.

**Why nothing saw it.** Every check in this repository looks at something it
already knows about. The deployment tooling inspects the containers it manages.
The credential inventory reads the database. The health checks ask whether the
known services are up. None of them asks *what else is running in here*, and a
container nobody deployed is invisible to all of them by construction — the same
shape as RA-076, where a container that had exited cleanly was invisible to
every check that asked whether the service had started.

`tests/phase0/sandbox-container-inventory.sh` asks the opposite question: every
container with a secret mounted under `/run/secrets` must be one the deployer
created. Ownership is the name prefix of the generated Sandbox project, read
from a container that is certainly the deployer's — it applies no labels, so the
name is what there is.

**Two ways that check could have lied, both found before it was believed.** It
first ran against the docker daemon on the author's own machine, found no
Banzami containers at all, and reported that every secret-holding container was
owned; it now requires the Sandbox services to be present and exits distinctly
when it inspects nothing. And every script in this repository that copies itself
to the VM was discarding its own exit status: `ssh host "cmd; rm -f /tmp/x"`
returns the status of the `rm`. Ledger reconciliation, the canonical binding
proof, both prunes and both audits had been returning 0 regardless of outcome.
Seven scripts fixed.

Stopped and removed 2026-09-06. It had been started with `--rm`, so the removal
was already under way the moment it was stopped — five days of holding every
operator secret, and it would have left no trace at all when it finally went.
The detector now reports 5 secret-holding containers, all owned, and every
public surface, the ledger reconciliation and the canonical binding proof were
re-checked afterwards.

## RA-080 — unmanaged execution and secret-boundary violation

- **Found:** 2026-09-06
- **Status:** CLOSED, with one rotation deliberately deferred (2026-09-06)

**Classification.** Unmanaged execution with access to operator credentials.
NOT a confirmed external compromise: there is no evidence of exfiltration, and
none that there was none.

**What happened.** RA-079 recorded the container. This entry records what it
meant. `silly_swirles` ran from 2026-09-01 09:47:47Z until it was stopped on
2026-09-06, with eight secret files bind-mounted read-only and attachment to the
Sandbox data network. It exposed no host port, so it was unreachable from
outside; from inside it could reach Postgres and Core with real credentials.

**Provenance, as far as evidence permits.** The image was
`banzami-sandbox/public-api-staging:7d680db65049`, digest
`sha256:3bd73a76136d…`, built by this repository's own pipeline from commit
`7d680db6504` (a merge of PR #94, 2026-09-01 09:20:39Z) — our code, not
foreign code. The container carried no labels and a Docker-generated name, so it
came from a `docker run` with no `--name` and no Compose project; the current
deployer always passes `--name`, so it did not come from the deploy path as it
stands today. **Who started it is not established, and this entry does not
guess.** A second container from the same session, `developer-api-prev` (created
09:39:59Z, exited, all eight secret mounts, still attached to the data network),
was found by the host attestation and removed.

**Scope of exposure.** The secrets are read-only bind mounts of files on the
host. Anyone able to start that container already had root there and could read
those files directly, so rotation does not defend against whoever started it.
What rotation ends is the validity of credentials that were readable by a
process nobody was tracking. That is the honest scope, and it is reason enough
before launch.

**Dispositions.** Seven rotated on 2026-09-06 and verified in both directions
(`tools/ops/verify-rotation.sh`, 17/17): the database password (the role changes
its own, so no superuser credential need exist), `jwt_secret`,
`core_internal_key`, `developer_internal_key`, `core_payee_validation_key`,
`session_secret`, `otp_pepper`. Old database password refused and new accepted;
old internal key refused by the guarded route and new one through it; a token
signed with the old JWT key rejected and one signed with the new key accepted.

`api_key_pepper` was deferred for several hours and then **done**, once
Vercel's daily build allowance reset — it invalidates every developer API key,
and those live in environment variables that take effect only on a new
deployment, so rotating it earlier would have stopped donations until the
allowance returned. The controlled reissue ran in the order the blast radius
demands: rotate the pepper, redeploy developer-api, mint three replacements each
inheriting its predecessor's scopes read from the operator's own records rather
than retyped, install each into its own deployment over stdin, redeploy, prove,
then revoke the three superseded records. The donation journey and the admin
refund both pass under the new keys; the predecessors were unverifiable from the
moment the pepper changed, because the hash they were stored under can no longer
be produced from any input.

**Controls added.** `ops/sandbox-host-manifest.tsv` says what the host should
contain; `tests/phase0/sandbox-host-attestation.sh` compares the whole of
`docker ps -a` against it, including stopped containers and the capability
settings that would let a container leave its boundary. 13/13 after the
removals, and wired as `make check-host-attestation` so it is something to run
rather than something that was run once.

**Re-proved after rotation.** The full stateful suite (13 harnesses, no
authority leaked), the DOA golden journey, the admin refund through the deployed
interface, ledger reconciliation, the canonical binding, and the
retired-authority denial proof.

**Worth noticing about the shape of this.** Every check in this repository
looked at something it already knew about, so the one thing nobody had declared
was invisible to all of them. That is the same shape as RA-076 — a container
that exited cleanly was invisible to every check that asked whether the service
had started — and the same as RA-078, where harnesses were audited for what they
create and never for what they leave.

## RA-081 — remote proofs discarded their own exit status

- **Found:** 2026-09-06
- **Status:** FIXED (2026-09-06)

Six assurance scripts and one deploy step ran their work on the Sandbox host
over ssh and threw the answer away. The remote command ended with a cleanup
`rm`, and ssh reports the status of the last command it ran. Ledger
reconciliation, the canonical binding proof, both prunes and both audits had
been returning 0 no matter what happened on the far side. The deploy step
managed it twice in one line: the same trailing cleanup, and the output piped
through `tail`, whose status replaces the pipeline's — a failing end-to-end
harness ended a deploy with "OK".

A related defect in the same family: the first host-inventory check ran against
the docker daemon on a laptop, found no Banzami containers, and reported the
Sandbox clean. "I looked and saw nothing" is not "there is nothing".

`tools/ops/lib/remote.sh` is now the single way to run a proof remotely. It
proves the host first and refuses rather than falling back to local docker,
sends the script and the library together, captures the proof's status, cleans
up from a trap so cleanup happens on any exit, and exits with the status it
captured. Nine scripts and the deploy step were rewired onto it.

Three proofs that it works: a probe that exits 42 on the real Sandbox must give
42 back; one that succeeds must give 0; and asserting "already on the host" when
that is false must refuse. A static gate flags any ssh line whose remote command
ends in cleanup or whose output is piped, and its self-test writes the two real
historical lines into the tree and requires the gate to fail on each.

**All evidence produced through those wrappers before 2026-09-06 is
non-authoritative** and has been regenerated: ledger reconciliation, the
canonical binding proof, the fixture and canonical-authority prunes, the stale
fixture audit, and the host inventory.

## RA-082 — one proof answered to many spellings, and real proof references were published

- **Found:** 2026-09-11 (the owner typed `…BYNO` — letter O — and got "Pagamento verificado" for `…BYN0`)
- **Status:** FIXED (2026-09-11; 099bbf77 … and the one-URL/leak-guard follow-up)

A proof reference is an exact identifier and a bearer capability. It had
several spellings:

- `/verificar` (226f63c2) read O as 0 and I/L as 1, upper-cased, trimmed,
  re-hyphenated and fished a reference out of pasted text — the owner's case.
- The gateway trimmed the reference before classifying it (`strings.TrimSpace`,
  which strips Unicode space too): `/v1/public/proofs/<ref>%20`, a tab, a
  newline or an NBSP answered with the proof.
- `banzami.com/r/` accepted a percent-escaped canonical character (`%30`,
  `%2D`), and Next redirected `/r/<ref>/` and `//r/<ref>` to the canonical page.
- admin-api read a proof's verification history with `upper()=upper()`.
- Both nginx edges masked a logged reference only when it began `BZM-`; any
  other first character wrote it whole.

Separately, three real Sandbox SECURE_V1 references and the historical legacy
receipt's reference had been committed to tests and documentation of a public
repository. They are replaced in source (synthetic references, checked absent
from the Sandbox) and remain exposed in git history, which is not rewritten.

Now: one grammar (`services/common/documents/proof_reference.go`, sharing the
generator's alphabet constant); nothing trims, folds, decodes twice or repairs a
look-alike, anywhere; the website edge and middleware give `/r/` one spelling;
the history query is exact; the nginx mask cuts any segment to 8 characters.
Guards, each mutation-proven: the gateway route test (every alias, zero database
connections), Unicode-wide alphabet parity, the website parser and `getProof`
(no request for an alias), `tests/ops/proof-url-one-spelling`,
`tests/ops/nginx-proof-log-redaction`, and `tests/ops/proof-reference-literals`
with its register `tools/assurance/synthetic-proof-references.txt` (any
unregistered concrete reference in any case fails CI; the Sandbox harness proves
the register holds no real proof). All `tests/ops` guards now run in CI — only
four of twenty-five did.

## RA-083 — the Sandbox disk filled during a deploy, and a hand cleanup deleted provenance

- **Found:** 2026-09-11 (public-api build: `no space left on device`, 32 MB free on `/`)
- **Status:** FIXED (capacity gate + reclaim in the deploy); provenance loss is permanent

Four full deploys in one day filled the Sandbox root filesystem — the same disk
PostgreSQL writes to. The native build (`remote-native-build.sh`) had no
capacity check (the documented capacity gate covers only the local release
package), and nothing ever reclaimed BuildKit cache (83 GB, none active),
superseded deploy image tags (76) or unpacked releases (23).

Recovering space by hand, I deleted every file older than 24 h in
`banzami-source-deploy/staging/` — 506 files. That directory holds each
bundle's `.manifest.json` and `.sha256` beside the archive, and the release
runbook says manifests are **never** deleted. About 168 bundle manifests went
with the archives; none were in the local store (which keeps only recent ones).
What remains: the 167 server deploy receipts (commit short SHA → image id →
health) and git history, so commit → runtime still resolves; the bundle
checksums of those older deploys are lost. The same happened in the earlier
cleanup of this session. Nothing else was touched: no database, volume,
secret, running image or receipt.

Now the native build gates capacity **before** building (≥ 12 GiB free, after
one reclaim) and reclaims **after** every successful deploy, through one
function that may only remove BuildKit cache older than 24 h, deploy image
tags beyond the two newest per service that no container runs, unpacked
releases beyond the three newest (never the current deploy or a
current/previous target), and bundle **archives** older than a day — never a
manifest, checksum or receipt. `tests/ops/native-build-reclaim.test.mjs`
checks every deletion in that function and the gate's position; both
mutation-proven.

## RA-084 — anyone could confirm a Sandbox payment: the callback secret was a public default

- **Found:** 2026-09-11 (full-system assurance, environment/secret domain)
- **Status:** FIXED

`AppState::new` read `ACQUIRING_WEBHOOK_SECRET` with a fallback to the literal
`change-in-production`, and the Sandbox core never set it (verified on the
running container: unset). The simulated acquirer verifies callbacks to the
public `POST /v1/callbacks/emis` with that secret, so anyone who read the
source could sign a callback for any pending acquiring payment and confirm it:
merchant wallet credited, payment link marked paid, `payment_link.paid` sent to
the integration — DOA included. The callback's own amount had to match since
dc8d2f40, which bounded the value but not the forgery. The same code logged the
**expected** signature on every mismatch (a valid signature for that body, in
the logs) and compared with a byte-wise `!=`. `QR_SIGNING_KEY` fell back to a
development key the same way; impact is low because a dynamic QR is verified
against its database record (owner, amount, currency, expiry), not the
signature alone.

Now: LIVE core refuses to boot without either key (and refuses the old default
as the callback secret). An unset Sandbox callback secret is 32 random bytes
drawn at boot and never exported — the simulated rail signs and verifies inside
one core request, so nothing outside needs it. The Sandbox QR key stays stable
on purpose (changing it would void every unexpired Sandbox QR). `EMISProvider::
from_env` no longer invents a secret. Both providers verify through
`signature_is_valid` (constant-time `Mac::verify_slice`) and log no signature.
Tests: `state::secret_tests` (six) and `providers::tests::
only_the_secret_signs_a_callback`; mutations restoring the default (three
fail) and accepting any 32-byte tag (fails) are caught.

## RA-085 — a forced log rotation left `docker logs --tail` hanging on every container

- **Found:** 2026-09-11, minutes after installing log rotation (RA-082 follow-up)
- **Status:** FIXED on the edges; stack services recover on their next deploy;
  PostgreSQL and Redis deliberately not restarted

I installed a logrotate stanza for `/var/lib/docker/containers/*/*-json.log`
with `copytruncate` and forced one rotation, to move the pre-redaction access
lines (223 and 96 naming a reference) out of the two nginx edges' active logs.
The rotation itself worked — the active logs hold 0, the old content sits in
two root-only rotated files, nothing was edited line by line — but Docker's
`json-file` logger keeps its own count of bytes written, and `docker logs
--tail` reads back from that count: on a file truncated underneath it, every
`--tail` hung (15 s timeouts on all 14 containers; a fresh container tailed in
18 ms). `--since` and plain `docker logs` still worked, and nothing was lost.
The stanza would have repeated this daily.

Now: the stanza is removed; a daily job deletes only rotated copies
(`<id>-json.log-*`) older than 14 days and never a live log
(`infra/sandbox/log-retention/`, guard `tests/ops/container-log-retention.test.mjs`
— it also fails on any host config that truncates a live Docker log; three
mutations caught). The two nginx edges and the webhook sink were restarted
(under a second each; `--tail` works again); the stack services are recreated
by every deploy. Live-log size caps need `log-opts` at container creation —
open for the long-lived containers (docs/operations/LOG_RETENTION.md).


## RA-086 — developer-api chose "development" when ENVIRONMENT was missing

- **Found:** 2026-09-11 (full-system assurance, fail-open review)
- **Status:** FIXED

`developer-api` defaulted `Environment` to `"development"`, and
`"development"` switches on the Sandbox privileges there (operator fixture
keys, the self-service path into a financial owner). The Sandbox sets
`ENVIRONMENT=sandbox`, so nothing ran wrongly — but a Live deploy that forgot
the variable would have started with them. Every other service already failed
closed (the canonical `env.Parse` maps anything but SANDBOX/LIVE to Unknown,
which grants nothing). Now `developer-api` refuses to start without
`ENVIRONMENT`. Test: `internal/config/config_test.go` (mutation: restore the
default → fails).

## RA-087 — a frozen account could still send, pay and withdraw

- **Found:** 2026-09-11 (operator control plane review)
- **Status:** FIXED (outgoing money); inflows to a frozen merchant by QR/P2P and
  application settlements from it remain open

An operator freeze (`account_freezes`, admin-api `POST /admin/v1/risk/freeze`)
was read by five routes — deposits, pay-link payment, payment requests,
acquiring credit, restitution — and by none of the routes that move a frozen
party's money out: P2P transfers (by id and by @banza), QR payment, merchant
payouts, wallet-account transfers. And `is_frozen` answered `false` on any
database error, so the five routes that did read it failed open.

Now `is_frozen` returns the error, every existing caller fails closed, and
`risk::ensure_not_frozen` (422 `ACCOUNT_FROZEN`) guards the four outgoing
routes. Tests: `core/api/src/routes/freeze_tests.rs` — freeze through the
operator route, the debit is refused and no ledger balance moves, lift, the
same call is no longer refused; plus an unreadable freeze refuses. Six
mutations (each guard removed, the error fallback restored) each fail exactly
their test. The BANZADMIN runbook matrix (stale since 0c408676 for
application approval and dispute resolution) is corrected and documents what a
freeze stops.

## RA-088 — a fully refunded payment could keep a proof that verified as paid

- **Found:** 2026-09-11 (receipts/proofs review)
- **Status:** FIXED

Refund and dispute restitution flipped the source's proof to `REVERSED` after
committing the money movement, on the pool, ignoring the error. A failed write
(lock timeout, connection loss, a trigger) left the payment fully refunded and
its public proof still `CONFIRMED` — a receipt that verifies a payment the payer
got back. The flip now runs inside `apply_restitution`'s transaction, when the
cumulative restitution reaches the captured amount: both happen or neither.
Test: `a_full_refund_whose_proof_cannot_be_reversed_does_not_happen` (a
trigger refuses the proof write → the refund fails, nothing is restituted, the
proof is unchanged); the original post-commit write fails it.

## RA-089 — one BANZADMIN TOTP code could open several sessions at once

- **Found:** 2026-09-11 (operator auth review)
- **Status:** FIXED

`MFAService.Verify` read `last_step`, refused a step at or below it, then
wrote the new step unconditionally. Logins racing with the same code all read
the same `last_step` and all passed: in the test, 5 of 12 concurrent logins
were accepted on one code. The step is now claimed by a conditional UPDATE
(`last_step IS NULL OR last_step < $step`); only the login that moves it
forward is admitted. Test: `TestMFAVerify_OneCodeOneLoginUnderConcurrency`
(DB-backed; the admin-api CI job now has a database so it runs there).
Logout remains a client-side clear by design — server revocation is the
audited "Terminar as minhas sessões" (token_version).

## RA-090 — two SUPER_ADMINs could suspend each other and leave none

- **Found:** 2026-09-11 (operator control plane review)
- **Status:** FIXED

The "last SUPER_ADMIN" guard counted non-suspended SUPER_ADMINs and then, in a
separate statement, applied the demotion or suspension. Two SUPER_ADMINs
acting on each other at the same moment both counted two and both succeeded:
the console was left with nobody who could administer it (reproduced in the
test on the first rounds). `SetOperatorRole` and `SetOperatorStatus` now apply
the change and recount inside one transaction, serialised by an advisory lock,
and roll back with `ErrLastSuperAdmin` (409 `LAST_SUPER_ADMIN`) if it took the
count from one or more to zero. Test:
`TestLastSuperAdmin_ConcurrentSuspensionsLeaveOne` (10 rounds); removing the
recount, or only the lock, each fail it.

## RA-091 — a Redis outage removed every per-IP credential limit on the gateway

- **Found:** 2026-09-11 (fail-open review)
- **Status:** FIXED

`RateLimitPerIP` / `RateLimitPerIPWindow` — the limits on `/v1/auth/token`,
merchant sign-in, handle lookup, refresh, public onboarding, application
submission and developer-key introspection — passed every request through when
Redis was unconfigured or erroring. One Redis failure lifted the brute-force
ceiling from all of them at once. They now fall back to the same limit counted
in the process (per instance, weaker than a shared count, never absent). The
general traffic limiter still fails open, by design, for availability. Live
probe: 20 admin logins/min per client → 429 with `Retry-After`, and rotating
`X-Forwarded-For` / `X-Real-IP` / `True-Client-IP` does not reset it (the edge
takes the client from `CF-Connecting-IP` for Cloudflare ranges only).
Test: `TestRateLimitPerIP_WithoutRedisStillLimits` (no Redis / Redis down);
the pass-through restored fails both.

## RA-092 — a Business application's capability id was written whole to the logs

- **Found:** 2026-09-11 (log privacy review)
- **Status:** FIXED

The public onboarding routes take the application id as the applicant's
capability — "the unguessable capability token" (server.go):
`/v1/merchant/applications/{id}` (status), `…/documents` (list),
`…/documents/upload-url` (upload), `…/resubmit`. Whoever holds it can read the
application's status and document list and add KYB documents. It was written
whole by every nginx server (the redaction map knew only proof references and
API keys), by the Go request loggers and the Developer API request log
(`obs.RedactPath`), and as a structured field by nine gateway log lines.
Now: `obs.RedactPath` keeps 8 characters of an application id in any UUID
spelling (plain, upper case, `{…}`, `%7B…%7D`, `urn:uuid:`); a second nginx map
stage does the same on both edges and is what the log format writes; the nine
log fields go through `obs.MaskID`. Guards: `TestRedactPath_ApplicationID`,
`TestMaskID`, `tests/ops/nginx-proof-log-redaction.test.mjs` (stage two, both
edges equal, the log format writes it), `tests/ops/application-id-log-masking.test.mjs`
(any unmasked `"application_id"` log field). Each mutation-proven. Probed live on
the Sandbox edge with a synthetic id: prefix only.

## RA-093 — a hygiene sweep wrote into DOA's tenant; the Sandbox pilot cap refuses new funding

- **Found:** 2026-09-11, by my own run of `fixture-hygiene-suite.sh`
- **Status:** guard FIXED; two DOA sub-accounts left for the owner's decision;
  the pilot cap is an owner decision

**What I did.** I ran `fixture-hygiene-suite.sh` to measure fixture leakage,
taking it for a read-only check because it writes nothing itself. It runs every
stateful harness — including the nine that act inside DOA's real Project or
Business. Measured afterwards (read-only): no DOA ledger entry, payout, payment
link or delivery; no application settlement created or completed anywhere (the
preserved DOA settlement untouched). But `campaign-payment-segregation.sh`
opened two CAMPAIGN sub-accounts in DOA's wallet ("Campanha A/B — demo",
balance 0) before it stopped. Earlier runs had left eight more: DOA holds ten
such empty demo accounts. They were not closed — the standing rule is never to
mutate canonical @doa state to clean fixtures — and are listed for the owner.
Three payment links on synthetic fixture merchants (`@synthetic.test`) were
left ACTIVE by harnesses that could not pay them; they were cancelled through
the API as their owners (open links back to 7).

**The guard.** The suite now skips any harness that names DOA's Project,
@doa or doadoa.app unless `BANZAMI_ALLOW_DOA_TENANT_WRITES=1`, detected from
the harness source; `--list` shows the selection without touching the Sandbox.
`tests/ops/fixture-suite-doa-tenant.test.mjs` fails if a default run would
include one. DOA being used as the test tenant of nine harnesses is itself the
defect — "DOA must never be special as a Banzami tenant" — and moving them onto
a generic fixture Project is open.

**Why most harnesses failed.** Core refuses every Sandbox top-up with
`422 PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED`: the pilot overlay
(`BANZAMI_PILOT_LIMITS=1`) caps synthetic funds in circulation at Kz 500 000,
and the cap is reached. New consumers start at zero and cannot be funded, so
harness payers hit `INSUFFICIENT_FUNDS`. Raising or resetting the cap is a
product decision. public-api reported that refusal as `500 INTERNAL_ERROR`; it
now answers `422` with core's code (`sandboxCreditRefusal`, tested).

## RA-094 — any container on the Sandbox network could call Core's /internal routes

- **Found:** 2026-09-11 (residual of the full-system assurance; closed in the closure phase)
- **Status:** FIXED

Core authenticated two route groups — refunds (`CORE_INTERNAL_KEY`) and payee
validation (`CORE_PAYEE_VALIDATION_KEY`). Every other `/internal` route — transfers,
wallet credits, payouts, settlements, application settlements, freezes, merchant
creation, pricing — answered whoever reached Core's port. Nothing public reaches it
(no edge routes `/internal`), but every Sandbox container shares the network: a
compromised pay-frontend or admin-frontend could have moved money directly.

Now the general group is behind the existing `internal_service_auth` check on
`CORE_INTERNAL_KEY` (constant time, fails closed on an unset key), with one
exception: a request from Core's own loopback — only a process inside Core's
container can originate there, i.e. `docker exec` on the host, which already holds
every secret. The four Go services send the key on every Core call through their
HTTP transport (8028dab6, deployed first so the gate never outran its callers); a
request that already names a dedicated key keeps it. `/health` stays open.
Guards: `general_gate_tests` (no key / wrong key → 401, key → accepted, loopback →
accepted, no connection info → not loopback), `tests/ops/core-internal-routes-gated.test.mjs`
(every `/internal` route literal sits inside an authenticated group; a route added
outside them fails — mutation-proven), and a per-client test that each Go client
sends the key.

## RA-095 — a freeze stopped half the account: money still reached a frozen party

- **Found:** 2026-09-11 (residual of RA-087; decided in the closure phase)
- **Status:** FIXED — ACCOUNT_FROZEN is a full freeze

No ADR or operator copy defined a freeze, and the behaviour was split: a frozen
consumer could not deposit and a frozen merchant's acquiring credit was withheld —
inflows — while P2P transfers, transfers by id and QR payments *into* a frozen
party went through. The existing precedents (deposits, acquiring, the requester of
a payment request) made one policy consistent: **nothing leaves or reaches a frozen
account.** The transfer engine now reads the freeze of both parties inside the
transfer's own transaction (`TransferError::AccountFrozen` → 422 `ACCOUNT_FROZEN`),
covering P2P, transfers by id, QR and link payments. Consumer pay-links check the
receiver; application settlements check source and beneficiary at creation and at
completion; restitution checks the receiving consumer. Runbook updated. Tests:
`a_frozen_consumer_receives_nothing`, `a_frozen_merchant_receives_nothing`
(balances unchanged, the lift restores the payment); disabling the engine check
fails both.


## RA-096 — a paid Payment Session kept a payable QR for 89 days

- **Found:** 2026-09-11 (latent L01 of the full-system assurance; closed in the closure phase)
- **Status:** FIXED (code + migration 0127)

A fixed-amount session provisions a payment link and a dynamic QR. When one paid it,
the session became PAID and the other interface stayed ACTIVE: all 56 PAID sessions
on the Sandbox still held a live dynamic QR (89-day expiry). No route pays a dynamic
QR today (core `qr::pay` has no public caller since RA-053), so nothing was paid
twice — the day one exists, every one of them could have been. The statement that
marks a session PAID now retires the other interface in the same SQL (QR → EXPIRED,
link → CANCELLED); the interface that paid is untouched. Migration 0127 repairs the
sessions paid before. Counter `PAID_SESSIONS_WITH_A_PAYABLE_INTERFACE` (0 on a clean
database, moves for an injected one). Test `paying_a_session_retires_its_other_interface`
(both directions); dropping the sibling update fails it.

## RA-097 — the fixture sweeps chose merchants by the Console's own email domain

- **Found:** 2026-09-11 (closure phase, before the synthetic-residue retirement ran)
- **Status:** FIXED (new tool; the old sweeps are not used)

Every merchant the Developer Console provisions for a Sandbox project gets an
address at `projects.banzami.test` — a real developer's as much as a harness's. A
selection that treated that domain as proof of "synthetic" matched
`Sandbox · DOA Sandbox`, DOA's earlier project tenant, and would have suspended it
and closed its accounts. The dry run of the first draft of the new retirement tool
showed it; nothing had run. The existing sweeps (`tools/ops/prune-fixture-authority.sh
--apply`, `tools/ops/sweep-console-fixtures.mjs`, `tools/e2e/console/lib/run-cleanup.mjs`)
also mutate by raw SQL, which this phase forbids.

`tools/ops/retire-synthetic-residue.sh` replaces them for this purpose. A selection is
positive: a harness name shape, a true test domain (`synthetic.test`,
`banzami-e2e.test`, …), or a binding to a harness project. DOA's two workspaces are
excluded as a whole. Every change is a canonical API call (payout fail, link cancel,
fund retirement to transit, account close, key revoke, webhook deactivate, project
retire, merchant/consumer suspend), dry-run by default, BEFORE/AFTER counts printed.
`tests/ops/retire-synthetic-residue.test.mjs` runs the shapes against real and harness
names; re-adding the Console domain, dropping the DOA exclusion or adding a row write
each fail it.

## RA-098 — a session paid on the hosted checkout stayed open, with a payable QR

- **Found:** 2026-09-11 (closure phase, while checking what blocks closing synthetic accounts)
- **Status:** FIXED (code + migration 0128)

The hosted acquiring rail (pay.banzami.com: the provider callback, and the Sandbox's
simulated confirmation) credited the session's account and marked its link USED, and
never told the session. Only the wallet rail (public-api link pay) called the session
settlement. 52 sessions on the Sandbox — the newest paid that morning — were ACTIVE
beside a USED link, each with a dynamic QR payable for 89 days, and the integrator
that created them never received `payment_session.paid`. It also blocked closing
their accounts: an open session is one of the things a close refuses.

Core's acquiring settlement now pays the session itself, after the credit commits and
again on a replayed confirmation (a crash between the two is healed by the provider's
retry): PAID, the QR retired, `payment_session.paid` naming the acquiring payment. No
wallet payment is recorded and `refund_source` is null — nothing was paid from a
wallet, and this rail has no typed refund source (open finding, not addressed here).
Migration 0128 repairs the sessions paid before; no event is sent for them. Counter
`SESSIONS_OPEN_AFTER_THEIR_LINK_WAS_PAID`. Tests
`a_session_paid_on_the_acquiring_rail_is_paid` and
`a_retried_confirmation_pays_a_session_the_first_one_missed` — removing either call
fails its test; `tests/ops/migration-0128-sessions-paid-on-hosted-rail.test.mjs`.

## RA-099 — an unpaid Payment Session could never end

- **Found:** 2026-09-11 (closure phase)
- **Status:** FIXED (code)

`CANCELLED` has been a session state since 0085 and nothing could reach it. An unpaid
session stayed open for good: its link and its dynamic QR stayed payable into the
account, and the account could never be closed, because a close refuses an open
session. The harnesses "cleaned up" a session by cancelling its link, which left
the session and its QR open. Core now has `POST /internal/v1/payment-sessions/:id/cancel`
(owner-scoped, operator route): the session, its link and its QR end in one statement;
a session paid even in part is refused (`SESSION_PAID`); repeating it answers with the
session as it is. `tests/phase0/lib/e2e-run.sh` and
`tools/ops/retire-synthetic-residue.sh` use it. Not exposed on the public API or the
SDKs — an integrator-facing cancel, with its event, is a protocol question (BANZA
ADR-043), not an operator one. Test `an_unpaid_session_cancels_with_its_interfaces`;
dropping the owner scope or the link update fails it.

## RA-100 — only a deployment value kept Sandbox KYB documents out of the Live bucket

- **Found:** 2026-09-11 (closure phase, §11 KYB R2 boundary)
- **Status:** FIXED (code)

The gateway stored KYB documents in whatever `KYB_STORAGE_BUCKET` named. The Sandbox
names `banzami-kyb-sandbox`, correctly — and nothing in the code would have noticed
`banzami-kyb-live` there, or the reverse. `kybstorage.NewFromConfig` now takes the
gateway's environment and refuses a bucket that does not name it, or names the other
(`ErrBucketEnvironment`); positive, so a bucket named for neither is refused too. The
gateway then runs with document storage disabled (the document endpoints answer 503)
instead of writing anywhere. Test `TestBucketMustBelongToTheEnvironment` (seven cases).

## RA-101 — a retried settlement was told it had failed

- **Found:** 2026-09-11 (closure phase, by the rewritten economic-model smoke, case C)
- **Status:** FIXED (core + gateway)

`POST /v1/application-settlements` names no amount: the gross is the source
account's balance when the request runs. A client whose first response was lost
retried with the same idempotency key, found the account already emptied by its own
settlement, and was answered `422 NOTHING_TO_SETTLE` — told it had failed when it had
not. Core's idempotency could not help: the retry's gross (0) differed from the
original's, and a different request under a known key is refused. Nothing moved
twice; the client was misinformed. The gateway now reads the key first
(`GET /internal/v1/application-settlements/by-idempotency-key/:key`, new) and answers a
retry from the same caller, for the same source and beneficiary, with the settlement
it made (200; completed if it was left CREATED/PENDING). The same key for anything
else is `409 IDEMPOTENCY_CONFLICT`, which says nothing about the settlement that owns
it. Tests `TestBusinessSettlement_RetryAnswersWithTheSettlementItMade` (removing the
lookup or the ownership check fails it) and `create_then_complete_via_api`.

## RA-102 — the developer docs sent account transfers to a route that was withdrawn

- **Found:** 2026-09-11 (closure phase, transfer-devkey-e2e.sh after its DOA conversion)
- **Status:** FIXED (docs, harness, Dart test)

The rename that dropped the `/business` namespace (8327a9cd) rewrote
`/v1/business/transfers` as `/v1/transfers` — the gateway route withdrawn for
security (SEC-015) — instead of `/v1/wallet-account-transfers`, where account-to-account
transfers are served. The public reference's curl example, the English credential
note and the machine-readable availability file sent a developer to a 404; the
Portuguese page had it right. The harness that proves transfers, and the Dart
client's publishable-key test ("it cannot transfer"), had been probing the missing
route. All now name `/v1/wallet-account-transfers`; the harness passes 20/20. The same
rename had also turned the refund harness's retired-path probes into live-path ones
(fixed with the DOA conversion, `refund-devkey-e2e.sh`).

## RA-103 — consumers created outside onboarding were missing from the @banza namespace

- **Found:** 2026-09-11 (full-system assurance, handle invariants)
- **Status:** FIXED (code + migration 0129)

`handle_registry` is the one table every @banza lookup routes through. Onboarding
(consumer-wallets) writes a consumer's handle there; the identity path (core/identity,
behind `POST /internal/v1/consumers`) wrote `consumers` only. 26 consumers created since
2026-09-09 were missing — two of them real people. None could be named as a settlement
party, and a Business could have registered the same name: one @banza, two possible
owners. The identity path now writes the identity and its registry entry in one
transaction, and a name already held by anyone is refused (`HandleTaken`), leaving no
consumer behind. Migration 0129 registers the consumers it missed (only names nobody
holds; none collided). Counter `CONSUMER_HANDLES_OUTSIDE_THE_NAMESPACE`. Tests
`created_consumer_is_in_the_handle_registry`, `a_name_a_business_holds_is_refused_and_nothing_is_written`
(dropping the registry insert fails both), `tests/ops/migration-0129-consumer-handles-registered.test.mjs`.

## RA-104 — a Business could read another's transaction and revoke another's API key

- **Found:** 2026-09-11 (full-system assurance, authority audit A1-01/A1-02)
- **Status:** FIXED (core + gateway)

`GET /v1/transactions/{id}` passed the id to core's `GET /internal/v1/transactions/:id`,
which read by id alone; the gateway's comment said the merchant was "validated in the
handler" and nothing compared it. Any merchant JWT or bound developer key holding
another Business's transaction id read it. `DELETE /v1/merchants/{self}/api-keys/{key}`
reached core's revoke with the caller's own merchant in the path, and core bound that
segment and threw it away (`Path((_, key_id))`): naming another Business's key id
switched off its integration. Core now requires the owner on the transaction read and
revokes `WHERE id AND merchant_id`; both answer 404 for another Business's resource,
the same answer as for none, and the gateway compares the transaction's owner as well.
Tests `tenant_scoping_tests::{a_merchant_reads_its_own_transaction_and_not_anothers,
a_merchant_cannot_revoke_another_merchants_key}` (real DB; removing either guard fails
its test at the cross-tenant assertion) and `TestTransactionGet_IsScopedToTheCaller`.

## RA-105 — an identifier pasted into a core path could rewrite the request's scope

- **Found:** 2026-09-11 (full-system assurance, token canonicality audit A3-01/A3-02)
- **Status:** FIXED (gateway)

The router hands a path parameter over already decoded, and ~50 gateway call sites
pasted it into core's URL unescaped. A refund id written `<victim>%3Fmerchant_id=<victim
business>&x=` arrived with a literal `?`, was pasted in front of `?merchant_id=<caller>`,
and core — which scopes the refund by that query value — returned the victim's refund
(reproduced through the real handler). `source_id` was appended to the list query raw;
`/public/profiles/%2564oa` was decoded twice and answered for @doa. Every segment and
query value is now escaped at its call site, and the core client refuses any path an
identifier could have reshaped — a second `?`, a repeated query key, a dot segment, a
fragment or whitespace — before sending it, answering not-found. Tests
`core_path_test.go` (reverting the escape and the guard together shows core scoped by
the victim; either alone still holds).

## RA-106 — a Console workspace could revoke another workspace's invite

- **Found:** 2026-09-11 (full-system assurance, A1-03 / A9-10)
- **Status:** FIXED (developer-api)

`DELETE /workspaces/{ws}/invites/{invite}` checked that the caller managed `{ws}` and
then revoked the invite by id alone — and anyone can create a workspace and own it. The
revoke is now `WHERE id AND workspace_id`; another workspace's invite answers 404. The
accept wrote `accepted_at` without re-reading the invite's state, so a revoke that
landed between the service's check and that write lost; the accept now only takes a
pending, unexpired invite, and a lost race answers "invite no longer valid". Tests
`TestRevokeInvite_AnotherWorkspacesInviteIsNotFound` and the real-database
`TestPgInvite_ScopedRevokeAndPendingOnlyAccept` (dropping the workspace scope or the
accept's state check each fails it).

## RA-107 — an abandoned factor replacement left BANZADMIN one password from a session

- **Found:** 2026-09-11 (full-system assurance, operator audit A5-01/A5-02)
- **Status:** FIXED (admin-api + migration 0130)

Starting a factor replacement overwrote the confirmed TOTP secret and set
`confirmed_at` back to NULL. Until the operator confirmed the new app, the account
behaved as never-enrolled: login with the password alone returned an enrolment token,
enrolment was allowed (nothing was confirmed), and confirm + acknowledge ended in a
session — for a SUPER_ADMIN too. The handler test that covered it stopped at "an
enrolment token, not a session", and its fake copied the defect. The new seed now waits
in `pending_secret_encrypted` (migration 0130, additive); the confirmed factor keeps
guarding every login and is swapped only when a code from the new authenticator
verifies, in a statement conditioned on that same pending seed. Confirming a new factor
ends every other session (token version). Separately, a wrong second-factor code never
fed the account's failure counter, so guessing a six-digit code was limited only per
IP; wrong codes now count with wrong passwords (five lock the account for 15 minutes,
ending all its tokens), a locked account's code is not checked, and only something
shaped like a recovery code reaches bcrypt. Tests
`TestMFAReplacement_TheOldFactorGuardsUntilTheNewOneIsProven` (real DB; restoring the
old reset fails it), `TestMFA_WrongCodesLockTheAccountAndEndItsTokens`,
`TestMFARecoveryCode_OnlyItsShapeReachesBcrypt`, and the corrected
`TestMFA_ReplacementNeverLeavesASuperAdminWithoutAFactor`.

## RA-108 — an operator could suppress their own audit row by disconnecting

- **Found:** 2026-09-11 (full-system assurance, operator audit A5-03)
- **Status:** FIXED (admin-api)

`admin_audit_log` is written after the action commits, with the request's context. A
client that disconnects cancels that context; the insert failed and only a log line
remained — while approve, reject and reissue send email synchronously first, giving the
operator hundreds of milliseconds to abort. Core records these actions as "ADMIN", so
the audit row is the only record of who acted. The write is now detached from the
request (bounded at five seconds). Test `TestAuditWrite_SurvivesTheClientGoingAway`
(real DB; with the request's context it records nothing).

## RA-109 — a fully refunded wallet payment still verified as paid

- **Found:** 2026-09-11 (full-system assurance, surfaces audit A7-01)
- **Status:** FIXED (core + migration 0131)

A full refund reverses the source's proof (RA-088) — but it looked the proof up by the
source's transaction id, and a wallet payment has none: its operation is the transfer,
and since one proof per operation its proof is keyed on the transfer id (older proofs
on the wallet payment itself). Every fully refunded wallet payment kept a CONFIRMED
proof, and `/r/`, the PDF and the app's comprovativo kept saying "Pagamento verificado"
for money that had been given back — four in the Sandbox, 8 000 Kz. The refund now
reverses both keys when the allocations reach the amount; migration 0131 moves the
proofs it missed (status only, forward only, dated by the refund that completed them).
Counter `PROOFS_CONFIRMED_FOR_FULLY_REFUNDED_WALLET_PAYMENTS`. Tests
`a_fully_refunded_wallet_payment_proof_is_reversed` (real DB; with no proof keys it
fails at the full refund, and a partial refund leaves the proof standing),
`tests/ops/migration-0131-refunded-wallet-payment-proofs.test.mjs`, and the counter's
case in `financial-assurance-sql.test.mjs` (counting any refund, not a full one, fails
it).

## RA-110 — the official PDF said "Confirmado" for operations that were not

- **Found:** 2026-09-11 (full-system assurance, surfaces audit A7-33)
- **Status:** FIXED (services/common/documents)

`statePT` turned CANCELLED, EXPIRED and every status it did not know into
"Confirmado", and the badge, hero line and footer always said the operation was
"confirmado… debitado e creditado", whatever the status. With RA-109 a refunded
payment's proof now really reads REVERSED, and its PDF would still have carried the
confirmed wording beside "Revertido". Only a confirmed status earns the confirmed copy
and the green mark; a reversed operation says it moved and was returned; anything else
says it did not complete, and an unknown status reads "Por confirmar". Test
`TestReceiptView_ClaimsOnlyWhatItsStatusAllows` (the old default and copy fail five of
its cases).

## RA-111 — a paid link could leave its Payment Session unpaid, silently and for good

- **Found:** 2026-09-11 (full-system assurance, fail-open audit A2-06/A2-07, surfaces A7-38)
- **Status:** FIXED (core + public-api)

After the transfer that pays a link commits, three things had to follow: the link
USED, the refundable wallet payment recorded, and the Payment Session the link belongs
to paid with `payment_session.paid` — DOA's payment signal. They were separate,
best-effort calls: public-api discarded the session call's result, core turned a
database error into "no session" and answered 204, and the record and the event were
`let _ =`. A transient fault left the payer debited and the link USED, with the session
ACTIVE, no event, no refundable object — and a retry was refused as LINK_NOT_ACTIVE, so
nothing ever healed it. An open-amount link recorded amount 0, which the table refuses,
so none of those payments could be refunded. On the acquiring rail a failed session
settle after the credit was dropped while the provider got 200. Now core's mark-used,
given the paying transfer, does all of it in ONE transaction (claim, record with the
transfer's own amount, session paid, event in the outbox); any failure rolls it back and
answers 5xx, and public-api tells the payer the payment was taken but not confirmed —
the retry replays the same transfer (its key names the link) and completes it. The
session settle and the acquiring settle return errors; the acquiring callback answers
5xx so the provider retries into the replay branch. Counter
`LINK_PAYMENTS_TAKEN_BUT_NOT_COMPLETED` (0 on the Sandbox). Tests
`link_completion_tests::{a_session_link_payment_completes_whole,
a_failed_completion_leaves_nothing_half_done_and_a_retry_completes_it,
an_open_amount_link_records_what_was_paid}` (real DB; swallowing the settle error or
recording 0 fails them), `TestPayLink_AFailedCompletionAsksForARetryAndIsOneCall`.

## RA-112 — payment_link.paid: sent for links nobody paid, missing for links that were

- **Found:** 2026-09-11 (full-system assurance, A2-07 fail-open, A4-08 route drift)
- **Status:** FIXED (core + gateway + E2E)

Three faces of one event. (1) On the hosted acquiring rail, core credited the merchant
and returned; the gateway then claimed the link and dispatched `payment_link.paid`,
best-effort — a link that expired between initiation and callback, or a transient
error, left the merchant credited, the link payable and no event, while the provider
was told 200 (and a core 5xx was answered 422, "refused for good"). (2) On the wallet
rail — a link paid from the Banzami app — nothing emitted `payment_link.paid` at all.
(3) `POST /v1/payment-links/{id}/mark-used` marked a link USED and sent
`payment_link.paid` with no money moving, beside a session left ACTIVE; the webhook
E2E used it as its event source, so the suite proved the event could be faked. Core is
now the one writer: the acquiring settlement claims the link (from ACTIVE, or EXPIRED —
the payer started in time and the money is confirmed), writes `payment_link.paid` and
settles the session in the credit's own transaction, and the wallet completion (RA-111)
writes it with its refund source. A failure rolls the credit back and the gateway
answers 502 so the provider retries. mark-used answers 410 for everyone. The webhook E2E
now pays its links on the Sandbox hosted rail and asserts the retired route produces
nothing. Tests `acquiring_settlement_tests::{the_link_is_paid_with_its_event_in_the_credits_transaction,
a_link_that_expired_while_the_payer_paid_is_recorded_as_paid,
a_failed_completion_rolls_back_the_credit_and_a_retry_settles_it}` (dropping the
completion or the EXPIRED claim fails them), the refund-source assertion in
`an_open_amount_link_records_what_was_paid`, `TestPayerPaths_LeaveTheLinkAndItsEventToCore`,
`TestEmisCallback_AnUnfinishedSettlementAsksForARetry`,
`TestPaymentLink_MarkUsedIsRetiredForEveryone`, `TestPaymentLink_RetiredMarkUsedEmitsNothing`.

## RA-113 — a payout that moved money without recording it could be failed without giving it back

- **Found:** 2026-09-11 (full-system assurance, fail-open audit A2-08)
- **Status:** FIXED (core/payouts + core/ledger)

`process` posts the net amount, then the fee, then records the net posting's id. The
net posting commits on its own, so a fault on the fee posting or on the id update sent
the payout back to PENDING with no posting id — money gone from the merchant's balance.
A later `fail` (or `return`) reversed only when that id was set, so it reversed nothing,
for good. And the reversal re-derived the fee as gross − net: had it run for a payout
whose fee posting was the one that failed, it would have "given back" a fee that was
never taken. The reversal now finds what moved by the payout's fixed keys
(`{key}:process`, `{key}:process:fee` — new `LedgerEngine::find_posting_by_key`) and
reverses each posting exactly; a PROCESSING payout with no recorded posting cannot be
marked SENT, and processing it again completes it without posting twice. Tests
`failing_a_half_processed_payout_returns_exactly_what_moved` (the id-only reversal
leaves the net debited) and `a_payout_without_its_posting_recorded_is_resumed_not_sent`.

## RA-114 — the gateway ran with no environment and let the caller pick one

- **Found:** 2026-09-11 (full-system assurance, fail-open audit A2-01)
- **Status:** FIXED (gateway)

`ENVIRONMENT` defaulted to "development", which the gateway reads as no environment at
all: the Live start-up refusals (no proof signing key, no webhook encryption key) and
the platform-mode guard switched off, and public onboarding took the environment from
the request body — anything but "SANDBOX" became LIVE, and approval then minted keys,
logins and activation tokens in the environment the caller chose. The local compose
file set no ENVIRONMENT for the gateway at all. The same "else LIVE" mapping sat in the
KYB upload, the application-to-KYB bridge and `/v1/me`. The gateway now refuses to
start without a declared ENVIRONMENT (as developer-api since RA-086); onboarding takes
the stack's environment and refuses when the stack has none; every mapping parses the
environment and refuses one it cannot name. Tests `TestLoad_RefusesToStartWithoutAnEnvironment`,
`TestSubmit_RefusesAnUndeclaredEnvironment`, `TestSubmitApplication_TheEnvironmentIsTheStacksNeverTheBodys`
(each fails on the previous code).

## RA-115 — PIN logins: no account limit for consumers, a raceable one for Businesses

- **Found:** 2026-09-11 (full-system assurance, auth audit A9-01/A9-03, A2-18)
- **Status:** FIXED (public-api + gateway + migration 0132)

A consumer's PIN login had no per-account limit at all — only 10 attempts a minute
per IP, per public-api instance — and the token it issues moves money
(`POST /v1/transfers` asks for no PIN); rotating addresses spends a per-IP limit, not an
account's. The Business App login had a limit, but read it, compared the PIN and only
then counted the failure: concurrent guesses all read "unlocked" (33 of 40 compared in
a race, where five was the limit), and the counter write's error was discarded, making
a failed write a free guess. Both now claim the attempt on the account before the PIN
is compared, in one statement that refuses a locked credential: five attempts, then
fifteen minutes, cleared by a correct PIN; a claim that cannot be written refuses the
attempt; an unknown consumer handle costs a bcrypt comparison like a real one.
Migration 0132 adds the consumer counter (additive). Tests
`TestVerify_WrongPinsLockTheAccountEvenUnderConcurrency` (50 racing guesses; without
the lock condition all 50 are compared) and
`TestVerifyHandlePin_ConcurrentGuessesCannotPassTheLimit` (the previous code compares
33 of 40).

## RA-116 — a revoked API key's token kept working for a day, and could mint a new key

- **Found:** 2026-09-11 (full-system assurance, auth audit A9-02)
- **Status:** FIXED (gateway) — residual noted

`POST /v1/auth/token` exchanged a merchant API key for a 24-hour, full-scope token that
is not checked against revocation on each request: revoking the key stopped new
exchanges and nothing else. And any merchant token — that one included — could call
`POST /v1/merchants/{id}/api-keys` and receive a fresh secret, so a leaked key could plant
its own replacement and outlive its revocation. The key-derived token now lives fifteen
minutes (the Business App's own access-token life; the SDKs re-exchange on expiry) and
carries its source (`src: api_key`); such a token cannot mint keys — a Business mints them
from the Business App or the Console. Tests `TestAPIKeyToken_IsShortLivedAndMarked`,
`TestCreateApiKey_AKeyCannotMintKeys` (the previous code fails both). Residual: a PIN
reset still ends app sessions only, not keys already minted from them (no "revoke all
keys" on credential reset yet).

## RA-117 — two operators could resolve one dispute both ways

- **Found:** 2026-09-11 (full-system assurance, operator audit A5-07)
- **Status:** FIXED (core)

`resolve` read the dispute's status outside any transaction, and both of its updates
were unconditional. Two operators resolving at once both passed the check: a
WON_BY_CONSUMER posted its restitution while a concurrent WON_BY_MERCHANT (or CLOSED)
overwrote the outcome — the dispute read "merchant won" with the money given back —
and two contradictory `dispute.resolved` events went out. The resolution now runs in one
transaction that locks the dispute's row, re-checks it is open, applies any
restitution, and updates on the condition that it is still open; the second resolver
waits on the lock and is told `DISPUTE_ALREADY_RESOLVED`. Test
`concurrent_opposite_resolutions_have_one_winner` (six racing resolutions; the previous
code lets several succeed).

## RA-118 — a core with no declared environment was Live, with simulators

- **Found:** 2026-09-11 (full-system assurance, fail-open audit A2-04/A2-15)
- **Status:** FIXED (core)

Core read a missing or unrecognised `ENVIRONMENT` as LIVE (and did not trim it, unlike
the Go services), and its refusals to run a simulated acquirer or a simulated KYC
provider were keyed on `APP_ENV=production` — which nothing in `infra/` sets. A Live
core would have booted with both simulators, the KYC one approving identities up to
Enhanced. Core now refuses to boot unless `ENVIRONMENT` names SANDBOX or LIVE
(trimmed, any case), and a LIVE core refuses unless `ACQUIRING_PROVIDER=EMIS` and
`KYC_PROVIDER=EXTERNAL`. The deployed Sandbox core declares `ENVIRONMENT=sandbox`. Tests
`only_the_two_universes_parse`, `boot_guard_tests::{a_live_core_refuses_simulated_providers,
a_sandbox_core_may_simulate}` (a guard that always allows fails the first).

## RA-119 — a KYB document could be accepted without ever being uploaded

- **Found:** 2026-09-11 (full-system assurance, operator audit A5-05)
- **Status:** FIXED (gateway)

The console disabled "Aceitar" for a document still PENDING_UPLOAD; the server did
not. Accept and reject were unconditional updates, so accepting a document whose file
never arrived counted it as present and approval then provisioned the Business with no
file in storage; a decided application's documents could be flipped afterwards. A
decision now needs an uploaded file (UPLOADED, ACCEPTED or REJECTED) of an application
still under review, in the UPDATE itself; otherwise it answers `DOCUMENT_NOT_UPLOADED`
or `APPLICATION_CLOSED` and changes nothing. Test
`TestDocumentDecision_NeedsAFileAndAnOpenApplication` (real DB; the previous code
accepts the never-uploaded document).

## RA-120 — "approve" lifted suspensions and cleared AML flags; compliance decisions erased each other

- **Found:** 2026-09-11 (full-system assurance, operator audit A5-06)
- **Status:** FIXED (core/compliance + admin-api)

`approve_merchant` set KYB and AML to APPROVED whatever they were: it silently lifted
a suspension and cleared an AML review flag, and the operator route asked for no
reason. Every compliance decision read the whole record, edited it and wrote it back,
so a concurrent AML flag and KYB rejection each overwrote the other. Each decision is
now one statement that moves only its own columns on the condition it needs: approval
is refused while KYB or AML is suspended and approves AML only while it is still
pending; an AML flag does not undo a suspension. The operator's approval requires a
reason, recorded in the audit. Tests
`approval_does_not_lift_a_suspension_or_clear_an_aml_flag`,
`concurrent_decisions_on_different_columns_both_stand` (real DB; the previous engine
fails both), `TestApproveMerchant_RequiresAReason`.

## RA-121 — every service could let an identifier reshape its call to core

- **Found:** 2026-09-11 (full-system assurance, extending A3-01 beyond the gateway)
- **Status:** FIXED (admin-api, public-api, developer-api; gateway moved to the shared guard)

RA-105 closed identifier injection into core paths in the gateway. The same
concatenation sat in admin-api (~67 call sites, including every operator action — an
id carrying `/../` reached a different core route than the operator's capability
names), public-api (including the transfer `cursor`, pasted raw) and developer-api. The
guard now lives in one shared module, `services/common/corepath` (one path, one query,
each key once, no dot segment, no fragment), used by every service's core and gateway
client; every pasted segment and query value is escaped. S3 signing code, which builds
`/bucket/key` for a signature and must not be re-encoded, is deliberately untouched.
Tests `corepath.TestWellFormed`, `TestCoreAdminClient_AnIdentifierCannotChooseTheRoute`
(unescaped and unguarded, the operator id reaches `/risk/freeze`), and the gateway's
`core_path_test.go`.

## RA-122 — operator routes that built a Business outside its lifecycle

- **Found:** 2026-09-11 (full-system assurance, operator audit A5-09, fail-open A2-11, privacy A6-04)
- **Status:** RETIRED (admin-api)

Five SUPER_ADMIN routes, reachable by API only (no console screen called them), sat
beside the one KYB authority: `POST /admin/v1/merchants` created a merchant and, with
`"sandbox": true`, approved its KYB and AML without an application in any platform
mode; `…/api-keys` and `…/resend-credentials` minted keys — resend always LIVE, the
secret returned to the operator and emailed in the clear, the old keys never revoked;
`…/wallets` hand-provisioned a wallet; `DELETE /admin/v1/merchants/{id}` hard-deleted
the merchant together with its KYB decision record and its keys, with no reason and no
snapshot. All five answer 410 `ROUTE_RETIRED`: a Business is created by an approved
application, keys are minted by the Business itself and shown to it once, and a
Business is suspended, never deleted. The console's unused client methods are removed.
Test `TestMerchantSetupRoutes_AreRetired`.

## RA-123 — unauthenticated reads served internal ids and consumers' private names

- **Found:** 2026-09-11 (full-system assurance, privacy audit A6-07, authority audit A1-04)
- **Status:** FIXED (public-api, gateway, Flutter models)

Four public, unauthenticated reads returned more than paying needs:
`GET /consumer/v1/payment-links/{slug}` carried the Business's merchant, wallet and
wallet-account ids (for DOA's campaign links, the campaign's ledger account);
`GET /consumer/v1/consumer-pay-links/{code}` and the gateway's
`/public/consumer-pay-links/{code}` carried the receiver's and the payer's consumer ids,
the transfer id and the receiver's private display name (ADR-024: a consumer is shown
by @banza on public surfaces); `/public/profiles/{handle}` carried the Business's
merchant and wallet ids. Nothing was directly exploitable, but these ids are exactly
what id-selector defects (RA-104, RA-105) feed on. Each response is now a payer-safe
projection; the Flutter models read the public shapes (an absent id falls back to the
slug or code). Tests `TestPublicReads_CarryNoInternalIds`,
`TestGatewayPublicReads_CarryNoInternalIds` (the previous handlers fail both),
`public_link_projection_test.dart`. A build of the apps from before this change fails to
decode these reads — rebuild the apps from main.

## RA-124 — anyone could page through the consumer directory, names included

- **Found:** 2026-09-11 (full-system assurance, privacy audit A6-08)
- **Status:** FIXED (public-api + Flutter client)

`GET /consumer/v1/consumers/search?q=` was public and unlimited, returned display names,
and passed `%` and `_` into core's `ILIKE '%…%'` — `?q=%%` listed everyone, and two- or
three-character queries paged through the rest. Search now requires a signed-in
consumer (30 queries a minute each), treats `%` and `_` as literal characters, and
returns @banza handles only; the app sends its token. Handle lookup
(`/v1/consumers/{handle}`) stays public — it confirms one name the caller already has.
Test `TestConsumerSearch_HandlesOnlyAndWildcardsAreLiteral` (the previous handler returns
the name and forwards the wildcards). To verify on the deployed runtime: the search
answers 401 without a consumer token.

## RA-125 — refund responses handed the payer's internal id to every caller

- **Found:** 2026-09-11 (full-system assurance, found while documenting A4-08)
- **Status:** FIXED (gateway)

`GET /v1/refunds`, `GET /v1/refunds/{id}` and the create response carried the payer's
internal `consumer_id`, the acquiring `transaction_id` and the `wallet_id` to any caller
with `refunds:read` — a Project key included (only `merchant_id` was stripped for
keys). A refund is addressed by its public typed source (`source_type`, `source_id`);
none of the three is now sent. Test `TestRefundResponse_CarriesNoPayerOrInternalIds`.

## RA-126 — capability tokens and personal data in query strings reached the edge logs

- **Found:** 2026-09-11 (full-system assurance, privacy audit A6-01/A6-02/A6-03, auth audit A9-07)
- **Status:** FIXED (both edges' nginx config; applied with the edge/website deploy)

The redaction maps covered proof references (RA-092) and application ids in paths
only. Query strings were logged whole: an operator's invite or reset token
(`/reset-password?token=` — whoever reads it sets the password and enrols their own
factor), a Business activation token (`/comerciantes/activar?token=`, it sets the PIN),
an applicant's status reference (`?ref=<application id>`), a developer's email
(`?email=`). And nginx's error log, with no directive, copied request lines and the
Referer unredacted on every upstream failure. A third map now cuts every query to
`?...`, the access format records `$upstream_status` so upstream failures stay visible,
and the error log keeps only critical conditions. Validated with `nginx -t` in the edge
image and a live probe (the log reads `GET /reset-password?... ` and `GET /r/BZM-7K2M...`).
Guard `tests/ops/nginx-query-log-redaction.test.mjs` (logging stage two instead of
stage three fails it).

## RA-127 — every official webhook verifier accepted an empty secret

- **Found:** 2026-09-11 (full-system assurance, fail-open audit A2-03; token audit A3-04)
- **Status:** FIXED (TypeScript, Go, Python and PHP SDKs; the Laravel, generic-node and generic-php plugins)

An integration that never configured its webhook secret verified against `""`: the
Laravel plugin defaults `BANZAMI_WEBHOOK_SECRET` to empty, and the SDK verifiers ran the
HMAC with whatever key they were given — so an event signed with the empty key (a
forged `payment_link.paid`, say) was accepted and goods shipped. Every verifier now
refuses an empty or blank secret, and the Laravel controller answers 500 "not
configured" instead of verifying. The PHP verifier also computed the MAC over the raw
`t` while checking freshness on `(int) $t`, so a `t` of `<T>.<first bytes of the body>`
verified a body that was never signed; `t` must now be digits. Tests
`webhook-secret.test.ts`, `TestVerifySignature_RefusesAnEmptySecret`,
`test_webhook_secret.py`, `WebhooksTest::{testRefusesAnEmptySecret,
testRefusesATimestampThatIsNotDigits}` (each fails on the previous verifier). The fix
reaches integrators with the next SDK releases (npm is the owner's step).

## RA-128 — two small gateway defaults that lied: "LIVE" on every transaction, and a limit that vanished with Redis

- **Found:** 2026-09-11 (full-system assurance, fail-open audit A2-13/A2-14)
- **Status:** FIXED (gateway)

Every transaction response was labelled `environment: "LIVE"` — including Sandbox
`SimulatePayment` ones, which the SDK types as `'LIVE' | 'SANDBOX'`; it now carries the
environment of the session that asked (the stack's). And the per-IP and global limits
on legacy proof-reference lookups — the brake that makes guessing a ~32-bit reference
impractical — were skipped whenever Redis erred (or was absent); they now count in the
process instead, as the credential limiters have since RA-091. Tests
`TestTransaction_CarriesTheSessionsEnvironment`,
`TestLegacyProof_ABrokenRedisStillCountsInProcess` (replacing the test that asserted the
fail-open; the previous limiter answers the seventh request with 200).

## RA-129 — the Sandbox stored every webhook signing secret and operator TOTP seed in plaintext

- **Found:** 2026-09-11 (full-system assurance, operator audit A5-04, privacy A6-10, fail-open A2-10)
- **Status:** FIXED in the deploy (applied at the next deploy of gateway, developer-api and admin-api)

No Sandbox service had `WEBHOOK_ENCRYPTION_KEY`: the services warned "plaintext
(sandbox only)" and stored the webhook signing secrets (gateway, developer-api) and the
BANZADMIN operators' TOTP seeds (admin-api) in the clear, in a database every service
can read — a dump would hand over the operators' second factor. developer-api's cipher
setup, and its refusal to run without a key outside the Sandbox, also sat inside the
branch for an unrelated credential (the refund key), so without that key neither ran.
The deploy now mints a 32-byte key (never rotated by `BZSB_ROTATE_SECRETS` — a rotation
would orphan everything encrypted under it) and mounts it only into the gateway and
developer-api; admin-api gets a key of its own for TOTP seeds. The first create and the
clone-based redeploy both provision and export them. Values already stored in plaintext
keep reading (an unprefixed value passes through `webhookprov`); new ones are
encrypted. developer-api's cipher block is unconditional. Guard
`tests/ops/sandbox-secret-preservation.test.sh` (22 checks; a key that rotates fails
it). admin-api rewrites any TOTP seed still in plaintext under its key when it starts
(`EncryptStoredSecrets`, conditioned on the row still holding the plaintext it read;
test `TestEncryptStoredSecrets_MovesPlaintextSeedsUnderTheKey` — the seed is encrypted
and still verifies). Residual: webhook signing secrets written before the key stay
plaintext until rotated; A6-09 (every other secret still mounted into every stack
service) is not yet scoped.
