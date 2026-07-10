# Banzami — Sandbox Infrastructure Runbook

Version: 1.0

> **Scope note.** This runbook describes how to operate, rebuild and migrate the
> **internal technical Sandbox** used for Phase 0 evidence and proposed as the base of
> the Phase 1 pilot. It is **sanitised**: it contains no IPs, hostnames, SSH users,
> private paths, database URLs, tokens, secrets, API keys or provider account details.
> Concrete values (server address, secret contents) are provided operationally out of
> band, never in Git. The Sandbox uses **synthetic data only** — no LIVE, no Production,
> no public availability, no real payments, no real customer data. Phase 0 status:
> **PASS 29 · FAIL 0 · SIMULATED 6 · DEFERRED 0 · BLOCKED 0**.

## 1. Purpose and scope

Provide a complete, reproducible procedure to stand up, operate, verify, back up,
migrate and roll back the internal Sandbox from the version-controlled repository,
without relying on undocumented knowledge, and independently of any specific hosting
provider.

## 2. Assumptions for a clean new server

- A clean, dedicated Linux server the operator controls, reachable over SSH on an
  internal/administrative channel only.
- No pre-existing Banzami state on the target.
- The repository is available at the canonical revision to be deployed.
- Secret material is supplied out of band (never from Git).

## 3. Minimum server requirements

- 64-bit Linux, container runtime + Compose v2.
- Sufficient CPU/RAM/disk for a small container set + a relational database and a
  cache/coordination service (sized to the closed-cohort pilot).
- Outbound access limited to what the build/runtime legitimately needs; **no** public
  inbound service ports.

## 4. Operating system assumptions

- A maintained Linux distribution with a modern shell, `git`, the container runtime and
  Compose v2. Time synchronised (NTP). Host firewall denies public inbound to service
  ports by default.

## 5. Required packages / runtime components

- Container engine + Compose v2; `git`; standard POSIX tooling.
- The attested service images are produced by the release-package build; migrations run
  through a dedicated migration executor image. No ad-hoc package installs on the DB.

## 6. User and permission model

- An administrative OS account is used only to run the gated adapters; services run as
  **non-root**, `no-new-privileges`.
- Database roles follow least privilege: a non-login schema owner owns migrated objects;
  the application runtime role holds DML only (no DDL/ownership/superuser); a short-lived
  migration login (time-bounded, connection-limited) is used only during migrations.

## 7. Directory structure (generic)

- A repository working tree (source of truth).
- A protected, root-only state root holding generated secret files, authorisation and
  receipt records, and evidence — never world-readable, never in Git.
- Release/package artefacts staged under a controlled path. (Exact paths are operational
  and are not recorded here.)

## 8. Secrets handling (file-only, not Docker-inspectable)

- Secrets are written to protected files and **bind-mounted read-only** into containers,
  then **exported in-process** by a narrow entrypoint wrapper. They are **never** passed
  via `-e`, so they do not appear in Docker-inspectable environment/config, in `compose`
  config, or in logs.
- Shared credentials (e.g. gateway↔core and core↔developer service keys) are the same
  value only where a pair must match; generated per run.

## 9. Container network model

- Two internal-only Docker networks (data + application); **no published host ports** on
  any service, database or cache.
- Services resolve each other by in-cluster name/alias; the developer service is reached
  by its canonical in-cluster alias (SSRF-guarded host allow-list).

## 10. Database model and schemas

- A single relational database, logically segregated by schema: an application schema and
  a developer/platform-key schema (`developer.*`). Balances are **derived from the
  ledger** (no persisted balance column). Ownership belongs to the non-login schema owner.

## 11. Canonical migration process

- Schema changes are expressed **only** as canonical, versioned migrations in the
  repository and applied with a forward-only migration runner (tracked, idempotent).
- Runtime DML grants (least privilege) are (re)applied per-schema after migrating.

## 12. Gated migration adapter

- Migrations are applied **only** through the gated adapter: it enforces a release-manifest
  identity gate, issues and consumes a single-use authorisation + receipt, runs under a
  session advisory lock, and **refreshes the short-lived migration login** (whose validity
  expires shortly after bootstrap) using the canonical role bootstrap before applying.
- Invocation is via the gated VM execution wrapper with an explicit `--apply` flag and a
  per-execution authorisation file. Plan-by-default; nothing mutates without authorisation.

## 13. Deploy process

