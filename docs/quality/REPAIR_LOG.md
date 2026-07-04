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
- **Finding:** Container flagged `unhealthy` for ~3 days; image is 6 weeks
  old while sibling frontends were rebuilt days ago.
- **Disposition:** open — diagnose healthcheck, rebuild/redeploy (Phase 6).

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
- **Disposition:** open — bind to loopback/internal network and route via
  nginx (Phase 6), after confirming no external consumer depends on :3005.

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
- **Disposition:** open — enforce dry-run or dedicated sandbox sender in
  staging compose + deploy gate (Phase 6/7).

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
