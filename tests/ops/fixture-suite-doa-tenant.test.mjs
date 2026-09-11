// DOA is a tenant, not a test fixture. The fixture-hygiene suite runs every
// stateful harness; by default it must not run one that acts inside DOA's
// Project or Business (its Project id, its @handle, deliveries to doadoa.app).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUITE = join(import.meta.dirname, '../phase0/fixture-hygiene-suite.sh');
const list = (env = {}) => execFileSync('bash', [SUITE, '--list'], { encoding: 'utf8', env: { ...process.env, ...env } })
  .trim().split('\n').map((l) => l.split(' '));

test('by default no harness that names DOA runs', () => {
  const rows = list({ BANZAMI_ALLOW_DOA_TENANT_WRITES: '' });
  const run = rows.filter(([k]) => k === 'run').map(([, h]) => h);
  assert.ok(run.length > 0, 'the suite selected nothing — the check would be vacuous');
  for (const h of run) {
    const src = readFileSync(join(import.meta.dirname, '../phase0', h), 'utf8');
    assert.ok(!/DOA_PROJECT|doadoa\.app|@doa/.test(src), `${h} names DOA's tenant and still runs by default`);
  }
  assert.ok(rows.some(([k]) => k === 'skip-doa-tenant'), 'nothing was held back — the DOA harnesses went somewhere');
});

test('the explicit opt-in includes them', () => {
  const rows = list({ BANZAMI_ALLOW_DOA_TENANT_WRITES: '1' });
  assert.ok(rows.every(([k]) => k === 'run'));
  assert.ok(rows.some(([, h]) => h === 'webhook-delivery-to-doa.sh'));
});
