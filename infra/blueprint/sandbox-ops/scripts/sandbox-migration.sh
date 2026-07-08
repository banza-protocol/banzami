#!/usr/bin/env bash
# Banzami Environment Blueprint — controlled operational migration orchestrator (adapter C).
#
# The ONLY controlled path that migrates banzami_staging — and only inside the generated
# internal Sandbox project created by the bootstrap adapter, using the attested operational
# executor from a verified release package. Enforces the release-manifest identity gate
# (revision / parent / executor / migration digests / service set), a single-use
# authorisation record + receipt, a REAL advisory lock, a fresh short-lived migration login,
# and a file-only read-only credential. Never the legacy RT04E path; never live/prod. The
# disposable 2D/2E lab guards are untouched.
#
# Reads live context from the bootstrap + release-package state files. Subcommands:
# plan | apply | verify | clean
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
AUTHZ="$REPO_ROOT/infra/blueprint/migration-control/scripts/authz.sh"
VERIFY_IDENTITY="$REPO_ROOT/infra/blueprint/migration-identity/scripts/verify-identity.sh"
SVC_EVIDENCE="$REPO_ROOT/infra/blueprint/service-lab/scripts/validate-service-evidence.mjs"
SANDBOX_STATE="${TMPDIR:-/tmp}/banzami-blueprint-sandbox/current.run"
RELEASE_STATE="${TMPDIR:-/tmp}/banzami-blueprint-release/current.run"
MIG_DIR="$REPO_ROOT/db/migrations"
PG_IMAGE="postgres@sha256:e013e867e712fec275706a6c51c966f0bb0c93cfa8f51000f85a15f9865a28cb"
LABEL="com.banzami.blueprint.sandbox-migration"
LOCK_KEY="47710026"
# shellcheck source=/dev/null
. "$AUTHZ"

die() { echo "sandbox-migration: $*" >&2; exit 1; }
hold() { echo "$1"; exit "${2:-42}"; }

load_context() {
  [ -f "$SANDBOX_STATE" ] || die "no bootstrapped Sandbox (run sandbox-bootstrap apply first)"
  [ -f "$RELEASE_STATE" ] || die "no verified release package (run sandbox-release-package build first)"
  . "$SANDBOX_STATE"; . "$RELEASE_STATE"
  : "${BZSB_PROJECT:?}" "${BZSB_DATA_NET:?}" "${BZSB_SECRET_ROOT:?}" "${AUTHZ_ROOT:?}" "${RECEIPT_ROOT:?}"
  : "${RELEASE_ROOT:?}" "${SOURCE_REVISION:?}" "${PARENT_DIGEST:?}"
  MANIFEST="$RELEASE_ROOT/manifest.txt"; [ -f "$MANIFEST" ] || die "release manifest missing"
  MIG_DIGEST="$(cat $(ls "$MIG_DIR"/*.sql | sort) | shasum -a 256 | awk '{print $1}')"
  EXEC_OCI="$RELEASE_ROOT/images/sandbox-executor.oci"; [ -d "$EXEC_OCI" ] || die "operational executor missing from package"
  # resolve an already-loaded operational executor (set by a prior apply) for verify/concurrency
  EXEC_TAG="${EXEC_TAG:-$(docker image ls --filter 'label=com.banzami.blueprint.sandbox-executor=1' --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | head -1)}"
  export EXEC_TAG
}
mget() { grep -E "^$1=" "$MANIFEST" | head -1 | cut -d= -f2-; }
oci_digest() { OCI="$1" node -e 'const fs=require("fs"),p=require("path");const oci=process.env.OCI;const b=d=>JSON.parse(fs.readFileSync(p.join(oci,"blobs",d.split(":")[0],d.split(":")[1])));const t=JSON.parse(fs.readFileSync(p.join(oci,"index.json")));let img=null;const v=d=>{const m=d.mediaType||"";if(m.includes("image.index"))b(d.digest).manifests.forEach(v);else if(m.includes("image.manifest")&&(d.annotations||{})["vnd.docker.reference.type"]!=="attestation-manifest")img=img||d.digest;};t.manifests.forEach(v);process.stdout.write(img||"");'; }

# gate: release manifest identities must match canonical + executor evidence
manifest_gate() {
  local ok=0
  [ "$(mget source_revision)" = "$SOURCE_REVISION" ] && [ "${#SOURCE_REVISION}" -eq 40 ] || { echo "  GATE revision_matches FAIL"; return 1; }
  [ "$(mget executor.parent_runner_digest)" = "$PARENT_DIGEST" ] || { echo "  GATE parent_digest_matches FAIL"; return 1; }
  [ "$(mget executor.migrations_digest)" = "$MIG_DIGEST" ] || { echo "  GATE migration_digest_matches FAIL"; return 1; }
  [ "$(mget executor.image_digest)" = "$(oci_digest "$EXEC_OCI")" ] || { echo "  GATE executor_digest_matches FAIL"; return 1; }
  [ "$(mget service_set)" = "core-api-staging api-gateway-staging developer-api public-api-staging" ] || { echo "  GATE service_set_matches FAIL"; return 1; }
  return 0
}

