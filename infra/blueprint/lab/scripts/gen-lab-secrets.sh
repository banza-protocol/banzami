#!/usr/bin/env bash
# Banzami Environment Blueprint — disposable runtime-lab secret generator (Increment 2A)
#
# LOCAL · DISPOSABLE · SYNTHETIC · non-Sandbox · non-LIVE · non-production.
#
# Generates fresh cryptographic synthetic secrets for a SINGLE lab run, OUTSIDE
# the repository, into a newly created 0700 secret root, each file 0600. Secret
# values are never printed, echoed, logged, copied to source or committed. Only
# the (non-secret) secret-root PATH is printed on stdout for the caller.
#
# Usage: gen-lab-secrets.sh <secret_dir>
set -euo pipefail

SECRET_DIR="${1:?secret_dir required}"

case "$SECRET_DIR" in
  /*) : ;;  # absolute path required
  *) echo "gen-lab-secrets: secret_dir must be absolute" >&2; exit 2 ;;
esac
if [ -e "$SECRET_DIR" ]; then
  echo "gen-lab-secrets: secret_dir must not pre-exist (single-use)" >&2; exit 2
fi

umask 077
mkdir -p "$SECRET_DIR"
chmod 0700 "$SECRET_DIR"

# 32 bytes of CSPRNG entropy, base64, url-safe-ish; no shell interpolation of value.
gen_one() {
  local dst="$1"
  ( set +x
    if command -v openssl >/dev/null 2>&1; then
      openssl rand -base64 32 | tr -d '\n/+=' | cut -c1-40
    else
      LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 40
    fi
  ) > "$dst"
  chmod 0600 "$dst"
}

gen_one "$SECRET_DIR/lab_pg_superuser"
gen_one "$SECRET_DIR/lab_runtime_login"
gen_one "$SECRET_DIR/lab_control_login"

# sanity: three non-empty 0600 regular files, dir 0700 — never print contents.
for f in lab_pg_superuser lab_runtime_login lab_control_login; do
  p="$SECRET_DIR/$f"
  [ -f "$p" ] && [ ! -L "$p" ] || { echo "gen-lab-secrets: $f not a regular file" >&2; exit 3; }
  [ -s "$p" ] || { echo "gen-lab-secrets: $f empty" >&2; exit 3; }
done

# emit only the path (not a secret)
printf '%s\n' "$SECRET_DIR"
