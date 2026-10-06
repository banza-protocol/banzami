#!/usr/bin/env bash
# Banzami Environment Blueprint — owner-gated external-secret transfer (pure library).
#
# Transfers an ALLOW-LISTED external secret file from one Sandbox RUNID's evidence root to
# another, OLD -> NEW. "External" means a secret that MUST be placed by the owner because it
# comes from outside the stack (resend_api_key for signup/recovery/security email, the optional
# firebase/kyb credentials). It is NEVER a runtime-generated secret: otp_pepper, rate_limit_pepper,
# the mi_* bootstrap database identities, the per-service db_url_* credentials and every other
# minted key are RUNID-local and are re-minted fresh by the sanctioned deploy path — they are
# forbidden here and can never be copied between stacks.
#
# This file is PURE: it contains no ssh, no VM target and no hard-coded RUNID. The resolution
# helpers take injected inputs (a SANDBOX_STATE file, a container-bind text) so they unit-test
# offline without docker; the placement takes already-resolved, realpath'd evidence roots. It
# NEVER prints a secret value (content is only ever copied file->file; comparisons use `cmp -s`).
# vm-execute.sh sources it for operator-side input validation and inlines it into the script it
# sends to the VM; the test harness invokes each function directly against temp fixtures.
#
# Secret-file contract (sandbox-deploy.sh:174-176,220-248; bootstrap gen_secrets): every evidence
# secret is mode 0644 and root-owned, and confidentiality is the 0700 root-only evidence directory
# that holds it (a 0600 file would be unreadable by the non-root service user across the bind mount
# and assert_secret_modes would reset it to 0644). So a placed file is 0:0 / 0644.

# The only names this mechanism may ever move. External, owner-placed secrets only.
ESX_ALLOW="resend_api_key firebase_credentials_json kyb_storage_endpoint kyb_storage_access_key_id kyb_storage_secret_access_key"
# Belt-and-suspenders deny list: RUNID-local / runtime-generated secrets that must NEVER cross
# stacks even if the allow list were edited. db_url_* and mi_* are also blocked by prefix below.
ESX_DENY="otp_pepper rate_limit_pepper mi_superuser mi_control mi_migration mi_runtime session_secret jwt_secret core_internal_key admin_jwt_secret api_key_pepper developer_internal_key core_payee_validation_key webhook_encryption_key push_topic_key app_web_session_store_key admin_mfa_encryption_key proof_signing_key"

# esx_valid_runid <runid> — the bootstrap RUNID shape: bzsandbox-<14 digits>-<pid>-<random>.
esx_valid_runid() { [[ "${1:-}" =~ ^bzsandbox-[0-9]{14}-[0-9]+-[0-9]+$ ]]; }

# esx_valid_name <name> — allow-listed, lower-case token only. Rejects path traversal / wildcards
# (anything outside [a-z0-9_]), the db_url_*/mi_* credential families, and every deny-listed name.
esx_valid_name() {
  local n="${1:-}" a d
  [ -n "$n" ] || return 1
  [[ "$n" =~ ^[a-z0-9_]+$ ]] || return 1          # no / .. \ NUL or shell metacharacters
  case "$n" in db_url*|mi_*) return 1 ;; esac      # runtime/bootstrap credential families
  for d in $ESX_DENY; do [ "$n" = "$d" ] && return 1; done
  for a in $ESX_ALLOW; do [ "$n" = "$a" ] && return 0; done
  return 1
}

esx_abs_dir() { ( cd "${1:-/nonexistent}" 2>/dev/null && pwd -P ); }
_esx_mode()        { stat -c '%a'    "$1" 2>/dev/null || stat -f '%Lp'   "$1" 2>/dev/null; }
_esx_owner()       { stat -c '%u:%g' "$1" 2>/dev/null || stat -f '%u:%g' "$1" 2>/dev/null; }
_esx_fingerprint() { stat -c '%s:%Y:%a' "$1" 2>/dev/null || stat -f '%z:%m:%Lp' "$1" 2>/dev/null; }

# esx_new_evidence_root <sandbox_state_file> <expected_runid> — the AUTHORITATIVE resolution of the
# destination. Reads the current Sandbox identity and refuses unless its RUNID is exactly the NEW
# RUNID, so a secret can never be placed into a stale stack by mistake. Single authoritative
# identity — never a first-match pick across coexisting stacks.
esx_new_evidence_root() {
  local state="${1:-}" want="${2:-}" RUNID="" EVIDENCE_ROOT=""
  [ -f "$state" ] || { echo "BLOCKER sandbox_state_missing" >&2; return 47; }
  # shellcheck disable=SC1090
  . "$state"
  [ -n "$RUNID" ] && [ -n "$EVIDENCE_ROOT" ] || { echo "BLOCKER sandbox_state_incomplete" >&2; return 47; }
  [ "$RUNID" = "$want" ] || { echo "BLOCKER new_runid_not_current (refusing to target a non-current stack)" >&2; return 47; }
  printf '%s' "$EVIDENCE_ROOT"
}

