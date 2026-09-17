#!/usr/bin/env bash
# COLLECTIONS-PROTOCOL-AND-PRODUCT-001 Part B — executable LIVE dual-control.
#
# A LIVE controlled migration may proceed ONLY with TWO DISTINCT authorised
# approvals over the exact same immutable migration identity (target, environment,
# source_revision, migration_digest, executor_digest, service_set). This is real
# enforcement, not documentation: each approval is HMAC-SHA256 signed with that
# approver's key from the LIVE approver keyring, so an approval cannot be fabricated
# without a real approver key. Verification recomputes the HMAC, requires the binding
# to match exactly, requires the approval to be unexpired and single-use, and counts
# DISTINCT approver identities — one approver cannot satisfy the quorum alone or by
# approving twice.
#
# No secret ever lands in an approval file (only the signature). The keyring maps
# approver_id -> key and is resolved from the LIVE secret store at run time; for
# autonomous validation a DISPOSABLE keyring is used (test-mode), never a real key.
#
# Ops:
#   approve   <dir> <keyring> <approver_id> <target> <env> <rev> <mig> <exec> <svc> <ttl>
#   verify    <dir> <keyring> <target> <env> <rev> <mig> <exec> <svc> [min_approvals=2]
#   consume   <dir>                         # single-use: mark every quorum approval consumed
set -euo pipefail

_now() { date -u '+%s'; }
_hmac() { # <key> <message> -> hex
  printf '%s' "$2" | openssl dgst -sha256 -hmac "$1" 2>/dev/null | sed 's/^.*= //'
}
# The signed binding — the immutable migration identity PLUS the approval's own
# validity window, so neither the identity nor the expiry can be altered after signing
# without breaking the HMAC.
_binding() { # <target> <env> <rev> <mig> <exec> <svc> <approver_id> <issued> <expiry>
  printf 'target=%s;env=%s;rev=%s;mig=%s;exec=%s;svc=%s;approver=%s;issued=%s;expiry=%s' \
    "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8" "$9"
}
_keyfor() { # <keyring> <approver_id>  -> key (empty if absent)
  grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2-
}
_get() { grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2-; }
_file_ok() { # <file> — non-symlink, single hard link, no secret material
  local f="$1"
  [ -f "$f" ] && [ ! -L "$f" ] || return 1
  [ "$(stat -c '%h' "$f" 2>/dev/null || stat -f '%l' "$f")" = "1" ] || return 1
  ! grep -qiE 'password|private key|-----BEGIN' "$f" || return 1
  return 0
}

dc_approve() { # <dir> <keyring> <approver_id> <target> <env> <rev> <mig> <exec> <svc> <ttl>
  local dir="$1" keyring="$2" aid="$3" target="$4" env="$5" rev="$6" mig="$7" exe="$8" svc="$9" ttl="${10}"
  local key; key="$(_keyfor "$keyring" "$aid")"
  [ -n "$key" ] || { echo "dual-control: approver '$aid' not in keyring (cannot approve)" >&2; return 1; }
  local n exp sig f; n="$(_now)"; exp="$((n + ttl))"
  sig="$(_hmac "$key" "$(_binding "$target" "$env" "$rev" "$mig" "$exe" "$svc" "$aid" "$n" "$exp")")"
  umask 077
  f="$dir/approval.$aid"
  { echo "kind=approval"; echo "approver_id=$aid"; echo "target=$target"; echo "environment=$env"
    echo "source_revision=$rev"; echo "migration_digest=$mig"; echo "executor_digest=$exe"
    echo "service_set=$svc"; echo "issued_epoch=$n"; echo "expiry_epoch=$exp"
    echo "state=issued"; echo "sig=$sig"; } > "$f"
  chmod 0600 "$f"
  printf '%s\n' "$f"
}

