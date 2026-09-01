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
