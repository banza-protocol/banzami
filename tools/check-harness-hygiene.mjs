#!/usr/bin/env node
/**
 * Every harness that mints operator authority must be able to give it back.
 *
 * The dynamic proof — run the suite, compare the operator's inventory before
 * and after — needs the deployed Sandbox, and CI must never hold credentials
 * for it: this runner executes repository code, including code from a branch
 * under review. So that gate runs on the operator's own machine
 * (tests/phase0/fixture-hygiene-suite.sh).
 *
 * What CI can enforce is the static half, and it is the half that regresses:
 * somebody adds a harness, it mints keys, and nothing was wired up. Three
 * rules, each mapping to a way cleanup has actually been lost here:
 *
 *   a harness that creates operator state sources lib/e2e-run.sh and calls
 *   e2e_begin — otherwise there is no manifest and no trap
 *
 *   it records what it creates with e2e_own — a run with a trap and an empty
 *   manifest cleans up nothing, and reports that it cleaned up
 *
 *   it does not install its own `trap ... EXIT`. The shell keeps one handler
 *   per signal, so a second trap silently replaces the run's cleanup handler.
 *   Two harnesses did exactly this, and their cleanup had stopped running.
 *
 * Detection is by what a harness CALLS, not by a list of filenames: a list is
 * out of date the moment someone adds a file, which is the case this exists for.
 *
 * The Node harnesses that drive the Console mint a different kind of authority
 * and so get their own rule. They create console ACCOUNTS — an identity that can
 * sign in, its sessions, its workspaces and its projects — and for a while none
 * of them cleaned up: 33 accounts with 33 live sessions had accumulated on the
 * operator, one set per run, kept forever. A leftover account that can still
 * sign in is not a leftover, it is a way in. So a script that inserts into
 * identity_users must register cleanup for what it created.
 *
 * Usage: node tools/check-harness-hygiene.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'tests/phase0';
/** The Node harnesses that sign accounts into the Console. */
const CONSOLE_DIRS = ['tools/e2e/console', 'tools/e2e/dev-console'];

/** Routes that mint operator authority. Creating any of these is the trigger. */
const MINTS = [
  [/\/internal\/v1\/projects\/[^/\s"']+\/fixture-keys/, 'a developer API key'],
  [/\/internal\/v1\/fixture-projects\b(?!\/)/,          'a developer project'],
  [/POST\s+\/v1\/merchants\b/,                          'a merchant'],
  [/POST[^\n]*\/webhooks\/endpoints\b/,                 'a webhook endpoint'],
  // The collection route creates; a route with a path segment after it acts on
  // something that already exists. `POST /v1/payment-links/{slug}/pay` is a
  // donor paying, not a harness minting, and reading it as minting made this
  // gate fail two harnesses that create nothing at all.
  [/POST[^\n]*\/v1\/payment-links(?![/\w-])/,           'a payment link'],
  [/POST[^\n]*\/payment-sessions(?![/\w-])/,             'a payment session'],
];

let failures = 0;
const bad = (f, m) => { failures += 1; console.error(`  ✗ ${f}: ${m}`); };

const files = readdirSync(DIR).filter((f) => f.endsWith('.sh')).sort();
console.log(`harness hygiene — ${files.length} script(s) in ${DIR}\n`);

for (const f of files) {
  const src = readFileSync(join(DIR, f), 'utf8');
  // The library itself, and the gates that measure harnesses, are not harnesses.
  if (f.startsWith('fixture-hygiene')) continue;

  const mints = MINTS.filter(([re]) => re.test(src)).map(([, what]) => what);

  // A second EXIT trap replaces the run's handler — checked in every script,
  // because a script that does not mint anything today may tomorrow.
  if (/^\s*trap\s+.*\bEXIT\b/m.test(src)) {
    bad(f, 'installs its own `trap ... EXIT`, which replaces the run cleanup handler. Use E2E_ALSO.');
  }

  if (mints.length === 0) continue;

  const begins = /\be2e_begin\b/.test(src);
  const owns = (src.match(/\be2e_own\b/g) ?? []).length;

  if (!begins) {
    bad(f, `creates ${mints.join(', ')} but never calls e2e_begin — nothing will clean up after it`);
    continue;
  }
  if (owns === 0) {
    bad(f, `calls e2e_begin but records nothing with e2e_own — cleanup would run over an empty manifest`);
    continue;
  }
  console.log(`  ✓ ${f.padEnd(36)} creates ${mints.length} kind(s), records ${owns}`);
}

// ── the Console harnesses ───────────────────────────────────────────────────
// Same principle, different currency: these mint accounts rather than keys, and
// the thing that must exist is a registered cleanup rather than a manifest.
const consoleFiles = CONSOLE_DIRS.flatMap((d) => {
  let names = [];
  try { names = readdirSync(d); } catch { return []; }
  return names.filter((f) => f.endsWith('.mjs')).map((f) => join(d, f));
}).filter((f) => !f.includes('/lib/')).sort();

console.log(`\nconsole harness hygiene — ${consoleFiles.length} script(s)\n`);

for (const f of consoleFiles) {
  const src = readFileSync(f, 'utf8');
  // Two ways a harness ends up owning an account, and the second is the one
  // that was missed: an insert into identity_users is obvious, but signing in
  // through /auth/request-otp with a fresh address creates the account
  // server-side just the same. Three harnesses did exactly that and read as
  // creating nothing.
  const makesAccounts =
    /insert into account_identity\.identity_users/i.test(src) ||
    (/auth\/request-otp/.test(src) && /@banzami-e2e\.test/.test(src));
  const short = f.replace(/^tools\/e2e\//, '');
  if (!makesAccounts) {
    // A harness that only reads, or that signs in as an account somebody else
    // provisioned, has nothing to give back.
    console.log(`  ·  ${short.padEnd(44)} creates no console account`);
    continue;
  }
  if (!/\bregisterCleanup\s*\(/.test(src)) {
    bad(short, 'creates console accounts but never calls registerCleanup — the accounts, their sessions and their workspaces stay live forever');
    continue;
  }
  if (!/emailPattern\s*:/.test(src)) {
    bad(short, 'calls registerCleanup without an emailPattern — cleanup would match nothing');
    continue;
  }
  console.log(`  ✓ ${short.padEnd(44)} creates console accounts, registers cleanup`);
}

console.log();
if (failures === 0) {
  console.log('✓ every harness that mints operator authority can give it back');
  process.exit(0);
}
console.error(`✗ ${failures} harness hygiene violation(s)`);
console.error('  see tests/phase0/lib/e2e-run.sh');
process.exit(1);
