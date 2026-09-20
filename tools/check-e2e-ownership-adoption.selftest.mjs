#!/usr/bin/env node
/**
 * check-e2e-ownership-adoption — ownership belongs to the code that creates
 * the resource.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase B1).
 *
 * BZV-20260920-0001 measured adoption for the first time: 33 funding-capable
 * journeys, 3 with a working manifest. The shape of the misses is the whole
 * argument. Six shell harnesses create a consumer through the same onboarding
 * primitive; five declare it, one does not — and that one leaked 296 000 minor
 * while reporting FUNCTIONAL PASS. It was never a shared-primitive defect. It
 * was five authors remembering and one forgetting.
 *
 * So the property under test is not "harnesses declare their fixtures". It is:
 * a resource created inside a validation journey is owned by that journey
 * WITHOUT the harness doing anything, and a resource created outside one is
 * not owned at all.
 *
 *   node tools/check-e2e-ownership-adoption.selftest.mjs
 */
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(repo, 'tools/e2e/app-web/lib');

let failures = 0;
const check = (t, ok, d = '') => {
  if (ok) return console.log(`  ✓ ${t}${d ? `  ${d}` : ''}`);
  console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`);
  failures++;
};

console.log('\nownership adoption — the creator registers, not the author\n');

const MOD = join(LIB, 'e2e-own.mjs');
const manifestFor = (name) => join(tmpdir(), 'banzami-e2e-manifests', `${name}.json`);
const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

/* ── 1 · outside a validation run, nothing is owned ───────────────────────── */

delete process.env.BANZAMI_VALIDATION_RUN_REF;
delete process.env.BANZAMI_VALIDATION_JOURNEY;
{
  const { ownCreated, ambientRun, setAmbientRun } = await import(`${MOD}?t=${Date.now()}`);
  setAmbientRun(null);
  check('outside a validation run there is no ambient context', ambientRun() === null);
  const returned = ownCreated('consumer', 'someone-elses-handle');
  check('…and a creation primitive still returns its id unchanged',
    returned === 'someone-elses-handle',
    'a scratch script must behave exactly as it did before');
}

/* ── 2 · inside one, the primitive owns it with no harness involvement ────── */

const REF = 'BZV-SELFTEST-0001';
const JOURNEY = 'S00-SELFTEST';
const mf = manifestFor(`run-${REF}-${JOURNEY}`);
rmSync(mf, { force: true });
process.env.BANZAMI_VALIDATION_RUN_REF = REF;
process.env.BANZAMI_VALIDATION_JOURNEY = JOURNEY;
{
  const { ownCreated, setAmbientRun } = await import(`${MOD}?t=${Date.now() + 1}`);
  setAmbientRun(null);              // nothing called e2eBegin: the 17-journey case
  ownCreated('consumer', 'c-alpha', { creation_source: 'registerConsumer' });
  ownCreated('business', 'b-one', { creation_source: 'provisionBusiness' });

  const m = read(mf);
  check('a manifest appears without the harness opening one', m !== null,
    'seventeen journeys had no manifest because nothing asked them for one');
  check('…named for the run and the journey', m?.runRef === REF && m?.journey === JOURNEY);
  check('…holding both resources', m?.owned?.length === 2,
    `owned ${JSON.stringify(m?.owned?.map((o) => `${o.kind}:${o.id}`))}`);

  const rec = m?.owned?.[0];
  for (const field of ['resource_type', 'resource_id_present', 'created_at', 'cleanup_required', 'creation_source']) {
    const present = field === 'resource_id_present' ? Boolean(rec?.id) : rec?.[field] !== undefined;
    check(`record carries ${field.replace('_present', '')}`, present, JSON.stringify(rec));
  }
  check('creation_source names the primitive, not the harness',
    rec?.creation_source === 'registerConsumer', `got ${rec?.creation_source}`);

  /* ── 3 · registering twice must not double-count ────────────────────────── */
  ownCreated('consumer', 'c-alpha', { creation_source: 'registerConsumer' });
  const m2 = read(mf);
  check('duplicate registration is recorded once',
    m2?.owned?.filter((o) => o.id === 'c-alpha').length === 1,
    'a resource counted twice would inflate the concurrent exposure sum by its whole balance');

  /* ── 4 · an unknown kind is refused, not silently accepted ──────────────── */
  const { e2eOwn } = await import(`${MOD}?t=${Date.now() + 2}`);
  let refused = false;
  try { e2eOwn({ owned: [], manifest: mf }, 'nonsense', 'x'); } catch { refused = true; }
  check('an unrecognised resource kind is refused', refused,
    'a kind nothing can retire must not be silently accepted as owned');
}
rmSync(mf, { force: true });

/* ── 5 · the primitives are actually wired ───────────────────────────────── */

const wired = {
  'registerConsumer (consumer.mjs)': ['consumer.mjs', /ownCreated\('consumer'/],
  // A developer PROJECT, not a merchant: a project id matches
  // developer.dev_project_sandbox_binding and matches wallets.merchant_id zero
  // times, so registering it as `merchant` would resolve to no account at all.
  'provisionMerchant (provision.mjs)': ['provision.mjs', /ownCreated\('fixture_project'/],
  'provisionBusiness (business-provision.mjs)': ['business-provision.mjs', /ownCreated\('business'/],
};
for (const [name, [file, re]] of Object.entries(wired)) {
  check(`${name} registers what it creates`, re.test(readFileSync(join(LIB, file), 'utf8')));
}

// The ordering property that made proof 14 leak twice per run: the account
// exists, and is funded, the moment submit() returns.
const consumer = readFileSync(join(LIB, 'consumer.mjs'), 'utf8');
check('the consumer is owned BEFORE the PIN step can fail',
  /create\.submit\(\);[\s\S]{0,600}?ownCreated\('consumer'[\s\S]{0,400}?createDuringOnboarding/.test(consumer),
  'registering on the success path only is worth almost nothing: the runs that leak are the runs that failed');

const own = readFileSync(join(LIB, 'e2e-own.mjs'), 'utf8');
check('the ownable kinds come from the one registry, not a second list',
  /RESOURCE_SCOPE/.test(own) && /new Set\(RESOURCE_SCOPE\.keys\(\)\)/.test(own),
  'a hand-written list silently swallowed fixture_project: ownCreated catches the throw, so the registration simply never happened');

console.log(failures === 0
  ? '\n✓ E2E_OWNERSHIP_ADOPTION=PASS\n'
  : `\n✗ E2E_OWNERSHIP_ADOPTION=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