# Verify a quorum. Prints VALID_APPROVERS=<n> then exits 0 only if >= min distinct,
# each approval unexpired, issued, binding-exact, and HMAC-verified against the keyring.
dc_verify() { # <dir> <keyring> <target> <env> <rev> <mig> <exec> <svc> [min]
  local dir="$1" keyring="$2" target="$3" env="$4" rev="$5" mig="$6" exe="$7" svc="$8" min="${9:-2}"
  local n; n="$(_now)"
  [ -f "$keyring" ] || { echo "dual-control: keyring missing" >&2; echo "VALID_APPROVERS=0"; return 1; }
  local seen="" count=0 f
  for f in "$dir"/approval.*; do
    [ -e "$f" ] || continue
    _file_ok "$f" || { echo "dual-control: bad approval file shape: $f" >&2; continue; }
    [ "$(_get "$f" kind)" = "approval" ] || continue
    [ "$(_get "$f" state)" = "issued" ] || { echo "dual-control: $f not issued" >&2; continue; }
    # binding must match EXACTLY — a wrong target/env/rev/digest/svc is rejected
    [ "$(_get "$f" target)" = "$target" ] || { echo "dual-control: $f target mismatch" >&2; continue; }
    [ "$(_get "$f" environment)" = "$env" ] || { echo "dual-control: $f env mismatch" >&2; continue; }
    [ "$(_get "$f" source_revision)" = "$rev" ] || { echo "dual-control: $f revision mismatch" >&2; continue; }
    [ "$(_get "$f" migration_digest)" = "$mig" ] || { echo "dual-control: $f migration digest mismatch" >&2; continue; }
    [ "$(_get "$f" executor_digest)" = "$exe" ] || { echo "dual-control: $f executor digest mismatch" >&2; continue; }
    [ "$(_get "$f" service_set)" = "$svc" ] || { echo "dual-control: $f service set mismatch" >&2; continue; }
    local ie ee; ie="$(_get "$f" issued_epoch)"; ee="$(_get "$f" expiry_epoch)"
    local aid key want got; aid="$(_get "$f" approver_id)"
    key="$(_keyfor "$keyring" "$aid")"
    [ -n "$key" ] || { echo "dual-control: $f approver not in keyring" >&2; continue; }
    # Verify the signature FIRST (covers identity + validity window), so a tampered
    # expiry or binding is rejected as forged before the freshness checks.
    want="$(_hmac "$key" "$(_binding "$target" "$env" "$rev" "$mig" "$exe" "$svc" "$aid" "$ie" "$ee")")"
    got="$(_get "$f" sig)"
    [ "$want" = "$got" ] || { echo "dual-control: $f signature invalid (forged/altered)" >&2; continue; }
    [ "$ie" -le "$n" ] || { echo "dual-control: $f future-issued" >&2; continue; }
    [ "$ee" -gt "$n" ] || { echo "dual-control: $f expired" >&2; continue; }
    case " $seen " in *" $aid "*) echo "dual-control: duplicate approver $aid ignored" >&2; continue;; esac
    seen="$seen $aid"; count=$((count + 1))
  done
  echo "VALID_APPROVERS=$count"
  [ "$count" -ge "$min" ] || { echo "dual-control: quorum not met ($count < $min distinct approvers)" >&2; return 1; }
  return 0
}

dc_consume() { # <dir> — single-use: flip every issued approval to consumed atomically
  local dir="$1" f tmp
  for f in "$dir"/approval.*; do
    [ -e "$f" ] || continue
    [ "$(_get "$f" state)" = "issued" ] || continue
    tmp="$dir/.$(basename "$f").consuming.$$"
    sed 's/^state=issued$/state=consumed/' "$f" > "$tmp"; chmod 0600 "$tmp"; mv -f "$tmp" "$f"
  done
}

if [ "${BASH_SOURCE[0]:-}" = "${0}" ]; then
  case "${1:-}" in
    approve) shift; dc_approve "$@" ;;
    verify)  shift; dc_verify "$@" ;;
    consume) shift; dc_consume "$@" ;;
    '') : ;;
    *) echo "dual-control.sh: unknown op $1" >&2; exit 2 ;;
  esac
fi
