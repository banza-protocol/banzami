#!/usr/bin/env node
/**
 * check-validation-concurrent-peak — the peak is what was held AT ONCE, by a
 * COMPLETE ownership set, in an order the ledger chose.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase B4).
 *
 * B3 proved every declared resource can be priced. It could not prove that
 * everything worth pricing was declared. S23-RAIL-001 is why the distinction
 * is not academic: its manifest listed a project and a consumer, every entry
 * resolved perfectly, and 1 200 000 minor sat in a test payer nobody had
 * handed over. RESOLVABLE is not COMPLETE.
 *
 *   node tools/check-validation-concurrent-peak.selftest.mjs
 */
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const { attributablePeak, exposureVerdict } = await import(join(repo, 'tools/lib/validation-exposure.mjs'));
const { ownershipCompleteness, resolveFinancialAccounts } =
  await import(join(repo, 'tools/lib/validation-resource-scope.mjs'));

let failures = 0;
const check = (t, ok, d = '') => {
  if (ok) return console.log(`  ✓ ${t}${d ? `  ${d}` : ''}`);
  console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`);
  failures++;
};

console.log('\nconcurrent peak — held at once, from a complete set\n');

const T = (s) => `2026-09-21T00:00:${String(s).padStart(2, '0')}.000Z`;
const ev = (resource, s, delta, posting = null) => ({ resource, at: T(s), delta, posting });

/* ── A/B/C · what "concurrent" means ─────────────────────────────────────── */

check('A. grant 1 000 000 then spend 350 000 peaks at 1 000 000',
  attributablePeak([ev('A', 0, 1_000_000), ev('A', 5, -350_000)]).peak === 1_000_000,
  'spending does not lower a peak that already happened');

check('B. two accounts funded at once sum',
  attributablePeak([ev('A', 0, 600_000), ev('B', 0, 500_000)]).peak === 1_100_000);

check('C. maxima at different instants are not summed',
  attributablePeak([ev('A', 0, 600_000), ev('A', 5, -600_000), ev('B', 9, 500_000)]).peak === 600_000,
  'the journey never held 1 100 000');

/* ── D/I · atomicity: a posting is one event ─────────────────────────────── */

{
  // Both legs of one posting, deliberately given DIFFERENT timestamps — which
  // is the case timestamp-grouping alone cannot handle.
  const r = attributablePeak([
    ev('A', 0, 1_000_000, 'p0'),
    ev('A', 5, -100_000, 'p1'), ev('B', 6, 100_000, 'p1'),
  ]);
  check('D. an owned→owned transfer creates no phantom exposure',
    r.peak === 1_000_000,
    `peak ${r.peak} — 1 100 000 here would be the arrival counted without the departure`);
}
{
  const r = attributablePeak([
    ev('A', 0, 1_000_000, 'p0'),
    ev('A', 5, -100_000, 'p1'), ev('B', 5, 100_000, 'p1'),
  ]);
  check('I. same-instant legs of one posting produce no transient peak',
    r.peak === 1_000_000 && r.ordering === 'DETERMINISTIC', `peak ${r.peak}, ${r.ordering}`);
}

/* ── J · ordering that could change the answer is UNKNOWN ────────────────── */

{
  // Two DISTINCT postings sharing an instant, with no authoritative sequence.
  const r = attributablePeak([
    { resource: 'A', at: T(3), delta: 500_000 },
    { resource: 'B', at: T(3), delta: 400_000 },
  ]);
  check('J. distinct postings sharing an instant are reported AMBIGUOUS',
    r.ordering === 'AMBIGUOUS' && r.ambiguousInstants === 1,
    'the runner turns this into UNKNOWN rather than quoting a number it chose the order for');
}

/* ── peak provenance, so the number can be re-derived ────────────────────── */

{
  const r = attributablePeak([ev('A', 0, 600_000, 'p0'), ev('B', 2, 500_000, 'p1'), ev('A', 9, -600_000, 'p2')]);
  check('the peak carries when it happened and what was held',
    r.peakAt === T(2) && r.totalAtPeak === 1_100_000 && r.peakAccounts.length === 2,
    `${r.peakAt} total ${r.totalAtPeak} across ${r.peakAccounts.length} account(s)`);
}

/* ── E/F · aliases resolve to one account ────────────────────────────────── */

const fakeSql = (table) => (q) => {
  const ids = [...q.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return table.filter(([id]) => ids.includes(String(id).toLowerCase()));
};
{
  const r = resolveFinancialAccounts(
    [{ kind: 'test_payer', id: 'c-9' }, { kind: 'consumer', id: 'c-9' }],
    { sql: fakeSql([['c-9', 'acct-C']]) });
  check('E. TEST_PAYER and its backing consumer are one account', r.accounts.length === 1);
}
{
  const r = resolveFinancialAccounts(
    [{ kind: 'business', id: 'm-1' }, { kind: 'merchant', id: 'm-1' }],
    { sql: fakeSql([['m-1', 'acct-M']]) });
  check('F. BUSINESS and MERCHANT on one wallet are one account', r.accounts.length === 1);
}

/* ── G · COMPLETENESS is a separate question, and it fails closed ────────── */

{
  // The S23 shape exactly: the project is owned, the test payer under it is not.
  const owned = [{ kind: 'fixture_project', id: 'proj-1' }];
  const c = ownershipCompleteness(owned, { sql: () => [['payer-9', 'proj-1']] });
  check('G. a resolvable manifest that omits a created resource is INCOMPLETE',
    c.verdict === 'INCOMPLETE' && c.missing[0]?.kind === 'test_payer',
    c.detail);
}
{
  // The S06 shape: a SEGREGATED account under an owned business. The probe
  // asks the schema for accounts whose account_id differs from the wallet's,
  // so only these reach it — a PRIMARY never does.
  const owned = [{ kind: 'business', id: 'm-1' }];
  const c = ownershipCompleteness(owned, { sql: () => [['wa-campaign', 'm-1']] });
  check('G. …including a segregated wallet_account under an owned business',
    c.verdict === 'INCOMPLETE' && c.missing[0]?.kind === 'wallet_account', c.detail);
  const ok = ownershipCompleteness([...owned, { kind: 'wallet_account', id: 'wa-campaign' }],
    { sql: () => [['wa-campaign', 'm-1']] });
  check('…and declaring it closes the gap', ok.verdict === 'VERIFIED');
}
{
  // The correction: a PRIMARY wallet_account IS the wallet's own account.
  // Measured live — 1211 of 1211 PRIMARY rows have
  // account_id = wallets.available_account_id, while all 382 CAMPAIGN differ.
  // The probe's SQL excludes them, so an owned business with only a PRIMARY
  // underneath is complete. It used to report S06-COL-002 INCOMPLETE for
  // failing to declare an account its BUSINESS already resolved to.
  const scope = readFileSync(join(repo, 'tools/lib/validation-resource-scope.mjs'), 'utf8');
  check('a PRIMARY account is not demanded separately',
    /account_id IS DISTINCT FROM w\.available_account_id/.test(scope),
    'owning the business already attributes it; demanding it again is declaration noise');
}
{
  const owned = [{ kind: 'fixture_project', id: 'proj-1' }, { kind: 'test_payer', id: 'payer-9' }];
  const c = ownershipCompleteness(owned, { sql: () => [['payer-9', 'proj-1']] });
  check('…and declaring it makes the same manifest VERIFIED', c.verdict === 'VERIFIED', c.detail);
}
{
  const c = ownershipCompleteness([{ kind: 'fixture_project', id: 'p' }],
    { sql: () => { throw new Error('probe unavailable'); } });
  check('H. a completeness probe that cannot run is UNKNOWN, never VERIFIED',
    c.verdict === 'UNKNOWN', c.detail);
}

/* ── K/L · the declaration verdict ───────────────────────────────────────── */

check('K. actual == declared is VERIFIED',
  exposureVerdict({ declared: 1_000_000, actual: 1_000_000 }).verdict === 'VERIFIED');
check('L. actual == declared + 1 is UNDER_DECLARED',
  exposureVerdict({ declared: 1_000_000, actual: 1_000_001 }).verdict === 'UNDER_DECLARED');
check('an unmeasurable actual is UNKNOWN, never VERIFIED-by-zero',
  exposureVerdict({ declared: 1_000_000, actual: null }).verdict === 'UNKNOWN',
  'UNKNOWN must never become VERIFIED because the number happened to compute as 0');

/* ── the runner honours both preconditions ───────────────────────────────── */


const runner = readFileSync(join(repo, 'tools/validation-runner.mjs'), 'utf8');
check('the runner checks completeness BEFORE resolution',
  /ownershipCompleteness\(owned[\s\S]{0,900}?resolveFinancialAccounts\(owned/.test(runner),
  'resolution cannot compensate for an incomplete set, so it must not be asked first');
check('…and an AMBIGUOUS ordering becomes UNKNOWN',
  /ordering === 'AMBIGUOUS'[\s\S]{0,200}ownershipKnown: false/.test(runner));
check('…and the peak provenance is carried out of the measurement',
  /peakAt, peakGroup, peakAccounts/.test(runner));

/* ── PART 10 · a rejected verdict is a system defect, not a journey result ─ */

check('the executor states both prerequisites when it persists a verdict',
  /ownership_completeness = \$\{txt\(e\.completeness\?\.verdict\)\}/.test(runner)
  && /peak_event_ordering = \$\{txt\(e\.ordering/.test(runner),
  '0165 refuses a VERIFIED whose prerequisites are absent, so silence is rejection');
check('…and a database rejection is surfaced, never swallowed',
  /EXPOSURE_PERSISTENCE_REJECTED/.test(runner) && /throw new Error\(`EXPOSURE_PERSISTENCE_REJECTED/.test(runner),
  'downgrading it to UNKNOWN would hide an executor writing a verdict the model forbids');
