# Increment 2D — Final Migration Identity and Derived Executor Attestation

**Status:** Increment 2D (local disposable lab). **Version:** 1.0

> **Scope boundary.** Local, synthetic, disposable lab only. Not a VM deployment, not
> Sandbox, not LIVE, not Production. Never contacts the VM, never uses `banzami_staging`,
> never invokes the production RT04E entrypoint, creates no authorisation record, receipt
> or advisory-lock test (those are 2E).

## A. Derived migration-executor attestation
The image that actually executes migrations receives its own immutable identity and
attestation — parent-image evidence alone is insufficient. It is built from the attested
2B runner supplied as an `oci-layout` build-context **pinned to the parent's content
digest** (captured before the build, validated as `sha256:…`, never a substitutable tag),
with the executor's **own SBOM + provenance**, and labels binding it to: full source
revision, parent content digest, embedded ordered canonical migration digest, derived
Dockerfile material digest, and the unique run identity. Evidence is validated per run
(SBOM valid + secret-free; provenance valid, contains the revision, links the parent
digest, secret-free) and removed at teardown. No registry login/push, no external signing,
no transparency-log upload, no byte-identical-reproducibility claim.

## B. Short-lived migration login lifecycle
The final migration identity is a per-run login (`LOGIN`, `CONNECTION LIMIT 1`,
`VALID UNTIL <expiry>`, `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`).
It is the **only** role granted membership of the `NOLOGIN` stable schema owner plus an
automatic `SET ROLE`, so canonical migrations create objects owned by the stable owner.
Runtime and control-plane roles are **not** owner members and cannot assume the owner.
No blanket grants; the superuser only creates roles and transfers ownership of the empty
`public` schema — it never applies migrations and never pre-creates a migration object.

Proven at runtime: the login authenticates; applies the full canonical set; all
application objects + the metadata table are owned by the stable owner; the login owns
nothing; runtime and control-plane own nothing and are not owner members; the login is
least-privilege (attributes + connection limit + valid-until); and after execution the
login is **removed**, its **owner-membership is gone**, and its **credential is unusable**.
If the least-privilege model could not satisfy the canonical migrations, the lab HOLDs
rather than escalate to superuser.

## Secrets
Fresh synthetic secrets per run, outside the repo (`0700`/`0600`, regular non-symlink,
hard-link 1, effective read-only mount, guarded current-run-only removal). The credential
never appears in Docker env/config/argv/logs/image metadata/SBOM/provenance/evidence/reports.

## Remaining (out of scope for 2D)
- **2E** — single-use authorisation record bound to target/revision/digests/service-set,
  receipt lifecycle, advisory-lock concurrency, real file-only path proof.
- **2F** — unified `blueprint-complete-lab` chaining 2A→2E twice from clean state.
- **Service-image attestation** — attested images for the four Sandbox services.
- **VM reset + Sandbox bootstrap + controlled migration + deployment** — later phases.

No Sandbox, LIVE, Production, payment, receipt, advisory-lock, deployment or VM readiness
is certified by Increment 2D.