# esx_evidence_root_from_binds <binds_text> — the OLD evidence root, located from the OLD core-api
# container's bind mounts (container METADATA only — the secret value is read from the resolved
# FILE, never from container env). Requires exactly one core_internal_key bind; ambiguity fails
# closed (never a first-match pick).
esx_evidence_root_from_binds() {
  local binds="${1:-}" hits
  hits="$(printf '%s\n' "$binds" | grep -c '/core_internal_key:' || true)"
  [ "$hits" = 1 ] || { echo "BLOCKER old_evidence_root_ambiguous hits=$hits" >&2; return 47; }
  printf '%s' "$(printf '%s\n' "$binds" | grep '/core_internal_key:' | sed 's#/core_internal_key:.*##')"
}

# external_secret_place <plan|apply> <old_evid> <new_evid> <comma-names> <dest_owner> <dest_mode>
# Two-pass, all-validated-before-any-write. Idempotent: an identical destination is a no-op PASS;
# a destination that differs is a BLOCKER and is NEVER overwritten. Atomic: each file is written to
# a temp inside the destination root, chowned/chmodded, then renamed into place and verified. The
# source is proved unchanged. Temp files are cleaned up on every failure path.
external_secret_place() {
  local mode="${1:-}" old_in="${2:-}" new_in="${3:-}" names_csv="${4:-}" downer="${5:-0:0}" dmode="${6:-0644}"
  local old_evid new_evid
  old_evid="$(esx_abs_dir "$old_in")" || true
  new_evid="$(esx_abs_dir "$new_in")" || true
  [ -n "$old_evid" ] && [ -d "$old_evid" ] || { echo "BLOCKER source_evidence_root_missing" >&2; return 47; }
  [ -n "$new_evid" ] && [ -d "$new_evid" ] || { echo "BLOCKER destination_evidence_root_missing" >&2; return 47; }
  [ "$old_evid" != "$new_evid" ] || { echo "BLOCKER source_and_destination_roots_identical" >&2; return 47; }

  # Split on comma with globbing OFF (a wildcard in the list can never expand to filenames).
  local oldifs="$IFS"; set -f; IFS=,; local -a names=($names_csv); set +f; IFS="$oldifs"
  [ "${#names[@]}" -ge 1 ] || { echo "BLOCKER no_secret_names" >&2; return 47; }

  # ---- PASS 1: validate EVERY requested name; compute action; write nothing. ----
  local -a act_list=()
  local n src dst a
  for n in "${names[@]}"; do
    esx_valid_name "$n" || { echo "BLOCKER secret_name_not_permitted name=$n" >&2; return 47; }
    src="$old_evid/$n"; dst="$new_evid/$n"
    [ "$(dirname "$src")" = "$old_evid" ] || { echo "BLOCKER source_path_escaped name=$n" >&2; return 47; }
    [ "$(dirname "$dst")" = "$new_evid" ] || { echo "BLOCKER destination_path_escaped name=$n" >&2; return 47; }
    [ -f "$src" ] || { echo "BLOCKER source_missing name=$n" >&2; return 47; }
    if [ -e "$dst" ]; then
      if cmp -s "$src" "$dst"; then a=ALREADY_IDENTICAL
      else echo "BLOCKER destination_exists_and_differs name=$n (not overwritten)" >&2; return 48; fi
    else a=CREATE; fi
    act_list+=("$n=$a")
  done

  local entry smode sowner
  if [ "$mode" = plan ]; then
    for entry in "${act_list[@]}"; do
      n="${entry%%=*}"; a="${entry#*=}"; src="$old_evid/$n"; dst="$new_evid/$n"
      smode="$(_esx_mode "$src")"; sowner="$(_esx_owner "$src")"
      echo "  secret=$n source_exists=yes destination_exists=$([ -e "$dst" ] && echo yes || echo no) source_owner=$sowner source_mode=$smode expected_destination_owner=$downer expected_destination_mode=$dmode action=$a"
    done
    echo "EXTERNAL_SECRET_TRANSFER_PLAN: PASS"
    return 0
  fi
  [ "$mode" = apply ] || { echo "BLOCKER unknown_mode mode=$mode" >&2; return 2; }

  # ---- PASS 2: place the CREATE set atomically; verify; prove the source unchanged. ----
  local tmp before after
  for entry in "${act_list[@]}"; do
    n="${entry%%=*}"; a="${entry#*=}"; src="$old_evid/$n"; dst="$new_evid/$n"
    if [ "$a" = ALREADY_IDENTICAL ]; then echo "  secret=$n action=ALREADY_IDENTICAL (not rewritten)"; continue; fi
    before="$(_esx_fingerprint "$src")"
    tmp="$new_evid/.esx.$n.$$"
    ( umask 077; cat "$src" > "$tmp" ) || { rm -f "$tmp" 2>/dev/null || true; echo "BLOCKER copy_failed name=$n" >&2; return 47; }
    chown "$downer" "$tmp" 2>/dev/null || { rm -f "$tmp" 2>/dev/null || true; echo "BLOCKER chown_failed name=$n owner=$downer" >&2; return 47; }
    chmod "$dmode"  "$tmp" 2>/dev/null || { rm -f "$tmp" 2>/dev/null || true; echo "BLOCKER chmod_failed name=$n mode=$dmode" >&2; return 47; }
    sync 2>/dev/null || true
    mv -f "$tmp" "$dst" || { rm -f "$tmp" 2>/dev/null || true; echo "BLOCKER atomic_rename_failed name=$n" >&2; return 47; }
    cmp -s "$src" "$dst" || { echo "BLOCKER verify_content_mismatch name=$n" >&2; return 48; }
    case "$(_esx_mode "$dst")" in "${dmode#0}"|"$dmode") : ;; *) echo "BLOCKER verify_mode name=$n" >&2; return 47 ;; esac
    [ "$(_esx_owner "$dst")" = "$downer" ] || { echo "BLOCKER verify_owner name=$n" >&2; return 47; }
    after="$(_esx_fingerprint "$src")"
    [ "$before" = "$after" ] || { echo "BLOCKER source_changed name=$n" >&2; return 47; }
    echo "  secret=$n action=PLACED verify_content=PASS verify_owner=PASS verify_mode=PASS source_unchanged=PASS"
  done
  echo "EXTERNAL_SECRET_TRANSFER_APPLY: PASS"
  return 0
}

