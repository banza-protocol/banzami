#!/usr/bin/env bash
# Start the container's own Docker daemon, then register and run the CI runner.
#
# The registration token is short-lived and supplied at start time; it is never
# baked into the image and never written to the repository.
set -euo pipefail

dockerd >/var/log/dockerd.log 2>&1 &
for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
docker info >/dev/null 2>&1 || { echo "dockerd failed to start"; tail -20 /var/log/dockerd.log; exit 1; }
echo "dockerd ready"

cd /actions-runner
if [ ! -f .runner ]; then
  ./config.sh --unattended --replace \
    --url "https://github.com/${GH_OWNER:?}/${GH_REPO:?}" \
    --token "${RUNNER_TOKEN:?}" \
    --name "${RUNNER_NAME:-banzami-ci-1}" \
    --labels "${RUNNER_LABELS:-self-hosted,banzami-ci,linux,arm64}" \
    --work _work
fi

# Deregister cleanly on stop so GitHub does not keep an offline ghost runner.
cleanup() { ./config.sh remove --token "${RUNNER_TOKEN}" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
exec ./run.sh
