#!/usr/bin/env bash
# =============================================================================
# RT04E migration-receipt lifecycle library — SOURCED by the runner + tests.
# NOT executed on its own. No mutation of services, no secrets, no DB, no Docker.
# =============================================================================
# Implements the fixed, single-use, bounded-freshness receipt lifecycle:
#
#     migration-only success  ->  fresh PENDING receipt
#     service-replacement-only ->  atomic CONSUME (pending -> consumed) before capture
#     expiry                  ->  atomic retire (pending -> EXPIRED), retained as audit
#
# The receipt is a local, permission-bound, process-generated technical control
# handoff — NOT cryptographically signed and NOT a payment-release approval.
#
# The <root> is passed by the caller: the PRODUCTION runner passes a single fixed
# canonical constant (never caller/argv/env-derived); deterministic tests pass a
# temporary root. The functions never read a receipt root/path/age/clock from the
# environment. State is filesystem-authoritative (pending/consumed/expired dirs) and
# is never inferred from text inside a receipt alone.
#
#   rt04e_receipt_ensure_dirs <root>
#   rt04e_receipt_write   <root> <sha> <validator> <after> <before> <ck> <bk> <ac> <mg> <cs> <dr>
#   rt04e_receipt_consume <root> <sha> <validator>
# -----------------------------------------------------------------------------

# internally-generated attempt/uniqueness token (no Date/caller input)
rt04e_receipt_token() { od -An -N6 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n' || printf '%s' "$$"; }

# fixed subdir layout; all root-owned + restrictive; reject symlinked roots/subdirs
rt04e_receipt_ensure_dirs() {
  local root="$1"
  [ -n "$root" ] || return 20
  [ -L "$root" ] && { printf 'receipt root is a symlink — refusing\n' >&2; return 20; }
  mkdir -p "$root/pending" "$root/consumed" "$root/expired" || return 20
  chmod 700 "$root" "$root/pending" "$root/consumed" "$root/expired" 2>/dev/null || true
  chown -R root:root "$root" 2>/dev/null || true
  local d
  for d in "$root" "$root/pending" "$root/consumed" "$root/expired"; do
    [ -L "$d" ] && { printf 'receipt subdir is a symlink — refusing\n' >&2; return 20; }
    [ -d "$d" ] || { printf 'receipt subdir missing — refusing\n' >&2; return 20; }
  done
  return 0
}

# write a fresh PENDING receipt (only with explicit PASS outcome states threaded in).
# echoes the pending path on success; sanitised errors to stderr.
rt04e_receipt_write() {
  local root="$1" sha="$2" validator="$3" after="$4" before="$5"
  local ck="$6" bk="$7" ac="$8" mg="$9" cs="${10}" dr="${11}"
  [ -n "$after" ] || after="head-unresolved"
  [ -n "$before" ] || before="unrecorded-pre-migration"
  # require EXPLICIT PASS outcome states — never hardcoded, never from caller env
  local st
  for st in "$ck" "$bk" "$ac" "$mg" "$cs" "$dr"; do
    [ "$st" = PASS ] || { printf 'refusing receipt: a required outcome state is not PASS\n' >&2; return 24; }
  done
  rt04e_receipt_ensure_dirs "$root" || return 24
  local pend="$root/pending/rt04e-migration-receipt-$sha.json"
  [ -L "$pend" ] && { printf 'pending receipt path is a symlink — refusing\n' >&2; return 24; }
  if [ -e "$pend" ]; then
    RT04E_RELEASE_REV="$sha" node "$validator" < "$pend" >/dev/null 2>&1
    local rc=$?
    case "$rc" in
      0) printf 'a fresh valid pending receipt already exists — refusing to overwrite\n' >&2; return 25 ;;
      3) # EXPIRED: atomically retire to the expired category (retained as audit), then proceed
         local exp="$root/expired/rt04e-migration-receipt-$sha-$(rt04e_receipt_token).json"
         mv "$pend" "$exp" 2>/dev/null || { printf 'cannot retire expired pending receipt — refusing\n' >&2; return 24; }
         chmod 600 "$exp" 2>/dev/null || true ;;
      *) printf 'existing pending receipt is malformed/unsafe/future — refusing to overwrite\n' >&2; return 25 ;;
    esac
  fi
  local ts tmp; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  tmp="$(mktemp "$root/pending/.receipt.XXXXXX")" || return 24
  chmod 600 "$tmp"
  {
    printf '{\n'
    printf '  "receipt_version": 1,\n'
    printf '  "release_revision": "%s",\n' "$sha"
    printf '  "target_category": "Sandbox",\n'
    printf '  "execution_mode": "migration-only",\n'
    printf '  "receipt_state": "pending",\n'
    printf '  "checkpoint_status": "%s",\n' "$ck"
    printf '  "backup_status": "%s",\n' "$bk"
    printf '  "migration_access_status": "%s",\n' "$ac"
    printf '  "migration_status": "%s",\n' "$mg"
    printf '  "migration_level_before": "%s",\n' "$before"
    printf '  "migration_level_after": "%s",\n' "$after"
    printf '  "checksum_status": "%s",\n' "$cs"
    printf '  "drift_status": "%s",\n' "$dr"
    printf '  "created_utc": "%s"\n' "$ts"
    printf '}\n'
  } > "$tmp"
  # self-validate through the constrained parser BEFORE finalising (no grep/awk)
  RT04E_RELEASE_REV="$sha" node "$validator" < "$tmp" >/dev/null 2>&1 \
    || { rm -f "$tmp"; printf 'generated receipt failed self-validation — refusing\n' >&2; return 24; }
  chown root:root "$tmp" 2>/dev/null || true
  mv -f "$tmp" "$pend"          # atomic rename on the same filesystem
  chmod 600 "$pend"
  printf '%s\n' "$pend"
  return 0
}

# atomically CONSUME the pending receipt (single-use). echoes the consumed path.
# The caller MUST already hold the exclusive rollout lock and have obtained the
# second TTY authorisation before calling this.
rt04e_receipt_consume() {
  local root="$1" sha="$2" validator="$3"
  rt04e_receipt_ensure_dirs "$root" || return 31
  local pend="$root/pending/rt04e-migration-receipt-$sha.json"
  [ -L "$pend" ] && { printf 'pending receipt is a symlink — refusing\n' >&2; return 31; }
  [ -e "$pend" ] || { printf 'no fresh pending receipt to consume — run migration-only first — refusing\n' >&2; return 31; }
  # revalidate freshness + safety immediately before consuming (must be exit 0)
  RT04E_RELEASE_REV="$sha" node "$validator" < "$pend" >/dev/null 2>&1 \
    || { printf 'pending receipt not fresh/valid at consume time — refusing\n' >&2; return 31; }
  local att cons; att="$(rt04e_receipt_token)"
  cons="$root/consumed/rt04e-migration-receipt-$sha-$att.json"
  # ATOMIC reserve — rename makes the pending receipt unavailable to any second process.
  mv "$pend" "$cons" 2>/dev/null || { printf 'atomic consume failed — pending unavailable (already consumed?) — refusing\n' >&2; return 32; }
  [ -e "$pend" ] && { printf 'pending still present after consume — refusing\n' >&2; return 32; }
  chmod 600 "$cons" 2>/dev/null || true
  # revalidate the consumed reservation content (integrity of what we just reserved)
  RT04E_RELEASE_REV="$sha" node "$validator" < "$cons" >/dev/null 2>&1 \
    || { printf 'consumed reservation failed revalidation — refusing\n' >&2; return 32; }
  printf '%s\n' "$cons"
  return 0
}
