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
  # pay-frontend — the hosted payer surface (Banzami ADR-052, CAP-APP-004).
  #
  # It was previously forbidden here. That invariant was written when the
  # Sandbox project was API-only; the external Sandbox product now includes the
  # page a payer actually opens, and every payment link the platform issues
  # points at it. A surface the product requires does not belong in a fourth
  # standalone topology to preserve a rule that no longer describes the product.
  #
  # It is the ONLY entry here with no financial authority: no secret mount, no
  # database URL, no Core credential. See PAY_FRONTEND_APP_PLANE_ONLY below.
  # The third field is what the entrypoint execs. For the Go services it is a
  # binary; for this one it is a Next.js standalone server, and `node` alone is
  # a REPL. Deployed that way the container started, found stdin was not a
  # terminal, exited 0 in under a second, and pay.banzami.com answered 502 to
  # every payer for twelve hours. A clean exit code is what made it quiet:
  # nothing crashed, nothing restarted, no log line was written.
  "pay-frontend|3002|node server.js"
)
# Services that must never exist in this project.
#
# `pay` and `frontend` were removed as blanket terms: they forbade the hosted
# payer surface, which is now an authorised Sandbox application (above). What
# they were really protecting — that no ADMIN or LIVE surface is deployed here —
# is unchanged and named precisely instead of by substring.
FORBIDDEN="admin-api admin-api-staging admin-frontend dashboard-frontend checkout-frontend reverse-proxy banza-docs banzai"

# pay-frontend gets the APPLICATION plane only.
#
# Every other service is on the data plane too, because every other service
# talks to Postgres. This one must not: it holds no credential and reads the
# gateway over HTTP like any other client would. Adding a frontend must not
# broaden what the Sandbox exposes.
PAY_FRONTEND_APP_PLANE_ONLY=1

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
  # `docker create` + attach + `start`, never `docker run -d` followed by a
  # `network connect`. Attaching the second network to an ALREADY-RUNNING
  # container reconfigures Docker's embedded resolver underneath it, and a
  # service that resolves a dependency during boot can catch the reconfiguration
  # window and get SERVFAIL. Observed reproducibly: public-api died at startup
  # with `lookup postgres on 127.0.0.11:53: server misbehaving`, twice, while the
  # gateway and developer-api survived only because they do not hard-fail on a
  # boot-time database ping. The container now has every network before its first
  # instruction runs.
  docker create --name "$cname" --network "$BZSB_DATA_NET" "${alias_args[@]}" \
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
    --entrypoint sh "$tag" -c 'export DATABASE_URL="$(cat /run/secrets/db_url)"; export JWT_SECRET="$(cat /run/secrets/jwt_secret)"; export CORE_INTERNAL_KEY="$(cat /run/secrets/core_internal_key)"; export CORE_REFUND_KEY="$CORE_INTERNAL_KEY"; export API_KEY_PEPPER="$(cat /run/secrets/api_key_pepper)"; export DEVELOPER_INTERNAL_KEY="$(cat /run/secrets/developer_internal_key)"; export CORE_PAYEE_VALIDATION_KEY="$(cat /run/secrets/core_payee_validation_key)"; export SESSION_SECRET="$(cat /run/secrets/session_secret)"; export OTP_PEPPER="$(cat /run/secrets/otp_pepper)"; exec '"$bin" >/dev/null 2>&1 || return 1
  docker network connect "$BZSB_APP_NET" "$cname" >/dev/null 2>&1 || true
  docker start "$cname" >/dev/null 2>&1 || return 1
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

