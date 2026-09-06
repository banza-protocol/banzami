#!/usr/bin/env bash
# Running a proof on the Sandbox host, and believing the answer.
#
# Every script here that needs the operator's containers copies itself to the VM
# and runs there. Two things went wrong with the way that was written, and both
# turned a check into decoration:
#
#   THE STATUS WAS THROWN AWAY. The remote command ended with a cleanup `rm`,
#   and ssh returns the status of the last command it ran. Ledger reconciliation,
#   the canonical binding proof, both prunes and both audits had been returning 0
#   no matter what happened on the other end.
#
#   THE HOST WAS NOT CHECKED. A container inventory ran against the docker daemon
#   on a laptop, found no Banzami containers, and reported the Sandbox clean.
#   "I looked and saw nothing" and "there is nothing" are different sentences.
#
# So: identity first, then the proof, then cleanup that cannot overwrite the
# proof's verdict.
#
# Callers source it through a small resolver, because the path differs between
# the repository and the directory it is copied into on the VM:
#
#   for p in "$(dirname "$0")/remote.sh" "$(dirname "$0")/lib/remote.sh" \
#            "$(dirname "$0")/../../tools/ops/lib/remote.sh"; do
#     [ -f "$p" ] && { . "$p"; break; }
#   done
#   remote_self_or_continue "$@"
#   # from here on, the script is running ON the Sandbox host
#
# Set BANZAMI_REMOTE to change the target. Set BANZAMI_ON_VM=1 to assert the
# script is already there — it then verifies that claim rather than trusting it.

# Is this the canonical Sandbox host? The marker is the deployed project's own
# core-api container: it exists only where the operator actually runs, needs no
# secret to observe, and cannot be true of a developer's laptop.
remote_is_sandbox_host() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'bzsandbox-.*-core-api-staging'
}

# The canonical remote contract:
#   set -e semantics remotely, the proof's status captured before cleanup,
#   cleanup in a trap so it runs on any exit, and the proof's status returned.
# A cleanup failure never turns a failed proof into a pass, and never hides one.
remote_self_or_continue() {
  if remote_is_sandbox_host; then
    return 0                      # already there — carry on
  fi

  if [ "${BANZAMI_ON_VM:-0}" = "1" ]; then
    echo "✗ BANZAMI_ON_VM is set, but this is not the canonical Sandbox host." >&2
    echo "  No bzsandbox core-api container is running here. Refusing to continue:" >&2
    echo "  a check that runs somewhere else and passes is worse than no check." >&2
    exit 2
  fi

  local target="${BANZAMI_REMOTE:-root@217.160.9.248}"
  local base; base=$(basename "$0")
  local dir="/tmp/bz-remote-$$"
  local lib; lib="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/remote.sh"

  # The script and this library travel together into one directory, so the copy
  # on the far side can source it by a path that exists there. Sending only the
  # script leaves it unable to find the very contract it is calling.
  ssh "$target" "mkdir -p $dir" >/dev/null 2>&1 || { echo "✗ could not reach $target" >&2; exit 2; }
  # A caller whose proof needs data files — a manifest, an allowlist — names
  # them in REMOTE_EXTRA_FILES. Sending the script without the file it compares
  # against produces a check that cannot run, which historically becomes a check
  # that is quietly skipped.
  # The caller's arguments are needed further down, so they are captured before
  # anything touches the positional parameters. An earlier attempt used `set --`
  # to build the file list and silently overwrote them — the remote script would
  # have been invoked with the wrong arguments, which is the kind of break that
  # shows up as a confusing failure somewhere else entirely.
  local args; args=$(printf '%q ' "$@")

  # `"${extra[@]}"` on an empty array is an unbound-variable error under `set -u`
  # in the bash that ships with macOS, so the file list is a plain string.
  local f files="$0 $lib"
  for f in ${REMOTE_EXTRA_FILES:-}; do [ -f "$f" ] && files="$files $f"; done
  # shellcheck disable=SC2086 — the paths here are ours and contain no spaces
  scp -q $files "$target:$dir/" \
    || { echo "✗ could not copy $base to $target" >&2; exit 2; }

  # The remote side runs the script, keeps its status, removes the copies from a
  # trap so cleanup happens on any exit, and then exits with the status it kept.
  # That last statement is what ssh reports, so the caller sees the proof's
  # verdict and never the cleanup's.
  ssh "$target" "BANZAMI_ON_VM=1 bash -c '
      rc=0
      trap \"rm -rf $dir\" EXIT
      bash $dir/$base $args || rc=\$?
      exit \$rc
    '"
  exit $?
}
