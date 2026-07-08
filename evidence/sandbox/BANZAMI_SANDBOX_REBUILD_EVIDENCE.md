# Banzami Internal Sandbox Rebuild — Technical Evidence Dossier

Version: 1.0

---

## 1. Document control

| Field | Value |
|-------|-------|
| Title | Banzami Internal Sandbox Rebuild — Technical Evidence Dossier |
| Version | 1.0 |
| Date | 2026-07-08 |
| Classification | Internal — Banzami technical Sandbox file |
| Author | Banzami engineering (operator) |
| Source of truth | Completed same-VM controlled internal Sandbox rebuild final reports |
| Environment described | Internal technical Sandbox (single VM), internal-only |
| Status | Rebuild complete; internal verification passed |
| Sanitisation | No secrets, IPs, hostnames, database URLs, raw Docker/DB output, migration SQL, private paths, SSH details or internal endpoints |

This dossier is a factual record only. It does not assert BNA approval, admission
to the BNA Regulatory Sandbox, production readiness, LIVE deployment, public
availability, real payments, or customer-data usage.

## 2. Executive summary

A controlled, single-VM rebuild of the Banzami internal technical Sandbox was
executed end-to-end through a gated, source-controlled VM execution adapter. The
prior legacy environment on the designated VM was deleted strictly from a
pre-built, sanitised manifest (no global prune, no unscoped deletion). A fresh
internal Sandbox was then rebuilt from canonical source: an isolated project with
internal-only networking, a controlled `banzami_staging` migration, and the four
approved internal services deployed non-root and internal-only.

Every irreversible action was gated behind a non-destructive dry-run that first
proved a complete rebuild works in a temporary isolated project without touching
the legacy environment. That dry-run surfaced and forced correction of four
environment issues before any deletion occurred; a fifth issue was caught and
corrected during the reset step itself, also without leaving the gated tooling.
Final verification passed on all checks, and all operator quality gates pass from
canonical `main`.

## 3. Purpose and scope

**Purpose.** Provide a robust, audit-friendly technical record of the internal
Sandbox rebuild suitable to attach to the Banzami technical Sandbox file and to
reuse later as supporting engineering evidence.

**In scope.** The internal technical Sandbox on a single VM: its reset, rebuild,
migration, deployed services, isolation and security controls, and the governance
and evidence around them.

**Out of scope.** LIVE, Production, public exposure, real-money rails, external
payment providers, customer data, DNS/TLS/SMTP, and any BNA regulatory claim.

**Environment terms (kept distinct throughout):**

| Term | Meaning in this dossier |
|------|-------------------------|
| Banzami technical Sandbox | The internal, operator-run test environment described here. Internal-only. |
| BNA Regulatory Sandbox | A separate external regulatory programme. Not claimed, not entered. |
| LIVE | The operator's real-money environment. Not provisioned here. |
| Production | General-availability operation. Not enabled here. |
| Local rehearsal | The fully local, synthetic, disposable rehearsal on the engineer workstation. |
| VM dry-run | The non-destructive rebuild proof executed on the VM in a temporary isolated project before any reset. |
| Final VM internal Sandbox | The persistent internal Sandbox rebuilt on the VM after the reset. |

## 4. Regulatory and audit positioning

This dossier is **engineering evidence**, not a regulatory submission. It records
that an internal technical Sandbox was rebuilt under disciplined controls. It may
support future regulatory preparation as background material, but on its own it:

- does **not** constitute or imply BNA approval;
- does **not** constitute or imply admission to the BNA Regulatory Sandbox;
- does **not** assert production readiness or LIVE operation;
- does **not** describe any real customer, real merchant, or real-money activity.

Banzami is the reference operator built on the BANZA protocol; the protocol,
certification framework and any conformance authority are owned externally and are
not asserted here.

## 5. System context

The internal Sandbox runs on a single existing VM (no new VM was created). The VM
provides the operating system, SSH access, and the Docker engine; these were
preserved. On top of that, the rebuild provisioned an isolated Sandbox project
consisting of an internal PostgreSQL 16 database, an internal Redis instance, and
four internal application services, all connected by internal-only container
networks with no host-published ports.

All VM-side operations were performed exclusively through a gated execution
adapter driven from canonical source; no ad-hoc destructive commands were used.

## 6. Canonical source and revisions

| Item | Value |
|------|-------|
| Operator source of truth | canonical `main`, revision `231e0e00` |
| Deployed service image revision | `ad4e992e` |
| Operator quality gates | 18 of 18 PASS from canonical `main` |

