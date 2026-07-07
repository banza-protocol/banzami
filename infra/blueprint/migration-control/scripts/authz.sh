#!/usr/bin/env bash
# Banzami Increment 2E — single-use authorisation record + receipt lifecycle library.
#
# Pure filesystem lifecycle for the controlled migration path. Records are KEY=VALUE
# files bound to the migration's immutable identity; they contain NO secret, URL or
# credential. Both are current-run-only, non-symlink, single-hard-link, strictly
# time-limited, atomically consumed, and never returned to pending after failure.
# No hidden prompt / PTY / expect / env override is involved anywhere.
set -euo pipefail

AUTHZ_TARGET_FIXED="banzami_staging"     # the ONLY permitted controlled-migration target

_now() { date -u '+%s'; }

# fail-closed file-shape assertion
_file_ok() { # <file>
  local f="$1"
  [ -e "$f" ] || return 1
  [ ! -L "$f" ] || return 1
  [ -f "$f" ] || return 1
  [ "$(stat -f '%l' "$f" 2>/dev/null || stat -c '%h' "$f")" = "1" ] || return 1
  # never a secret/URL/credential inside
  ! grep -qiE 'password|secret|://[^ ]*:[^ ]*@|BEGIN [A-Z ]*PRIVATE KEY' "$f" || return 1
  return 0
}
_get() { grep -E "^$2=" "$1" | head -1 | cut -d= -f2-; }

# atomic KEY rewrite (issued -> consumed) via temp+rename; refuse unless currently issued
_consume() { # <file> <kind>
  local f="$1" kind="$2" tmp
  _file_ok "$f" || { echo "authz: $kind file shape invalid" >&2; return 1; }
  [ "$(_get "$f" state)" = "issued" ] || { echo "authz: $kind not in issued state (single-use)" >&2; return 1; }
  tmp="$(dirname "$f")/.$(basename "$f").consuming.$$"
  sed 's/^state=issued$/state=consumed/' "$f" > "$tmp"
  chmod 0600 "$tmp"
  mv -f "$tmp" "$f"     # atomic within the same dir
  [ "$(_get "$f" state)" = "consumed" ] || { echo "authz: $kind consume failed" >&2; return 1; }
  return 0
}

# ---- authorisation record ----
authz_issue() { # <dir> <rev> <parent> <exec> <mig> <service_set> <ttl_sec>
  local dir="$1" rev="$2" parent="$3" exe="$4" mig="$5" svc="$6" ttl="$7" f="$1/authz.record" n
  n="$(_now)"
  umask 077
  { echo "kind=authorisation"
    echo "target=$AUTHZ_TARGET_FIXED"
    echo "source_revision=$rev"
    echo "parent_digest=$parent"
    echo "executor_digest=$exe"
    echo "migration_digest=$mig"
    echo "service_set=$svc"
    echo "issued_epoch=$n"
    echo "expiry_epoch=$((n + ttl))"
    echo "state=issued"; } > "$f"
  chmod 0600 "$f"
  printf '%s\n' "$f"
}

