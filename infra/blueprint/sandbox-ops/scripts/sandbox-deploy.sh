#!/usr/bin/env bash
# Banzami Environment Blueprint — provenance-first Sandbox deployment orchestrator (adapter D).
#
# Deploys EXACTLY the four approved services from a verified release package into the current
# generated Sandbox project: no build, no pull, no mutable tags. Each service is validated
# (allowlist + manifest revision + loaded-image digest match + SBOM/provenance + no secret)
# BEFORE deployment; health is validated AFTER. The DB credential is delivered file-only and
# exported in-process by a narrow wrapper so it never appears in Docker-inspectable config.
# Internal networking only; non-root; no host namespaces/ports/socket/mounts.
#
# Subcommands: plan | apply | verify | clean
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
SVC_EVIDENCE="$REPO_ROOT/infra/blueprint/service-lab/scripts/validate-service-evidence.mjs"
SANDBOX_STATE="${TMPDIR:-/tmp}/banzami-blueprint-sandbox/current.run"
RELEASE_STATE="${TMPDIR:-/tmp}/banzami-blueprint-release/current.run"
LABEL="com.banzami.blueprint.sandbox-deploy"
# APPROVED four services: name|port|binary
SERVICES=(
  "core-api-staging|8081|core-api"
  "api-gateway-staging|8080|api-gateway"
  "developer-api|8086|developer-api"
  "public-api-staging|8083|public-api"
)
FORBIDDEN="admin-api admin-api-staging frontend dashboard checkout pay reverse-proxy banza-docs banzai"

die() { echo "sandbox-deploy: $*" >&2; exit 1; }
hold() { echo "$1"; exit "${2:-43}"; }
allow_ok() { local n="$1" e; for e in "${SERVICES[@]}"; do [ "${e%%|*}" = "$n" ] && return 0; done; return 1; }
mget() { grep -E "^$1=" "$MANIFEST" | head -1 | cut -d= -f2-; }
oci_digest() { OCI="$1" node -e 'const fs=require("fs"),p=require("path");const oci=process.env.OCI;const b=d=>JSON.parse(fs.readFileSync(p.join(oci,"blobs",d.split(":")[0],d.split(":")[1])));const t=JSON.parse(fs.readFileSync(p.join(oci,"index.json")));let img=null;const v=d=>{const m=d.mediaType||"";if(m.includes("image.index"))b(d.digest).manifests.forEach(v);else if(m.includes("image.manifest")&&(d.annotations||{})["vnd.docker.reference.type"]!=="attestation-manifest")img=img||d.digest;};t.manifests.forEach(v);process.stdout.write(img||"");'; }

load_context() {
  [ -f "$SANDBOX_STATE" ] || die "no bootstrapped Sandbox"
  [ -f "$RELEASE_STATE" ] || die "no verified release package"
  . "$SANDBOX_STATE"; . "$RELEASE_STATE"
  : "${BZSB_PROJECT:?}" "${BZSB_DATA_NET:?}" "${BZSB_APP_NET:?}" "${BZSB_SECRET_ROOT:?}" "${EVIDENCE_ROOT:?}"
  : "${RELEASE_ROOT:?}" "${SOURCE_REVISION:?}"
  MANIFEST="$RELEASE_ROOT/manifest.txt"; [ -f "$MANIFEST" ] || die "release manifest missing"
  DBURL_FILE="$EVIDENCE_ROOT/db_url"
  JWT_FILE="$EVIDENCE_ROOT/jwt_secret"
  CIK_FILE="$EVIDENCE_ROOT/core_internal_key"
  # Developer/platform API-key layer (ADR-046/047) synthetic credentials — file-only.
  APIKEY_PEPPER_FILE="$EVIDENCE_ROOT/api_key_pepper"
  DEVINT_FILE="$EVIDENCE_ROOT/developer_internal_key"
  PAYEEVAL_FILE="$EVIDENCE_ROOT/core_payee_validation_key"
  SESSION_FILE="$EVIDENCE_ROOT/session_secret"
  OTP_FILE="$EVIDENCE_ROOT/otp_pepper"
}
svc_image() { docker image ls --filter "label=com.banzami.blueprint.service-lab.service=$1" --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | head -1; }