The deployed images carry revision `ad4e992e` — the verified release package built
immediately before a final orchestrator-only change (revision `231e0e00`) that
does not alter any deployed artifact. The image build context (financial core and
API services) is identical between the two revisions.

Changes merged during this work (documentation and adapter only; no financial
rule, migration, service contract or protocol change):

| PR | Purpose |
|----|---------|
| #14 | Gated same-VM execution adapter — remote wiring, source/state materialisation, dry-run, reset gating |
| #15 | Linux tool portability fix (secret file mode/hard-link checks) |
| #16 | Build release images for the deployment target architecture |
| #17 | Container-consumed secret files readable by non-root on Linux |
| #18 | Prevent SSH from draining the reset loop input |
| #19 / this PR | Evidence pack / dossier (documentation only) |

## 7. Pre-execution governance

- The rebuild ran only after the operator provided explicit, scoped authorisation
  and reconciled the disposability of the legacy environment.
- All VM actions were gated: **plan-by-default**; any mutating action required an
  explicit apply flag **and** a single-use authorisation file created for the one
  execution and deleted at the end.
- Deletion could occur **only** from a sanitised manifest restricted to the
  Banzami / BANZA / BanzAI resource family; global prune and unscoped deletion are
  structurally impossible in the adapter.
- The irreversible reset was **fail-closed** unless a non-destructive dry-run had
  first proven a complete rebuild.
- The single-use authorisation file was stored outside the repository at
  restricted permissions and deleted at completion.

## 8. Release package and provenance

A verified release package was built from canonical source and verified before any
transfer or deployment:

- Verified source-transfer artifact (revision-pinned).
- Attested, immutable images for the four approved services and the operational
  migration executor.
- SBOMs and provenance attestations for each image.
- A manifest binding every immutable identity, plus a checksum set.

Verification results: image content digests match the manifest; SBOM and
provenance valid for every image; the package is secret-free and contains no
database dump, no customer data, and no registry credential. Images target the
deployment architecture and were confirmed as such. No image is pushed to a
registry, and no build or pull occurs at deployment time.

## 9. VM execution adapter

All VM operations run through a single, source-controlled, gated adapter:

- **No embedded target.** The SSH destination and remote working root are read
  only from the runtime environment; they are never committed, printed, or
  persisted. A static gate rejects any embedded IP, hostname, key, credentialed
  URL, or literal SSH target in source.
- **Plan-by-default; guarded apply.** Every mutating subcommand requires an
  explicit apply flag and a scoped single-use authorisation file.
- **Manifest-scoped deletion only.** A read-only inventory is classified into a
  Banzami/BANZA/BanzAI teardown set and a preserved set; only the teardown set is
  deleted, one scoped command per resource. No prune, no unscoped deletion can be
  generated; the plan is re-scrubbed before execution.
- **Fail-closed.** Remote and transfer operations require a runtime target;
  evidence is sanitised to categories and counts only.
- **Reuse.** Bootstrap, migration and deployment reuse the already-validated local
  Sandbox adapters, executed on the VM against materialised canonical source.

## 10. Non-destructive VM dry-run

Before any deletion, the adapter executed a full rebuild in a **temporary,
uniquely-named, isolated project** on the VM: bootstrap → controlled migration →
deploy four services → verify health → guarded teardown → zero-residue check. It
never touched the legacy environment (unique names, internal-only, no host ports),
and on success wrote a marker that the reset step requires.

The dry-run passed only after four independent environment issues were found and
fixed in canonical source (see §20). This is the central safety property of the
whole exercise: **destructive execution was gated behind a proven-good rebuild.**

## 11. Legacy reset

The legacy Banzami / BANZA / BanzAI environment was deleted strictly from the
sanitised manifest. Sanitised categories and counts only:

| Category | Count |
|----------|------:|
| Deleted containers | 18 |
| Deleted images | 19 |
| Deleted networks | 3 |
| Preserved unrelated images | 11 |
| Preserved unrelated volumes | 1 |

- Preserved resources were unaffiliated shared base images and one unrelated
  volume, retained by a fail-closed classifier.
- Post-reset re-inventory: **0** legacy Banzami/BANZA/BanzAI containers, images or
  networks remain.
- No global prune, no unscoped Docker deletion, no unscoped filesystem deletion.
- No database dump or backup was taken. The recovery model is reconstruction from
  canonical source, canonical migrations and fresh configuration only.