authz_validate() { # <file> <rev> <parent> <exec> <mig> <service_set>
  local f="$1" rev="$2" parent="$3" exe="$4" mig="$5" svc="$6" n; n="$(_now)"
  _file_ok "$f" || { echo "authz: record file shape invalid" >&2; return 1; }
  [ "$(_get "$f" kind)" = "authorisation" ] || { echo "authz: wrong kind" >&2; return 1; }
  [ "$(_get "$f" target)" = "$AUTHZ_TARGET_FIXED" ] || { echo "authz: target not $AUTHZ_TARGET_FIXED" >&2; return 1; }
  local r; r="$(_get "$f" source_revision)"
  [ "${#r}" -eq 40 ] || { echo "authz: revision not 40-char" >&2; return 1; }
  [ "$r" = "$rev" ] || { echo "authz: revision mismatch" >&2; return 1; }
  [ "$(_get "$f" parent_digest)" = "$parent" ] || { echo "authz: parent digest mismatch" >&2; return 1; }
  [ "$(_get "$f" executor_digest)" = "$exe" ] || { echo "authz: executor digest mismatch" >&2; return 1; }
  [ "$(_get "$f" migration_digest)" = "$mig" ] || { echo "authz: migration digest mismatch" >&2; return 1; }
  [ "$(_get "$f" service_set)" = "$svc" ] || { echo "authz: service set mismatch" >&2; return 1; }
  [ "$(_get "$f" state)" = "issued" ] || { echo "authz: not issued (consumed?)" >&2; return 1; }
  local ie ee; ie="$(_get "$f" issued_epoch)"; ee="$(_get "$f" expiry_epoch)"
  [ "$ie" -le "$n" ] || { echo "authz: future-issued record" >&2; return 1; }
  [ "$ee" -gt "$n" ] || { echo "authz: expired record" >&2; return 1; }
  return 0
}
authz_consume() { _consume "$1" authorisation; }

# ---- migration receipt (separate from authorisation) ----
receipt_issue() { # <dir> <rev> <parent> <exec> <mig> <authz_id> <mig_id> <ttl_sec>
  local dir="$1" rev="$2" parent="$3" exe="$4" mig="$5" aid="$6" mid="$7" ttl="$8" f="$1/migration.receipt" n
  n="$(_now)"; umask 077
  { echo "kind=receipt"
    echo "target=$AUTHZ_TARGET_FIXED"
    echo "source_revision=$rev"
    echo "parent_digest=$parent"
    echo "executor_digest=$exe"
    echo "migration_digest=$mig"
    echo "authorisation_id=$aid"
    echo "migration_identity=$mid"
    echo "issued_epoch=$n"
    echo "expiry_epoch=$((n + ttl))"
    echo "state=issued"; } > "$f"
  chmod 0600 "$f"; printf '%s\n' "$f"
}
receipt_validate() { # <file> <rev> <exec> <mig>
  local f="$1" rev="$2" exe="$3" mig="$4" n; n="$(_now)"
  _file_ok "$f" || { echo "receipt: file shape invalid" >&2; return 1; }
  [ "$(_get "$f" kind)" = "receipt" ] || { echo "receipt: wrong kind" >&2; return 1; }
  [ "$(_get "$f" target)" = "$AUTHZ_TARGET_FIXED" ] || { echo "receipt: wrong target" >&2; return 1; }
  [ "$(_get "$f" source_revision)" = "$rev" ] || { echo "receipt: revision mismatch" >&2; return 1; }
  [ "$(_get "$f" executor_digest)" = "$exe" ] || { echo "receipt: executor mismatch" >&2; return 1; }
  [ "$(_get "$f" migration_digest)" = "$mig" ] || { echo "receipt: migration mismatch" >&2; return 1; }
  [ "$(_get "$f" state)" = "issued" ] || { echo "receipt: not issued (consumed?)" >&2; return 1; }
  local ie ee; ie="$(_get "$f" issued_epoch)"; ee="$(_get "$f" expiry_epoch)"
  [ "$ie" -le "$n" ] || { echo "receipt: future-issued" >&2; return 1; }
  [ "$ee" -gt "$n" ] || { echo "receipt: expired" >&2; return 1; }
  return 0
}
receipt_consume() { _consume "$1" receipt; }

# CLI dispatch — ONLY when executed directly, never when sourced as a library.
if [ "${BASH_SOURCE[0]:-}" = "${0}" ]; then
  case "${1:-}" in
    issue-authz)    shift; authz_issue "$@" ;;
    validate-authz) shift; authz_validate "$@" ;;
    consume-authz)  shift; authz_consume "$@" ;;
    issue-receipt)    shift; receipt_issue "$@" ;;
    validate-receipt) shift; receipt_validate "$@" ;;
    consume-receipt)  shift; receipt_consume "$@" ;;
    '') : ;;
    *) echo "authz.sh: unknown op $1" >&2; exit 2 ;;
  esac
fi
