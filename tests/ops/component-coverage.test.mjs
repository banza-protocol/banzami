// Every deployed component is classified for assurance
// (quality/deployed-component-coverage.json, tools/check-component-coverage.mjs).
// The check must pass on the tree and fail when something runs unclassified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');
const run = (root) => spawnSync('node', [join(ROOT, 'tools/check-component-coverage.mjs'), '--root', root], { encoding: 'utf8' });

function copy() {
  const dir = mkdtempSync(join(tmpdir(), 'bz-cov-'));
  for (const p of ['quality', 'ops', 'apps', 'services', 'sdk', 'tests', 'tools', 'core', 'sdk']) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true, filter: (s) => !/node_modules|\/target\/|\.dart_tool|\/build\//.test(s) });
  }
  return dir;
}

test('the tree is fully classified', () => {
  const r = run(ROOT);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /DEPLOYED_COMPONENTS_WITHOUT_ASSURANCE_CLASSIFICATION = 0/);
});

test('an unclassified container, source tree or capability fails it', () => {
  const dir = copy();
  writeFileSync(join(dir, 'ops/sandbox-host-manifest.tsv'),
    readFileSync(join(dir, 'ops/sandbox-host-manifest.tsv'), 'utf8') + 'rogue-container\timg\tapp\tno\tno\trunning\n');
  let r = run(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /unclassified: container rogue-container/);

  const dir2 = copy();
  mkdirSync(join(dir2, 'services/new-service'));
  r = run(dir2);
  assert.match(r.stdout, /unclassified: services\/new-service/);

  const dir3 = copy();
  const m = JSON.parse(readFileSync(join(dir3, 'quality/deployed-component-coverage.json'), 'utf8'));
  m.components[0].capabilities.push('CAP-NOPE-999');
  writeFileSync(join(dir3, 'quality/deployed-component-coverage.json'), JSON.stringify(m));
  r = run(dir3);
  assert.match(r.stdout, /unknown capability CAP-NOPE-999/);
});