# provenance-first validation for one service; echoes the loaded image tag on success
validate_service() { # <name>
  local name="$1" oci="$RELEASE_ROOT/images/$1.oci" tag
  allow_ok "$name" || die "service $name not allowlisted"
  echo "$FORBIDDEN" | tr ' ' '\n' | grep -qx "$name" && die "service $name is forbidden"
  [ -d "$oci" ] || die "$name image missing from package"
  [ "$(mget source_revision)" = "$SOURCE_REVISION" ] || die "manifest revision != canonical"
  # provenance validation BEFORE load/deploy
  node "$SVC_EVIDENCE" "$oci" "$SOURCE_REVISION" "$name" >/dev/null 2>&1 || { echo "  $name provenance FAIL" >&2; return 1; }
  # load from package (no build, no pull) + digest match manifest
  tar -cf "$RELEASE_ROOT/$name.tar" -C "$oci" .
  docker load -i "$RELEASE_ROOT/$name.tar" >/dev/null 2>&1 || die "$name load failed"
  [ "$(oci_digest "$oci")" = "$(mget "service.$name.image_digest")" ] || die "$name loaded digest != manifest"
  tag="$(svc_image "$name")"; [ -n "$tag" ] || die "$name image not resolvable after load"
  # no secret in image metadata
  docker image inspect "$tag" -f '{{json .Config.Env}}{{json .Config.Labels}}' | grep -qiE 'password=|secret=|database_url=[a-z]|private[_-]?key' && die "$name image carries a secret"
  # no collision (already-running same-name in project)
  docker ps -aq --filter "name=${BZSB_PROJECT}-$name" | grep -q . && die "$name already deployed (collision)"
  printf '%s' "$tag"
}

write_db_url() { # file-only runtime credential (bl_app_runtime → banzami_staging), never in env
  local proto='postgresql://' host='postgres:5432' db='banzami_staging'
  # 0644 (not 0600): bind-mounted read-only into NON-root service containers; on Linux the mount
  # preserves host perms so a 0600 root-owned file is unreadable by the container user. Host
  # confidentiality is preserved by the 0700 root-only EVIDENCE_ROOT dir that contains it.
  printf '%sbl_app_runtime:%s@%s/%s' "$proto" "$(cat "$BZSB_SECRET_ROOT/mi_runtime")" "$host" "$db" > "$DBURL_FILE"; chmod 0644 "$DBURL_FILE"
}
uuid() { uuidgen 2>/dev/null | tr 'A-Z' 'a-z' || python3 -c 'import uuid;print(uuid.uuid4())'; }
# file-only synthetic signing secret for services that hard-require JWT_SECRET at
# boot (e.g. public-api). Disposable, generated per run, NOT a real credential;
# delivered file-only + exported in-process so it never lands in Docker config.
write_jwt_secret() { printf '%s%s' "$(uuid)" "$(uuid)" | tr -d '-' > "$JWT_FILE"; chmod 0644 "$JWT_FILE"; }
# file-only synthetic Gateway↔Core service credential (X-Internal-Key ↔ CORE_INTERNAL_KEY).
# Enables the fail-closed internal route groups (refunds, F4) inside the Sandbox. Disposable,
# generated per run, delivered file-only + exported in-process so it never lands in Docker
# config; the SAME value is mounted into every service so the shared secret matches.
write_core_internal_key() { printf '%s%s' "$(uuid)" "$(uuid)" | tr -d '-' > "$CIK_FILE"; chmod 0644 "$CIK_FILE"; }
# file-only synthetic credentials for the developer/platform API-key layer. All
# disposable, generated per run, delivered file-only + exported in-process so they
# never land in Docker-inspectable config. The shared ones (developer_internal_key,
# core_payee_validation_key) are the SAME value in every service so the pairs match.
# Sandbox/Phase-0 only; the fixture + dev-key paths are hard-gated to ENVIRONMENT=sandbox.
write_devkey_secrets() {
  printf '%s%s' "$(uuid)" "$(uuid)" | tr -d '-' > "$APIKEY_PEPPER_FILE"; chmod 0644 "$APIKEY_PEPPER_FILE"
  printf '%s%s' "$(uuid)" "$(uuid)" | tr -d '-' > "$DEVINT_FILE";       chmod 0644 "$DEVINT_FILE"
  printf '%s%s' "$(uuid)" "$(uuid)" | tr -d '-' > "$PAYEEVAL_FILE";     chmod 0644 "$PAYEEVAL_FILE"
  printf '%s%s' "$(uuid)" "$(uuid)" | tr -d '-' > "$SESSION_FILE";      chmod 0644 "$SESSION_FILE"
  printf '%s%s' "$(uuid)" "$(uuid)" | tr -d '-' > "$OTP_FILE";          chmod 0644 "$OTP_FILE"
}