# esx_vm_main <old_runid> <new_runid> <comma-names> <plan|apply> <sandbox_state_file>
# The VM-side entrypoint: validate RUNIDs, resolve NEW from the current SANDBOX_STATE and OLD from
# the OLD core-api container binds, then place. Destination owner/mode are fixed to the contract
# (0:0 / 0644) here — they are never taken from caller input.
esx_vm_main() {
  local old="${1:-}" new="${2:-}" names="${3:-}" mode="${4:-}" state="${5:-}"
  esx_valid_runid "$old" || { echo "BLOCKER old_runid_malformed" >&2; return 47; }
  esx_valid_runid "$new" || { echo "BLOCKER new_runid_malformed" >&2; return 47; }
  [ "$old" != "$new" ] || { echo "BLOCKER old_equals_new" >&2; return 47; }
  local new_evid old_evid binds
  new_evid="$(esx_new_evidence_root "$state" "$new")" || return 47
  command -v docker >/dev/null 2>&1 || { echo "BLOCKER docker_unavailable" >&2; return 47; }
  docker inspect "${old}-core-api-staging" >/dev/null 2>&1 || { echo "BLOCKER old_core_api_not_found" >&2; return 47; }
  binds="$(docker inspect "${old}-core-api-staging" --format '{{range .HostConfig.Binds}}{{println .}}{{end}}' 2>/dev/null)"
  old_evid="$(esx_evidence_root_from_binds "$binds")" || return 47
  external_secret_place "$mode" "$old_evid" "$new_evid" "$names" 0:0 0644
}

# Direct invocation — used by the VM-side preamble (via an explicit esx_vm_main call appended by
# vm-execute.sh) and by the offline test harness. Sourcing (BASH_SOURCE != $0) only defines
# functions, so operator-side use in vm-execute.sh has no side effects.
if [ "${BASH_SOURCE[0]:-}" = "${0:-}" ]; then
  set -euo pipefail
  _sub="${1:-}"; shift || true
  case "$_sub" in
    vm-main)                  esx_vm_main "$@" ;;
    place)                    external_secret_place "$@" ;;
    valid-runid)              esx_valid_runid "$@" ;;
    valid-name)               esx_valid_name "$@" ;;
    new-evidence-root)        esx_new_evidence_root "$@" ;;
    evidence-root-from-binds) esx_evidence_root_from_binds "$@" ;;
    *) echo "usage: external-secret-xfer.sh {vm-main|place|valid-runid|valid-name|new-evidence-root|evidence-root-from-binds} ..." >&2; exit 2 ;;
  esac
fi
