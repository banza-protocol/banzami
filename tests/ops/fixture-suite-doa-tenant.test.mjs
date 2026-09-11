// DOA is a tenant, not a test fixture. The fixture-hygiene suite runs every
// stateful harness; by default it must not run one that acts inside DOA's
// Project or Business (its Project id, its @handle, deliveries to doadoa.app).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
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
  assert.ok(rows.some(([k]) => k === 'skip-reference-application-doa'), 'nothing was held back — the DOA harnesses went somewhere');
});

test('the explicit opt-in includes them', () => {
  const rows = list({ BANZAMI_ALLOW_DOA_TENANT_WRITES: '1' });
  assert.ok(rows.every(([k]) => k === 'run'));
  assert.ok(rows.some(([, h]) => h === 'webhook-delivery-to-doa.sh'));
});

// GENERIC_HARNESSES_DEPENDING_ON_DOA = 0. A harness that is not a test of DOA
// builds a tenant of its own (tests/phase0/lib/synthetic-tenant.sh); only the
// integration tests of DOA itself may name it, and they say so.
test('only the labelled integration tests of DOA name DOA', () => {
  const dir = join(import.meta.dirname, '../phase0');
  const names = /DOA_PROJECT|doadoa\.app|@doa|WHERE w\.name = 'DOA'/;
  const offenders = []; const labelled = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sh') && n !== 'fixture-hygiene-suite.sh')) {
    const src = readFileSync(join(dir, f), 'utf8');
    const isRef = /^# REFERENCE_APPLICATION_DOA/m.test(src);
    if (isRef) labelled.push(f);
    if (names.test(src) && !isRef) offenders.push(f);
  }
  assert.deepEqual(offenders, [], `generic harnesses that name DOA's tenant: ${offenders.join(', ')}`);
  assert.deepEqual(labelled.sort(), ['doa-canonical-binding.sh', 'doa-public-donation-e2e.sh', 'webhook-delivery-to-doa.sh']);
});