load_executor() {
  # import the attested executor from the package (no build, no pull) and verify identity
  tar -cf "$RELEASE_ROOT/exec.tar" -C "$EXEC_OCI" .
  docker load -i "$RELEASE_ROOT/exec.tar" > "$RELEASE_ROOT/exec-load.log" 2>&1 || die "executor load failed"
  EXEC_TAG="$(grep -oE 'Loaded image.*' "$RELEASE_ROOT/exec-load.log" | sed -E 's/Loaded image( ID)?: //' | head -1)"
  [ -n "$EXEC_TAG" ] || EXEC_TAG="$(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E ':local$' | grep executor | head -1)"
  docker image inspect "$EXEC_TAG" >/dev/null 2>&1 || die "executor image not resolvable after load"
  # loaded image content digest must match manifest
  local loaded; loaded="$(docker image inspect "$EXEC_TAG" -f '{{index .Config.Labels "com.banzami.blueprint.sandbox-executor.migrations-digest"}}')"
  [ "$loaded" = "$MIG_DIGEST" ] || die "loaded executor migration digest mismatch"
}

mig_url_file() { # write the file-only migration credential from the sandbox migration secret
  local f="$AUTHZ_ROOT/../mi_migration_url"
  # bl_migration login (owner-session) → banzami_staging on the internal sandbox host
  local proto='postgresql://' host='postgres:5432' db='banzami_staging'
  # 0644 (not 0600): this file is bind-mounted read-only into the NON-root executor container;
  # on Linux the bind mount preserves host perms, so a 0600 root-owned file is unreadable by the
  # container user. Host confidentiality is preserved by the 0700 root-only SANDBOX_ROOT dir that
  # contains it (matches Docker's own 0444 secret-mount convention).
  printf '%sbl_migration:%s@%s/%s' "$proto" "$(cat "$BZSB_SECRET_ROOT/mi_migration")" "$host" "$db" > "$f"; chmod 0644 "$f"
  printf '%s' "$f"
}
exec_run() { # <mode> <url-file>
  docker run --rm --network "$BZSB_DATA_NET" -e "BZMC_LOCK_KEY=$LOCK_KEY" \
    -v "$2:/run/secrets/rt04e_migration_url:ro" --label "$LABEL=1" --label "$LABEL.run=$BZSB_PROJECT" \
    "$EXEC_TAG" "${1:-migrate}"
}

cmd_plan() {
  echo "sandbox-migration PLAN: target=banzami_staging profile=sandbox (generated project only)"
  echo "  requires: verified release package + attested executor + single-use authz + receipt + advisory lock + short-lived login"
  echo "  rejects: live/prod/production/banzami_live, blueprint_migration_lab-as-operational, external host/port, legacy RT04E"
}

cmd_apply() {
  load_context
  echo "sandbox-migration: applying controlled migration to banzami_staging (generated project)"
  echo "== release-manifest identity gate =="
  manifest_gate && echo "  GATE all_identities_match PASS" || hold "BLOCKER — SANDBOX MIGRATION CONTRACT CANNOT BE VALIDATED" 42
  load_executor
  local URL; URL="$(mig_url_file)"
  # issue single-use authorisation + receipt bound to the manifest identities
  authz_issue "$AUTHZ_ROOT" "$SOURCE_REVISION" "$PARENT_DIGEST" "$(mget executor.image_digest)" "$MIG_DIGEST" "$(mget service_set)" 600 >/dev/null
  receipt_issue "$RECEIPT_ROOT" "$SOURCE_REVISION" "$PARENT_DIGEST" "$(mget executor.image_digest)" "$MIG_DIGEST" "authz.record" "bl_migration" 600 >/dev/null
  echo "== controlled migration (advisory lock, file-only secret) =="
  authz_consume "$AUTHZ_ROOT/authz.record" >/dev/null 2>&1 && echo "  authz_consumed_once PASS" || die "authz consume failed"
  receipt_consume "$RECEIPT_ROOT/migration.receipt" >/dev/null 2>&1 && echo "  receipt_consumed_once PASS" || die "receipt consume failed"
  if exec_run migrate "$URL" > "$RELEASE_ROOT/migrate.log" 2>&1; then echo "  migration_applied PASS"; else echo "  migration_applied FAIL"; hold "BLOCKER — SANDBOX MIGRATION CONTRACT CANNOT BE VALIDATED" 42; fi
  # enable the runtime role for the deployed services (DML on migrated app objects; owner-owned)
  docker run --rm --network "$BZSB_DATA_NET" -v "$BZSB_SECRET_ROOT/mi_superuser:/s:ro" --entrypoint sh "$PG_IMAGE" -c '
    export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:sbadmin:%s\n" "$(cat /s)" > $PGPASSFILE; chmod 600 $PGPASSFILE
    psql -h postgres -U sbadmin -d banzami_staging -v ON_ERROR_STOP=1 -q \
      -c "GRANT USAGE ON SCHEMA public TO bl_app_runtime" \
      -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO bl_app_runtime" \
      -c "GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO bl_app_runtime" \
      -c "ALTER DEFAULT PRIVILEGES FOR ROLE bl_schema_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO bl_app_runtime"' >/dev/null 2>&1 \
    || die "runtime-role privilege enablement failed"
  echo "  runtime_role_dml_enabled PASS"
  echo "sandbox-migration: apply complete"
}

