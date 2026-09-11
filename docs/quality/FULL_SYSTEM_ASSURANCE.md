# Full-system assurance — Sandbox, 2026-09-11

Version: 1.0

What was examined, what was found, what was fixed and how each fix is known to
hold. Scope: the deployed Sandbox stack on 217.160.9.248, the two public nginx
edges, the website, the SDKs in this repository, CI and the Sandbox host.
Financial LIVE is **not ready and fail-closed**; nothing here changes that. The
preserved DOA settlement was **not** executed.

Verdicts:

- **PASS** — deployed, and evidence (a test that fails without the behaviour,
  a live probe, or a read-only database count) shows the behaviour holds.
- **FIXED** — a defect was found in this programme, fixed, mutation-proven,
  deployed and re-verified. Its RA entry in [REPAIR_LOG.md](REPAIR_LOG.md) has
  the detail.
- **RESIDUAL** — a known, bounded risk that was deliberately left, with its
  reason.
- **BOUNDARY** — needs a person or a provider (owner MFA, a physical device,
  credentials only the owner can place). Not claimed.

"Zero bugs" is not a claim this document makes. The claim is narrower: every
defect found is fixed, bounded or on a boundary, and each fix is guarded.

## 1. Deployed components — every one classified

`DEPLOYED_COMPONENTS_WITHOUT_ASSURANCE_CLASSIFICATION = 0`

| Component | Where | Priority | Verdict | Evidence |
|---|---|---|---|---|
| core-api (Rust financial core) | `bzsandbox-…-core-api-staging` | P0 | PASS | 603 core tests incl. real-DB invariants; financial assurance SQL (§3); RA-084, RA-087, RA-088 |
| api-gateway | `…-api-gateway-staging` | P0 | PASS | Go suite; route/tenancy sweeps; live probes (§4) |
| public-api (consumer API) | `…-public-api-staging` | P0 | PASS | Go suite; routing-error contract; OTP fix (0b5f8991) |
| admin-api (BANZADMIN API) | `…-admin-api` | P0 | PASS | Go suite incl. DB-backed MFA/SUPER_ADMIN races (RA-089, RA-090); RBAC matrix |
| developer-api (Developers Console API) | `…-developer-api` | P1 | PASS | Go suite now in CI; ENVIRONMENT fail-closed (RA-086) |
| pay-frontend (hosted payer, pay.banzami.com) | `…-pay-frontend` | P0 | PASS | serves 200; public pay initiation rate-limited (live 429 after 20/min) |
| admin-frontend (BANZADMIN UI) | `…-admin-frontend` | P1 | PASS (code) / BOUNDARY (walk) | tests in CI; a signed-in walk needs the owner's MFA |
| website-frontend (banzami.com, developers.banzami.com, `/verificar`, `/r/`) | `banzami-website-frontend-1` | P0 | PASS | 762 tests, now in CI; proof canonicality; `/r/` no-referrer |
| website edge (nginx) | `banzami-website-nginx-1` | P0 | PASS | every server logs redacted (RA-082, RA-092); probes |
| Sandbox edge (nginx) | `bzsbedge-sandbox-edge` | P0 | PASS | real client IP from `CF-Connecting-IP` for Cloudflare ranges only; header rotation does not reset limits (probe) |
| PostgreSQL (stack) | `bzsandbox-…-postgres-1` | P0 | PASS | 35 invariant counters at 0 (§3); never restarted, never written by hand |
| Redis (stack) | `bzsandbox-…-redis-1` | P1 | PASS | rate limits; credential limits no longer vanish without it (RA-091) |
| webhook sink (sandbox-webhook.banzami.com) | `banzami-webhook-sink` | P1 | PASS | test receiver on its own network; logs redacted |
| legacy Redis | `banzami-redis-1` | — | RESIDUAL | attached only to the website network; nothing reads it (no client configured). Decommission is an owner decision |
| Consumer / Business mobile apps (Flutter) | devices | P1 | BOUNDARY | device walks need the owner's iPhone |
| @banzami/sdk (npm), banzami_client (pub.dev), Python, PHP, Go SDKs | registries / repo | P1 | FIXED | route drift closed (§5); publishing the source fixes is an owner step |
| Cloudflare | edge | P0 | PASS | forged `CF-Connecting-IP` refused by Cloudflare (403); origin trusts its ranges only |
| Sandbox host | 217.160.9.248 | P0 | PASS | deploy capacity gate + reclaim (RA-083); log retention (RA-085) |
| DOA | separate application (Vercel) | — | not a Banzami component | DOA is a tenant/integrator; no DOA-specific code path was added or kept |

