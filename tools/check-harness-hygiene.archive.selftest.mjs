#!/usr/bin/env node
/**
 * Does the archive-only cleanup rule bite? (SANDBOX-DELETE-001)
 *
 * 165 synthetic test Businesses were left ACTIVE by harnesses whose cleanup
 * archived. Each case below is run through the real gate in a temporary copy of
 * the tree — including the self-service harness exactly as it was committed
 * before the fix, taken from git.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = 'tools/check-harness-hygiene.mjs';
let failed = 0;
const check = (name, cond) => { console.log(`${cond ? '✓' : '✗'} ${name}`); if (!cond) failed++; };

function runGate(files) {
  const dir = mkdtempSync(join(tmpdir(), 'hyg-archive-'));
  try {
    mkdirSync(join(dir, 'tests', 'phase0'), { recursive: true });
    cpSync(join(ROOT, GATE), join(dir, GATE));
    for (const [path, src] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), src);
    }
    const out = execFileSync('node', [GATE], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    return { pass: true, out };
  } catch (e) {
    return { pass: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ARCHIVE = "await call(`/projects/${p}/archive`, 'POST', { name });\nawait call(`/workspaces/${ws}/archive`, 'POST', { name });\n";
const DELETE = "await call(`/workspaces/${ws}`, 'DELETE', { name });\n";
const RUN_CLEANUP = "import { registerCleanup } from '../console/lib/run-cleanup.mjs';\nregisterCleanup({ emailPattern: 'x-%@banzami-e2e.test' });\n";

{
  const r = runGate({ 'tools/e2e/sandbox/probe.mjs': ARCHIVE });
  check('cleanup that only archives → fail', !r.pass && /CURRENT_HARNESS_ARCHIVE_ONLY_CLEANUP_PATHS=1/.test(r.out));
}
check('archives, then deletes the workspace → pass', runGate({ 'tools/e2e/sandbox/probe.mjs': ARCHIVE + DELETE }).pass);
check('archives, cleans up through cleanupRun → pass', runGate({ 'tools/e2e/sandbox/probe.mjs': RUN_CLEANUP + ARCHIVE }).pass);
{
  const r = runGate({ 'tools/e2e/console/lib/run-cleanup.mjs': "export function cleanupRun() { return q(\"update developer.dev_projects set status='ARCHIVED'\"); }" });
  check('run-cleanup that archives without Core retirement → fail', !r.pass && /coreRetirementStep/.test(r.out));
}
{
  let before = '';
  try { before = execFileSync('git', ['show', 'f88507fd:tools/e2e/sandbox/self-service-e2e.mjs'], { cwd: ROOT, encoding: 'utf8' }); } catch { /* shallow clone */ }
  if (before) {
    const r = runGate({ 'tools/e2e/sandbox/self-service-e2e.mjs': before });
    check('the self-service harness as committed before the fix → fail', !r.pass && /self-service-e2e\.mjs: cleans up by archiving only/.test(r.out));
  } else {
    console.log('· the pre-fix harness is not in this clone (shallow) — crafted cases above cover the rule');
  }
}

if (failed) { console.error(`\n✗ archive-only cleanup self-test: ${failed} case(s) failed`); process.exit(1); }
console.log('\n✓ archive-only cleanup self-test: archiving without retiring is caught');
