#!/usr/bin/env node
/**
 * WEB-E2E-RUNNER-001 — the canonical App Banzami Web cleanroom command.
 *
 * Orchestrates the whole thing against the PUBLIC hosts and returns non-zero on
 * any mandatory failure:
 *
 *   browser readiness (reported)               → BROWSER_EXECUTABLE_REPORTED
 *   Proof 01  registration → PIN → Home
 *   Proof 02  Web→Web P2P (ledger-conserved)
 *   Proof 03  invalid deep-link
 *   Cleanroom run 1  generic developer → consumer → app-web pay → webhook/receipt
 *   Cleanroom run 2  (fresh everything)         → GENERIC_CLEANROOM_REPEATABILITY
 *   Console UI evidence  (API Explorer + App Banzami page)
 *   Regressions  hosted checkout + deterministic payer + three modes
 *   Final scanners  consumer residue = 0
 *   Economic integrity  book balanced, no unbacked liability, no duplicate effects
 *
 *   node run-all.mjs            (make app-web-cleanroom)
 *   node run-all.mjs --quick    (one cleanroom run instead of two)
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { launchChromium } from './lib/browser.mjs';
import { integrity } from './lib/operator-read.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const quick = process.argv.includes('--quick');
const results = [];

function step(name, script, args = []) {
  process.stdout.write(`\n── ${name} ${'─'.repeat(Math.max(2, 60 - name.length))}\n`);
  let ok = false; let tail = '';
  try {
    const out = execFileSync('node', [join(HERE, script), ...args], { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    process.stdout.write(out);
    tail = out.trim().split('\n').slice(-2).join(' ');
    ok = true;
  } catch (e) {
    if (e.stdout) process.stdout.write(e.stdout);
    if (e.stderr) process.stderr.write(e.stderr);
    tail = String(e.stdout ?? '').trim().split('\n').slice(-2).join(' ');
    ok = false;
  }
  results.push({ name, ok });
  return ok;
}

// 0. Browser readiness — report the executable/version once, up front.
try {
  const { browser, chosen } = await launchChromium();
  await browser.close();
  console.log(`\nBROWSER_EXECUTABLE_REPORTED=PASS (${chosen.source} ${chosen.version})`);
  console.log('BROWSER_RUNNER_MACHINE_CACHE_ASSUMPTION=0');
  results.push({ name: 'Browser readiness', ok: true });
} catch (e) {
  console.error(`BROWSER_EXECUTABLE_REPORTED=FAIL — ${e.message}`);
  results.push({ name: 'Browser readiness', ok: false });
}

// 1-3. Foundational proofs.
step('Proof 01 — registration → PIN → Home', 'proofs/01-registration-pin-home.mjs');
step('Proof 02 — Web→Web P2P', 'proofs/02-web-to-web-p2p.mjs');
step('Proof 03 — invalid deep-link', 'proofs/03-invalid-deeplink.mjs');

// 4-5. The generic cleanroom, twice (repeatability) — fresh dev/consumer/payment.
const run1 = step('Cleanroom run 1', 'app-web-cleanroom.mjs', ['--label', 'run1']);
const run2 = quick ? true : step('Cleanroom run 2', 'app-web-cleanroom.mjs', ['--label', 'run2']);
console.log(`\nGENERIC_CLEANROOM_REPEATABILITY=${run1 && run2 ? 'PASS' : 'FAIL'}${quick ? ' (quick: single run)' : ''}`);
results.push({ name: 'Cleanroom repeatability', ok: run1 && run2 });

// 6-7. Console UI evidence + regressions.
step('Console UI evidence', 'console-ui-evidence.mjs');
step('Sandbox regressions', 'regressions.mjs');

// 8. Final scanners — independent of the harness's own cleanup.
console.log(`\n── Final scanners ${'─'.repeat(46)}`);
let residueOk = false;
try {
  const out = execFileSync('node', [join(REPO, 'tools/check-consumer-residue.mjs')], { encoding: 'utf8' });
  process.stdout.write(out.trim().split('\n').slice(-2).join('\n') + '\n');
  residueOk = true;
} catch (e) {
  if (e.stdout) process.stdout.write(e.stdout);
  residueOk = false;
}
console.log(`CLEANROOM_ACCEPTANCE_RESIDUE=${residueOk ? '0' : 'NONZERO'}`);
results.push({ name: 'Consumer residue scan', ok: residueOk });

// 9. Economic integrity.
console.log(`\n── Economic integrity ${'─'.repeat(42)}`);
const I = integrity();
const intOk = I.bookBalanced && I.noUnbackedLiability && I.duplicateEffects === 0;
console.log(`BOOK_BALANCED=${I.bookBalanced ? 'PASS' : 'FAIL'} (sum=${I.bookSum} minor)`);
console.log(`NO_UNBACKED_SANDBOX_LIABILITY=${I.noUnbackedLiability ? 'PASS' : 'FAIL'}`);
console.log(`NO_HIDDEN_RETIRED_VALUE=${residueOk ? 'PASS' : 'FAIL'} (consumer residue scanner)`);
console.log(`DUPLICATE_FINANCIAL_EFFECTS=${I.duplicateEffects}`);
console.log(`  detail: unbalanced=${I.unbalancedPostings} single-leg=${I.singleLegPostings} posting-less=${I.entriesWithoutPostings} entry-less=${I.postingsWithoutEntries} orphan-account=${I.entriesOrphanAccount}`);
results.push({ name: 'Economic integrity', ok: intOk });

// Verdict.
console.log(`\n${'═'.repeat(66)}`);
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);
const verdict = failed.length === 0;
console.log(`\nAPP_WEB_CLEANROOM_CANONICAL_COMMAND=${verdict ? 'PASS' : 'FAIL'} (${results.length - failed.length}/${results.length})`);
process.exitCode = verdict ? 0 : 1;