cmd_verify() {
  load_context
  local rc=0
  echo "== authorisation/receipt single-use + rejection =="
  authz_consume "$AUTHZ_ROOT/authz.record" >/dev/null 2>&1 && { echo "  consumed_authz_reject FAIL"; rc=1; } || echo "  consumed_authz_reject PASS"
  receipt_consume "$RECEIPT_ROOT/migration.receipt" >/dev/null 2>&1 && { echo "  consumed_receipt_reject FAIL"; rc=1; } || echo "  consumed_receipt_reject PASS"
  # rejection matrix (fresh temp records)
  local t="$AUTHZ_ROOT/reject"; mkdir -p "$t"
  authz_issue "$t" "$SOURCE_REVISION" "$PARENT_DIGEST" "$(mget executor.image_digest)" "$MIG_DIGEST" "$(mget service_set)" -1 >/dev/null
  authz_validate "$t/authz.record" "$SOURCE_REVISION" "$PARENT_DIGEST" "$(mget executor.image_digest)" "$MIG_DIGEST" "$(mget service_set)" >/dev/null 2>&1 && { echo "  expired_reject FAIL"; rc=1; } || echo "  expired_reject PASS"
  authz_issue "$t" "$SOURCE_REVISION" "$PARENT_DIGEST" "$(mget executor.image_digest)" "$MIG_DIGEST" "$(mget service_set)" 600 >/dev/null
  authz_validate "$t/authz.record" "deadbeef" "$PARENT_DIGEST" "$(mget executor.image_digest)" "$MIG_DIGEST" "$(mget service_set)" >/dev/null 2>&1 && { echo "  wrong_revision_reject FAIL"; rc=1; } || echo "  wrong_revision_reject PASS"
  authz_validate "$t/authz.record" "$SOURCE_REVISION" "sha256:0" "$(mget executor.image_digest)" "$MIG_DIGEST" "$(mget service_set)" >/dev/null 2>&1 && { echo "  wrong_parent_reject FAIL"; rc=1; } || echo "  wrong_parent_reject PASS"
  authz_validate "$t/authz.record" "$SOURCE_REVISION" "$PARENT_DIGEST" "sha256:0" "$MIG_DIGEST" "$(mget service_set)" >/dev/null 2>&1 && { echo "  wrong_executor_reject FAIL"; rc=1; } || echo "  wrong_executor_reject PASS"
  authz_validate "$t/authz.record" "$SOURCE_REVISION" "$PARENT_DIGEST" "$(mget executor.image_digest)" "$MIG_DIGEST" "admin-api" >/dev/null 2>&1 && { echo "  wrong_service_set_reject FAIL"; rc=1; } || echo "  wrong_service_set_reject PASS"
  rm -rf "$t"

  echo "== advisory-lock concurrency =="
  concurrency_proof || rc=1

  echo "== integrity + ownership =="
  local MIG_COUNT MIG_MAXVER; MIG_COUNT="$(ls "$MIG_DIR"/*.sql | wc -l | tr -d ' ')"; MIG_MAXVER="$(ls "$MIG_DIR"/*.sql | sed -E 's#.*/0*([0-9]+)_.*#\1#' | sort -n | tail -1)"
  docker run --rm --network "$BZSB_DATA_NET" -e "EXPECT_COUNT=$MIG_COUNT" -e "EXPECT_MAXVER=$MIG_MAXVER" -e "EXPECT_CONNLIMIT=2" \
    -e "PG_SUPERUSER=sbadmin" -e "PG_DB=banzami_staging" \
    -v "$BZSB_SECRET_ROOT/mi_superuser:/run/secrets/mi_superuser:ro" -v "$VERIFY_IDENTITY:/lab/verify-identity.sh:ro" \
    --entrypoint /bin/bash "$PG_IMAGE" -c 'sed -e "s/miadmin/${PG_SUPERUSER}/g" -e "s/blueprint_migration_lab/${PG_DB}/g" /lab/verify-identity.sh > /tmp/v.sh; bash /tmp/v.sh' || rc=1

  echo "== short-lived login lifecycle + secret boundary =="
  lifecycle_and_secret || rc=1
  echo "SANDBOX_MIGRATION_VERIFY_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"
}