deploy_one() { # <name> <port> <binary> <tag>
  local name="$1" port="$2" bin="$3" tag="$4" cname="${BZSB_PROJECT}-$name"
  # The gateway resolves the Developer API by its canonical in-cluster host
  # `developer-api` (SSRF-guarded allowlist); give that container the alias.
  local alias_args=(); [ "$name" = "developer-api" ] && alias_args=(--network-alias developer-api)
  # synthetic NON-secret config; secrets are file-only + exported in-process (never -e)
  docker run -d --name "$cname" --network "$BZSB_DATA_NET" "${alias_args[@]}" \
    --label "$LABEL=1" --label "$LABEL.run=$BZSB_PROJECT" --label "$LABEL.service=$name" \
    --security-opt "no-new-privileges:true" \
    -v "$DBURL_FILE:/run/secrets/db_url:ro" \
    -v "$JWT_FILE:/run/secrets/jwt_secret:ro" \
    -v "$CIK_FILE:/run/secrets/core_internal_key:ro" \
    -v "$APIKEY_PEPPER_FILE:/run/secrets/api_key_pepper:ro" \
    -v "$DEVINT_FILE:/run/secrets/developer_internal_key:ro" \
    -v "$PAYEEVAL_FILE:/run/secrets/core_payee_validation_key:ro" \
    -v "$SESSION_FILE:/run/secrets/session_secret:ro" \
    -v "$OTP_FILE:/run/secrets/otp_pepper:ro" \
    -e "CORE_API_PORT=$port" -e "PORT=$port" -e "ENVIRONMENT=sandbox" \
    -e "BANZAMI_PILOT_LIMITS=1" \
    -e "CORE_API_URL=http://${BZSB_PROJECT}-core-api-staging:8081" \
    -e "DEVELOPER_API_URL=http://developer-api:8086" \
    -e "DEVELOPER_KEY_AUTH_ENABLED=true" -e "PAYMENT_CAPABILITY_RELEASED=true" \
    -e "REDIS_URL=redis://redis:6379" -e "REDIS_ADDR=redis:6379" \
    -e "TRANSIT_ACCOUNT_ID=$(uuid)" -e "BANK_ACCOUNT_ID=$(uuid)" -e "OPERATOR_FEE_REVENUE_ACCOUNT_ID=$(uuid)" \
    --entrypoint sh "$tag" -c 'export DATABASE_URL="$(cat /run/secrets/db_url)"; export JWT_SECRET="$(cat /run/secrets/jwt_secret)"; export CORE_INTERNAL_KEY="$(cat /run/secrets/core_internal_key)"; export API_KEY_PEPPER="$(cat /run/secrets/api_key_pepper)"; export DEVELOPER_INTERNAL_KEY="$(cat /run/secrets/developer_internal_key)"; export CORE_PAYEE_VALIDATION_KEY="$(cat /run/secrets/core_payee_validation_key)"; export SESSION_SECRET="$(cat /run/secrets/session_secret)"; export OTP_PEPPER="$(cat /run/secrets/otp_pepper)"; exec '"$bin" >/dev/null 2>&1 || return 1
  docker network connect "$BZSB_APP_NET" "$cname" >/dev/null 2>&1 || true
  # health AFTER deployment (docker HEALTHCHECK from the image)
  local i=0 st
  while :; do st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}nohc{{end}}' "$cname" 2>/dev/null)"
    [ "$st" = healthy ] && return 0
    [ "$st" = nohc ] && { docker exec "$cname" true >/dev/null 2>&1 && return 0; }
    i=$((i+1)); [ "$i" -gt 60 ] && { echo "  $name health timeout (last=$st)" >&2; docker logs --tail 20 "$cname" 2>&1 | sed 's/^/    /' >&2; return 1; }
    sleep 2
  done
}

