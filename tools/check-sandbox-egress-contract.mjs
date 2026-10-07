#!/usr/bin/env node
/**
 * The Sandbox outbound-egress contract has ONE canonical service set, and every
 * deploy path must restore it on create AND recreate — reusing the single egress
 * mechanism, never a second hand-kept list. This gate proves that and fails on drift.
 *
 * It exists for a real regression: a core ceremony recreate dropped bzsb-egress
 * for api-gateway/developer-api/public-api (only the app path re-attached admin-api),
 * so public-api could no longer resolve api.resend.com and consumer signup email
 * returned 503. The fix routed every path through ensure_egress + the canonical
 * SANDBOX_EGRESS_SERVICES set; this gate keeps it that way.
 *
 *   EGRESS_SET_DRIFT        SANDBOX_EGRESS_SERVICES != the audited canonical set, OR it
 *                           contains a service with no outbound need (core-api, a
 *                           frontend, a data service).
 *   EGRESS_NOT_RESTORED     a deploy path that creates/recreates a service does not call
 *                           ensure_egress (so a recreate would silently drop egress).
 *   EGRESS_SECOND_LIST      an egress attachment bypasses the canonical mechanism (a raw
 *                           `docker network connect … bzsb-egress`, or a second egress
 *                           membership list), which can drift from the canonical set.
 *   EGRESS_MECHANISM_REUSE  ensure_egress reimplements the network/firewall logic instead
 *                           of reusing sandbox-egress.sh (its single idempotent owner).
 *
 *   node tools/check-sandbox-egress-contract.mjs
 *   BZ_EGRESS_ROOT=/tmp/copy node tools/check-sandbox-egress-contract.mjs   (selftest)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BZ_EGRESS_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const DEPLOY = 'infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh';
const EGRESS = 'infra/blueprint/sandbox-ops/scripts/sandbox-egress.sh';

// The audited canonical set — each member has a real outbound need:
//   api-gateway-staging (webhook delivery), developer-api (Resend + webhooks),
//   public-api-staging (consumer verification/recovery email), admin-api (operator mail).
const EXPECTED = ['admin-api', 'api-gateway-staging', 'developer-api', 'public-api-staging'];
// Services that must NEVER be granted egress (internal core, frontends, data).
const FORBIDDEN = ['core-api-staging', 'pay-frontend', 'admin-frontend', 'app-frontend', 'postgres', 'redis', 'app-session-redis'];
const norm = (a) => [...new Set(a)].sort();

const findings = { EGRESS_SET_DRIFT: [], EGRESS_NOT_RESTORED: [], EGRESS_SECOND_LIST: [], EGRESS_MECHANISM_REUSE: [] };
const dep = read(DEPLOY);

// ── 1. the canonical set is exactly the audited one, and excludes non-egress services
const setBlock = (dep.match(/\nSANDBOX_EGRESS_SERVICES=\(([^)]*)\)/) ?? [])[1] ?? '';
const set = setBlock.trim().split(/\s+/).filter(Boolean);
if (!(norm(set).length === EXPECTED.length && norm(set).every((s, i) => s === EXPECTED[i]))) {
  findings.EGRESS_SET_DRIFT.push(`SANDBOX_EGRESS_SERVICES = [${norm(set).join(', ') || '(none parsed)'}] != [${EXPECTED.join(', ')}]`);
}
for (const f of FORBIDDEN) if (set.includes(f)) findings.EGRESS_SET_DRIFT.push(`${f} must never have egress but is in SANDBOX_EGRESS_SERVICES`);

// helper: body of a shell function up to the next top-level function or the dispatch.
const fnBody = (src, name) => {
  const i = src.indexOf(`${name}() {`);
  if (i < 0) return '';
  const after = src.slice(i + 1);
  const next = after.search(/\n[a-z_]+\(\) \{|\ncase "\$\{1:-\}"/);
  return after.slice(0, next < 0 ? undefined : next);
};

// ── 2. every create/recreate path restores egress through ensure_egress
for (const fn of ['deploy_one', 'cmd_deploy_one']) {
  const body = fnBody(dep, fn);
  if (!body) { findings.EGRESS_NOT_RESTORED.push(`${DEPLOY}: function ${fn} not found`); continue; }
  if (!/ensure_egress\b/.test(body)) findings.EGRESS_NOT_RESTORED.push(`${DEPLOY} ${fn}: never calls ensure_egress (a recreate would drop egress)`);
}
// cmd_deploy_one holds BOTH a first-create and a single-service swap path; both must restore.
{
  const body = fnBody(dep, 'cmd_deploy_one');
  const n = (body.match(/ensure_egress\b/g) ?? []).length;
  if (body && n < 2) findings.EGRESS_NOT_RESTORED.push(`${DEPLOY} cmd_deploy_one: ensure_egress appears ${n}x; both the first-create and the swap/recreate path must restore egress`);
}

// ── 3. no second egress list / no raw egress attach bypassing the canonical mechanism
for (const line of dep.split('\n')) {
  if (/^\s*#/.test(line)) continue; // comments may name bzsb-egress to explain it
  // a raw network connect to the egress net, anywhere, is a bypass (ensure_egress uses sandbox-egress.sh, not docker network connect)
  if (/docker network connect\b/.test(line) && /egress/i.test(line)) findings.EGRESS_SECOND_LIST.push(`${DEPLOY}: raw egress network connect bypasses ensure_egress: "${line.trim().slice(0, 100)}"`);
  // a second membership glob for the egress net outside the mechanism
  if (/bzsb-egress/.test(line) && /grep|network ls/.test(line)) findings.EGRESS_SECOND_LIST.push(`${DEPLOY}: second egress-membership lookup outside ensure_egress: "${line.trim().slice(0, 100)}"`);
}

// ── 4. ensure_egress reuses sandbox-egress.sh rather than reimplementing iptables/network logic
const ensure = fnBody(dep, 'ensure_egress');
if (!ensure) findings.EGRESS_MECHANISM_REUSE.push(`${DEPLOY}: ensure_egress not found`);
else {
  if (!/sandbox-egress\.sh/.test(ensure)) findings.EGRESS_MECHANISM_REUSE.push(`${DEPLOY} ensure_egress: does not delegate to sandbox-egress.sh`);
  if (/iptables|DOCKER-USER/.test(ensure)) findings.EGRESS_MECHANISM_REUSE.push(`${DEPLOY} ensure_egress: reimplements host firewall logic (should live only in sandbox-egress.sh)`);
}
try { read(EGRESS); } catch { findings.EGRESS_MECHANISM_REUSE.push(`${EGRESS}: the single idempotent egress owner is missing`); }

let failed = 0;
for (const [k, list] of Object.entries(findings)) {
  console.log(`${k}=${list.length}`);
  for (const l of list) console.log(`  ✗ ${l}`);
  failed += list.length;
}
console.log(`SANDBOX_EGRESS_CONTRACT=${failed ? 'FAIL' : 'PASS'}`);
if (!failed) console.log('\n✓ one canonical egress set; every create/recreate path restores it via sandbox-egress.sh; no second list');
process.exit(failed ? 1 : 0);
