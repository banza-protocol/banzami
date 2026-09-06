#!/usr/bin/env node
/**
 * Two proofs about the deploy status bug: that the old shape really loses a
 * failure, and that the gate catches it.
 *
 * The first matters because the pattern looks careful. `cmd | grep ... || true`
 * followed by `rc=${PIPESTATUS[0]}` reads like someone thought about pipelines,
 * and reviewers had read it that way for a long time. Running it is the only way
 * to see that PIPESTATUS describes the last pipeline the shell ran, and after
 * the `||` that pipeline is `true`.
 *
 * Usage: node tools/check-deploy-status-capture.selftest.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';

const sh = (script) => spawnSync('bash', ['-c', script], { encoding: 'utf8' });

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { failures += 1; console.error(`  ✗ ${m}`); };

console.log('deploy status capture — self-test\n');

// ── 1. the old shape loses the failure ──────────────────────────────────────
const OLD = `
  set -o pipefail
  bash -c 'echo "#5 ERROR: build failed"; exit 1' | grep -E "^(#[0-9]+ ERROR)" || true
  rc=\${PIPESTATUS[0]}
  echo "reported=$rc"
`;
const oldRun = sh(OLD);
/reported=0/.test(oldRun.stdout)
  ? ok('the old shape reports 0 for a build that exited 1')
  : bad(`the old shape did not reproduce (${oldRun.stdout.trim()})`);

// ── 2. the shape now in deploy.sh keeps it ──────────────────────────────────
const NEW = `
  out=$(bash -c 'echo "#5 ERROR: build failed"; exit 1' 2>&1)
  rc=$?
  printf '%s\\n' "$out" | grep -E "^(#[0-9]+ ERROR)" || true
  echo "reported=$rc"
`;
const newRun = sh(NEW);
/reported=1/.test(newRun.stdout)
  ? ok('capturing before filtering keeps the failure')
  : bad(`the corrected shape lost it too (${newRun.stdout.trim()})`);

// ── 3. and success still reads as success ───────────────────────────────────
const NEWOK = `
  out=$(bash -c 'echo "#5 DONE"; exit 0' 2>&1)
  rc=$?
  printf '%s\\n' "$out" | grep -E "^(#[0-9]+ DONE)" || true
  echo "reported=$rc"
`;
/reported=0/.test(sh(NEWOK).stdout)
  ? ok('a build that succeeds still reports success')
  : bad('the corrected shape reports failure for a successful build');

// ── 4. the static gate catches the old shape ────────────────────────────────
const gate = () => {
  try { execFileSync('node', ['tools/check-deploy-status-capture.mjs'], { encoding: 'utf8' }); return 0; }
  catch (e) { return e.status ?? 1; }
};
if (gate() !== 0) { console.error('  ✗ the gate fails on the clean tree'); process.exit(1); }
ok('clean tree passes');

const FIXTURE = 'tools/ops/zz-selftest-deploy.sh';
writeFileSync(FIXTURE, `#!/usr/bin/env bash\nssh "$R" "docker build ." | grep DONE || true\nrc=\${PIPESTATUS[0]}\n`);
const caught = gate() !== 0;
unlinkSync(FIXTURE);
caught ? ok('the gate flags a PIPESTATUS read after `|| true`') : bad('the gate did not catch it');

if (gate() !== 0) { console.error('  ✗ the tree does not pass again'); process.exit(1); }
ok('clean tree passes again');

console.log();
if (failures === 0) { console.log('✓ a failed build cannot be reported as a successful deploy'); process.exit(0); }
console.error(`✗ ${failures} check(s) failed`);
process.exit(1);