cmd_plan() {
  echo "sandbox-deploy PLAN: deploy 4 approved services one-at-a-time from the verified package"
  echo "  provenance-before-health; no build/pull/mutable-tag; file-only in-process DB credential; non-root; internal networks only"
  echo "  services: core-api-staging api-gateway-staging developer-api public-api-staging (allowlist-enforced)"
}

cmd_apply() {
  load_context; write_db_url; write_jwt_secret; write_core_internal_key; write_devkey_secrets
  local e name port bin tag
  for e in "${SERVICES[@]}"; do
    IFS='|' read -r name port bin <<<"$e"
    echo "sandbox-deploy: validating + deploying $name"
    tag="$(validate_service "$name")" || hold "BLOCKER — SANDBOX DEPLOYMENT CONTRACT CANNOT BE VALIDATED" 43
    echo "  $name provenance_validated PASS"
    if deploy_one "$name" "$port" "$bin" "$tag"; then echo "  $name deployed_and_healthy PASS"; else echo "  $name deployed_and_healthy FAIL"; hold "BLOCKER — SANDBOX DEPLOYMENT CONTRACT CANNOT BE VALIDATED" 43; fi
  done
  echo "sandbox-deploy: all four approved services deployed and healthy"
}

cmd_verify() {
  load_context; local rc=0 e name port bin cname
  for e in "${SERVICES[@]}"; do
    IFS='|' read -r name port bin <<<"$e"; cname="${BZSB_PROJECT}-$name"
    docker ps -q --filter "name=$cname" | grep -q . || { echo "  $name running FAIL"; rc=1; continue; }
    # health
    local st; st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}nohc{{end}}' "$cname")"
    { [ "$st" = healthy ] || { [ "$st" = nohc ] && docker exec "$cname" true >/dev/null 2>&1; }; } && echo "  $name healthy PASS" || { echo "  $name healthy FAIL"; rc=1; }
    # non-root
    [ "$(docker exec "$cname" id -u 2>/dev/null)" != "0" ] && echo "  $name non_root PASS" || { echo "  $name non_root FAIL"; rc=1; }
    # no secret in inspectable env / no host port
    docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cname" | grep -qiE 'DATABASE_URL=|password=|:[^ ]*@' && { echo "  $name no_secret_in_env FAIL"; rc=1; } || echo "  $name no_secret_in_env PASS"
    [ -z "$(docker port "$cname" 2>/dev/null)" ] && echo "  $name no_host_port PASS" || { echo "  $name no_host_port FAIL"; rc=1; }
    # image identity matches manifest
    [ "$(oci_digest "$RELEASE_ROOT/images/$name.oci")" = "$(mget "service.$name.image_digest")" ] && echo "  $name image_identity_matches PASS" || { echo "  $name image_identity_matches FAIL"; rc=1; }
  done
  echo "SANDBOX_DEPLOY_VERIFY_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"
}

cmd_clean() {
  load_context 2>/dev/null || true
  [ -n "${BZSB_PROJECT:-}" ] && docker ps -aq --filter "label=$LABEL.run=$BZSB_PROJECT" | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker ps -aq --filter "label=$LABEL" | xargs -r docker rm -f >/dev/null 2>&1 || true
  local e name; for e in "${SERVICES[@]}"; do name="${e%%|*}"; docker image ls --filter "label=com.banzami.blueprint.service-lab.service=$name" -q | xargs -r docker image rm -f >/dev/null 2>&1 || true; done
  rm -f "${DBURL_FILE:-/nonexistent}" "${JWT_FILE:-/nonexistent}" "${CIK_FILE:-/nonexistent}" \
        "${APIKEY_PEPPER_FILE:-/nonexistent}" "${DEVINT_FILE:-/nonexistent}" "${PAYEEVAL_FILE:-/nonexistent}" \
        "${SESSION_FILE:-/nonexistent}" "${OTP_FILE:-/nonexistent}" 2>/dev/null || true
  echo "sandbox-deploy: scoped cleanup done"
}

case "${1:-}" in
  plan) cmd_plan ;; apply) cmd_apply ;; verify) cmd_verify ;; clean) cmd_clean ;;
  *) die "usage: sandbox-deploy.sh {plan|apply|verify|clean}" ;;
esac
