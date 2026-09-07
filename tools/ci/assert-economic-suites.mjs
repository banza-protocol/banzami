#!/usr/bin/env node
// Proves the database-backed economic suites actually ran.
//
// A green `cargo test` is not by itself evidence that financial correctness was
// checked. A suite can vanish from a run in ways that leave the exit code at
// zero: a test renamed or deleted, a `#[ignore]` added, a filter narrowing the
// run, or a whole integration binary that never got built. Each of those turns
// the gate into a formality while still reporting success.
//
// So the gate asserts on the test output itself: every named economic
// invariant must appear, and must appear as a pass. It also refuses any
// ignored or filtered-out test across the whole workspace, because "0 failed"
// says nothing about tests that never executed.
//
// Usage: node tools/ci/assert-economic-suites.mjs <cargo-test.log>

import { readFileSync } from 'node:fs';

const logPath = process.argv[2];
if (!logPath) {
  console.error('usage: assert-economic-suites.mjs <cargo-test.log>');
  process.exit(2);
}

const log = readFileSync(logPath, 'utf8');

// Each entry is an economic invariant that must be exercised against a real
// PostgreSQL. The comment is the fact the test defends, not a restatement of
// its name — if a test is renamed, this list should be updated deliberately.
const REQUIRED = [
  // An explicit 0-bps rule is a pricing DECISION: capture succeeds, fee is
  // zero, and a rule id is recorded so the zero is attributable.
  'government_zero_bps_gross_equals_net',
  // No applicable rule is the ABSENCE of a decision: capture must refuse.
  'unknown_category_refuses_capture',
  'no_category_refuses_capture',
  // A nonzero rate produces the arithmetically correct fee, balanced.
  'donation_two_percent_net_fee_balanced',
  // A later rule change never reprices a settled fee.
  'rule_change_does_not_change_old_fee',
  // The same explicit-zero / absent-decision split, on the settlement path.
  'zero_application_fee_net_equals_gross',
  'no_applicable_rule_refuses_settlement',
  'settles_net_and_application_fee_balanced',
  // A completed settlement is immutable under later rule changes.
  'rule_change_does_not_alter_completed',
];

const failures = [];

// libtest prints one line per test: `test <name> ... ok` (or `... FAILED`,
// `... ignored`). Integration tests at the root of tests/*.rs carry no module
// prefix, but match a suffix boundary anyway so a future move does not silently
// stop matching.
for (const name of REQUIRED) {
  const ran = new RegExp(`^test (?:\\S*::)?${name} \\.\\.\\. ok$`, 'm').test(log);
  if (ran) continue;

  const mentioned = new RegExp(`^test (?:\\S*::)?${name} \\.\\.\\. (.+)$`, 'm').exec(log);
  failures.push(
    mentioned
      ? `${name}: did not pass (reported "${mentioned[1].trim()}")`
      : `${name}: never executed — not present in the test output at all`,
  );
}

// Nothing anywhere in the workspace may be skipped. `ignored` and `filtered
// out` are the two ways libtest reports a test that did not run, and both keep
// the exit code at zero.
const summaries = [...log.matchAll(
  /^test result: (\w+)\. (\d+) passed; (\d+) failed; (\d+) ignored; \d+ measured; (\d+) filtered out/gm,
)];

if (summaries.length === 0) {
  failures.push('no `test result:` summary found — cargo test produced no test output');
}

let totalPassed = 0;
for (const [, , passed, failed, ignored, filtered] of summaries) {
  totalPassed += Number(passed);
  if (Number(failed) > 0) failures.push(`a suite reported ${failed} failed test(s)`);
  if (Number(ignored) > 0) failures.push(`a suite reported ${ignored} ignored test(s) — skipped tests are not evidence`);
  if (Number(filtered) > 0) failures.push(`a suite reported ${filtered} filtered-out test(s) — the run was narrowed`);
}

// A DB-backed run compiles and executes far more than a handful of tests. A
// suspiciously small total means the workspace was not really exercised.
const MIN_EXPECTED = 400;
if (totalPassed > 0 && totalPassed < MIN_EXPECTED) {
  failures.push(
    `only ${totalPassed} tests passed across ${summaries.length} suites; ` +
    `expected at least ${MIN_EXPECTED} for a full workspace run`,
  );
}

console.log(`suites reporting results : ${summaries.length}`);
console.log(`tests passed             : ${totalPassed}`);
console.log(`economic invariants       : ${REQUIRED.length} required`);

if (failures.length > 0) {
  console.error('\nECONOMIC GATE NOT SATISFIED:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log('\n✓ every required economic invariant executed and passed against PostgreSQL');
