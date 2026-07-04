# Banzami Sandbox Release Assurance — Repair Log

Programme: **BANZAMI-SANDBOX-RELEASE-ASSURANCE-001** · started 2026-07-04
Canonical capability registry: [`quality/operator-assurance-manifest.yaml`](../../quality/operator-assurance-manifest.yaml)
Asset inventory: [`ops/asset-inventory.yaml`](../../ops/asset-inventory.yaml)

Each finding records: severity, root cause, remediation, environment, tests,
deployment evidence, cleanup result, final disposition.

Severity: CRITICAL / HIGH / MEDIUM / LOW.
Disposition: fixed / blocked(owner+decision) / accepted-justified / open.

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

## RA-011 — `refund_source` is an operator extension; ADR-045 still draft

- **Severity:** MEDIUM (protocol governance / docs truthfulness)
- **Finding:** Banzami ships `refund_source` on paid events/LINK GET.
  BANZA ADR-045 (draft, submitted by the operator) proposes standardising it;
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
