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
