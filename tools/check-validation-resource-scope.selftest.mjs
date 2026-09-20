#!/usr/bin/env node
/**
 * check-validation-resource-scope — a journey's exposure is the balance of the
 * ACCOUNTS it owns, counted once each.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase B3).
 *
 * B2 made ownership reach the runner. It did not make it mean anything:
 * S06-COL-002 arrived with a valid manifest, one owned BUSINESS, and an
 * exposure verdict of UNKNOWN — because the resolver joined consumers.handle
 * and nothing else. Thirty-three journeys declaring into a resolver that
 * understands one resource type is thirty-two silences with extra steps.
 *
 * `sql` is injected, so every branch below — including the ones that must
 * fail closed — is proven without a database, a run, or a Sandbox resource.
 *
 *   node tools/check-validation-resource-scope.selftest.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const { resolveFinancialAccounts, scopeOf, RESOURCE_SCOPE } =
  await import(join(repo, 'tools/lib/validation-resource-scope.mjs'));
const { attributablePeak } = await import(join(repo, 'tools/lib/validation-exposure.mjs'));

let failures = 0;
const check = (t, ok, d = '') => {
  if (ok) return console.log(`  ✓ ${t}${d ? `  ${d}` : ''}`);
  console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`);
  failures++;
};

console.log('\nresource scope — the unit of exposure is the account\n');

/** A fake database: each kind's query answers from a fixed table. */
const fakeSql = (table) => (q) => {
  const ids = [...q.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return table.filter(([id]) => ids.includes(String(id).toLowerCase())).map(([id, acct]) => [id, acct]);
};
const own = (kind, id) => ({ kind, id });

/* ── A/B · the two commonest families resolve ────────────────────────────── */

{
  const r = resolveFinancialAccounts([own('consumer', 'alice')], { sql: fakeSql([['alice', 'acct-A']]) });
  check('A. a CONSUMER resolves to its wallet account',
    r.verdict === 'RESOLVED' && r.accounts.length === 1 && r.accounts[0] === 'acct-A', r.detail);
}
{
  const r = resolveFinancialAccounts([own('merchant', 'm-1')], { sql: fakeSql([['m-1', 'acct-M']]) });
  check('B. a MERCHANT resolves to its wallet account',
    r.verdict === 'RESOLVED' && r.accounts[0] === 'acct-M', r.detail);
}

/* ── C · BUSINESS + MERCHANT on one wallet is ONE balance ────────────────── */

{
  const r = resolveFinancialAccounts([own('business', 'm-1'), own('merchant', 'm-1')],
    { sql: fakeSql([['m-1', 'acct-M']]) });
  check('C. BUSINESS + MERCHANT on the same wallet count once',
    r.verdict === 'RESOLVED' && r.accounts.length === 1,
    `${r.counts.financial} financial record(s) → ${r.accounts.length} account(s)`);
}

/* ── D · a test payer IS its consumer ────────────────────────────────────── */

{
  // sandbox_test_payers is keyed by consumer_id — verified against the live
  // schema — so both records name the same account.
  const r = resolveFinancialAccounts([own('test_payer', 'c-9'), own('consumer', 'c-9')],
    { sql: fakeSql([['c-9', 'acct-C']]) });
  check('D. TEST_PAYER and its backing CONSUMER count once',
    r.verdict === 'RESOLVED' && r.accounts.length === 1,
    'a 2× peak here would be an alias, not exposure');
}

/* ── E · structural resources are classified, not ignored, not UNKNOWN ───── */

{
  const r = resolveFinancialAccounts(
    [own('fixture_key', 'k-1'), own('webhook_endpoint', 'w-1'), own('merchant_application', 'a-1')],
    { sql: () => { throw new Error('no financial query should be issued'); } });
  check('E. structural resources resolve to zero accounts and no UNKNOWN',
    r.verdict === 'RESOLVED' && r.accounts.length === 0 && r.counts.structural === 3 && r.counts.unknown === 0,
    r.detail);
  check('…and they are still listed, because cleanup and provenance need them',
    r.structural.length === 3);
}

/* ── F · an unsupported type fails closed ────────────────────────────────── */

{
  const r = resolveFinancialAccounts([own('teapot', 'x')], { sql: fakeSql([]) });
  check('F. an unsupported resource type is UNKNOWN, not STRUCTURAL',
    r.verdict === 'UNKNOWN' && r.counts.unknown === 1,
    'treating what we do not recognise as holding nothing is how a zero gets invented');
}

/* ── G · a financial resource that maps to nothing is UNKNOWN ────────────── */

{
  const r = resolveFinancialAccounts([own('consumer', 'ghost')], { sql: fakeSql([]) });
  check('G. a FINANCIAL resource with no account is UNKNOWN, not zero',
    r.verdict === 'UNKNOWN',
    'retired and mis-joined look identical from here, so neither may be assumed');
}
{
  const r = resolveFinancialAccounts([own('consumer', 'alice')],
    { sql: () => { throw new Error('connection lost'); } });
  check('…and an unreadable resolver is UNKNOWN too', r.verdict === 'UNKNOWN', r.detail);
}

/* ── H · the same record twice is one account ────────────────────────────── */

{
  const r = resolveFinancialAccounts([own('consumer', 'alice'), own('consumer', 'alice')],
    { sql: fakeSql([['alice', 'acct-A']]) });
  check('H. a duplicate ownership record yields one account', r.accounts.length === 1);
}

/* ── I/J/K · the peak is concurrent, never a sum of maxima ───────────────── */

{
  // Two accounts funded at the same time: the exposure is what was held AT
  // ONCE, so they add.
  const r = attributablePeak([
    { resource: 'acct-A', at: '2026-09-21T00:00:00.000Z', delta: 1_000_000 },
    { resource: 'acct-B', at: '2026-09-21T00:00:00.000Z', delta: 1_000_000 },
  ]);
  check('I. two accounts funded simultaneously give a concurrent sum',
    r.peak === 2_000_000, `peak ${r.peak}`);
}
{
  // A peaks, then empties; B only then fills. The maxima are 1 000 000 each
  // and the journey never held 2 000 000.
  const r = attributablePeak([
    { resource: 'acct-A', at: '2026-09-21T00:00:00.000Z', delta: 1_000_000 },
    { resource: 'acct-A', at: '2026-09-21T00:00:01.000Z', delta: -1_000_000 },
    { resource: 'acct-B', at: '2026-09-21T00:00:02.000Z', delta: 1_000_000 },
  ]);
  check('J. maxima at different times are NOT summed', r.peak === 1_000_000, `peak ${r.peak}`);
}
{
  // The one that makes ownership worth resolving properly: value moving
  // BETWEEN two owned accounts is not new exposure.
  const r = attributablePeak([
    { resource: 'acct-A', at: '2026-09-21T00:00:00.000Z', delta: 1_000_000 },
    { resource: 'acct-A', at: '2026-09-21T00:00:05.000Z', delta: -100_000 },
    { resource: 'acct-B', at: '2026-09-21T00:00:05.000Z', delta: 100_000 },
  ]);
  check('K. a transfer between two owned accounts creates no phantom peak',
    r.peak === 1_000_000, `peak ${r.peak} — a 1 100 000 here would be the transfer counted as arrival only`);
}
{
  // The invariant carried over from Phase 6: spending does not lower a peak
  // that already happened.
  const r = attributablePeak([
    { resource: 'acct-A', at: '2026-09-21T00:00:00.000Z', delta: 1_000_000 },
    { resource: 'acct-A', at: '2026-09-21T00:00:10.000Z', delta: -350_000 },
  ]);
  check('grant 1 000 000 then spend 350 000 peaks at 1 000 000, not 650 000',
    r.peak === 1_000_000, `peak ${r.peak}`);
}

/* ── the registry covers the vocabulary B2 actually observed ─────────────── */

for (const kind of ['consumer', 'business', 'merchant', 'test_payer', 'wallet_account',
                    'fixture_project', 'fixture_workspace', 'fixture_key', 'payment_link',
                    'payment_session', 'webhook_endpoint', 'merchant_application', 'rail_state']) {
  check(`"${kind}" is classified`, scopeOf(kind) !== 'UNKNOWN', scopeOf(kind));
}
check('an unlisted kind is UNKNOWN', scopeOf('something-new') === 'UNKNOWN');
check('every FINANCIAL entry carries a resolver',
  [...RESOURCE_SCOPE.values()].every((s) => s.scope !== 'FINANCIAL' || typeof s.query === 'function'));
check('every STRUCTURAL entry says WHY it holds nothing',
  [...RESOURCE_SCOPE.values()].every((s) => s.scope !== 'STRUCTURAL' || typeof s.why === 'string'),
  'a classification with no reason is an assumption with a label');

console.log(failures === 0
  ? '\n✓ VALIDATION_RESOURCE_SCOPE=PASS\n'
  : `\n✗ VALIDATION_RESOURCE_SCOPE=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