## 2. Priority domains

| Domain | Verdict | How it is known |
|---|---|---|
| A. Financial authority | PASS | the callback secret is no longer public (RA-084, live forge → `INVALID_SIGNATURE`); system ledger accounts must be configured exactly (96c3e01a); LIVE refuses to boot without its keys |
| B. Ledger | PASS | debits − credits = 0 over 548 postings / 1 096 entries; every posting two balanced legs; no entry without a posting; no posting claimed twice (§3) |
| C. Payments / P2P / links | PASS | callbacks confirm only their own amount; test-confirm bound to its link (dc8d2f40); one spelling per slug (3be7e8dd); idempotency never replays another owner's movement (2b905ede); SDK public pay reachable (6e4f238e) |
| D. Receipts / proofs | PASS | a reference is exact (no alias verifies); real references out of the repo, guarded; logs redacted on every server; full reversal and proof flip atomic (RA-088); `/r/` sends no Referer |
| E. Settlements | PASS | transitions serialised; a source is never overdrawn; a batch settles a positive net only (912cc96a) |
| F. Payouts | PASS | a transition is claimed before money moves; reversed at most once (3abe35ce); frozen merchants withdraw nothing (RA-087) |
| G. Refunds / disputes | PASS | disputes owned by their Business (094aa253); resolvable (149c9101); proof reversal atomic (RA-088) |
| H. Auth / session | PASS | one TOTP code, one session (RA-089); API keys mint sessions only for an ACTIVE Business (7bde2d18); credential limits survive a Redis outage (RA-091); logout is a client clear by design, server revocation is the audited "Terminar as minhas sessões" |
| I. Operator controls | PASS | role matrix does what it says (0c408676); the last SUPER_ADMIN cannot be removed, also concurrently (RA-090); a freeze stops outgoing money (RA-087) |
| J. Cross-tenant isolation | PASS | consumer tokens refused on the merchant surface (35-route sweep); links, disputes, QR owner checks (094aa253) |
| K. Environment integrity | PASS | developer-api needs ENVIRONMENT (RA-086); canonical env fails closed; LIVE boot refusals (RA-084) |
| L–M. Business onboarding, KYB | PASS (code) / BOUNDARY (R2) | one KYB authority; application capability ids masked in logs (RA-092); document storage needs the owner's R2 credentials |
| N. Developers Console | PASS | tests in CI; API routing errors in its envelope |
| O. BANZADMIN | PASS (API) / BOUNDARY (UI walk) | see H and I |
| P–Q. Consumer / Business apps | BOUNDARY | device walks |
| R. Webhooks | PASS | one send per attempt under a lease; never signed with ciphertext (a501b6a8) |
| S. Reconciliation | PASS | read-only assurance SQL (§3), 35 counters at 0 |
| T. Public website | PASS | now typechecked and tested in CI |
| U. SDK / contracts | FIXED | §5 |
| V. Release / deployment | PASS | capacity gate; runtime parity (§6) |

Also examined: error contract (routing errors now JSON — d16b4fbe), rate limits
(§4), dependencies (npm production 0; Rust 0; Go standard-library advisories
fixed in the deployed go1.26.8 binaries, `x/crypto` raised to v0.56.0), fail-open
paths (freeze read, credential limits, callback secret, environment default).

## 3. Ledger and money-state invariants (read-only, live Sandbox)

`tools/assurance/sandbox-financial-assurance.sql`, run through the read-only
helper. Every line is a count that must be 0, except the three totals.