- Raw resource names are intentionally omitted.

## 12. Fresh internal Sandbox rebuild

On the same VM, from the verified release package and materialised canonical
source, the following were provisioned:

1. An isolated Sandbox project with internal application and data networks.
2. PostgreSQL 16 and Redis, internal-only, with no host-published ports.
3. The role model: a stable schema owner (no-login), restricted runtime and
   control-plane identities, and a short-lived migration login.
4. A controlled `banzami_staging` migration under single-use authorisation,
   single-use receipt and a real advisory lock.
5. The four approved internal services, deployed one at a time from
   provenance-verified images (no build, no pull at deployment).

## 13. Database and migration control

- Target: `banzami_staging` (internal Sandbox only). The controlled path refuses
  any live/production marker and any external host or host port.
- Controls applied: manifest identity gate; single-use authorisation and receipt
  (each consumed once); a real advisory lock; a fresh short-lived migration login;
  a file-only, read-only database credential; embedded canonical migrations only
  (no source mount, no external migration directory, no legacy manual path).
- Post-migration verification (all PASS):
  - relations, schemas, routines and metadata owned by the stable schema owner;
  - no foreign role owns application objects;
  - migration login least-privilege, connection-limit bounded, validity bounded;
  - runtime and control-plane roles are not object owners;
  - the stable owner is no-login;
  - the short-lived migration login was removed after use and its credential is
    unusable;
  - the migration secret is absent from image metadata.
- A concurrent migration attempt is refused by the advisory lock.

## 14. Runtime services

The four approved internal services are deployed and verified. Detailed,
sanitised, per-service status:

| Service | Purpose (internal Sandbox instance) | Deployment | Health | Non-root | Network exposure | Secret handling | Image provenance | Known limitations |
|---------|-------------------------------------|:----------:|:------:|:--------:|------------------|-----------------|:----------------:|-------------------|
| core-api-staging | Financial core API (ledger, wallet, transaction primitives) | Deployed | PASS | PASS | Internal networks only; no host port | DB credential file-only, exported in-process; not in Docker env | Matches manifest | Internal test scope; synthetic data only |
| api-gateway-staging | API gateway / routing and authentication surface (v1) | Deployed | PASS | PASS | Internal networks only; no host port | File-only credentials; not in Docker env | Matches manifest | Not publicly exposed; no external auth providers |
| developer-api | Developer/console-facing internal API | Deployed | PASS | PASS | Internal networks only; no host port | File-only credentials; not in Docker env | Matches manifest | Not publicly exposed; developer-key path internal only |
| public-api-staging | Consumer/public-facing internal API instance | Deployed | PASS | PASS | Internal networks only; no host port | File-only DB credential + synthetic signing secret; not in Docker env | Matches manifest | Internal only; no public availability |

Running footprint on the VM: PostgreSQL, Redis and the four services (six
containers), all internal-only with zero host-published ports. No unapproved
service was deployed; the deny-list (admin, frontends, dashboard, checkout, pay,
reverse proxy, documentation, BanzAI, payment adapters, LIVE) is enforced.

## 15. Isolation model

- Separate internal application and data networks (internal-only).
- PostgreSQL and Redis: no host-published ports.
- Services: internal networks only; no host-published ports.
- `no-new-privileges` set; no host namespaces; no privileged containers; no host
  socket or host mounts beyond the read-only file-only credential mounts.
- Unique per-run project and network identities; the fresh Sandbox is named
  distinctly from any legacy resource.

## 16. Secret-management model

- Service and migration credentials are delivered **file-only** and read at process
  start; they never appear in Docker-inspectable environment, config, or labels.
- Container-consumed credential files sit inside root-only (0700) directories;
  file modes were made readable by the non-root container user while directory
  permissions preserve host confidentiality.
- The Sandbox uses fresh, generated Sandbox secrets; no production credential and
  no customer data are present. Synthetic signing material used by a service is
  disposable and clearly non-real.
- No secret, key, database URL, or credentialed URL is present in source or in this
  document.

## 17. Identity, roles and ownership model

| Role | Type | Purpose | Ownership |
|------|------|---------|-----------|
| Stable schema owner | No-login | Owns all application objects | Owns relations, schemas, routines, metadata |
| Runtime identity | Restricted login | Application runtime DB access | Owns no application objects |
| Control-plane identity | Restricted login | Operational/control access | Owns no application objects |
| Short-lived migration login | Temporary login | Applies the controlled migration | Member of the stable owner during migration; removed afterwards |