concurrency_proof() {
  local ok=0
  docker rm -f "${BZSB_PROJECT}-mholder" >/dev/null 2>&1 || true
  [ -n "${EXEC_TAG:-}" ] || { echo "  second_attempt_refused FAIL (executor not loaded)"; return 1; }
  docker run -d --name "${BZSB_PROJECT}-mholder" --network "$BZSB_DATA_NET" --label "$LABEL=1" \
    -v "$BZSB_SECRET_ROOT/mi_superuser:/s:ro" --entrypoint sh "$PG_IMAGE" -c '
      export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:sbadmin:%s\n" "$(cat /s)" > $PGPASSFILE; chmod 600 $PGPASSFILE
      psql -h postgres -U sbadmin -d banzami_staging -Atqc "SELECT pg_advisory_lock('"$LOCK_KEY"'); SELECT pg_sleep(20);"' >/dev/null 2>&1
  sleep 3
  local URL; URL="$(mig_url_file)"
  if exec_run migrate "$URL" > "$RELEASE_ROOT/concurrent.log" 2>&1; then echo "  second_attempt_refused FAIL"; ok=1
  else grep -q 'MIGRATION_LOCK_HELD' "$RELEASE_ROOT/concurrent.log" && echo "  second_attempt_refused PASS" || { echo "  second_attempt_refused FAIL"; ok=1; }; fi
  docker rm -f "${BZSB_PROJECT}-mholder" >/dev/null 2>&1 || true
  return "$ok"
}

lifecycle_and_secret() {
  local ok=0
  docker run --rm --network "$BZSB_DATA_NET" -v "$BZSB_SECRET_ROOT/mi_superuser:/s:ro" --entrypoint sh "$PG_IMAGE" -c '
    export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:sbadmin:%s\n" "$(cat /s)" > $PGPASSFILE; chmod 600 $PGPASSFILE
    psql -h postgres -U sbadmin -d banzami_staging -v ON_ERROR_STOP=1 -q -c "DROP OWNED BY bl_migration" -c "DROP ROLE bl_migration"' >/dev/null 2>&1 \
    && echo "  migration_login_removed PASS" || { echo "  migration_login_removed FAIL"; ok=1; }
  if docker run --rm --network "$BZSB_DATA_NET" -v "$BZSB_SECRET_ROOT/mi_migration:/s:ro" --entrypoint sh "$PG_IMAGE" -c '
       export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:bl_migration:%s\n" "$(cat /s)" > $PGPASSFILE; chmod 600 $PGPASSFILE
       psql -h postgres -U bl_migration -d banzami_staging -tAc "SELECT 1" >/dev/null 2>&1'; then echo "  credential_unusable FAIL"; ok=1; else echo "  credential_unusable PASS"; fi
  # read-only secret mount + secret absent from executor image config
  local sv; sv="$(cat "$AUTHZ_ROOT/../mi_migration_url" 2>/dev/null || echo __none__)"
  if docker image inspect "$EXEC_TAG" -f '{{json .Config.Env}}{{json .Config.Labels}}' 2>/dev/null | grep -qF "$sv"; then echo "  secret_absent_from_image FAIL"; ok=1; else echo "  secret_absent_from_image PASS"; fi
  unset sv; return "$ok"
}

cmd_clean() {
  load_context 2>/dev/null || true
  [ -n "${BZSB_PROJECT:-}" ] && docker rm -f "${BZSB_PROJECT}-mholder" >/dev/null 2>&1 || true
  docker ps -aq --filter "label=$LABEL" | xargs -r docker rm -f >/dev/null 2>&1 || true
  [ -n "${EXEC_TAG:-}" ] && docker image rm -f "$EXEC_TAG" >/dev/null 2>&1 || true
  rm -f "$AUTHZ_ROOT/../mi_migration_url" 2>/dev/null || true
  echo "sandbox-migration: scoped cleanup done"
}

case "${1:-}" in
  plan) cmd_plan ;; apply) cmd_apply ;; verify) cmd_verify ;; clean) cmd_clean ;;
  *) die "usage: sandbox-migration.sh {plan|apply|verify|clean}" ;;
esac
