# Banzami — Server Migration Checklist (Sandbox)

Version: 1.0

> **Scope note.** Concise checklist to move the internal **Sandbox** to another server.
> Sanitised: no IPs, hostnames, SSH users, paths, database URLs, tokens or secrets.
> Synthetic data only — no LIVE, no Production, no public availability, no real payments,
> no real customer data. Concrete addresses/credentials are handled out of band, never in
> Git. Use with `BANZAMI_SANDBOX_INFRASTRUCTURE_RUNBOOK.md`.

Legend: ☐ = to do · record date/operator/outcome for each item.

## 1. Pre-migration freeze
- ☐ Announce a maintenance window; stop issuing new synthetic operations.
- ☐ Record current repository revision and database migration version.

## 2. Backup
- ☐ Consistent logical database backup taken and verified restorable.
- ☐ Protected state files (secret files, authorisation/receipt/evidence roots) copied to
  secure, access-controlled storage.

## 3. Target server preparation
- ☐ Clean Linux host with container engine + Compose v2, time synchronised.
- ☐ Host firewall denies public inbound to service ports; no public ports planned.

## 4. Repository checkout
- ☐ Check out the exact canonical revision to be deployed.

## 5. Secret file placement
- ☐ Place secret files into the protected, root-only state root (file-only; never `-e`,
  never in Git). Verify permissions restrict access to the administrative account.

## 6. Role / bootstrap refresh
- ☐ Ensure database roles exist with least privilege; refresh the short-lived migration
  login (time-bounded) — via the canonical role bootstrap only.

## 7. Migration apply (gated)
- ☐ Apply canonical migrations through the **gated migration adapter** (single-use
  authorisation + receipt, advisory lock, manifest identity gate). No ad-hoc SQL.

## 8. Deploy
- ☐ **Routine:** `./deploy.sh <service>` — source bundle from the exact commit (no
  `.git`/history/secrets) → transfer bundle+manifest+checksum → server builds the
  selected service **natively on amd64** → deploy that service → health check → sanitised
  receipt. Selected-service is the default; `--all` explicit. Git stays only on the Mac;
  the server holds no Git/history/credentials. (See
  `BANZAMI_SANDBOX_DEPLOY_FLOW_SIMPLIFICATION.md`.)
- ☐ **Formal/release:** build/transfer the attested, secret-free release package; deploy
  the four approved services (provenance/digest-validated before, health-checked after).
  Local Mac `linux/amd64` QEMU image builds are **removed / unsupported** — all Sandbox
  service builds run natively on the amd64 Sandbox server from a verified source bundle.

## 9. Health checks
- ☐ All services healthy, non-root, no host ports, internal networks only, no secret in
  Docker-inspectable environment.

## 10. Phase 0 smoke tests
- ☐ Run the Phase 0 harness subset (QR pay, a pilot-limit rejection, an intent, a refund,
  a platform key auth) over the internal network; confirm expected results.

## 11. Reconciliation check
- ☐ Reconcile expected vs ledger-derived balances for the smoke set; discrepancy = zero.

## 12. Evidence sanitisation
- ☐ Run the evidence sanitiser; confirm clean (no secrets/tokens/IDs/hostnames/IPs/paths).

## 13. Rollback conditions
- ☐ If any of health, smoke tests, reconciliation or sanitisation fails: stop the new
  deploy, restore the prior database backup + state, redeploy the previous revision, and
  re-verify. Roll schema forward only via the gated adapter — never force-apply.

## 14. Final sign-off
- ☐ Record revision, migration version, verification outcomes and operator.
- ☐ Obtain operator + accountable-owner sign-off before resuming the cohort.

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Operator | | | |
| Accountable owner (Banzami) | | | |

**Never:** ad-hoc SQL for state changes · manual DB mutation outside the migration system ·
VM reset unless explicitly approved · secrets in Git · secrets in Docker-inspectable
environment · a production/LIVE target · real customer data in the Sandbox.
