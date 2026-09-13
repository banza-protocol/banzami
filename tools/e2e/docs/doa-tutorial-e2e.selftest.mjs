#!/usr/bin/env node
/**
 * Mutation proof for the DOA tutorial harness, offline.
 *
 * The page contract is judged against the tutorial as it stands in the source
 * (both languages), then against copies broken the ways the tutorial has
 * actually been wrong: a step left out, a method that does not exist, the wrong
 * payload field, a scope missing, the fee destination omitted. Each break must
 * fail the step it belongs to, and only by the contract — not by accident.
 *
 *   node tools/e2e/docs/doa-tutorial-e2e.selftest.mjs
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUBRIC, checkContract, countSpecialCases } from './doa-tutorial-e2e.mjs';
import { flatten, journey } from './lib/journey.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const section = (file, fn, next) => {
  const src = readFileSync(join(ROOT, 'apps/website/app/developers/docs', file), 'utf8');
  const a = src.indexOf(`export function ${fn}`);
  const b = src.indexOf(`export function ${next}`, a);
  // JSX → the text a reader sees: unwrap {' '} and template raws, drop tags.
  return flatten(src.slice(a, b).replace(/\{' '\}/g, ' ').replace(/raw=\{`([\s\S]*?)`\}/g, '>$1<'));
};
const PT = section('content-pt.tsx', 'PtDoa', 'PtReference');
const EN = section('content-en.tsx', 'EnDoa', 'EnReference');

let failed = 0;
const expect = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
};
const failing = (pages) => RUBRIC.map((_, i) => i + 1).filter((n) => checkContract(n, pages).length > 0);

console.log('DOA tutorial harness — mutation proof\n');

const base = failing({ PT, EN });
expect('the tutorial in the source satisfies all 13 steps', base.length === 0, `failing: ${base.join(', ')} — ${base.map((n) => checkContract(n, { PT, EN }).join('; ')).join(' | ')}`);

const MUTATIONS = [
  { name: 'step 6 omitted: no createWalletAccount', step: 6, f: (t) => t.replace(/createWalletAccount\(/g, 'openAccount(') },
  { name: 'step 6 wrong method: walletAccounts.create', step: 6, f: (t) => t.replace('createWalletAccount(', 'walletAccounts.create(') },
  { name: 'step 10 wrong field: data.reference', step: 10, f: (t) => t.replace(/\.data\.reference_id/g, '.data.reference') },
  { name: 'step 10 wrong method: webhooks.verify', step: 10, f: (t) => t.replace(/webhooks\.constructEvent\(/g, 'webhooks.verify(') },
  { name: 'step 10 raw body omitted', step: 10, f: (t) => t.replace(/req\.text\(\)/g, 'req.json()') },
  { name: 'step 10 wrong event name', step: 10, f: (t) => t.replace(/payment_session\.paid/g, 'payment.completed') },
  { name: 'step 3 a scope missing', step: 3, f: (t) => t.replace(/application_settlements:write/g, '') },
  { name: 'step 5 readiness gate omitted', step: 5, f: (t) => t.replace(/getFinancialSetup\(\)/g, '') },
  { name: 'step 11 receipt verification omitted', step: 11, f: (t) => t.replace(/\/v1\/public\/proofs\//g, '/v1/proofs/') },
  { name: 'step 12 fee destination omitted', step: 12, f: (t) => t.replace(/feeDestinationBanzaName/g, 'feeDestination') },
  { name: 'step 12 wrong method: applicationSettlements.create', step: 12, f: (t) => `${t}\nbanzami.applicationSettlements.create({})` },
  { name: 'step 13 rotation omitted', step: 13, f: (t) => t.replace(/rotateWebhookEndpointSecret/g, 'newSecret') },
];
for (const m of MUTATIONS) {
  for (const lang of ['PT', 'EN']) {
    const pages = { PT, EN, [lang]: m.f(lang === 'PT' ? PT : EN) };
    const f = failing(pages);
    expect(`${lang} · ${m.name} → step ${m.step} FAILS`, f.includes(m.step), `failing steps: ${f.join(', ') || 'none'}`);
  }
}

// The summary cannot be greener than its steps.
{
  const j = journey(RUBRIC, { log: false });
  RUBRIC.forEach((_, i) => j.mark(i + 1, 'PASS'));
  j.mark(11, 'PENDING');
  let threw = false;
  try { j.assertConsistent(j.steps, { passed: 13, total: 13, verdict: 'PASS' }); } catch { threw = true; }
  expect('a PASS summary beside a PENDING step is refused', threw);
  expect('twelve of thirteen is FAIL, not PASS', j.summarise().verdict === 'FAIL');
  let bad = false;
  try { j.mark(14, 'PASS'); } catch { bad = true; }
  expect('a step outside the rubric cannot be marked', bad);
}

// DOA must never be special as a tenant.
expect('the harness names no DOA tenant', countSpecialCases(readFileSync(join(ROOT, 'tools/e2e/docs/doa-tutorial-e2e.mjs'), 'utf8')) === 0);
expect('a DOA handle in code is counted', countSpecialCases("const b = '@doa';\n") === 1);
expect('a DOA name in a comment is not', countSpecialCases("// never use '@doa' here\n") === 0);

console.log(`\nDOA_DOC_TUTORIAL_MUTATIONS=${MUTATIONS.length * 2}`);
console.log(`DOA_DOC_TUTORIAL_SELFTEST=${failed === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failed ? 1 : 0);
