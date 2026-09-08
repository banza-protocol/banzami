/**
 * The regression for the exact defect: `FAIL=0` must read as PASS.
 *
 * A release check once reported four green suites as four failures because it
 * grepped the output for the substring "FAIL", which every passing suite prints
 * as the label of its zero. The verdict has to come from the number.
 *
 * Run: node tests/ops/suite-summary-parsing.test.mjs
 */
import { parseSuiteSummary, suiteVerdict } from '../../tools/e2e/lib/parse-suite-summary.mjs';

let pass = 0, fail = 0;
const ok = (d) => { console.log(`  \x1b[0;32m✓\x1b[0m ${d}`); pass++; };
const no = (d, got) => { console.log(`  \x1b[0;31m✗\x1b[0m ${d} — got ${JSON.stringify(got)}`); fail++; };
const eq = (d, got, want) => (JSON.stringify(got) === JSON.stringify(want) ? ok(d) : no(d, got));

console.log('\n▸ the defect this exists for');
// The literal line that was misread on 2026-09-09.
eq('FAIL=0 is a PASS',
   parseSuiteSummary('SETTLEMENT_ECONOMICS_E2E: PASS=24 FAIL=0').verdict, 'PASS');
eq('FAIL=1 is a FAIL',
   parseSuiteSummary('SETTLEMENT_ECONOMICS_E2E: PASS=23 FAIL=1').verdict, 'FAIL');
eq('the counts survive the parse',
   (({ pass, fail }) => ({ pass, fail }))(parseSuiteSummary('ECONOMIC_MODEL_SMOKE: PASS=45 FAIL=0')),
   { pass: 45, fail: 0 });

console.log('\n▸ a verdict is never guessed');
eq('no summary line is UNKNOWN, not PASS',
   suiteVerdict({ exitCode: 0, output: 'lots of prose, no summary' }).verdict, 'UNKNOWN');
eq('prose mentioning PASS does not make a verdict',
   parseSuiteSummary('everything looks PASS to me'), null);
eq('a non-zero exit outranks a green-looking summary',
   suiteVerdict({ exitCode: 1, output: 'X: PASS=10 FAIL=0' }).verdict, 'FAIL');

console.log('\n▸ zero assertions is not success');
eq('PASS=0 FAIL=0 is a FAIL, not a vacuous pass',
   parseSuiteSummary('EMPTY_SUITE: PASS=0 FAIL=0').verdict, 'FAIL');

console.log('\n▸ blocked assertions are not passes');
eq('BLOCKED>0 fails even with FAIL=0',
   parseSuiteSummary('X: PASS=5 FAIL=0 BLOCKED=1').verdict, 'FAIL');
eq('the lowercase harness shape parses too',
   parseSuiteSummary('### SUMMARY pass=20 fail=0 simulated=1 blocked=0').verdict, 'PASS');
eq('simulated is carried, not silently folded into pass',
   parseSuiteSummary('### SUMMARY pass=20 fail=0 simulated=1 blocked=0').simulated, 1);

console.log('\n▸ the last summary wins when a suite prints several');
eq('trailing summary is authoritative',
   parseSuiteSummary('A: PASS=1 FAIL=0\nB: PASS=2 FAIL=3').verdict, 'FAIL');

console.log();
if (fail === 0) { console.log(`\x1b[0;32m✓ suite summary parsing: ${pass}/${pass + fail}\x1b[0m\n`); process.exit(0); }
console.log(`\x1b[0;31m✗ suite summary parsing: ${fail} of ${pass + fail} failed\x1b[0m\n`);
process.exit(1);
