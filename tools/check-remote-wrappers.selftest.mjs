#!/usr/bin/env node
/**
 * Does the remote-status gate catch the shapes that actually happened?
 *
 * Both fixtures below are the real lines that were in this repository — one
 * from the assurance scripts, one from the deploy path. A gate written after
 * the fact should at minimum fail on the thing it was written for.
 *
 * Usage: node tools/check-remote-wrappers.selftest.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';

const DIR = 'tools/ops';
const FIXTURE = `${DIR}/zz-selftest-remote.sh`;

const CASES = [
  ['the remote command ends in a cleanup rm',
   '#!/usr/bin/env bash\nssh "$REMOTE" "BANZAMI_ON_VM=1 bash /tmp/x.sh; rm -f /tmp/x.sh"\n'],
  ['the ssh output is piped into tail',
   '#!/usr/bin/env bash\nssh "$REMOTE" \'bash /tmp/x.sh 2>&1\' | tail -3\n'],
];

const gate = () => {
  try { execFileSync('node', ['tools/check-remote-wrappers.mjs'], { encoding: 'utf8' }); return 0; }
  catch (e) { return e.status ?? 1; }
};

let failures = 0;
console.log('remote-status gate — self-test\n');

if (gate() !== 0) { console.error('  ✗ the gate fails on the clean tree'); process.exit(1); }
console.log('  ✓ clean tree passes');

mkdirSync(DIR, { recursive: true });
for (const [name, body] of CASES) {
  writeFileSync(FIXTURE, body);
  const rc = gate();
  unlinkSync(FIXTURE);
  if (rc === 0) { failures += 1; console.error(`  ✗ NOT caught: ${name}`); }
  else console.log(`  ✓ caught: ${name}`);
}

if (gate() !== 0) { console.error('  ✗ the tree does not pass again'); process.exit(1); }
console.log('  ✓ clean tree passes again');

console.log();
if (failures === 0) { console.log('✓ both real failure shapes are detected'); process.exit(0); }
console.error(`✗ ${failures} shape(s) undetected`);
process.exit(1);
