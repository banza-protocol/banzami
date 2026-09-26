#!/usr/bin/env node
/**
 * Mutation proof for tools/check-public-terminology.mjs.
 *
 * Copies the public surface into a scratch tree and proves the guard: fails when
 * the human phrase "Financial Live" reaches rendered copy, ignores it inside a
 * comment, and never fires on an internal identifier (FINANCIAL_LIVE, …).
 *
 *   node tools/check-public-terminology.selftest.mjs
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const GATE = join(ROOT, 'tools/check-public-terminology.mjs');
const COPY = [
  'apps/website/app', 'apps/website/components', 'apps/website/lib', 'apps/website/public',
  'apps/pay/components', 'apps/admin/app', 'apps/mobile/web/index.html', 'sdk/typescript/README.md',
];

function tree() {
  const dir = mkdtempSync(join(tmpdir(), 'bz-pubterm-'));
  for (const p of COPY) {
    cpSync(join(ROOT, p), join(dir, p), {
      recursive: true,
      filter: (src) => !/node_modules|\.next|\.git\b/.test(src),
    });
  }
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
  const r = spawnSync(process.execPath, [GATE], { env: { ...process.env, BZ_PUBLIC_TERMINOLOGY_ROOT: dir }, encoding: 'utf8' });
  const counters = Object.fromEntries([...(r.stdout ?? '').matchAll(/^([A-Z_]+)=(\S+)$/gm)].map((m) => [m[1], m[2]]));
  return { code: r.status, counters, out: `${r.stdout}${r.stderr}` };
};
const W = 'apps/website';
const fails = (c) => c.code !== 0 && Number(c.counters.PUBLIC_FINANCIAL_LIVE_OCCURRENCES) >= 1;
const passes = (c) => c.code === 0 && c.counters.PUBLIC_TERMINOLOGY === 'PASS';

const CASES = [
  { name: 'baseline copy passes', mutate: () => {}, expect: passes },
  {
    name: 'rendered copy — a page string reintroduces the phrase',
    mutate: (d) => edit(d, `${W}/components/marketing/HomeHero.tsx`, (s) => s.replace('As operações com dinheiro real ainda não estão disponíveis', 'Financial Live ainda não está disponível')),
    expect: fails,
  },
  {
    name: 'rendered copy — the phrase in the published SDK README',
    mutate: (d) => edit(d, 'sdk/typescript/README.md', (s) => s.replace('Real-money operations remain unavailable', 'Financial Live remains unavailable')),
    expect: fails,
  },
  {
    name: 'rendered copy — the phrase in a pay/admin/mobile banner',
    mutate: (d) => edit(d, 'apps/pay/components/PlatformBadge.tsx', (s) => s.replace('As operações com dinheiro real estão indisponíveis.', 'O Financial Live está indisponível.')),
    expect: fails,
  },
  {
    name: 'comments do not count — the phrase inside a // comment passes',
    mutate: (d) => edit(d, `${W}/lib/public-truth.ts`, (s) => s.replace('export const PUBLIC_TRUTH', '// legacy: Financial Live wording lived here\nexport const PUBLIC_TRUTH')),
    expect: passes,
  },
  {
    name: 'identifiers do not count — FINANCIAL_LIVE / financial-live are allowed',
    mutate: (d) => edit(d, `${W}/lib/public-truth.ts`, (s) => s.replace("apiVersion: 'v1'", "apiVersion: 'v1', internalFlag: 'FINANCIAL_LIVE', anchor: 'financial-live'")),
    expect: passes,
  },
];

let failed = 0;
for (const k of CASES) {
  const dir = tree();
  try {
    k.mutate(dir);
    const r = run(dir);
    const ok = k.expect(r);
    console.log(`  ${ok ? '✓' : '✗'} ${k.name}${ok ? '' : `\n      exit ${r.code} ${JSON.stringify(r.counters)}`}`);
    if (!ok) failed += 1;
  } catch (e) {
    console.log(`  ✗ ${k.name}: ${e.message}`);
    failed += 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`\nPUBLIC_TERMINOLOGY_MUTATIONS=${CASES.length - 1}`);
console.log(`PUBLIC_TERMINOLOGY_SELFTEST=${failed === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failed ? 1 : 0);
