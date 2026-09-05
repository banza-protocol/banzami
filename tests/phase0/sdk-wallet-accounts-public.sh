#!/usr/bin/env bash
# Public-path proof for project-bound wallet sub-accounts (ADR-050).
#
# The VM-internal harness (wallet-subaccount-e2e.sh) talks to the gateway
# container directly with curl. That proves the server. It does NOT prove that a
# developer following the public documentation can do the same thing, which is a
# different claim and the one the Developer Platform actually makes.
#
# So this one uses only what a developer has:
#   - @banzami/sdk installed FRESH from the public npm registry (no workspace
#     link, no local build, no vendored copy)
#   - the public endpoint https://sandbox-api.banzami.com
#   - a project API key and nothing else — no merchant id, no wallet id
#
# It runs the SDK inside a throwaway node container so the install is genuinely
# clean. The key is passed by environment and never printed, written to disk, or
# baked into an image.
set -uo pipefail

SDK_VERSION="${SDK_VERSION:-0.6.0}"
BASE_URL="${BASE_URL:-https://sandbox-api.banzami.com}"
DOA_PROJECT="${DOA_PROJECT:-6367749d-ba77-47b6-80bd-982382ddd1c9}"
ACTOR="${ACTOR:-11111111-2222-4333-8444-555555555555}"

DEV=$(docker ps --format '{{.Names}}' | grep developer-api | head -1)
[ -n "$DEV" ] || { echo "DEVELOPER_API_NOT_FOUND"; exit 1; }
DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
[ -n "$DEVINT" ] || { echo "NO_INTERNAL_KEY"; exit 1; }

R="${RANDOM}${RANDOM}"
SCOPES='["identity:read","payment_sessions:read","payment_sessions:write","wallet_accounts:read","wallet_accounts:create"]'
KEY=$(printf '%s' "{\"name\":\"sdk-public-$R\",\"scopes\":$SCOPES,\"created_by\":\"$ACTOR\"}" \
  | docker exec -i "$DEV" curl -s -X POST "http://localhost:8086/internal/v1/projects/$DOA_PROJECT/fixture-keys" \
      -H "X-Internal-Key: $DEVINT" -H "Content-Type: application/json" --data @- \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).secret||"")}catch(e){}})')
[ -n "$KEY" ] || { echo "KEY_MINT_FAILED"; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/proof.mjs" <<'JS'
import { BanzamiClient } from '@banzami/sdk';

const run = process.env.RUN_ID;
let pass = 0, fail = 0;
const chk = (id, got, want) => {
  if (String(got) === String(want)) { console.log(`  ${id} PASS (${got})`); pass++; }
  else { console.log(`  ${id} FAIL (got '${got}' want '${want}')`); fail++; }
};
const chkne = (id, a, b) => {
  if (a && a !== b) { console.log(`  ${id} PASS (distinct)`); pass++; }
  else { console.log(`  ${id} FAIL (collided or empty)`); fail++; }
};

// Exactly the construction the public Quickstart shows: a key and a base URL.
// No merchant id, no wallet id — the developer does not have them and does not
// need them.
const banzami = new BanzamiClient({
  apiKey:  process.env.BANZAMI_API_KEY,
  baseUrl: process.env.BANZAMI_BASE_URL,
});

console.log(`### sdk ${process.env.SDK_VERSION} against ${process.env.BANZAMI_BASE_URL}`);

const openCampaign = (id, label) => banzami.createWalletAccount({
  purpose: 'CAMPAIGN', referenceType: 'DOA_CAMPAIGN', referenceId: id, label,
});

console.log('### two campaigns, two accounts');
const a = await openCampaign(`sdk-camp-a-${run}`, 'Campaign A');
const b = await openCampaign(`sdk-camp-b-${run}`, 'Campaign B');
chkne('A_B_DISTINCT', a.id, b.id);
chk('A_B_SAME_OWNER', a.wallet_id, b.wallet_id);

console.log('### idempotent provisioning');
const a2 = await openCampaign(`sdk-camp-a-${run}`, 'Campaign A');
chk('A_IDEMPOTENT', a2.id, a.id);

console.log('### listing returns the project’s own accounts');
const list = await banzami.listWalletAccounts();
const ids = (Array.isArray(list) ? list : list.data ?? []).map((x) => x.id);
chk('LIST_CONTAINS_A', ids.includes(a.id), true);
chk('LIST_CONTAINS_B', ids.includes(b.id), true);

console.log('### each campaign collects into its own account');
const sa = await banzami.createPaymentSession({
  walletAccountId: a.id, purpose: 'DONATION', referenceType: 'DOA_DONATION',
  referenceId: `sdk-don-a-${run}`, amountMinor: 250_000, currency: 'AOA',
});
const sb = await banzami.createPaymentSession({
  walletAccountId: b.id, purpose: 'DONATION', referenceType: 'DOA_DONATION',
  referenceId: `sdk-don-b-${run}`, amountMinor: 150_000, currency: 'AOA',
});
chkne('SESSIONS_DISTINCT', sa.session_id, sb.session_id);
// No `?? a.id` fallback here. With one, a response that omits the field would
// compare a.id against itself and pass while proving nothing — the assertion
// would be reporting on its own default rather than on the server.
chk('SESSION_A_TO_A', sa.wallet_account_id, a.id);
chk('SESSION_B_TO_B', sb.wallet_account_id, b.id);

console.log('### the session is payable — an interface the donor can open');
const link = banzami.paymentSessionInterface(sa, 'PAYMENT_LINK')
          ?? banzami.paymentSessionInterface(sa, 'DEEP_LINK');
chk('SESSION_HAS_INTERFACE', !!link?.value, true);

console.log(`\nSDK_PUBLIC_WALLET_ACCOUNTS: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
JS

# Fresh registry install in a throwaway container. --ignore-scripts because a
# proof should not run arbitrary package lifecycle code.
docker run --rm \
  -e BANZAMI_API_KEY="$KEY" -e BANZAMI_BASE_URL="$BASE_URL" \
  -e SDK_VERSION="$SDK_VERSION" -e RUN_ID="$R" \
  -v "$WORK":/w -w /w node:24-alpine sh -c "
    npm init -y >/dev/null 2>&1
    npm install --no-fund --no-audit --ignore-scripts @banzami/sdk@$SDK_VERSION >/dev/null 2>&1 || { echo NPM_INSTALL_FAILED; exit 1; }
    echo \"  installed: \$(node -p \"require('/w/node_modules/@banzami/sdk/package.json').version\") from the public registry\"
    node proof.mjs
  "
