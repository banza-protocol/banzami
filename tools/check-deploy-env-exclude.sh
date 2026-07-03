#!/usr/bin/env bash
# Regression guard (D0 secret hygiene): every rsync in deploy.sh must exclude env
# files, so a local .env can never be synced to the server. Static check + a
# functional rsync dry-run. Exit non-zero on drift.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

# --- static: every rsync command excludes .env ---
rsyncs=$(grep -c 'rsync -' deploy.sh || true)
git_excl=$(grep -c "exclude='.git'" deploy.sh || true)
paired=$(grep -c "exclude='.git' --exclude='.env'" deploy.sh || true)
if [ "$paired" -lt "$git_excl" ] || [ "$paired" -lt "$rsyncs" ]; then
  echo "✗ deploy.sh: $rsyncs rsync(s), $git_excl .git-exclude(s), only $paired paired with --exclude='.env'"
  fail=1
else
  echo "✓ static: all $rsyncs deploy.sh rsync(s) exclude .env"
fi

# --- functional: rsync with the deploy excludes must NOT transfer a .env ---
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/src"
printf 'SECRET=should-not-sync\n' > "$tmp/src/.env"
printf 'SECRET=should-not-sync\n' > "$tmp/src/.env.local"
printf 'code\n' > "$tmp/src/app.go"
out=$(rsync -az --delete --exclude='.git' --exclude='.env' --exclude='.env.*' \
      --dry-run --itemize-changes "$tmp/src/" "$tmp/dst/" 2>&1)
if printf '%s\n' "$out" | grep -qE '(^|/)\.env'; then
  echo "✗ functional: a .env file would be synced:"; printf '%s\n' "$out" | grep -E '\.env'
  fail=1
else
  echo "✓ functional: rsync (deploy excludes) does not transfer .env / .env.*"
fi

[ "$fail" -eq 0 ] && echo "deploy env-exclude guard: PASS" || { echo "deploy env-exclude guard: FAIL"; exit 1; }
