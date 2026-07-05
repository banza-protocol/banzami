#!/usr/bin/env bash
# =============================================================================
# GitHub App installation-token helper  —  REVIEWED TEMPLATE, NOT EXECUTED HERE
# =============================================================================
# Mints a SHORT-LIVED GitHub App installation access token for read-only HTTPS
# clone/fetch of the canonical repo banza-protocol/banzami (deploy keys are
# disabled by org policy; no PAT, no personal SSH key). Least privilege:
# Contents: Read-only on exactly one repository.
#
# Secret handling (precise — no overclaim):
#   * the App PRIVATE KEY is read by openssl from a root-owned 0600 file; its value
#     is never placed in argv, env, a URL, git config or a log;
#   * the JWT (≤10 min) is handed to the GitHub API via curl's STDIN config
#     (--config -), never as an argv/URL/log;
#   * the installation token (≤1 h) is emitted ONCE on stdout for immediate capture
#     by the clone wrapper; it is never logged, argv'd, URL'd or written to disk;
#   * Bash provides scope/lifetime control only — NOT a cryptographic memory wipe.
#
# Install root-owned, restricted:
#   install -o root -g root -m 0700 github-app-token-helper.sh \
#     /root/banzami-secrets/github-app/github-app-token-helper.sh
# -----------------------------------------------------------------------------
set -euo pipefail
set +x                    # never trace — would render the JWT/token
export PS4=''
umask 077

# Non-secret config (App id + installation id are NOT secrets):
APP_ID="${GH_APP_ID:?set GH_APP_ID (non-secret GitHub App id)}"
INSTALLATION_ID="${GH_APP_INSTALLATION_ID:?set GH_APP_INSTALLATION_ID (non-secret)}"
# The PRIVATE KEY is referenced only by PATH (root-owned 0600); its value is never
# taken as an argument or env value.
KEY_FILE="${GH_APP_PRIVATE_KEY_FILE:?set GH_APP_PRIVATE_KEY_FILE (root-owned 0600 .pem path)}"
[ -r "$KEY_FILE" ] || { echo "helper: private key file unreadable" >&2; exit 1; }

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# JWT header/payload are PUBLIC (not secret); only the signature + key are sensitive.
now="$(date +%s)"; iat=$((now - 60)); exp=$((now + 540))   # ≤ 10 minutes
h="$(printf '%s' '{"alg":"RS256","typ":"JWT"}' | b64url)"
p="$(printf '%s' "{\"iat\":$iat,\"exp\":$exp,\"iss\":\"$APP_ID\"}" | b64url)"
# Sign with the private key read from file (never printed); signature is piped, not argv.
sig="$(printf '%s' "$h.$p" | openssl dgst -sha256 -sign "$KEY_FILE" | b64url)"
jwt="$h.$p.$sig"

# Exchange JWT -> short-lived installation token. The JWT is passed to curl via a
# STDIN config (--config -), so it is never in argv (ps-visible), a URL or a file.
resp="$(
  printf 'header = "Authorization: Bearer %s"\nheader = "Accept: application/vnd.github+json"\nheader = "X-GitHub-Api-Version: 2022-11-28"\n' "$jwt" \
  | curl -sS --config - -X POST \
      "https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens"
)"
jwt=''   # drop the JWT as soon as it is used

token="$(printf '%s' "$resp" | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
[ -n "$token" ] || { echo "helper: installation-token issuance failed" >&2; exit 1; }

# Emit exactly once for immediate capture by the wrapper; caller must not log it.
printf '%s' "$token"
token=''