| Counter | Value |
|---|---|
| Postings without exactly one DEBIT and one CREDIT | 0 |
| Unbalanced postings / entry–account currency mismatch | 0 / 0 |
| Global debits − credits | 0 |
| Negative business wallet (account / available), negative consumer available | 0 / 0 / 0 |
| COMPLETED transfers without a posting / amount ≠ posting | 0 / 0 |
| Proofs unsigned / of missing transfers / amount ≠ transfer / description ≠ operation | 0 / 0 / 0 / 0 |
| Proofs printing a technical link description / business payment without payee / duplicated references | 0 / 0 / 0 |
| Ledger entries without a posting | 0 |
| Postings claimed by two objects / object postings that do not exist | 0 / 0 |
| Payouts processed, settlements settled, app settlements completed, deposits confirmed, restitutions — without their posting | 0 each |
| Links / sessions that read paid with no payment behind them | 0 / 0 |
| Wallet payments without a completed transfer | 0 |
| Environment, handle, KYB, application, webhook counters | 0 each |
| Totals | 548 postings, 1 096 entries, 114 proofs |

The eleven money-state counters are new in this programme (d9609d1b); each is
zero on a clean database and moves for the defect it exists to catch
(`tests/ops/financial-assurance-sql.test.mjs`, now run in CI with a database).

## 4. Live probes (all against the deployed Sandbox)

| Probe | Result |
|---|---|
| Acquiring callback signed with the old public default | before: passed signature, reached lookup; after: `INVALID_SIGNATURE` |
| 20+ admin logins/min from one client | 429 with `Retry-After`; rotating `X-Forwarded-For` / `X-Real-IP` / `True-Client-IP` keeps 429; forged `CF-Connecting-IP` refused by Cloudflare |
| 22 unauthenticated public payment initiations/min | 20 answered, then 429 |
| 40 spellings of `/internal/…` on every public host | 404 |
| A synthetic proof reference on every host, in path and Referer | logged as `BZM-XXXX...`, no Referer |
| A synthetic application id on the Sandbox edge | logged by its first 8 characters |
| `/v1/public/pay/{slug}` (SDK path) | reaches the handler |
| Unknown route / wrong method, three APIs | JSON error in each API's shape |

### Sandbox harnesses (run against the deployed stack, 2026-09-11)

| Harness | Result |
|---|---|
| `proof-lookup-assurance.sh` (every alias of every stored proof refused; synthetic register absent) | PASS 10 / FAIL 0 |
| `receipt-assurance.sh` (payee, operation, reference and instant agree on proof, PDF, verifier, app) | PASS 25 / FAIL 0 |
| `business-tenant-isolation.sh` | PASS 21 / FAIL 0 |
| `ledger-reconciliation.sh` | PASS 6 / FAIL 0 |
| `pay-frontend-lifecycle-e2e.sh` | PASS 7 / FAIL 0 |
| `webhook-retry-cleanroom.sh` (a real retried delivery, judged by a verifier that never saw the signer) | PASS 16 / FAIL 0 |
| `sandbox-host-attestation.sh` | PASS 14 / FAIL 0 (after recording BANZADMIN's two containers — 8d5bd73b) |
| `refund-settlement-matrix.sh`, `economic-model-smoke.sh` | stale — their settlement steps use the contract retired on 2026-09-05 (§8) |

Harnesses that touch DOA's Project (fixture keys, campaign accounts, deliveries
to doadoa.app) were deliberately not run.

## 5. SDK and contract drift

| Drift | Fix |
|---|---|
| `getPublicPaymentLink` / `getPaymentLinkStatus` called an unmounted `/v1/public/pay` — always 404; the drift guard passed because it compared version-less paths | gateway serves both prefixes (6e4f238e); guard counts only routes under `/v1` and fails on exactly these two without the mount (eff8c3e1) |
| `createStaticQr` / `createDynamicQr` omitted `owner_type` (static: currency) — always 400 | gateway fills the only accepted values; SDK sends them (091e7896) |
| Python and PHP SDKs offered payment requests on a withdrawn route (RA-057) | removed (21e0d0a7) |
| `createApplicationSettlement` sent the wallet-to-wallet body retired on 2026-09-05 — refused on every call (a body shape, which a path-only drift check cannot see) | deprecated; rejects locally with `METHOD_RETIRED` and names `createBusinessApplicationSettlement` |
| developer-api and `services/common` not tested in CI; website not in CI | CI jobs added (2496e7b3, 091e7896) |