Verified properties: stable owner is no-login and owns all objects; runtime and
control-plane identities own nothing; the migration login is least-privilege,
bounded by connection limit and validity, and is removed after use with its
credential rendered unusable.

## 18. Security controls

Sanitised control matrix (status reflects verified results):

| Control | Status |
|---------|:------:|
| Source revision control (canonical `main` pinned) | PASS |
| Release package verification | PASS |
| SBOM / provenance verification | PASS |
| Manifest-scoped reset | PASS |
| No global prune | PASS (structurally prevented) |
| Dry-run before reset | PASS (reset gated on marker) |
| Internal-only networking | PASS |
| PostgreSQL no host port | PASS |
| Redis no host port | PASS |
| Service allowlist (four approved only) | PASS |
| Non-root containers | PASS (all four) |
| File-only secrets | PASS |
| No secrets in Docker environment | PASS |
| Controlled migration | PASS |
| Single-use authorisation | PASS |
| Single-use receipt | PASS |
| Advisory lock | PASS |
| Temporary migration identity | PASS (created and removed) |
| Stable owner ownership | PASS |
| Runtime least privilege | PASS |
| Zero customer data | PASS |
| No external payment provider | PASS |
| No DNS / certificate / SMTP change | PASS |

## 19. Evidence summary

| Stage | Result |
|-------|--------|
| Release package build + verification (digests, SBOM, provenance, secret-free) | PASS |
| Verified transfer + source materialisation + revision match | PASS |
| Non-destructive dry-run (bootstrap → migrate → deploy → verify → teardown → zero residue) | PASS |
| Legacy reset (manifest-scoped) + post-reset legacy-absence | PASS / 0 remain |
| Fresh Sandbox bootstrap | PASS |
| Controlled `banzami_staging` migration + verification | PASS |
| Four approved services deployed, healthy, non-root | PASS |
| Final VM verification (migration + deploy + isolation) | PASS |
| Single-use authorisation file deleted; local residue zero | Confirmed |
| Operator quality gates from canonical `main` | 18 / 18 PASS |

## 20. Issues discovered and resolved

The non-destructive dry-run and the gated reset surfaced five issues. Each was
fixed in canonical source, merged, and re-proven before proceeding. Crucially,
**every issue was caught before or during gated execution — none caused an
uncontrolled or unrecoverable outcome.**

| # | Issue | Where caught | Resolution | Re-proven |
|---|-------|--------------|-----------|:---------:|
| 1 | Missing source/state materialisation on the VM | Dry-run design review, before any reset | Adapter now materialises the canonical source tree and VM-local release state | Yes |
| 2 | Linux tool portability (secret file mode/hard-link checks) | Dry-run (bootstrap) | Portability fix to the mode/hard-link checks | Yes |
| 3 | Build-target architecture mismatch (build host vs deploy host) | Dry-run (migration) | Release images built for the deployment target architecture | Yes |
| 4 | Non-root container could not read a mounted credential file on Linux | Dry-run (migration/deploy) | Container-consumed credential files made readable by the non-root user inside root-only directories | Yes |
| 5 | Reset loop input drained by SSH, deleting only one resource | Reset step (fail-closed BLOCKER, not a partial silent reset) | Prevent SSH from consuming the loop input | Yes |

This is the core assurance narrative: destructive execution was **gated and
corrected before the final reset**, and the reset itself failed closed rather than
completing partially and silently.

## 21. Explicit non-claims and exclusions

The current environment is an **internal technical Sandbox**. It is explicitly:

- **not LIVE**;
- **not Production**;
- **not public**;
- **does not process real customer data**;
- **does not execute real-money payments**;
- **does not claim BNA approval**;
- **does not claim admission to the BNA Regulatory Sandbox**.

Additionally not enabled: external payment providers; public API availability;
public developer access; DNS, TLS certificate or SMTP changes; and any new VM.

## 22. Current operational status

- Legacy environment: removed (0 Banzami/BANZA/BanzAI resources remain).
- Fresh internal Sandbox: running — PostgreSQL, Redis and four services, all
  internal-only, no host ports.
- Migration: applied and verified against `banzami_staging`.
- Verification: final VM verification PASS; operator gates 18/18 PASS.
- Data: synthetic/none; no customer data.

## 23. Recommended internal functional tests

Internal, synthetic, non-public only — no external OTP, email, payment rails,
customer accounts or third-party providers:

