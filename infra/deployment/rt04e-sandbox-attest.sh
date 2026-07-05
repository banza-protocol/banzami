#!/usr/bin/env bash
# =============================================================================
# RT04E semantic Compose attestation — REVIEWED TEMPLATE, NOT AUTO-RUN
# =============================================================================
# Uses the Docker Compose ENGINE (non-mutating `config`) as the authoritative
# model — NOT grep/awk. Runs BEFORE any migration checkpoint, migration, image
# build, service replacement or rollback decision. Fails closed on any anomaly.
#
# Flow: verify Compose supports the required safe flags -> `config --no-interpolate
# --format json` over the fixed base+overlay+RT04E-override file set -> pipe the
# JSON DIRECTLY to the constrained parser (no full config printed/stored) -> the
# parser emits only PASS/FAIL per service.
#
# Usage: RT04E_RELEASE_REV=<rev> RT04E_OVERRIDE=<generated-override> rt04e-sandbox-attest.sh
# -----------------------------------------------------------------------------
set -euo pipefail
set +x
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/rt04e-sandbox-lib.sh"
PARSER="$HERE/../../tools/rt04e-attest-parser.mjs"
die() { printf 'attest: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }

: "${RT04E_RELEASE_REV:?RT04E_RELEASE_REV required}"
rt04e_valid_rev "$RT04E_RELEASE_REV" || die "RT04E_RELEASE_REV is not a valid git revision" 1
: "${RT04E_OVERRIDE:?RT04E_OVERRIDE (generated immutable-image override) required}"
[ -f "$RT04E_OVERRIDE" ] || die "generated RT04E override not found — refusing" 1
[ -f "$PARSER" ] || die "attestation parser missing — refusing" 1

# 1+2. Verify Compose supports the required SAFE flags before proceeding; fail closed.
docker compose version >/dev/null 2>&1 || die "docker compose unavailable — refusing" 2
help="$(docker compose config --help 2>&1 || true)"
for flag in --no-interpolate --format; do
  printf '%s' "$help" | grep -q -- "$flag" || die "docker compose config lacks $flag — required safe flag unavailable" 2
done
# up-side isolation flags must also be supported (checked here so we fail before mutation)
uphelp="$(docker compose up --help 2>&1 || true)"
for flag in --no-build --pull --force-recreate --no-deps; do
  printf '%s' "$uphelp" | grep -q -- "$flag" || die "docker compose up lacks $flag — isolation guarantee unavailable" 2
done

# 3+4+5. Authoritative model: config --no-interpolate, piped DIRECTLY to the parser.
#        The full resolved config is never printed, logged or written to disk.
files="$(rt04e_compose_file_args "$RT04E_OVERRIDE")"
if ! ( cd "$RT04E_COMPOSE_DIR" && docker compose $files config --no-interpolate --format json 2>/dev/null ) \
     | RT04E_RELEASE_REV="$RT04E_RELEASE_REV" node "$PARSER"; then
  die "semantic compose attestation FAILED — refusing to mutate" 1
fi
printf '  attestation: PASS — four services resolve to literal immutable RT04E references (semantic)\n'