A recorded run of every TypeScript SDK method against the gateway's route
table maps every request to a mounted route. Publishing the SDK source fixes is
the owner's npm step; the gateway fixes make already-published versions work.

## 6. Release state

Every commit of this programme is on `origin/main` and deployed through
`./deploy.sh` (stack) and `./deploy.sh website-frontend`. See the final report
for the exact runtime parity (image tag = commit) and CI state at the time of
reporting.

## 7. Defect ledger (this programme)

| ID | Sev | Domain | Finding | Status |
|---|---|---|---|---|
| D01 | P0 | proofs | `/verificar` normalised look-alikes (O→0) into another proof | FIXED 1149e517 |
| D02 | P0 | proofs | the gateway trimmed whitespace, so an altered spelling verified | FIXED 099bbf77 |
| D03 | P1 | proofs | `/r/` decoded `%30`/`%2D`; slashes redirected to the canonical | FIXED af0a53fc |
| D04 | P1 | privacy | four real proof references in the public repo | FIXED in tree cba7a4da + guard; git history not rewritten (by instruction) |
| D05 | P1 | logs | redaction keyed on the route: a mistyped route logged a reference whole | FIXED a7a48cbf, 1edf5674 (RA-082) |
| D06 | P2 | logs | no container log limit or rotation | FIXED (RA-082/085): rotated once, retention job |
| D07 | P0 | ops | Sandbox disk filled during a deploy | FIXED 0c77ffef, 4ae33712 (RA-083) |
| D08 | P1 | ops | a hand cleanup deleted ~168 bundle manifests | PERMANENT, disclosed (RA-083) |
| D09 | P1 | money | synthetic credits not idempotent | FIXED a2a7caea |
| D10 | P2 | assurance | 21 of 25 operator guards not in CI | FIXED cba7a4da |
| D11 | P0 | tenancy | a consumer token listed/cancelled any Business's links (live-proven) | FIXED 094aa253, re-probed 403 |
| D12 | P0 | tenancy | 35 merchant-surface routes admitted consumer tokens | FIXED 094aa253 |
| D13 | P0 | tenancy | any Business read every tenant's disputes | FIXED 094aa253 |
| D14 | P1 | identity | a caller-chosen SMS OTP; an empty code verified | FIXED 0b5f8991 |
| D15 | P0 | money | payout fail/return race: double reversal | FIXED 3abe35ce |
| D16 | P0 | money | app settlement complete vs cancel; concurrent overdraft | FIXED 7f78c0ec |
| D17 | P2 | money | batch settlement confirm/fail race | FIXED 7f78c0ec |
| D18 | P0 | money | an idempotency key replayed another owner's movement | FIXED 2b905ede |
| D19 | P1 | operators | help desk could take over a SUPER_ADMIN; OPERATIONS held the KYB decision; disputes unresolvable; a credential shown on a mode-read failure | FIXED 149c9101, 0c408676 |
| D20 | P0 | money | a callback confirmed another amount; a withheld settlement read "paid"; test-confirm unbound | FIXED dc8d2f40 |
| D21 | P1 | links | slug / pay-link code decoded twice (aliases) | FIXED 3be7e8dd |
| D22 | P1 | push | Sandbox debug push to any named device token | FIXED 7f8a2d09 |
| D23 | P1 | tenancy | a Business created from a merchant session on LIVE | FIXED 8a69eba6 |
| D24 | P1 | auth | an API key minted a session for a non-ACTIVE Business | FIXED 7bde2d18 |
| D25 | P1 | webhooks | a delivery sent twice per attempt; signed with ciphertext | FIXED a501b6a8 |
| D26 | P0 | money | callback secret was a public default (live-proven) | FIXED 0848cd4d (RA-084) |
| D27 | P1 | logs | nine nginx servers logged the request and Referer unredacted | FIXED 233e625e |
| D28 | P2 | ops | the forced rotation hung `docker logs --tail` | FIXED 015c7b37 (RA-085); PostgreSQL / legacy Redis until their next restart |
| D29 | P2 | CI | CI red: format, clippy, a stale RBAC test, DB guards without a DB | FIXED 99892142, dfb72a00 |
| D30 | P3 | website | type errors in a test; website not in CI | FIXED 2496e7b3 |
| D32 | P0 | controls | a freeze did not stop P2P, QR, payouts, account transfers; read failed open | FIXED 072cf780 (RA-087) |
| D33 | P1 | config | developer-api defaulted to Sandbox privileges | FIXED 7de23b29 (RA-086) |
| D34 | P2 | money | a settlement batch accepted 0 / fee = gross | FIXED 912cc96a |
| D35 | P3 | docs | BANZADMIN runbook role matrix stale | FIXED 072cf780 |
| D36 | P1 | money | missing/malformed system account ids became new random accounts per boot | FIXED 96c3e01a |
| D37 | P1 | proofs | full refund committed before its proof flip, error ignored | FIXED 9497eff0 (RA-088) |
| D38 | P1 | auth | one TOTP code opened several sessions concurrently | FIXED 25496a55 (RA-089) |
| D39 | P1 | operators | two SUPER_ADMINs could suspend each other to zero | FIXED 381a2aaf (RA-090) |
| D40 | P1 | auth | credential limits vanished with Redis | FIXED e739696b (RA-091) |
| D41 | P3 | API | routing errors were text/plain / empty | FIXED d16b4fbe |
| D42 | P1 | SDK | public pay SDK calls 404; public initiation unlimited | FIXED 6e4f238e, eff8c3e1 |
| D43 | P2 | SDK | SDK QR creation always refused | FIXED 091e7896 |
| D44 | P2 | SDK | Python/PHP payment requests on a withdrawn route | FIXED 21e0d0a7 |
| D45 | P1 | logs | application capability ids written whole | FIXED 24c4eb05 (RA-092) |
| D46 | P3 | deps | `x/crypto` v0.55.0 (unreachable ssh advisories) | FIXED dc3df868 |