check('…and the figure records which model produced it',
  /measurement_model = \$\{lit\(MEASUREMENT_MODEL\)\}/.test(runner),
  'a pre-B4 peak and a B4 peak are not comparable and must not be compared');

/* ── POST-THIRD-FULL · one pipeline, no shortcuts ────────────────────────── */

// BZV-20260921-0001 stopped on S14-DOA-001: an empty financial universe took a
// shortcut to VERIFIED before completeness or ordering existed, and 0165
// refused the row. The repair belongs in the executor — the constraint was
// right.
check('the empty set is stated positively, never as NULL',
  /NO_FUNDED_RESOURCES/.test(runner) && /ordering: 'DETERMINISTIC'/.test(runner),
  'the empty ownership set IS complete and the empty event sequence IS deterministic');
check('completeness is computed before any verdict can be returned',
  /const complete = ownershipCompleteness\(owned[\s\S]{0,900}?const scope = resolveFinancialAccounts/.test(runner),
  'no path may produce a verdict without the prerequisites of that verdict');
// The EXECUTABLE occurrence, not any occurrence: the comment explaining the
// defect quotes the old expression verbatim, and an assertion that cannot tell
// a line of code from a line about code is not checking the code.
const executable = runner.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
check('a prose count is no longer read as financial capability',
  !/const fundingCapable = \(p\.disposable/.test(executable)
  && /const expectsFinancial = \(declared \?\? 0\) > 0/.test(executable),
  'cleanup.disposable is a list of sentences written for a human');
check('a journey that declares a bound and owns nothing fails closed',
  /expectsFinancial && owned\.length === 0[\s\S]{0,260}ownershipKnown: false/.test(runner));

/* ── terminal reconciliation ─────────────────────────────────────────────── */

check('abandonment reconciles PLANNED to NOT_REACHED',
  /outcome='NOT_REACHED'[\s\S]{0,200}WHERE run_id=\$\{lit\(run\.id\)\}::uuid AND outcome='PLANNED'/.test(runner),
  'a terminal run whose records say they are waiting to start describes a state that no longer exists');
check('…and touches only PLANNED, never a reached record',
  /AND outcome='PLANNED'/.test(runner)
  && !/outcome='NOT_REACHED'[^;]*outcome IN \('PASSED'/.test(runner),
  'PASSED, FAILED and OBSERVED are the record of what happened');

/* ── conditional financial classification ────────────────────────────────── */

{
  const scopeSrc = readFileSync(join(repo, 'tools/lib/validation-resource-scope.mjs'), 'utf8');
  check('fixture_project is CONDITIONAL, not unconditionally financial',
    /\['fixture_project', \{[\s\S]{0,1400}?scope: 'CONDITIONAL'/.test(scopeSrc),
    'an unbound project never ran financial-setup: no merchant, no wallet, no way to hold funds');
  check('…and the condition is asked of the schema',
    /condition: \(ids\) =>[\s\S]{0,200}dev_project_sandbox_binding/.test(scopeSrc));

  // Bound → financial. Unbound → structural. Both from the same input.
  const owned = [{ kind: 'fixture_project', id: 'bound' }, { kind: 'fixture_project', id: 'unbound' }];
  const sql = (q) => (/dev_project_sandbox_binding/.test(q) && !/available_account_id::text/.test(q)
    ? [['bound']]                       // the condition: only `bound` is bound
    : [['bound', 'acct-W']]);           // the resolver
  const r = resolveFinancialAccounts(owned, { sql });
  check('a bound project resolves and an unbound one is structural',
    r.verdict === 'RESOLVED' && r.accounts.length === 1 && r.structural.length === 1,
    `${r.accounts.length} account(s), ${r.structural.length} structural — ${r.detail}`);
  check('…and the structural one says WHY it holds nothing',
    /never ran financial-setup/.test(r.structural[0]?.why ?? ''));
}

console.log(failures === 0
  ? '\n✓ VALIDATION_CONCURRENT_PEAK=PASS\n'
  : `\n✗ VALIDATION_CONCURRENT_PEAK=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
