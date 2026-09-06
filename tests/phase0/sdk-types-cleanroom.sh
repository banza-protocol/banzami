#!/usr/bin/env bash
# Does @banzami/sdk typecheck for a consumer who has no Node types?
#
# 0.8.1 shipped `string | Buffer` in webhooks.d.ts. Buffer is a Node global the
# package neither supplied nor declared, so a TypeScript project with
# skipLibCheck:false and no @types/node got five errors out of a file it never
# imported. The fix widened the public signatures to string | Uint8Array.
#
# This harness is the consumer that would have caught it: a fresh project,
# outside both repositories, strict, skipLibCheck FALSE, and deliberately WITHOUT
# @types/node. It then proves the Node consumer is unbroken by compiling real
# Buffer call sites against the same declarations.
#
# Usage:  sdk-types-cleanroom.sh [<spec>]
#   spec defaults to @banzami/sdk@latest (the registry, not the working tree).
set -uo pipefail

SPEC="${1:-@banzami/sdk@latest}"
PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

# This one creates nothing on the operator — no keys, no merchants, no
# endpoints. It uses the shared handler purely so its clean room is removed by
# the same path as everything else.
. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

DIR=$(mktemp -d "${TMPDIR:-/tmp}/bz-cleanroom.XXXXXX")
# Not a second trap: the shell keeps one EXIT handler, and installing another
# here would replace the run's cleanup handler and silently stop it.
E2E_ALSO='rm -rf "$DIR"'
cd "$DIR" || exit 1
echo "clean room: $DIR"
echo "spec:       $SPEC"

npm init -y >/dev/null 2>&1
npm install --no-audit --no-fund "$SPEC" typescript@5 >/dev/null 2>&1 || { echo "install failed"; exit 1; }

INSTALLED=$(node -p "require('./node_modules/@banzami/sdk/package.json').version")
echo "installed:  $INSTALLED"

# No @types/node anywhere — the whole point of the exercise.
if [[ -d node_modules/@types/node ]]; then
  bad "@types/node was installed — the clean room is not clean"
else
  ok "no @types/node present"
fi

# Nothing may resolve from a checkout — asserted only when the spec IS the
# registry. Running the harness against a local directory before publishing is a
# deliberate dry run, and reporting that as a leak would be noise.
if [[ "$SPEC" == @banzami/sdk* ]]; then
  if grep -qE '"(file:|link:|workspace:)' package.json package-lock.json 2>/dev/null; then
    bad "a local spec leaked into the manifest"
  else
    ok "resolved from the registry only"
  fi
else
  echo "  ·  local spec ($SPEC) — registry-resolution check skipped (dry run)"
fi

cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": false,
    "noEmit": true,
    "types": []
  },
  "include": ["app.ts"]
}
JSON

cat > app.ts <<'TS'
import { BanzamiClient } from '@banzami/sdk';
import { constructEvent, verifySignature, generateTestSignature } from '@banzami/sdk/webhooks';

const banzami = new BanzamiClient({ apiKey: 'bz_test_sk_placeholder' });

// A raw body as a string — the shape a framework hands you when it has decoded.
const fromString = constructEvent('{}', 't=1,v1=deadbeef', 'whsec_x');

// A raw body as bytes, with NO Node types available: Uint8Array is the type a
// consumer without @types/node can actually name.
const bytes: Uint8Array = new TextEncoder().encode('{}');
verifySignature(bytes, 't=1,v1=deadbeef', 'whsec_x');
const sig: string = generateTestSignature(bytes, 'whsec_x');

export { banzami, fromString, sig };
TS

if npx --no-install tsc -p tsconfig.json 2>type-errors.txt; then
  ok "strict + skipLibCheck:false + no Node types → zero type errors"
else
  bad "typecheck failed without @types/node:"
  sed 's/^/       /' type-errors.txt | head -20
fi

# A Node consumer must remain source-compatible: Buffer extends Uint8Array, so
# every existing Buffer call site still compiles against the widened signature.
npm install --no-audit --no-fund @types/node >/dev/null 2>&1
cat > tsconfig.node.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": false,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["node-app.ts"]
}
JSON
cat > node-app.ts <<'TS'
import { constructEvent, verifySignature, generateTestSignature } from '@banzami/sdk/webhooks';

// Exactly what the README's Express example does today.
const raw: Buffer = Buffer.from('{}', 'utf-8');
verifySignature(raw, 't=1,v1=deadbeef', 'whsec_x');
const evt = constructEvent(raw, 't=1,v1=deadbeef', 'whsec_x');
const sig: string = generateTestSignature(raw, 'whsec_x');

export { evt, sig };
TS

if npx --no-install tsc -p tsconfig.node.json 2>node-errors.txt; then
  ok "an existing Buffer caller still compiles (Buffer assignable to Uint8Array)"
else
  bad "the widening broke a Node consumer:"
  sed 's/^/       /' node-errors.txt | head -20
fi

echo
echo "PASS=$PASS FAIL=$FAIL  (version $INSTALLED)"
[[ $FAIL -eq 0 ]]