## 8. Residual and latent risks

| Risk | Why it is bounded |
|---|---|
| Core's `/internal` API has no service credential inside the Docker network | no public route reaches it (40 spellings × 5 hosts: 404); the network holds only stack services and the edge. A service credential is the next step for defence in depth |
| Money **into** a frozen merchant by QR/P2P, and app settlements from a frozen source, are not refused | runbook states it; acquiring into a frozen merchant is withheld; no freeze has ever existed on the Sandbox |
| A session's dynamic QR and link are both payable if QR pay is re-mounted | `qr::pay` has no public route since RA-053 |
| BANZADMIN "Activate" can label an operator ACTIVE before enrolment finishes | login still routes through MFA enrolment; it cannot grant a session without the factor |
| `docker logs --tail` on the stack PostgreSQL and legacy Redis hangs until their next restart | `--since` works; they were deliberately not restarted |
| ~168 deploy bundle manifests deleted | receipts and git history still resolve commit → runtime |
| Four historical real proof references remain in git history | not rewritten, by instruction |
| `banzami-redis-1` legacy container | unused; owner decision |
| Two Sandbox harnesses (`refund-settlement-matrix.sh`, `economic-model-smoke.sh`) still settle wallet-to-wallet, which the gateway retired on 2026-09-05 — their settlement steps fail (400) | not run in CI; the economics they assert are covered by the core real-DB suites (settlement, app-settlement, pricing). Rewriting them onto the account/@banza contract is open |

## 9. Boundaries (not claimed)

- BANZADMIN signed-in UI walk — needs the owner's MFA.
- Consumer and Business app walks on a device — needs the owner's iPhone.
- KYB document storage — needs the owner's R2 credentials.
- A fresh DOA reference payment — the donor half runs on doadoa.app behind a
  real email OTP; the harness would also spend an arbitrary consumer's Sandbox
  balance. Not run.
- Publishing the SDK source fixes (npm / pub.dev / Packagist / PyPI).
