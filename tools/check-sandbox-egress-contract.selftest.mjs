#!/usr/bin/env node
/**
 * Mutation proof for tools/check-sandbox-egress-contract.mjs. Each case copies the
 * two sources into a scratch tree, reintroduces one real way the egress contract can
 * regress, and requires the gate to fail on the counter that names it. The unmodified
 * copy must pass.
 *
 *   node tools/check-sandbox-egress-contract.selftest.mjs
 */
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const GATE = join(ROOT, 'tools/check-sandbox-egress-contract.mjs');
const DEPLOY = 'infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh';
const EGRESS = 'infra/blueprint/sandbox-ops/scripts/sandbox-egress.sh';
const FILES = [DEPLOY, EGRESS];

const tree = () => {
  const dir = mkdtempSync(join(tmpdir(), 'bz-egress-'));
  for (const f of FILES) { mkdirSync(join(dir, dirname(f)), { recursive: true }); cpSync(join(ROOT, f), join(dir, f)); }
  return dir;
};
const edit = (dir, file, fn) => {
  const p = join(dir, file); const before = readFileSync(p, 'utf8'); const after = fn(before);
  if (after === before) throw new Error(`mutation did not change ${file}`);
  writeFileSync(p, after);
};
const run = (dir) => {
  const r = spawnSync(process.execPath, [GATE], { env: { ...process.env, BZ_EGRESS_ROOT: dir }, encoding: 'utf8' });
  const counters = Object.fromEntries([...(r.stdout ?? '').matchAll(/^([A-Z_]+)=(\S+)$/gm)].map((m) => [m[1], m[2]]));
  return { code: r.status, counters, stdout: r.stdout };
};
const fails = (key) => (c) => c.code !== 0 && Number(c.counters[key]) >= 1;

const CASES = [
  { name: 'baseline passes', mutate: () => {}, expect: (c) => c.code === 0 && c.counters.SANDBOX_EGRESS_CONTRACT === 'PASS' },
  {
    name: 'canonical set drops a required service (public-api)',
    mutate: (d) => edit(d, DEPLOY, (s) => s.replace('SANDBOX_EGRESS_SERVICES=(api-gateway-staging developer-api public-api-staging admin-api)', 'SANDBOX_EGRESS_SERVICES=(api-gateway-staging developer-api admin-api)')),
    expect: fails('EGRESS_SET_DRIFT'),
  },
  {
    name: 'canonical set grants egress to an internal/non-egress service (core-api)',
    mutate: (d) => edit(d, DEPLOY, (s) => s.replace('SANDBOX_EGRESS_SERVICES=(api-gateway-staging developer-api public-api-staging admin-api)', 'SANDBOX_EGRESS_SERVICES=(api-gateway-staging developer-api public-api-staging admin-api core-api-staging)')),
    expect: fails('EGRESS_SET_DRIFT'),
  },
  {
    name: 'ceremony create path stops restoring egress',
    mutate: (d) => edit(d, DEPLOY, (s) => s.replace('  ensure_egress "$cname" "$name" || return 1\n  docker start "$cname" >/dev/null 2>&1 || return 1', '  docker start "$cname" >/dev/null 2>&1 || return 1')),
    expect: fails('EGRESS_NOT_RESTORED'),
  },
  {
    name: 'app-plane swap path stops restoring egress (only first-create left)',
    mutate: (d) => edit(d, DEPLOY, (s) => s.replace('  ensure_egress "$cname" "$name" || { echo "  $name egress attach FAIL"; return 1; }', '  : # swap egress removed')),
    expect: fails('EGRESS_NOT_RESTORED'),
  },
  {
    name: 'a raw egress network connect bypasses the canonical mechanism',
    mutate: (d) => edit(d, DEPLOY, (s) => s.replace('  docker network connect "$BZSB_APP_NET" "$cname" >/dev/null 2>&1 || true', '  docker network connect "$BZSB_APP_NET" "$cname" >/dev/null 2>&1 || true\n  docker network connect bzsb-egress "$cname" >/dev/null 2>&1 || true')),
    expect: fails('EGRESS_SECOND_LIST'),
  },
  {
    name: 'ensure_egress reimplements the firewall instead of reusing sandbox-egress.sh',
    mutate: (d) => edit(d, DEPLOY, (s) => s.replace('  if bash "$SCRIPT_DIR/sandbox-egress.sh" apply "$cname" >/dev/null 2>&1; then', '  if iptables -I DOCKER-USER 1 -j ACCEPT && docker network connect bzsb-egress "$cname" >/dev/null 2>&1; then')),
    expect: fails('EGRESS_MECHANISM_REUSE'),
  },
];

let pass = 0, fail = 0;
for (const c of CASES) {
  const dir = tree();
  try { c.mutate(dir); } catch (e) { console.log(`✗ ${c.name}: ${e.message}`); fail++; continue; }
  const r = run(dir);
  if (c.expect(r)) { console.log(`✓ ${c.name}`); pass++; }
  else { console.log(`✗ ${c.name} — code=${r.code} counters=${JSON.stringify(r.counters)}`); fail++; }
}
console.log(`\nEGRESS_CONTRACT_SELFTEST=${fail ? 'FAIL' : 'PASS'} (${pass}/${CASES.length})`);
process.exit(fail ? 1 : 0);
