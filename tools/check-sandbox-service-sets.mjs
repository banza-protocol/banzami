#!/usr/bin/env node
/**
 * The VM execution ceremony has ONE four-service contract, and it must be stated
 * identically everywhere. This gate proves two things and fails on any drift:
 *
 *   SANDBOX_CEREMONY_SET_DRIFT   the ceremony's four-service set is not identical across
 *                                - infra/blueprint/sandbox-ops/scripts/sandbox-release-package.sh (the provenance package)
 *                                - infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh         (CEREMONY_APPLY_SERVICES)
 *                                - infra/blueprint/vm-execution/vm-execute.sh                     (APPROVED)
 *                                - infra/blueprint/docs/VM_EXECUTION.md                           (documented set)
 *                                It fails on a 5th service added anywhere, one of the 4 omitted,
 *                                or doc/code divergence.
 *
 *   SANDBOX_APP_PLANE_TARGETING  sandbox-deploy.sh deploy-one selects the target stack by a
 *                                global `head -1` glob instead of the resolved stack identity
 *                                (_resolve_stack → BZSB_PROJECT). That is the two-stack
 *                                cross-match bug: during a blue/green rebuild (OLD alive while
 *                                NEW is built) it can bind an app-plane container to the wrong
 *                                stack's network/gateway/secret directory.
 *
 *   node tools/check-sandbox-service-sets.mjs
 *   BZ_SERVICE_SETS_ROOT=/tmp/copy node tools/check-sandbox-service-sets.mjs   (selftest)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BZ_SERVICE_SETS_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const RELEASE = 'infra/blueprint/sandbox-ops/scripts/sandbox-release-package.sh';
const DEPLOY = 'infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh';
const VMEXEC = 'infra/blueprint/vm-execution/vm-execute.sh';
const DOC = 'infra/blueprint/docs/VM_EXECUTION.md';

const EXPECTED = ['api-gateway-staging', 'core-api-staging', 'developer-api', 'public-api-staging'];
const norm = (a) => [...new Set(a)].sort();
const eq = (a) => norm(a).length === EXPECTED.length && norm(a).every((s, i) => s === EXPECTED[i]);

const findings = { SANDBOX_CEREMONY_SET_DRIFT: [], SANDBOX_APP_PLANE_TARGETING: [] };

// ── 1. the four-service set, from each source ──────────────────────────────────
// release package: the SERVICES=( "name|ctx|df" … ) array — the only service array there.
const relSrc = read(RELEASE);
const relBlock = (relSrc.match(/\nSERVICES=\(([\s\S]*?)\n\)/) ?? [])[1] ?? '';
const relSet = [...relBlock.matchAll(/"([a-z0-9-]+)\|/g)].map((m) => m[1]);

// sandbox-deploy: CEREMONY_APPLY_SERVICES=(a b c d)
const depSrc = read(DEPLOY);
const depBlock = (depSrc.match(/\nCEREMONY_APPLY_SERVICES=\(([^)]*)\)/) ?? [])[1] ?? '';
const depSet = depBlock.trim().split(/\s+/).filter(Boolean);

// vm-execute: APPROVED="a b c d"
const vmSrc = read(VMEXEC);
const vmSet = ((vmSrc.match(/\nAPPROVED="([^"]*)"/) ?? [])[1] ?? '').trim().split(/\s+/).filter(Boolean);

// doc: "Deploys exactly and only `a`, `b`, `c`, `d`" — the backtick-quoted service names
// in the Scope section.
const docSrc = read(DOC);
const docScope = (docSrc.match(/Deploys exactly and only([\s\S]*?)\./) ?? [])[1] ?? '';
const docSet = [...docScope.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);

for (const [label, set] of [[RELEASE, relSet], [`${DEPLOY} CEREMONY_APPLY_SERVICES`, depSet], [`${VMEXEC} APPROVED`, vmSet], [`${DOC} scope`, docSet]]) {
  if (!eq(set)) findings.SANDBOX_CEREMONY_SET_DRIFT.push(`${label}: [${norm(set).join(', ') || '(none parsed)'}] != [${EXPECTED.join(', ')}]`);
}

// ── 2. deploy-one binds to the resolved stack, never a cross-stack head -1 glob ─
// Scan cmd_deploy_one + release_config_env: no `… | head -1` that selects a stack
// resource (project, app/data net, a core/api/frontend container). The ONE allowed
// head -1 is the egress singleton (a single shared network, not per-stack), and the
// single-stack fail-closed fallback lives in _resolve_stack (a different function).
const fnBody = (src, name) => {
  const i = src.indexOf(`${name}() {`);
  if (i < 0) return '';
  // to the next top-level "\n<name>() {" or the final dispatch
  const after = src.slice(i + 1);
  const next = after.search(/\n[a-z_]+\(\) \{|\ncase "\$\{1:-\}"/);
  return after.slice(0, next < 0 ? undefined : next);
};
const STACK_GLOB = /head -1/;
const STACK_RESOURCE = /grep -oE '\^bzsandbox-|grep -E '\^bzsb-app-|grep -E '\^bzsb-data-|grep -E -- '-core-api-staging\$'|grep -E -- '-public-api-staging\$'|grep -E -- '-api-gateway-staging\$'|grep -E -- '-developer-api\$'|grep -E -- '-app-session-redis\$'/;
for (const fn of ['cmd_deploy_one', 'release_config_env']) {
  const body = fnBody(depSrc, fn);
  if (!body) { findings.SANDBOX_APP_PLANE_TARGETING.push(`${DEPLOY}: function ${fn} not found`); continue; }
  for (const line of body.split('\n')) {
    if (STACK_GLOB.test(line) && STACK_RESOURCE.test(line)) {
      findings.SANDBOX_APP_PLANE_TARGETING.push(`${DEPLOY} ${fn}: cross-stack head -1 glob: "${line.trim().slice(0, 100)}"`);
    }
  }
}
// cmd_deploy_one must resolve the stack explicitly before it acts.
if (!/^\s*_resolve_stack\b/m.test(fnBody(depSrc, 'cmd_deploy_one'))) {
  findings.SANDBOX_APP_PLANE_TARGETING.push(`${DEPLOY} cmd_deploy_one: does not call _resolve_stack (stack identity unresolved)`);
}

let failed = 0;
for (const [k, list] of Object.entries(findings)) {
  console.log(`${k}=${list.length}`);
  for (const l of list) console.log(`  ✗ ${l}`);
  failed += list.length;
}
console.log(`SANDBOX_SERVICE_SETS=${failed ? 'FAIL' : 'PASS'}`);
if (!failed) console.log('\n✓ one four-service ceremony contract across package/deploy/vm-execute/doc; app-plane deploy-one binds to the resolved stack');
process.exit(failed ? 1 : 0);
