#!/usr/bin/env node
/**
 * check-validation-ownership-transport — ownership must reach the runner, and
 * only this journey's ownership may.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase B2).
 *
 * Thirteen shell journeys declared ownership correctly — S10-SET-002 called
 * e2e_own twice — and the runner recorded zero resources for every one of
 * them. Not one bug but three, any of which was sufficient on its own: a
 * different FORMAT (tab-separated versus records), a different NAME (a
 * self-generated run id versus run + journey), and a different MACHINE (these
 * harnesses run on the Sandbox VM; the runner read its own /tmp).
 *
 * B2 answers one question only: did ownership reach the runner? Whether the
 * runner can then map it to authoritative financial state is B3, and the two
 * are deliberately not collapsed.
 *
 * The validator is pure, so every rejection branch is provable here without a
 * VM, a run, or a single Sandbox resource.
 *
 *   node tools/check-validation-ownership-transport.selftest.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const { parseOwnershipManifest, ownershipContext, ownedClassFor } =
  await import(join(repo, 'tools/validation-runner.mjs'));

let failures = 0;
const check = (t, ok, d = '') => {
  if (ok) return console.log(`  ✓ ${t}${d ? `  ${d}` : ''}`);
  console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`);
  failures++;
};

console.log('\nownership transport — shell → runner, and nothing else\n');

const ctx = ownershipContext('BZV-20260921-0001', 'S10-SET-002');
const rec = (over = {}) => JSON.stringify({
  schema_version: 1, run_ref: ctx.runRef, journey_id: ctx.journeyID, nonce: ctx.nonce,
  resource_type: 'consumer', resource_id: 'c-1', created_at: '2026-09-21T00:00:00Z',
  cleanup_required: true, creation_source: 'e2e_own', financial_owner_id: '', ...over,
});

/* ── the context the runner mints ────────────────────────────────────────── */

check('the remote path is unique to run + journey + nonce',
  ctx.remoteDir.includes('BZV-20260921-0001') && ctx.remoteDir.includes('S10-SET-002')
  && ctx.remoteDir.includes(ctx.nonce) && ctx.nonce.length >= 16,
  ctx.remoteDir);
const other = ownershipContext('BZV-20260921-0001', 'S10-SET-002');
check('…and two contexts for the SAME run and journey do not collide',
  other.remoteDir !== ctx.remoteDir,
  'the directory was keyed by run alone, so the second journey wiped the first one\'s manifest');

/* ── A/B/C · a valid manifest is accepted however the harness ended ──────── */

const valid = [rec(), rec({ resource_type: 'merchant', resource_id: 'm-1' })].join('\n');
{
  const r = parseOwnershipManifest(valid, ctx);
  check('A/B/C. a valid manifest yields its resources', r.owned.length === 2 && !r.rejected.length,
    JSON.stringify(r.owned.map((o) => `${o.kind}:${o.id}`)));
  check('…and parsing does not depend on how the harness exited', true,
    'retrieval happens before any branch can return; proven structurally below');
}

/* ── D/E/F/G · someone else's manifest is refused ─────────────────────────── */

for (const [name, over, reason] of [
  ['D. a stale manifest from a previous run', { nonce: 'deadbeefdeadbeefdeadbeef' }, 'NONCE'],
  ['E. a record naming another run', { run_ref: 'BZV-20260919-0003' }, 'RUN_REF'],
  ['F. a record naming another journey', { journey_id: 'S07-REF-001' }, 'JOURNEY_ID'],
  ['G. a record with the wrong nonce', { nonce: 'f'.repeat(24) }, 'NONCE'],
]) {
  const r = parseOwnershipManifest(rec(over), ctx);
  check(`${name} is refused`, r.owned.length === 0 && r.rejected[0]?.reason === reason,
    `owned=${r.owned.length} rejected=${JSON.stringify(r.rejected.map((x) => x.reason))}`);
}

check('an unknown schema version is refused',
  parseOwnershipManifest(rec({ schema_version: 99 }), ctx).rejected[0]?.reason === 'SCHEMA');

/* ── H · malformed records fail closed ───────────────────────────────────── */

{
  const r = parseOwnershipManifest('{not json\n' + rec(), ctx);
  check('H. a malformed line is refused and the valid one still lands',
    r.owned.length === 1 && r.rejected[0]?.reason === 'MALFORMED',
    'append-only NDJSON: a harness killed mid-write loses at most its last line');
  const only = parseOwnershipManifest('{not json', ctx);
  check('…a manifest of nothing BUT malformed lines yields no ownership',
    only.owned.length === 0 && only.rejected.length === 1);
}

/* ── an unmappable resource type is refused, not defaulted ───────────────── */

{
  const r = parseOwnershipManifest(rec({ resource_type: 'nonsense' }), ctx);
  check('an unmapped resource type is refused', r.rejected[0]?.reason === 'RESOURCE_TYPE');
  check('…and a record with no id is refused',
    parseOwnershipManifest(rec({ resource_id: '' }), ctx).rejected[0]?.reason === 'NO_ID');
}

/* ── J · the same resource twice is one resource ─────────────────────────── */

{
  const r = parseOwnershipManifest([rec(), rec(), rec()].join('\n'), ctx);
  check('J. duplicate registration is not double-counted', r.owned.length === 1,
    'a resource counted twice would inflate the concurrent exposure sum by its whole balance');
}

