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
 * Usage: node tools/check-harness-hygiene.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'tests/phase0';

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

console.log();
if (failures === 0) {
  console.log('✓ every harness that mints operator authority can give it back');
  process.exit(0);
}
console.error(`✗ ${failures} harness hygiene violation(s)`);
console.error('  see tests/phase0/lib/e2e-run.sh');
process.exit(1);
