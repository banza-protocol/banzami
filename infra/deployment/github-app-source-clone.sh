#!/usr/bin/env bash
# =============================================================================
# Canonical source clone/fetch wrapper  —  REVIEWED TEMPLATE, NOT EXECUTED HERE
# =============================================================================
# Clones/fetches ONLY banza-protocol/banzami over HTTPS using a short-lived GitHub
# App installation token (from github-app-token-helper.sh). The token is supplied
# to git via GIT_ASKPASS and is NEVER placed in the remote URL, argv, git config,
# env files, Compose, logs or shell history. The remote stays a tokenless HTTPS URL.
#
# Usage (operator, root):
#   GH_APP_ID=<id> GH_APP_INSTALLATION_ID=<id> \
#   GH_APP_PRIVATE_KEY_FILE=/root/banzami-secrets/github-app/private-key.pem \
#     github-app-source-clone.sh /srv/banzami/canonical-src
# -----------------------------------------------------------------------------
set -euo pipefail
set +x
export PS4=''
umask 077

DEST="${1:?usage: github-app-source-clone.sh <dest-dir>}"
HELPER="${GH_APP_TOKEN_HELPER:-/root/banzami-secrets/github-app/github-app-token-helper.sh}"
# Canonical repo over HTTPS (NOT ssh, NOT a deploy key, NOT the stale redirect alias).
REPO_HTTPS="https://github.com/banza-protocol/banzami.git"

[ -x "$HELPER" ] || { echo "wrapper: token helper not found/executable" >&2; exit 1; }

# Short-lived installation token — transient, root-only; captured into a variable,
# never argv/URL/config/log.
INSTALL_TOKEN="$("$HELPER")"
[ -n "$INSTALL_TOKEN" ] || { echo "wrapper: no installation token" >&2; exit 1; }
export INSTALL_TOKEN

# GIT_ASKPASS feeds the token to git as the HTTPS password (user x-access-token)
# WITHOUT it ever appearing in the URL, argv or git config. The askpass script holds
# NO secret itself — it reads INSTALL_TOKEN from the (root-only) environment.
ASKPASS="$(mktemp)"; chmod 700 "$ASKPASS"
cat > "$ASKPASS" <<'ASK'
#!/usr/bin/env bash
case "$1" in
  Username*) printf 'x-access-token' ;;
  Password*) printf '%s' "${INSTALL_TOKEN:-}" ;;
esac
ASK
export GIT_ASKPASS="$ASKPASS" GIT_TERMINAL_PROMPT=0

cleanup() { rm -f "$ASKPASS" 2>/dev/null || true; INSTALL_TOKEN=''; unset INSTALL_TOKEN 2>/dev/null || true; }
trap cleanup EXIT INT TERM HUP

if [ -d "$DEST/.git" ]; then
  git -C "$DEST" fetch --prune origin
else
  git clone "$REPO_HTTPS" "$DEST"
fi

# The token must NEVER persist. The remote must remain the tokenless HTTPS URL.
if grep -qiE 'x-access-token|ghs_|://[^/@]*:[^/@]*@github' "$DEST/.git/config" 2>/dev/null; then
  echo "wrapper: FATAL — a credential was persisted in .git/config (must not happen)" >&2
  exit 2
fi
echo "canonical source ready at $DEST (tokenless HTTPS remote; no credential persisted)"
