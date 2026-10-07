#!/usr/bin/env node
/**
 * Mutation proof for tools/check-sandbox-service-sets.mjs. Each case copies the four
 * sources into a scratch tree, reintroduces one real drift, and requires the gate to
 * fail on the counter that names it. The unmodified copy must pass.
 *
 *   node tools/check-sandbox-service-sets.selftest.mjs
 */
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const GATE = join(ROOT, 'tools/check-sandbox-service-sets.mjs');
const FILES = [
  'infra/blueprint/sandbox-ops/scripts/sandbox-release-package.sh',
  'infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh',
  'infra/blueprint/vm-execution/vm-execute.sh',
  'infra/blueprint/docs/VM_EXECUTION.md',
  'deploy.sh',
  'infra/blueprint/sandbox-ops/scripts/sandbox-source-deploy.sh',
  'infra/blueprint/sandbox-ops/scripts/remote-native-build.sh',
];
const [RELEASE, DEPLOY, VMEXEC, DOC, DEPLOYSH, SRCDEP, RNB] = FILES;

const tree = () => {
  const dir = mkdtempSync(join(tmpdir(), 'bz-svcsets-'));
  for (const f of FILES) { mkdirSync(join(dir, dirname(f)), { recursive: true }); cpSync(join(ROOT, f), join(dir, f)); }
  return dir;
};
const edit = (dir, file, fn) => {
  const p = join(dir, file); const before = readFileSync(p, 'utf8'); const after = fn(before);
  if (after === before) throw new Error(`mutation did not change ${file}`);
  writeFileSync(p, after);
};
const run = (dir) => {
  const r = spawnSync(process.execPath, [GATE], { env: { ...process.env, BZ_SERVICE_SETS_ROOT: dir }, encoding: 'utf8' });
  const counters = Object.fromEntries([...(r.stdout ?? '').matchAll(/^([A-Z_]+)=(\S+)$/gm)].map((m) => [m[1], m[2]]));
  return { code: r.status, counters };
};
const fails = (key) => (c) => c.code !== 0 && Number(c.counters[key]) >= 1;

const CASES = [
  { name: 'baseline passes', mutate: () => {}, expect: (c) => c.code === 0 && c.counters.SANDBOX_SERVICE_SETS === 'PASS' },
  {
    name: 'release package gains a 5th service',
    mutate: (d) => edit(d, RELEASE, (s) => s.replace('"public-api-staging|services|services/public-api/Dockerfile"', '"public-api-staging|services|services/public-api/Dockerfile"\n  "pay-frontend|apps/pay|apps/pay/Dockerfile"')),
    expect: fails('SANDBOX_CEREMONY_SET_DRIFT'),
  },
  {
    name: 'sandbox-deploy ceremony set gains a 5th service',
    mutate: (d) => edit(d, DEPLOY, (s) => s.replace('CEREMONY_APPLY_SERVICES=(core-api-staging api-gateway-staging developer-api public-api-staging)', 'CEREMONY_APPLY_SERVICES=(core-api-staging api-gateway-staging developer-api public-api-staging pay-frontend)')),
    expect: fails('SANDBOX_CEREMONY_SET_DRIFT'),
  },
  {
    name: 'vm-execute APPROVED omits one of the four',
    mutate: (d) => edit(d, VMEXEC, (s) => s.replace('APPROVED="core-api-staging api-gateway-staging developer-api public-api-staging"', 'APPROVED="core-api-staging api-gateway-staging developer-api"')),
    expect: fails('SANDBOX_CEREMONY_SET_DRIFT'),
  },
  {
    name: 'doc scope drifts from the code',
    mutate: (d) => edit(d, DOC, (s) => s.replace('`public-api-staging`.', '`public-api-staging`, `pay-frontend`.')),
    expect: fails('SANDBOX_CEREMONY_SET_DRIFT'),
  },
  {
    name: 'deploy-one reintroduces a cross-stack head -1 glob',
    mutate: (d) => edit(d, DEPLOY, (s) => s.replace('  local cname=""', "  local cname=\"\"\n  appnet=\"$(docker network ls --format '{{.Name}}' | grep -E '^bzsb-app-' | head -1)\"")),
    expect: fails('SANDBOX_APP_PLANE_TARGETING'),
  },
  {
    name: 'deploy-one stops resolving the stack',
    mutate: (d) => edit(d, DEPLOY, (s) => s.replace('  _resolve_stack\n', '  :\n')),
    expect: fails('SANDBOX_APP_PLANE_TARGETING'),
  },
  {
    name: 'deploy.sh drops the explicit target env',
    mutate: (d) => edit(d, DEPLOYSH, (s) => s.replace(/BANZAMI_SANDBOX_TMPDIR/g, 'BANZAMI_SANDBOX_UNUSED')),
    expect: fails('SANDBOX_TARGET_PROPAGATION'),
  },
  {
    name: 'sandbox-source-deploy stops forwarding --sandbox-tmpdir',
    mutate: (d) => edit(d, SRCDEP, (s) => s.replace(/--sandbox-tmpdir/g, '--sandbox-ignored')),
    expect: fails('SANDBOX_TARGET_PROPAGATION'),
  },
  {
    name: 'remote-native-build stops running deploy-one under the target TMPDIR',
    mutate: (d) => edit(d, RNB, (s) => s.replace('TMPDIR=$SANDBOX_TMPDIR', 'TMPDIR_IGNORED=$SANDBOX_TMPDIR')),
    expect: fails('SANDBOX_TARGET_PROPAGATION'),
  },
  {
    name: 'remote-native-build stops failing closed on a stateless target',
    mutate: (d) => edit(d, RNB, (s) => s.replace(/banzami-blueprint-sandbox\/current\.run/g, 'banzami-blueprint-sandbox/ignored.run')),
    expect: fails('SANDBOX_TARGET_PROPAGATION'),
  },
];

let failed = 0;
for (const k of CASES) {
  const dir = tree();
  try {
    k.mutate(dir);
    const r = run(dir);
    const ok = k.expect(r);
    console.log(`  ${ok ? '✓' : '✗'} ${k.name}${ok ? '' : ` — exit ${r.code} ${JSON.stringify(r.counters)}`}`);
    if (!ok) failed += 1;
  } catch (e) { console.log(`  ✗ ${k.name}: ${e.message}`); failed += 1; }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(`\nSANDBOX_SERVICE_SETS_MUTATIONS=${CASES.length - 1}`);
console.log(`SANDBOX_SERVICE_SETS_SELFTEST=${failed === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failed ? 1 : 0);