/* ── the kind vocabulary is the harnesses\' own ───────────────────────────── */

for (const kind of ['consumer', 'merchant', 'merchant_application', 'fixture_project',
                    'fixture_key', 'payment_link', 'payment_session', 'webhook_endpoint',
                    'test_payer', 'wallet_account', 'business']) {
  check(`kind "${kind}" maps to a stored class`, ownedClassFor(kind) !== null, String(ownedClassFor(kind)));
}
check('an unmapped kind has no class, so it cannot be persisted as one',
  ownedClassFor('something-else') === null,
  'it used to fall through to BUSINESS, which would have recorded a test payer and an API key as Businesses');

/* ── structural · the transport exists on both sides ─────────────────────── */

const runner = readFileSync(join(repo, 'tools/validation-runner.mjs'), 'utf8');
const shell = readFileSync(join(repo, 'tests/phase0/lib/e2e-run.sh'), 'utf8');

check('the runner passes the context as explicit environment',
  /BZ_VALIDATION_RUN_REF=\$\{shq/.test(runner) && /BZ_OWNERSHIP_NONCE=\$\{shq/.test(runner)
  && /BZ_OWNERSHIP_MANIFEST=\$\{shq/.test(runner));
check('the shell writer emits the canonical record',
  /e2e_own_canonical/.test(shell) && /"schema_version":1/.test(shell));
check('…and e2e_own calls it, so no harness author has to know it exists',
  /e2e_own\(\)\s*\{[\s\S]{0,300}?e2e_own_canonical/.test(shell));
check('e2e_begin creates the manifest empty',
  /: > "\$BZ_OWNERSHIP_MANIFEST"/.test(shell),
  '"ran and owned nothing" and "never reached e2e_begin" are different facts');
check('outside a validation context the shell writer is inert',
  /\[ -n "\$\{BZ_OWNERSHIP_MANIFEST:-\}" \] \|\| return 0/.test(shell));

// THE property that made this worth doing: retrieval must not be conditional
// on success, because the runs that hold resources are the runs that failed.
check('ownership is retrieved BEFORE any result branch can return',
  /const ownership = collectOwnership\(ctx\);[\s\S]{0,400}?const durationMs/.test(runner),
  'a timeout, a failed assertion and a failed cleanup are exactly when resources are still held');
for (const path of ['timed out after', 'parsed.mismatch', 'ok, reason, gates']) {
  check(`…and the "${path}" return carries it`,
    new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^;]*ownership`).test(runner));
}

/* ── the class, not the instance ─────────────────────────────────────────── */

// Six shell harnesses create a consumer through /v1/consumer/onboarding/complete.
// Five declared it and one did not, and that one leaked 296 000 minor while
// reporting FUNCTIONAL PASS. There is no shared creation client in shell —
// e2e_http discards the response body, so it cannot learn an id — which is
// why the node side could be fixed centrally and this side cannot. The class
// is closed with a gate instead: a harness that onboards a consumer must hand
// it over.
import { readdirSync, existsSync as _ex } from 'node:fs';
import { execFileSync } from 'node:child_process';
const PHASE0 = join(repo, 'tests/phase0');

// Scoped to the FULL universe. These gates protect the journeys a validation
// run measures, not every script under tests/phase0 — thirteen files create a
// wallet-account and only four of them are journeys. Policing the rest would
// be this guard over-reporting, which is a habit worth not acquiring.
const REGISTRY = new Set(JSON.parse(execFileSync('python3', ['-c',
  'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(repo, 'quality/validation/journeys.yaml')], { encoding: 'utf8', maxBuffer: 1 << 24 }))
  .journeys?.map((j) => j.existing_harness).filter((h) => h?.endsWith('.sh'))
  .map((h) => h.split('/').pop()) ?? []);
const registryShell = (f) => REGISTRY.has(f);

const onboarders = readdirSync(PHASE0).filter((f) => f.endsWith('.sh')).filter(registryShell)
  .filter((f) => /onboarding\/complete/.test(readFileSync(join(PHASE0, f), 'utf8')));
check('every shell harness that onboards a consumer declares it',
  onboarders.length > 0 && onboarders.every((f) =>
    /e2e_own\s+consumer/.test(readFileSync(join(PHASE0, f), 'utf8'))),
  onboarders.filter((f) => !/e2e_own\s+consumer/.test(readFileSync(join(PHASE0, f), 'utf8')))
    .join(', ') || `${onboarders.length} harness(es) checked`);

// Likewise for segregated accounts: a CAMPAIGN account's account_id differs
// from its wallet's, so owning the merchant does not attribute it.
const segregated = readdirSync(PHASE0).filter((f) => f.endsWith('.sh')).filter(registryShell)
  .filter((f) => /POST[^\n]*\/v1\/wallet-accounts/.test(readFileSync(join(PHASE0, f), 'utf8')));
check('every shell harness that creates a wallet-account declares it',
  segregated.every((f) => /e2e_own\s+wallet_account/.test(readFileSync(join(PHASE0, f), 'utf8'))),
  segregated.filter((f) => !/e2e_own\s+wallet_account/.test(readFileSync(join(PHASE0, f), 'utf8')))
    .join(', ') || `${segregated.length} harness(es) checked`);

console.log(failures === 0
  ? '\n✓ VALIDATION_OWNERSHIP_TRANSPORT=PASS\n'
  : `\n✗ VALIDATION_OWNERSHIP_TRANSPORT=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
