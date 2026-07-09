# Sandbox Local Deploy — Source-Bundle Native-Build Evidence

Version: 1.0

> **Scope note.** Sanitised: no IPs, hostnames, SSH users, paths, DB URLs, tokens or
> secrets. Internal Sandbox only — no LIVE, Production, real money, real customers,
> external providers, real EMIS callback, public access, DNS/cert/SMTP change, database
> migration, VM reset or destructive Docker prune was used.

## Old flow (before)

Routine Sandbox iteration built `linux/amd64` service images **on the Apple Silicon Mac
under QEMU emulation** (the attested `sandbox-release-package.sh` run locally), then
transferred the images and deployed them via the gated adapter. The QEMU build was the
slow, fragile step (≈10–20 min).

## New flow (after)

`./deploy.sh <service>` stays the operator command. It: validates the Git checkout,
requires a clean worktree (unless `--allow-dirty`), captures the exact commit, creates a
**source bundle** (`git archive`; excludes `.git` and all untracked files, so no secrets
are shipped), writes a **manifest** (commit, services, mode, checksum) and a **SHA256
checksum**, and transfers **only** the bundle + manifest + checksum. The **amd64 server**
verifies the checksum, unpacks a **versioned release** (previous kept for rollback),
verifies architecture, **builds only the selected service natively** (BuildKit cache),
records the image digest, runs a **secret-free image check**, and deploys/restarts only
that service (cloning the running container's file-only secret mounts + config), with a
health check and a **sanitised receipt**.

## Confirmations

| Confirmation | Result |
|--------------|:------:|
| Git is **not** required on the server (no `git clone`/`git pull`) | CONFIRMED |
| Server has **no** `.git` directory / repository history | CONFIRMED (checked: no `.git` in the release) |
| Server holds **no** GitHub credentials / deploy keys | CONFIRMED (only a verified source bundle is transferred) |
| Repository history is **not** transferred | CONFIRMED (`git archive` ships only committed files at the commit) |
| Secrets are **not** in the bundle | CONFIRMED (untracked `.env`/secret/runtime files are excluded) |
| Local Mac QEMU build is **not** the default path | CONFIRMED (fallback-only, explicit `--local-amd64-build-fallback`) |
| Selected-service deploy works | CONFIRMED (real `./deploy.sh developer-api`) |
| `--all` is not the default | CONFIRMED (explicit flag) |

## Validation performed

- **Shell syntax** (`bash -n`): PASS for `deploy.sh`, `sandbox-source-deploy.sh`,
  `remote-native-build.sh`, `sandbox-deploy.sh`.
- **Routing**: `developer-api`, `core-api-staging …`, `--all --build-only` route to the
  Sandbox source-bundle flow; production service names / bare invocations are untouched.
- **Dry-run** (`./deploy.sh developer-api --dry-run`): bundle created + plan printed; no
  transfer/build/deploy.
- **Real `--build-only`** (`./deploy.sh developer-api --build-only`): source bundle →
  transfer → server `checksum_verify PASS` → `arch_amd64 PASS` → native `build PASS` →
  image digest recorded → `image_secret_free PASS`.
- **Real full deploy** (`./deploy.sh developer-api`): the above **plus**
  `deployed_and_healthy PASS`. Independent post-deploy check: developer-api **healthy**,
  **non-root**, **no host ports**, running the **native-built** image, **no secret in the
  Docker-inspectable environment**; **all four Sandbox services healthy (4/4)**; the
  server has **no `.git`**.

## Timing comparison (measured)

| Path | Wall-clock (developer-api) |
|------|----------------------------|
| Old: local Mac `linux/amd64` QEMU image build | ≈ several minutes to ~10–20 min |
| New: source bundle → transfer → **native amd64 server build**, `--build-only` | ≈ 29 s |
| New: full `./deploy.sh developer-api` (build + deploy + health) | ≈ 20 s |

## Limitations and fallback mode

- Three modes are kept separate: (1) fast Sandbox iteration (source bundle → native
  server build, default); (2) formal evidence/release build (attested, digests,
  SBOM/provenance, secret-free — unchanged); (3) local Mac `linux/amd64` QEMU build
  (fallback-only, `--local-amd64-build-fallback`).
- The reproducibility/attestation/secret-free checks of mode (2) are preserved; the fast
  path performs a native build + a secret-free image check (not the full attestation) and
  is intended for iteration, not formal release evidence.
- The fast redeploy clones the running service container's config; a full gated `apply`
  must have established the Sandbox at least once.

## Non-usage confirmation

No Production, LIVE, real money, real customers, real personal data, external payment
providers, real EMIS callback, public access, DNS/certificate/SMTP change, database
migration, VM reset or destructive Docker prune was used. Secrets remained file-only /
in-process and never appeared in committed files, evidence, or the Docker-inspectable
environment.
