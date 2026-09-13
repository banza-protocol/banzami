#!/usr/bin/env node
/**
 * Mutation proof for check-docs-api-reference.mjs: each mutation introduces one
 * defect a reader would hit, and the gate must fail for that reason.
 *
 *   node tools/check-docs-api-reference.selftest.mjs
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const GATE = join(ROOT, 'tools/check-docs-api-reference.mjs');
const DOCS = 'apps/website/app/developers/docs';

const MUTATIONS = [
  ['wrong scope', 'endpoint-meta.ts', "scope: 'refunds:write',", "scope: 'refunds:read',", 'API_REFERENCE_SCOPE_DRIFT=1'],
  ['invented body field', 'endpoint-meta.ts', "{ in: 'body', name: 'reason', type: 'string', required: false,\n        note: { pt: 'texto livre', en: 'free text' } },\n    ],\n    sdk: 'createRefund',", "{ in: 'body', name: 'reason', type: 'string', required: false,\n        note: { pt: 'texto livre', en: 'free text' } },\n      { in: 'body', name: 'refund_all', type: 'boolean', required: false, note: { pt: 'x', en: 'x' } },\n    ],\n    sdk: 'createRefund',", 'API_REFERENCE_DEAD_FIELDS=1'],
  ['payee field documented', 'endpoint-meta.ts', "note: { pt: 'AOA', en: 'AOA' }, example: 'AOA' },", "note: { pt: 'AOA', en: 'AOA' }, example: 'AOA' },\n      { in: 'body', name: 'wallet_id', type: 'string', required: true, note: { pt: 'x', en: 'x' } },", 'API_REFERENCE_DEAD_FIELDS='],
  ['invented event', 'endpoint-meta.ts', "events: ['refund.completed'],", "events: ['refund.completed', 'refund.failed'],", 'API_REFERENCE_FAKE_EVENTS=1'],
  ['invented SDK method', 'endpoint-meta.ts', "sdk: 'getRefund',", "sdk: 'fetchRefund',", 'API_REFERENCE_SDK_DRIFT=1'],
  ['missing guide', 'endpoint-meta.ts', "guides: ['receipts'],", "guides: [],", 'API_REFERENCE_REQUIRED_FIELDS_MISSING=1'],
  ['unknown guide', 'endpoint-meta.ts', "guides: ['receipts'],", "guides: ['proofs'],", 'API_REFERENCE_BROKEN_GUIDES=1'],
  ['invented error', 'reference.tsx', "{ code: '422 LINK_NOT_ACTIVE',", "{ code: '422 LINK_ALREADY_PAID',", 'API_REFERENCE_FAKE_ERRORS=1'],
  ['query param the handler never reads', 'endpoint-meta.ts', "note: { pt: 'filtra por estado, por exemplo ACTIVE ou PAID', en: 'filters by status, for example ACTIVE or PAID' }, example: 'PAID' },", "note: { pt: 'filtra por estado, por exemplo ACTIVE ou PAID', en: 'filters by status, for example ACTIVE or PAID' }, example: 'PAID' },\n      { in: 'query', name: 'cursor', type: 'string', required: false, note: { pt: 'x', en: 'x' } },", 'API_REFERENCE_DEAD_FIELDS=1'],
];

let failed = 0;
for (const [name, file, from, to, expect] of MUTATIONS) {
  const tmp = mkdtempSync(join(tmpdir(), 'bz-apiref-'));
  try {
    mkdirSync(join(tmp, 'apps/website/app/developers'), { recursive: true });
    cpSync(join(ROOT, DOCS), join(tmp, DOCS), { recursive: true, filter: (s) => !s.includes('node_modules') });
    for (const d of ['services', 'sdk']) symlinkSync(join(ROOT, d), join(tmp, d));
    const target = join(tmp, DOCS, file);
    const src = readFileSync(target, 'utf8');
    if (!src.includes(from)) throw new Error(`mutation "${name}" does not apply`);
    writeFileSync(target, src.replace(from, to));
    let out = '';
    let code = 0;
    try { out = execFileSync('node', [GATE], { env: { ...process.env, BZ_DOCS_ROOT: tmp }, encoding: 'utf8', stdio: 'pipe' }); } catch (e) { out = `${e.stdout}${e.stderr}`; code = e.status; }
    const ok = code !== 0 && out.includes(expect.endsWith('=') ? expect : expect) && !(expect.endsWith('=') && out.includes(`${expect}0`) && !out.includes(`✗ ${expect}`));
    console.log(`  ${ok ? '✓' : '✗'} ${name} → ${ok ? `fails with ${expect}` : `did not fail as expected (exit ${code})`}`);
    if (!ok) failed += 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
console.log(`\nAPI_REFERENCE_GATE_MUTATIONS=${MUTATIONS.length} CAUGHT=${MUTATIONS.length - failed}`);
process.exit(failed ? 1 : 0);