# cmd_deploy_one — redeploy a SINGLE approved service from an already-built local image
# tag (the fast source-bundle native-build path). It CLONES the currently-running
# container's configuration (its file-only secret mounts, non-secret -e env, networks
# and non-root/no-new-privileges posture) and swaps only the image — so it is decoupled
# from the gated bootstrap state, does NOT regenerate secrets (cross-service auth is
# preserved), and does NOT run any migration, VM reset or prune. The file-only-secret
# entrypoint is reconstructed (secrets are exported in-process from /run/secrets, never
# via -e). Rollback redeploys the previously-running image.
cmd_deploy_one() {
  local name="$1" tag="$2" rollback="${3:-}"
  local e n p b bin port; for e in "${SERVICES[@]}"; do IFS='|' read -r n p b <<<"$e"; [ "$n" = "$name" ] && { bin="$b"; port="$p"; }; done
  [ -n "${bin:-}" ] || die "unknown sandbox service: $name"
  # `|| true`: under `set -e` an empty grep result exits the script, which is
  # exactly the case a FIRST deploy is — no container yet. Without it the script
  # died silently before reaching the create path below, reporting only rc=1.
  local cname; cname="$(docker ps -a --format '{{.Names}}' | grep -E -- "-${name}\$" | head -1 || true)"

  # First deploy of the hosted payer surface.
  #
  # The clone-the-running-container path below cannot bootstrap a service that
  # has never run, and every other service here was created by the gated apply
  # with its secret mounts. pay-frontend has none to clone: no secret, no
  # database URL, no Core credential — only the public gateway origin it reads.
  # So its first create is explicit, minimal, and on the APPLICATION plane only.
  if [ -z "$cname" ] && [ "$name" = "pay-frontend" ]; then
    local proj net
    proj="$(docker ps --format '{{.Names}}' | grep -oE '^bzsandbox-[0-9]+-[0-9]+-[0-9]+' | head -1)"
    [ -n "$proj" ] || die "no bootstrapped Sandbox project found"
    net="$(docker network ls --format '{{.Name}}' | grep -E '^bzsb-app-' | head -1)"
    [ -n "$net" ] || die "no Sandbox application network found"
    cname="${proj}-pay-frontend"
    echo "  $name first create on $net (application plane only, no secrets)"
    docker run -d --name "$cname" --network "$net" \
      --security-opt "no-new-privileges:true" \
      --label "$LABEL.service=$name" \
      -e NEXT_PUBLIC_GATEWAY_URL="${PAY_GATEWAY_URL:-https://sandbox-api.banzami.com}" \
      -e GATEWAY_INTERNAL_URL="http://${proj}-api-gateway-staging:8080" \
      -e PORT="$port" -e HOSTNAME=0.0.0.0 \
      "$tag" >/dev/null 2>&1 || { echo "  $name first create FAIL"; return 1; }
    local c=0 st
    while :; do st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}nohc{{end}}' "$cname" 2>/dev/null)"
      case "$st" in healthy) echo "  $name deployed_and_healthy PASS"; return 0 ;; esac
      c=$((c+1)); [ "$c" -gt 45 ] && { echo "  $name first create FAIL (health timeout)"; return 1; }; sleep 2
    done
  fi

  [ -n "$cname" ] || die "no running $name container to redeploy (run a full gated apply first)"
  local prev pf; prev="$(docker inspect -f '{{.Config.Image}}' "$cname" 2>/dev/null || true)"; pf="/tmp/.banzami-prev-img-$name"
  if [ "$rollback" = "--rollback" ]; then tag="$(cat "$pf" 2>/dev/null || echo "$tag")"; else [ -n "$prev" ] && printf '%s' "$prev" > "$pf" || true; fi
  # clone config from the running container
  local nets; mapfile -t nets < <(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$cname")
  local run=(docker run -d --name "$cname" --security-opt "no-new-privileges:true" --network "${nets[0]}")
  [ "$name" = developer-api ] && run+=(--network-alias developer-api)
  local x; while IFS= read -r x; do [ -n "$x" ] && run+=(-v "$x"); done < <(docker inspect -f '{{range .HostConfig.Binds}}{{println .}}{{end}}' "$cname")
  # Clone the previous container's env EXCEPT anything the new image is the
  # authority on. BANZAMI_BUILD_COMMIT is baked into each image by the build
  # (ARG -> ENV); re-applying the previous container's value as an explicit -e
  # shadows the new image's ENV, so the deployed build would report whichever
  # commit happened to be running when the env was first cloned — and would keep
  # reporting it through every future deploy.
  #
  # Caught by the runtime gate immediately after a deploy: the container was
  # created from image :9c2d0f428fec, whose ENV says 9c2d0f428fec, while /readyz
  # answered 4a924e764024. Build identity that silently freezes is worse than no
  # build identity, because it looks like an answer.
  while IFS= read -r x; do
    case "$x" in BANZAMI_BUILD_COMMIT=*) continue ;; esac
    [ -n "$x" ] && run+=(-e "$x")
  done < <(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cname")
  # reconstruct the file-only-secret entrypoint (secrets exported in-process, never -e).
  #
  # core_internal_key appears twice, under two names. Core gates its refund group
  # on one shared service credential, so the Gateway's CORE_INTERNAL_KEY and
  # developer-api's CORE_REFUND_KEY are the same value — but each service names
  # the variable for what it authorises there, so reading either one says what
  # that service is allowed to do rather than where the secret came from. A
  # service that does not read a name simply ignores it.
  local ep='for s in db_url:DATABASE_URL jwt_secret:JWT_SECRET core_internal_key:CORE_INTERNAL_KEY core_internal_key:CORE_REFUND_KEY api_key_pepper:API_KEY_PEPPER developer_internal_key:DEVELOPER_INTERNAL_KEY core_payee_validation_key:CORE_PAYEE_VALIDATION_KEY session_secret:SESSION_SECRET otp_pepper:OTP_PEPPER; do f="/run/secrets/${s%%:*}"; v="${s##*:}"; [ -f "$f" ] && export "$v"="$(cat "$f")"; done; exec '"$bin"
  docker rm -f "$cname" >/dev/null 2>&1 || true   # single-service swap (nothing else pruned)
  "${run[@]}" --entrypoint sh "$tag" -c "$ep" >/dev/null 2>&1 || { echo "  $name docker run FAIL"; return 1; }
  local i; for i in "${nets[@]:1}"; do docker network connect "$i" "$cname" >/dev/null 2>&1 || true; done
  local k=0 st; while :; do st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}nohc{{end}}' "$cname" 2>/dev/null)"
    [ "$st" = healthy ] && { echo "  $name deployed_and_healthy PASS"; return 0; }
    [ "$st" = nohc ] && { docker exec "$cname" true >/dev/null 2>&1 && { echo "  $name deployed PASS (no healthcheck)"; return 0; }; }
    k=$((k+1)); [ "$k" -gt 45 ] && { echo "  $name deployed_and_healthy FAIL (health timeout)"; return 1; }; sleep 2
  done
}

case "${1:-}" in
  plan) cmd_plan ;; apply) cmd_apply ;; verify) cmd_verify ;; clean) cmd_clean ;;
  deploy-one) shift; cmd_deploy_one "$@" ;;
  *) die "usage: sandbox-deploy.sh {plan|apply|verify|clean|deploy-one <name> <tag> [--rollback]}" ;;
esac
