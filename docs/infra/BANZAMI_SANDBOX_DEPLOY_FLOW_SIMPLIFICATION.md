# Banzami — Sandbox Deploy Flow Simplification (source-bundle native build)

Version: 1.0

> **Scope note.** Sanitised: no IPs, hostnames, SSH users, paths, DB URLs, tokens or
> secrets. Synthetic/internal Sandbox only — no LIVE, Production, real money, external
> providers, public access, DNS/cert/SMTP, migration or VM reset. Concrete server
> address and secret contents are handled out of band, never in Git.

## Why this change

Routine Sandbox iteration was building `linux/amd64` service images **on the Apple
Silicon Mac under QEMU emulation** (the attested release-package build,
`sandbox-release-package.sh`, run locally) and shipping the result to the server. That
is slow and fragile. The fix keeps the operator command identical but moves the routine
build to the **native amd64 Sandbox server**, driven from a **verified source bundle** —
no Git and no repository history on the server.

## Current flow (before) — as inspected

- **Operator command:** `./deploy.sh <service>` (root `deploy.sh`).
- The `/srv/*` service functions already `rsync` the working tree (excluding `.git`,
  `.env*`) to a build directory and run `docker build` **on the server** — but from an
  ad-hoc working-tree copy (no commit pin, no clean-worktree gate, no manifest/checksum,
  no versioned release directory).
- The **Blueprint Sandbox services** (`core-api-staging`, `api-gateway-staging`,
  `developer-api`, `public-api-staging`) were deployed via the Blueprint flow: the
  attested `sandbox-release-package.sh build` runs **locally on the Mac** (`linux/amd64`
  under QEMU), producing attested images (digests, SBOM/provenance, secret-free), then a
  gated transfer + `sandbox-deploy.sh apply` loads and deploys them. The QEMU build is
  the slow, fragile step.

## Target flow (after)

- **Operator command stays:** `./deploy.sh <service>` (selected-service is the default;
  `--all` must be explicit).
- The local script: validates the Git checkout, requires a clean worktree (unless
  `--allow-dirty`), captures the exact commit, creates a **source bundle** from that
  commit (`git archive`, excludes `.git` and anything not committed), writes a
  **manifest** (commit, timestamp, service, checksum, mode) and a **SHA256 checksum**,
  and transfers **only** the bundle + manifest + checksum.
- The **server** verifies the checksum and manifest, unpacks into a **versioned release
  directory** (previous release kept for rollback), verifies it is **amd64**, builds
  **only the selected service** natively with BuildKit cache, records the image digest,
  runs the existing secret-free image check, deploys/restarts **only that service**
  (reusing the Sandbox's file-only secrets, networks, non-root config), runs the health
  check, and writes a **sanitised deploy receipt**.

## Principles

- **Deploy is initiated from the Mac.** The operator's control point does not change.
- **Git stays only on the Mac/operator machine.** The server never runs `git clone` /
  `git pull`, holds no GitHub credentials, deploy keys, repository history or `.git`.
- **The server receives source bundles, not history.**
- **The server builds natively on amd64** (fast, no emulation).
- **Local Mac `linux/amd64` QEMU build is fallback-only** (`--local-amd64-build-fallback`),
  not the routine path.
- **`./deploy.sh <service>` is the normal operator interface**; selected-service deploy
  is the default; `--all` must be explicit.
- **Build, deploy, migration and E2E are separate concerns.** Deploy never runs a
  database migration; E2E runs only with `--run-e2e`.

## Three build/deploy modes (kept separate — Step 8)

1. **Fast Sandbox iteration (default).** Mac `deploy.sh` creates a source bundle,
   transfers it, and the server builds the selected service **natively on amd64** and
   deploys it. No local QEMU.
2. **Formal evidence / release build.** The reproducible/attested build with digests,
   SBOM/provenance and secret-free verification (`sandbox-release-package.sh` +
   gated transfer/deploy) — preferably on a native amd64 environment. Unchanged; its
   reproducibility, digest, attestation and secret-free checks are preserved.
3. **Local Mac `linux/amd64` QEMU build.** Fallback only
   (`--local-amd64-build-fallback`), not the routine path; not used by default.

## Boundaries preserved

Deploy does not: run migrations, reset the VM, prune unrelated Docker resources, change
DNS/certificates/SMTP, target Production/LIVE, or use real money/customers/external
providers. Secrets remain file-only / in-process and never Docker-inspectable. Rollback
uses the previous validated release + previous image.
