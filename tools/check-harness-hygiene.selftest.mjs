#!/usr/bin/env node
/**
 * Does the harness-hygiene gate actually catch anything?
 *
 * A checker that has never failed is indistinguishable from a checker that
 * cannot fail, and this repository has shipped both kinds. So each violation
 * class gets a synthetic harness written into the real directory, the gate is
 * run, and the run must fail — then the file is removed and the gate must pass
 * again, which also proves the failures came from the fixtures and not from
 * something left behind.
 *
 * Usage: node tools/check-harness-hygiene.selftest.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'tests/phase0';

const CASES = [
  ['mints a key and never calls e2e_begin', `#!/usr/bin/env bash
call "$DEV" 8086 POST "/internal/v1/projects/$P/fixture-keys" '{"name":"x"}'
`],
  ['calls e2e_begin but records nothing', `#!/usr/bin/env bash
. "$(dirname "$0")/lib/e2e-run.sh"
e2e_begin
call "$GW" 8080 POST /v1/merchants '{"name":"x"}'
`],
  ['installs its own EXIT trap', `#!/usr/bin/env bash
. "$(dirname "$0")/lib/e2e-run.sh"
e2e_begin
trap 'rm -rf "$W"' EXIT
call "$DEV" 8086 POST /internal/v1/fixture-projects '{"name":"x"}'
e2e_own fixture_project "$P"
`],
];

const gate = () => {
  try { execFileSync('node', ['tools/check-harness-hygiene.mjs'], { encoding: 'utf8' }); return 0; }
  catch (e) { return e.status ?? 1; }
};

let failures = 0;
console.log('harness-hygiene gate — self-test\n');

if (gate() !== 0) {
  console.error('  ✗ the gate fails on the real tree before any fixture is added');
  process.exit(1);
}
console.log('  ✓ clean tree passes');

for (const [name, body] of CASES) {
  const path = join(DIR, 'zz-selftest-fixture.sh');
  writeFileSync(path, body);
  const rc = gate();
  unlinkSync(path);
  if (rc === 0) { failures += 1; console.error(`  ✗ NOT caught: ${name}`); }
  else console.log(`  ✓ caught: ${name}`);
}

if (gate() !== 0) {
  console.error('  ✗ the tree does not pass again after the fixtures are removed');
  process.exit(1);
}
console.log('  ✓ clean tree passes again');

console.log();
if (failures === 0) { console.log('✓ every violation class is detected'); process.exit(0); }
console.error(`✗ ${failures} violation class(es) go undetected`);
process.exit(1);
