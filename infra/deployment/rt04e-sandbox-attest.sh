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

# 1+2. Verify Compose supports the required CONFIDENTIALITY + SAFE flags before
#       proceeding; fail closed if any is missing. --no-env-resolution keeps service
#       env files unresolved and environment values out of the model entirely.
docker compose version >/dev/null 2>&1 || die "docker compose unavailable — refusing" 2
help="$(docker compose config --help 2>&1 || true)"
for flag in --no-interpolate --no-env-resolution --format; do
  printf '%s' "$help" | grep -q -- "$flag" || die "docker compose config lacks $flag — required confidentiality/safe flag unavailable" 2
done
# up-side isolation flags must also be supported (checked here so we fail before mutation)
uphelp="$(docker compose up --help 2>&1 || true)"
for flag in --no-build --pull --force-recreate --no-deps; do
  printf '%s' "$uphelp" | grep -q -- "$flag" || die "docker compose up lacks $flag — isolation guarantee unavailable" 2
done

# Hermeticity: refuse if any inherited COMPOSE_* control could steer file/project/
# profile/orphan selection (the central wrapper also unsets them for the child).
rt04e_assert_clean_compose_env || die "inherited COMPOSE_* control present — refusing (hermeticity)" 2

# Authoritative model via the central hermetic wrapper. config --no-interpolate
# --no-env-resolution --format json is piped DIRECTLY to the constrained parser;
# the resolved config is never printed, logged or written to disk. Both projections
# run: PROJECTION=base proves api-gateway-staging is overlay-only (absent from base),
# PROJECTION=full proves the four services + literal immutable references.
CFG="config --no-interpolate --no-env-resolution --format json"

# Projection A — approved base ONLY (no overlay, no override).
if ! rt04e_compose base "$RT04E_OVERRIDE" $CFG 2>/dev/null \
     | RT04E_PROJECTION=base RT04E_RELEASE_REV="$RT04E_RELEASE_REV" node "$PARSER"; then
  die "base-only projection FAILED — overlay-provenance/structure invalid — refusing to mutate" 1
fi
printf '  attestation A (base-only): PASS — base services present, gateway overlay-only\n'

# Projection B — full RT04E composition (base → gateway overlay → immutable override).
if ! rt04e_compose full "$RT04E_OVERRIDE" $CFG 2>/dev/null \
     | RT04E_PROJECTION=full RT04E_RELEASE_REV="$RT04E_RELEASE_REV" node "$PARSER"; then
  die "full-composition projection FAILED — refusing to mutate" 1
fi
printf '  attestation B (full): PASS — four services resolve to literal immutable RT04E references\n'