**Deploy model — Git stays only on the Mac; the server builds natively.** The single
authorised local Git working directory is `/Users/fm65/banzami`; no duplicate checkout
(e.g. `banzami-canonical`) may exist locally, and the server must hold no Git checkout,
`.git`, credentials, deploy keys or repository history. `deploy.sh` runs a preflight guard
that refuses the wrong working directory (see `BANZAMI_SINGLE_SOURCE_OF_TRUTH.md`). The
routine operator command is `./deploy.sh <service>` (selected-service is the default;
`--all` must be explicit). It creates a **source bundle** from the exact local commit
(`git archive`; no `.git`, no repository history, no secrets), transfers **only** the
bundle + manifest + checksum, and the **amd64 server builds the selected service
natively** (BuildKit cache) and deploys/restarts only that service (reusing the file-only
secrets + config), with health check + a sanitised receipt. The server never runs
`git clone`/`git pull`, holds no GitHub credentials/deploy keys/repository history/`.git`.
**The Banzami Sandbox does not support local Mac `linux/amd64` QEMU image builds** — there
is no fallback flag and no local image build/export/transfer/load path; any such request is
refused. All Sandbox service builds are performed natively on the amd64 Sandbox server from
a verified source bundle. See `BANZAMI_SANDBOX_DEPLOY_FLOW_SIMPLIFICATION.md`.

- Deploy does **not** run migrations, reset the VM, prune unrelated Docker resources, or
  change DNS/certificates/SMTP; it never targets Production/LIVE and uses no real
  money/customers/external providers. Rollback redeploys the previous validated image.
- **Public website independence.** The institutional website `banzami.com` must start
  independently of payment/admin/gateway/API/pay/checkout/Developer Platform services;
  website restore is separate from payment/Sandbox deploy and must not require a full
  production restore. See `BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md` and
  `BANZAMI_WEBSITE_RECOVERY_RUNBOOK.md`.

**Formal evidence / release build (separate mode).** Build an attested, secret-free
release package (digests + provenance verified), transfer + materialise it, and deploy
the four approved services one-at-a-time, each provenance/digest-validated **before**
deploy and health-checked **after**. Its reproducibility, digest, attestation and
secret-free checks are preserved.

## 14. Health checks

- Each service exposes a health endpoint; deploy waits for healthy status. Post-deploy
  verification asserts: services healthy, non-root, no host ports, internal networks, and
  no secret present in Docker-inspectable environment.

## 15. Phase 0 test execution

- Functional evidence is produced by the Phase 0 harnesses executed **against the internal
  Sandbox over the internal network only** (service-container to service-container), using
  synthetic participants/merchants/platforms and synthetic balances. Auth is bootstrapped
  by minting SANDBOX tokens with the Sandbox's own signing secret held only in memory.

## 16. Evidence collection and sanitisation

- Results are written under the evidence tree using only the status tokens
  PASS/FAIL/SIMULATED/DEFERRED/BLOCKED/NOT_IN_SCOPE, then run through the **sanitiser**,
  which must report clean (no secrets/tokens/IDs/hostnames/IPs/paths/raw outputs).

## 17. Backup procedure

- Take a consistent logical backup of the database and copy the protected state files
  (secret files, authorisation/receipt/evidence roots) to secure, access-controlled
  storage. Record the repository revision and migration version alongside the backup.

## 18. Restore procedure

- On a prepared target, restore the database backup and the state files, check out the
  matching repository revision, refresh roles/login, and run post-restore verification
  (schema present, grants correct, services healthy). Reconcile before resuming.

## 19. Server migration procedure

- Follow the Server Migration Checklist: freeze → backup → prepare target → checkout →
  place secret files → refresh roles → apply migrations (gated) → deploy → health checks →
  Phase 0 smoke tests → reconciliation → evidence sanitisation → sign-off. See
  `BANZAMI_SERVER_MIGRATION_CHECKLIST.md`.

## 20. Rollback procedure

- If verification fails: stop the new deploy, restore the previous database backup and
  state, redeploy the prior release revision, and re-run health + reconciliation. Do not
  force-apply schema changes; roll forward only via the gated migration adapter.

## 21. Emergency suspension procedure

- Suspend affected participants and revoke platform keys (fail-closed). If needed, stop the
  affected service(s) to halt new operations while preserving the database and evidence.
  Classify and, when material, report the incident to the BNA (Annex F). Never wipe data as
  a suspension measure.

## 22. Post-migration verification checklist

- Schema present with expected tables; runtime role has least-privilege grants on the
  intended schemas only; services healthy, non-root, no host ports; a Phase 0 smoke test
  passes; reconciliation shows zero discrepancy; evidence sanitiser clean.

## 23. What must never be done manually

**Binding operational rules:**

- **No ad-hoc SQL for state changes.**
- **No manual database mutation outside the migration system.**
- **No VM reset unless explicitly approved.**
- **No secrets in Git.**
- **No secrets in Docker-inspectable environment.**
- **No production/LIVE target.**
- **No real customer data in the Sandbox.**

Read-only verification queries (diagnostics) are permitted; any state change goes through
the canonical, gated migration/deploy adapters only.
