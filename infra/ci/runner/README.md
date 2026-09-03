# Banzami self-hosted CI runner

Zero-billing CI for a **private** repository. Replaces GitHub-hosted runners,
which bill against the organisation once the included minutes are gone — the
condition that blocked a critical security release for ~8 hours on 2026-08-31.

## Why a Linux container and not the Mac directly

Three jobs (Rust, Go api-gateway, Migrations) use `services: postgres`. GitHub is
explicit that service containers require a **Linux** runner with Docker:

> *"If your workflows use Docker container actions, job containers, or service
> containers, then you must use a Linux runner ... If you are using self-hosted
> runners, you must use a Linux machine as your runner and Docker must be
> installed."*

A macOS runner therefore cannot run them. The runner is a Linux container on
Docker Desktop's VM.

## Why docker-in-docker rather than the host socket

With the host socket mounted, a service container is a sibling on the host daemon
and its published port lands on the daemon host — not inside the runner. The job
would look for postgres on its own `localhost:5433` and find nothing. Running our
own `dockerd` puts service containers on *this* container's localhost, which is
what the workflows already expect. No host path and no host socket is mounted.

## Security boundary

The runner executes repository code, so it holds **no** production material: no
database credentials, no Cloudflare tokens, no signing keys, no SSH keys, no
financial secrets. `docker inspect` shows **0 mounts**.

Deployment authority is kept off it deliberately. The `deploy` job is the only
one receiving `DEPLOY_SSH_KEY` / `DEPLOY_HOST` / `DEPLOY_USER`, and it stays on
`ubuntu-latest`. It is opt-in behind `ENABLE_CI_DEPLOY` and currently disabled,
so it consumes no hosted minutes.

`--privileged` is required for the inner `dockerd`. That privilege is confined to
the Docker Desktop Linux VM, not to macOS.

## Run

```bash
docker build -t banzami-ci-runner:local infra/ci/runner

TOKEN=$(gh api -X POST repos/banza-protocol/banzami/actions/runners/registration-token -q .token)
docker run -d --name banzami-ci-runner --privileged --restart unless-stopped \
  -e GH_OWNER=banza-protocol -e GH_REPO=banzami -e RUNNER_TOKEN="$TOKEN" \
  -e RUNNER_NAME=banzami-ci-mac \
  -e RUNNER_LABELS='self-hosted,banzami-ci,linux,arm64' \
  -v banzami-ci-dind:/var/lib/docker \
  banzami-ci-runner:local
```

The `banzami-ci-dind` volume is **required**, not an optimisation. Without it the
inner daemon stores images on the container's own overlay filesystem, and
overlay-on-overlay is rejected by the kernel:

```
failed to mount ... fstype: overlay ... err: invalid argument
```

The visible symptom is every job with a `services:` block failing at *Initialize
containers* while jobs without one pass — which reads like a service-container
problem and is actually a storage-driver one. It is a Docker-managed volume, not
a host path: the runner still mounts nothing from the host filesystem and has no
host Docker socket.

The registration token is short-lived, supplied at start time, and never baked
into the image or committed.

## Availability

CI runs only while the Mac is powered on, online, and this container is running.
Otherwise jobs **queue** — they must never fall back to paid hosted runners, and
no such fallback is configured. A queued job is visible in the Actions tab; a job
that never starts is not a pass.

## Architecture caveat — stated, not hidden

The runner is **arm64**; production is **amd64**. Go and Rust unit tests are
largely architecture-independent, and the deploy pipeline builds natively on the
amd64 server, so the shipped artefact is still compiled and checked for its real
target. But CI no longer executes on production's architecture, and that is a
genuine reduction in what CI proves. Moving to an amd64 CI host would remove it.

Related: the gitleaks download was hard-coded to `linux_x64` and silently would
not run here; it now selects the asset matching the runner's architecture.

## Two traps found while building this

`installdependencies.sh` does **not** install libicu on Ubuntu 24.04 — it probes
for long-obsolete versions (`libicu52`), finds none, and exits **successfully**
having installed nothing. The runner then starts and dies with *"Libicu's
dependencies is missing for Dotnet Core"*. `libicu74` is installed explicitly.

That script also runs `apt-get install`, so package lists must exist when it
executes. Clearing them in an earlier layer made it a silent no-op.

## Two more differences from `ubuntu-latest`, found by running it

**Rust and Node must be in the image.** GitHub's hosted image ships both
preinstalled, and
some jobs quietly depend on that: the Migrations job calls `cargo install
sqlx-cli` without a `rust-toolchain` step and `node tools/check-schema-manifest.mjs`
without a `setup-node` step — both failed with exit 127. Jobs that do pin a
version still override these at job time.

**Link parallelism is capped** via `CARGO_BUILD_JOBS=2`. The Docker Desktop VM
has ~4 GB and cargo links one test binary per CPU (8 here); several concurrent
linkers exhaust it and the kernel OOM-kills the linker:

```
collect2: fatal error: ld terminated with signal 9 [Killed]
```

Capping concurrency alone was not enough, so debug info is dropped too
(`CARGO_PROFILE_TEST_DEBUG=0`) — it dominates link-time memory for these
binaries. Every test still compiles and still runs; only backtrace detail in a
failing test is reduced, never which tests execute.

**The better fix is more memory.** Docker Desktop → Settings → Resources; the VM
currently has ~4 GB for 8 CPUs. With more, both settings can be relaxed and CI
gets faster.

## Production architecture (arm64 CI, amd64 production)

CI runs on arm64; production runs on amd64. Tests passing on arm64 are real
evidence, but they are not evidence that the artefacts we ship even compile for
the architecture they run on — so the image carries an amd64 cross-toolchain and
the `amd64-artifacts` job builds every deployable artefact for
`x86_64-unknown-linux-gnu` on each run.

The linker alone is not enough: `ring` compiles C, so `libc6-dev-amd64-cross` is
required too. Without it the cross build dies inside cc-rs rather than in Rust,
which is a confusing place to land.

**What this proves and what it does not.** It proves every production artefact
*builds and links* for amd64, moving architecture breakage from deploy time to CI
time. It does **not** prove amd64 *runtime* behaviour — nothing here executes an
amd64 binary. Genuine amd64 execution testing would need an amd64 runner, and the
deploy path still builds natively on the amd64 server.

The job asserts the ELF machine type of each artefact rather than trusting the
build to have targeted what it was asked to, since a build that silently emitted
arm64 would otherwise pass while proving nothing.
