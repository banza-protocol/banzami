#!/usr/bin/env node
/**
 * Mutation proof for tools/lib/sdk-readme-claims.mjs, on real packages.
 *
 * The README inside @banzami/sdk 0.14.0 — as the registry serves it — is the
 * known-stale specimen and must fail; the current source README must pass; and
 * each required statement, removed, must be reported missing.
 *
 *   node tools/lib/sdk-readme-claims.selftest.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readmeFindings } from './sdk-readme-claims.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
let failed = 0;
const expect = (name, ok, detail) => { console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failed += 1; };

const dir = mkdtempSync(join(tmpdir(), 'bz-readme-selftest-'));
execFileSync('npm', ['pack', '@banzami/sdk@0.14.0', '--silent'], { cwd: dir, stdio: 'pipe' });
execFileSync('tar', ['xzf', 'banzami-sdk-0.14.0.tgz'], { cwd: dir });
const old = readmeFindings(readFileSync(join(dir, 'package/README.md'), 'utf8'));
expect('the published 0.14.0 README is caught as stale', old.stale.length >= 4, old.stale.join('; '));
expect('the published 0.14.0 README lacks the status and docs link', old.missing.length >= 2, old.missing.join('; '));

const current = readFileSync(join(ROOT, 'sdk/typescript/README.md'), 'utf8');
const now = readmeFindings(current);
expect('the source README passes', now.stale.length === 0 && now.missing.length === 0, [...now.stale, ...now.missing].join('; ') || 'clean');

for (const [needle, label] of [['Financial Live remains unavailable', 'Live status'], ['https://developers.banzami.com/docs', 'docs link']]) {
  const r = readmeFindings(current.replaceAll(needle, 'x'));
  expect(`removing the ${label} is reported`, r.missing.length >= 1, r.missing.join('; '));
}
for (const inject of ["merchantId:  'mch_...',", 'Sandbox is for development. Live is for production.', 'Use HTTP for links until the next SDK release.']) {
  const r = readmeFindings(`${current}\n${inject}\n`);
  expect(`reintroducing "${inject.slice(0, 40)}" is reported`, r.stale.length >= 1, r.stale.join('; '));
}
console.log(`\nSDK_README_CLAIMS_SELFTEST=${failed ? 'FAIL' : 'PASS'}`);
process.exit(failed ? 1 : 0);
