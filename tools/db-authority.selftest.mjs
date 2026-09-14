#!/usr/bin/env node
/**
 * Mutation proof for tools/db-authority.mjs. Each case copies the manifest, the
 * migrations and the Go services into a scratch tree, breaks the authority model
 * in one way, and requires the check to fail naming it. The database behaviour
 * itself is proven in core/api/src/routes/database_authority_tests.rs.
 *
 *   node tools/db-authority.selftest.mjs
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const TOOL = join(ROOT, 'tools/db-authority.mjs');
const COPY = ['db/authority', 'db/migrations', 'services/api-gateway', 'services/public-api', 'services/developer-api', 'services/admin-api'];

function tree() {
  const dir = mkdtempSync(join(tmpdir(), 'bz-dbauth-'));
  for (const p of COPY) cpSync(join(ROOT, p), join(dir, p), { recursive: true, filter: (s) => !/node_modules|\/bin\//.test(s) });
  return dir;
}
const edit = (dir, file, fn) => {
  const p = join(dir, file);
  const before = readFileSync(p, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`mutation did not change ${file}`);
  writeFileSync(p, after);
};
const run = (dir) => {
  const r = spawnSync(process.execPath, [TOOL], { env: { ...process.env, BZ_DB_AUTHORITY_ROOT: dir }, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const json = (fn) => (d) => edit(d, 'db/authority/runtime-authority.json', (s) => JSON.stringify(fn(JSON.parse(s)), null, 2));

const CASES = [
  { name: 'baseline passes', mutate: () => {}, expect: (r) => r.code === 0 && /DB_AUTHORITY_MANIFEST=PASS/.test(r.out) },
  { name: 'the gateway role is granted a financial table',
    mutate: json((m) => { m.roles.bl_gateway_runtime.write.tables.push('public.wallets'); return m; }),
    expect: (r) => r.code !== 0 && /may not write financial table public\.wallets/.test(r.out) },
  { name: 'a second role gets write authority over every table',
    mutate: json((m) => { m.roles.bl_admin_api_runtime.write = { all_tables_in: ['public'] }; return m; }),
    expect: (r) => r.code !== 0 && /exactly one role, bl_core_runtime/.test(r.out) },
  { name: 'a financial table is dropped from the manifest but 0144 still guards it',
    mutate: json((m) => { m.financial_tables = m.financial_tables.filter((t) => t !== 'payouts'); return m; }),
    expect: (r) => r.code !== 0 && /0144 guards payouts/.test(r.out) },
  { name: 'public-api code starts writing operator accounts it is not granted',
    mutate: (d) => writeFileSync(join(d, 'services/public-api/internal/service/zz_mut.go'), 'package service\nconst q = `UPDATE admin_users SET status = $1 WHERE id = $2`\n'),
    expect: (r) => r.code !== 0 && /public-api-staging code writes public\.admin_users/.test(r.out) },
  { name: 'developer-api code starts writing a ledger entry',
    mutate: (d) => writeFileSync(join(d, 'services/developer-api/internal/developer/zz_mut.go'), 'package developer\nconst q = `INSERT INTO ledger_entries (id) VALUES ($1)`\n'),
    expect: (r) => r.code !== 0 && /developer-api code writes financial table public\.ledger_entries/.test(r.out) },
  { name: 'the committed SQL is edited by hand',
    mutate: (d) => edit(d, 'db/authority/runtime-authority.sql', (s) => `${s}GRANT UPDATE ON public.wallets TO bl_gateway_runtime;\n`),
    expect: (r) => r.code !== 0 && /is not what the manifest generates/.test(r.out) },
  { name: 'a test fixture that writes a wallet does not count',
    mutate: (d) => writeFileSync(join(d, 'services/api-gateway/internal/service/zz_fixture_test.go'), 'package service\nconst q = `INSERT INTO wallets (id) VALUES ($1)`\n'),
    expect: (r) => r.code === 0 },
];

let failed = 0;
for (const k of CASES) {
  const dir = tree();
  try {
    k.mutate(dir);
    const r = run(dir);
    const ok = k.expect(r);
    console.log(`  ${ok ? '✓' : '✗'} ${k.name}${ok ? '' : `\n${r.out.split('\n').slice(-6).join('\n')}`}`);
    if (!ok) failed += 1;
  } catch (e) {
    console.log(`  ✗ ${k.name}: ${e.message}`);
    failed += 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`\nDB_AUTHORITY_MUTATIONS=${CASES.length - 2}`);
console.log(`DB_AUTHORITY_SELFTEST=${failed === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failed ? 1 : 0);