1. Internal service-to-service reachability across the Sandbox networks.
2. Idempotent re-run of the controlled migration (confirm no-op, stable checksums,
   unchanged ownership).
3. Synthetic wallet/ledger flow with test data; assert double-entry invariants.
4. Restart/recovery drill for the four services (return healthy, non-root,
   internal-only).
5. Observability check (health, metrics, structured logs emitted internally).
6. Reproducibility drill (re-run the non-destructive dry-run; zero residue).
7. Secret-boundary re-audit after restart (no credential in any inspectable
   surface).

## 24. Recommended BNA Phase 0 test evidence

The following **synthetic-data-only** tests are recommended to build engineering
evidence. They are internal preparation and do **not** imply BNA participation or
approval:

| # | Test | Data | Notes |
|---|------|------|-------|
| 1 | Synthetic user onboarding | Synthetic | Internal only |
| 2 | Synthetic merchant onboarding | Synthetic | Internal only |
| 3 | Wallet account creation | Synthetic | Ledger-backed |
| 4 | Ledger posting | Synthetic | Assert double-entry invariants |
| 5 | QR payment | Synthetic | No real money |
| 6 | Payment link | Synthetic | No real money |
| 7 | Payment intent lifecycle | Synthetic | State transitions only |
| 8 | Idempotency | Synthetic | Duplicate request handling |
| 9 | Insufficient balance | Synthetic | Rejection path |
| 10 | Duplicate payment prevention | Synthetic | Replay protection |
| 11 | Failed payment path | Synthetic | Error handling |
| 12 | Service restart recovery | Synthetic | Health after restart |
| 13 | Migration re-run safety | Synthetic | No-op idempotency |
| 14 | API authentication | Synthetic | Internal credentials only |
| 15 | Audit / event logging | Synthetic | Traceability |
| 16 | Settlement simulation | Synthetic | No real money moved |

## 25. Residual risks and open decisions

- **Single VM.** The internal Sandbox runs on one VM; no high-availability or
  multi-node posture is claimed.
- **Emulated cross-architecture build.** Release images for the deployment
  architecture are built under emulation on the engineer workstation; a native
  build host would remove emulation from the pipeline.
- **Revision offset.** Deployed images are at `ad4e992e`; canonical `main` is
  `231e0e00` (an orchestrator-only delta). A subsequent rebuild would align both.
- **No backup by design.** The legacy environment was removed without a dump;
  recovery is reconstruction-only, as authorised.
- **Adapter ordering note.** The dry-run teardown removes VM-local release state;
  the sequence re-materialises it before the real migration. A future refinement
  could make this ordering implicit.
- **Regulatory path.** Any BNA engagement is a separate, future decision; nothing
  here presumes it.

## Appendix A — Sanitised timeline

Relative order only (no timestamps, no host details):

1. Local preflight and operator quality gates pass on canonical `main`.
2. Gated VM execution adapter implemented, validated locally, merged.
3. Verified release package built and verified from canonical source.
4. Package transferred to the VM; canonical source tree and VM-local state
   materialised and revision-verified.
5. Non-destructive VM dry-run executed; four issues found, fixed in canonical
   source, and re-proven until the dry-run passed with zero residue.
6. Reset plan reviewed (sanitised categories/counts); one further issue (reset loop
   input) found as a fail-closed block, fixed, and re-run.
7. Legacy environment deleted from manifest; post-reset legacy-absence confirmed.
8. Fresh Sandbox bootstrapped; VM-local release state re-materialised.
9. Controlled `banzami_staging` migration applied and verified.
10. Four approved services deployed, healthy and non-root.
11. Final VM verification passed; single-use authorisation deleted; local residue
    zero; operator gates re-confirmed from canonical `main`.

## Appendix B — Sanitised result markers

| Marker | Result |
|--------|--------|
| RELEASE_PACKAGE_VERIFY_RESULT | PASS |
| VM_RELEASE_TRANSFER_APPLY | PASS |
| VM_DRY_RUN_RESULT | PASS |
| VM_LEGACY_RESET_APPLY | PASS (0 legacy remain) |
| VM_SANDBOX_BOOTSTRAP_APPLY | PASS |
| VM_SANDBOX_MIGRATION_APPLY | PASS |
| VM_SANDBOX_DEPLOY_APPLY | PASS (4/4 healthy, non-root) |
| SANDBOX_MIGRATION_VERIFY_RESULT | PASS |
| SANDBOX_DEPLOY_VERIFY_RESULT | PASS |
| SANDBOX_BOOTSTRAP_VERIFY_RESULT | PASS |
| VM_FINAL_VERIFY_RESULT | PASS |
| Operator quality gates | 18 / 18 PASS |

## Appendix C — Service inventory

| Service | Role | Exposure | Runtime user | Data |
|---------|------|----------|--------------|------|
| PostgreSQL 16 | Sandbox database (`banzami_staging`) | Internal only; no host port | Container default (internal) | Synthetic / migrated schema only |
| Redis | Sandbox cache/coordination | Internal only; no host port | Container default (internal) | Synthetic only |
| core-api-staging | Financial core API | Internal only; no host port | Non-root | Synthetic only |
| api-gateway-staging | Gateway / auth surface | Internal only; no host port | Non-root | Synthetic only |
| developer-api | Developer/console API | Internal only; no host port | Non-root | Synthetic only |
| public-api-staging | Consumer/public API instance | Internal only; no host port | Non-root | Synthetic only |

## Appendix D — Control checklist

| # | Control | State |
|---|---------|:-----:|
| 1 | Canonical revision pinned | ✅ |
| 2 | Release package verified | ✅ |
| 3 | SBOM/provenance verified | ✅ |
| 4 | Manifest-scoped reset | ✅ |
| 5 | No global prune | ✅ |
| 6 | Dry-run before reset | ✅ |
| 7 | Internal-only networking | ✅ |
| 8 | PostgreSQL no host port | ✅ |
| 9 | Redis no host port | ✅ |
| 10 | Service allowlist enforced | ✅ |
| 11 | Non-root containers | ✅ |
| 12 | File-only secrets | ✅ |
| 13 | No secrets in Docker env | ✅ |
| 14 | Controlled migration | ✅ |
| 15 | Single-use authorisation | ✅ |
| 16 | Single-use receipt | ✅ |
| 17 | Advisory lock | ✅ |
| 18 | Temporary migration identity removed | ✅ |
| 19 | Stable owner ownership | ✅ |
| 20 | Runtime least privilege | ✅ |
| 21 | Zero customer data | ✅ |
| 22 | No external payment provider | ✅ |
| 23 | No DNS/certificate/SMTP change | ✅ |
| 24 | LIVE not provisioned | ✅ |
| 25 | Production not enabled | ✅ |

## Appendix E — Glossary

| Term | Definition |
|------|------------|
| Banzami | Independent commercial reference operator built on the BANZA protocol. |
| BANZA | Open financial infrastructure protocol (owned externally). |
| Internal technical Sandbox | Operator-run internal test environment; not public, not LIVE. |
| BNA Regulatory Sandbox | External regulatory programme; not claimed or entered here. |
| LIVE | Real-money operator environment; not provisioned here. |
| Production | General-availability operation; not enabled here. |
| Local rehearsal | Fully local, synthetic, disposable rehearsal on the engineer workstation. |
| VM dry-run | Non-destructive rebuild proof on the VM in a temporary isolated project before any reset. |
| Manifest-scoped reset | Deletion limited to an explicit, sanitised resource manifest; no prune. |
| Advisory lock | A database lock ensuring only one migration runs at a time. |
| Stable schema owner | No-login role owning all application objects. |
| Provenance / SBOM | Build attestation and software bill of materials for an image. |

---

## Ready for Internal Functional Testing

**Ready:**

- ✅ Internal Sandbox running (PostgreSQL, Redis, four services), internal-only.
- ✅ `banzami_staging` migrated and ownership-verified.
- ✅ Four approved services healthy, non-root, no host ports.
- ✅ Isolation and secret-boundary controls verified.
- ✅ Reproducible rebuild path proven by a non-destructive dry-run.
- ✅ Suitable for internal, synthetic-data functional testing.

**Intentionally NOT ready (by design):**

- ⛔ LIVE environment — not provisioned.
- ⛔ Production capability — not enabled.
- ⛔ Public API availability / public developer access — not enabled.
- ⛔ Real-money rails / external payment providers — not enabled.
- ⛔ Real customer data — not present.
- ⛔ DNS / TLS certificate / SMTP — unchanged.
- ⛔ BNA approval or BNA Regulatory Sandbox admission — not claimed.

---

*Prepared as internal supporting evidence for the Banzami technical Sandbox file.
Factual record of an internal Sandbox rebuild only. No LIVE, Production, public,
real-payment, customer-data, external-payment-provider, or BNA-approval claim is
made.*
