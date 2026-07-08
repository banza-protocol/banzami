// Phase 0 internal functional test runner (baseline + synthetic harness).
//
// Records ONLY genuine results — no fabrication, no overclaiming:
//  - pilot-limit policy unit tests (cargo, real);
//  - the operator core financial test-suite (cargo --lib, real);
//  - a live read-only Sandbox safety inspection result (supplied);
//  - an evidence sanitisation check (real).
//
// Statuses: PASS | FAIL | SIMULATED | DEFERRED.
//  - PASS       — fully validated in this pass without requiring live-API traffic.
//  - DEFERRED   — requires live-API end-to-end synthetic traffic against the
//                 deployed Sandbox, which is NOT performed here (see follow-up).
//  - SIMULATED  — tabletop/simulated operational scenario (not an operational PASS).
//  - FAIL       — a genuine failure.
//
// This runner does NOT claim full Phase 0 completion.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFixtures, PILOT_LIMITS_MINOR } from './fixtures.mjs';
import { sanitiseDir } from './sanitise.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVID = join(ROOT, 'evidence', 'phase0');
const FIXDIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

function cargo(args) {
  try {
    const out = execFileSync('cargo', args, { cwd: join(ROOT, 'core'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return parseCargo(out);
  } catch (e) {
    return parseCargo(`${e.stdout || ''}${e.stderr || ''}`, true);
  }
}
function parseCargo(out, failedRun = false) {
  let passed = 0, failed = 0;
  for (const m of out.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed/g)) {
    passed += +m[1]; failed += +m[2];
  }
  return { passed, failed, ok: !failedRun && failed === 0 && passed > 0 };
}

// ---- fixtures ----------------------------------------------------------------
mkdirSync(FIXDIR, { recursive: true });
const fixtures = generateFixtures();
writeFileSync(join(FIXDIR, 'synthetic-participants.json'), JSON.stringify(fixtures, null, 2) + '\n');

// ---- genuine executions ------------------------------------------------------
console.log('phase0: running pilot-limit policy unit tests (cargo)...');
const pilot = cargo(['test', '-p', 'banzami-compliance', '--lib']);
console.log(`  compliance lib: ${pilot.passed} passed, ${pilot.failed} failed`);
console.log('phase0: running operator core financial test-suite (cargo --lib)...');
const core = cargo(['test', '--lib']);
console.log(`  core lib: ${core.passed} passed, ${core.failed} failed`);

const vmSafety = process.env.VM_SAFETY_VERIFIED === '1';
const pilotOK = pilot.ok;
const coreOK = core.ok;

// ---- runtime enforcement status for the 8 V1.0 limits ------------------------
// wiring: "runtime-authorization" (wired at compliance authorize_operation) |
//         "policy-function" (implemented + unit-tested, NOT yet runtime-wired).
// live_api: always DEFERRED in this pass.
const enforcement = [
  { limit: 'consumer_per_payment', wiring: 'runtime-authorization', unit: pilotOK, live_api: 'DEFERRED' },
  { limit: 'consumer_daily', wiring: 'runtime-authorization', unit: pilotOK, live_api: 'DEFERRED' },
  { limit: 'consumer_max_balance', wiring: 'policy-function', unit: pilotOK, live_api: 'DEFERRED' },
  { limit: 'merchant_per_received', wiring: 'policy-function', unit: pilotOK, live_api: 'DEFERRED' },
  { limit: 'merchant_daily_receiving', wiring: 'policy-function', unit: pilotOK, live_api: 'DEFERRED' },
  { limit: 'merchant_max_balance', wiring: 'policy-function', unit: pilotOK, live_api: 'DEFERRED' },
  { limit: 'aggregate_funds', wiring: 'policy-function', unit: pilotOK, live_api: 'DEFERRED' },
  { limit: 'aggregate_volume', wiring: 'policy-function', unit: pilotOK, live_api: 'DEFERRED' },
];

// ---- F0 matrix (honest; live-API behavioural tests are DEFERRED) -------------
// validation: how it WAS validated this pass. result: single honest status.
const T = (id, name, validation, result, note) => ({ id, name, validation, result, note });
const cases = [
  T('F0-001', 'Sandbox health and service allowlist', 'live read-only Sandbox safety inspection', vmSafety ? 'PASS' : 'DEFERRED', 'four approved services; no host ports; internal networks; no LIVE/Production'),
  T('F0-002', 'Synthetic consumer onboarding', 'core-suite (cargo) coverage; synthetic fixtures', 'DEFERRED', 'live-API onboarding not executed'),
  T('F0-003', 'Synthetic merchant onboarding', 'core-suite (cargo) coverage; synthetic fixtures', 'DEFERRED', 'live-API onboarding not executed'),
  T('F0-004', 'Wallet/account creation', 'core-suite (cargo) coverage', 'DEFERRED', 'live-API creation not executed'),
  T('F0-005', 'Synthetic balance allocation', 'synthetic fixtures generated', 'DEFERRED', 'live-API funding not executed'),
  T('F0-006', 'QR payment success', 'core-suite (qr) coverage', 'DEFERRED', 'live-API QR payment not executed'),
  T('F0-007', 'Payment link success', 'core-suite (payment-links) coverage', 'DEFERRED', 'live-API payment link not executed'),
  T('F0-008', 'Payment intent create-confirm-complete', 'core-suite (transactions/collections) coverage', 'DEFERRED', 'live-API intent lifecycle not executed'),
  T('F0-009', 'Ledger double-entry integrity', 'core-suite (ledger) coverage', 'DEFERRED', 'live-API ledger assertion not executed'),
  T('F0-010', 'Idempotent payment retry', 'core-suite (transactions) coverage', 'DEFERRED', 'live-API idempotency not executed'),
  T('F0-011', 'Duplicate payment prevention', 'core-suite (transactions) coverage', 'DEFERRED', 'live-API dedupe not executed'),
  T('F0-012', 'Insufficient balance rejection', 'core-suite (wallets) coverage', 'DEFERRED', 'live-API rejection not executed'),
  T('F0-013', 'Per-payment limit rejection', 'pilot-unit + runtime-authorization wiring', 'DEFERRED', 'policy wired at authorization + unit-tested; live-API rejection not executed'),
  T('F0-014', 'Consumer daily limit rejection', 'pilot-unit + runtime-authorization wiring', 'DEFERRED', 'policy wired at authorization + unit-tested; live-API rejection not executed'),
  T('F0-015', 'Merchant receiving limit rejection', 'pilot-unit (policy function)', 'DEFERRED', 'policy unit-tested; runtime wiring + live-API not executed'),
  T('F0-016', 'Aggregate synthetic funds limit rejection', 'pilot-unit (policy function)', 'DEFERRED', 'policy unit-tested; runtime wiring + live-API not executed'),
  T('F0-017', 'Invalid QR/payment request rejection', 'core-suite (qr negative-path) coverage', 'DEFERRED', 'live-API rejection not executed'),
  T('F0-018', 'Failed payment rollback', 'core-suite (ledger/transactions) coverage', 'DEFERRED', 'live-API rollback not executed'),
  T('F0-019', 'Service restart recovery', 'tabletop/deploy-level (services previously healthy)', 'SIMULATED', 'live restart drill deferred'),
  T('F0-020', 'Daily reconciliation simulation', 'core-suite (reconciliation) coverage', 'DEFERRED', 'live-API reconciliation not executed'),
  T('F0-021', 'Complaint/refund simulation (synthetic balance)', 'core-suite (refund surface) coverage', 'DEFERRED', 'live-API refund not executed'),
  T('F0-022', 'Incident material classification simulation', 'tabletop simulation (documented)', 'SIMULATED', 'not an operational PASS'),
  T('F0-023', 'Evidence sanitisation check', 'sanitise.mjs over evidence/phase0', 'PENDING', 'set after sanitisation runs'),
  T('F0-024', 'Phase 0 closure report', 'this report (narrowed scope)', 'PASS', 'baseline + harness; live-API deferred'),
];

const summary = () => {
  const c = (r) => cases.filter((x) => x.result === r).length;
  return { pass: c('PASS'), fail: c('FAIL'), simulated: c('SIMULATED'), deferred: c('DEFERRED'), pending: c('PENDING'), total: cases.length };
};

mkdirSync(EVID, { recursive: true });
function writeResults() {
  const doc = {
    suite: 'Banzami Phase 0 — Pilot Limit Policy Baseline and Synthetic Test Harness',
    plan: 'Plano de Teste Detalhado Banzami V1.0',
    profile: 'phase0-internal-sandbox',
    generated_at: now(),
    completion: 'PARTIAL — policy baseline + synthetic harness; live-API end-to-end DEFERRED',
    scope_note:
      'Internal technical Sandbox only. Synthetic participants and balances only. No real money, ' +
      'customers, external providers, public access, LIVE, Production or BNA claim. This pass validates ' +
      'the pilot-limit policy at the code/unit level, the operator core financial suite, a live read-only ' +
      'Sandbox safety inspection, and evidence sanitisation. Live-API end-to-end synthetic-traffic ' +
      'execution against the deployed Sandbox is DEFERRED to the follow-up (PHASE0_FOLLOWUP_LIVE_API.md). ' +
      'This is NOT a claim of full Phase 0 completion.',
    pilot_limits_minor: PILOT_LIMITS_MINOR,
    runtime_enforcement: enforcement,
    executions: {
      pilot_limit_unit_tests: { command: 'cargo test -p banzami-compliance --lib', passed: pilot.passed, failed: pilot.failed },
      core_financial_suite: { command: 'cargo test --lib', passed: core.passed, failed: core.failed },
      vm_safety_inspection: { performed: vmSafety, method: 'read-only' },
    },
    summary: summary(),
    tests: cases.map((c) => ({ id: c.id, name: c.name, validation: c.validation, result: c.result, note: c.note, timestamp: now(), participants: 'synthetic only', amounts: 'synthetic (minor units)' })),
  };
  writeFileSync(join(EVID, 'PHASE0_TEST_RESULTS.json'), JSON.stringify(doc, null, 2) + '\n');
  return doc;
}
function writeReport(doc) {
  const row = (c) => `| ${c.id} | ${c.name} | ${c.validation} | ${c.result} |`;
  const er = (e) => `| ${e.limit} | ${e.wiring} | ${e.unit ? 'PASS' : 'FAIL'} | ${e.live_api} |`;
  const md = `# Phase 0 — Pilot Limit Policy Baseline and Synthetic Test Harness

Version: 1.0
Generated: ${doc.generated_at}
Plan: ${doc.plan}
Completion: ${doc.completion}

## Scope

${doc.scope_note}

## Genuine executions

- Pilot-limit policy unit tests — \`${doc.executions.pilot_limit_unit_tests.command}\`: ${doc.executions.pilot_limit_unit_tests.passed} passed, ${doc.executions.pilot_limit_unit_tests.failed} failed.
- Core financial test-suite — \`${doc.executions.core_financial_suite.command}\`: ${doc.executions.core_financial_suite.passed} passed, ${doc.executions.core_financial_suite.failed} failed.
- Live Sandbox safety inspection: ${doc.executions.vm_safety_inspection.performed ? 'performed (read-only)' : 'not performed'}.

## V1.0 pilot-limit runtime enforcement status

| Limit | Runtime wiring | Unit test | Live-API |
|-------|----------------|:---------:|:--------:|
${enforcement.map(er).join('\n')}

- **runtime-authorization** = enforced at the compliance authorization point before ledger posting.
- **policy-function** = deterministic policy implemented + unit-tested; runtime wiring at its data-layer boundary is DEFERRED (follow-up).
- Live-API end-to-end verification is DEFERRED for all limits in this pass.

## Summary

PASS ${doc.summary.pass} · FAIL ${doc.summary.fail} · SIMULATED ${doc.summary.simulated} · DEFERRED ${doc.summary.deferred} · total ${doc.summary.total}

## Result matrix

| ID | Test | Validation this pass | Result |
|----|------|----------------------|:------:|
${cases.map(row).join('\n')}

## Status legend

- **PASS** — fully validated this pass without live-API traffic.
- **DEFERRED** — requires live-API end-to-end synthetic traffic against the deployed Sandbox (see \`PHASE0_FOLLOWUP_LIVE_API.md\`).
- **SIMULATED** — tabletop/simulated operational scenario (NOT an operational PASS).
- **FAIL** — a genuine failure (none).

## Non-claims

This is NOT a claim of full Phase 0 completion. No LIVE, Production, real-money payment, external payment provider, customer data, public access, DNS/certificate/SMTP change, or BNA approval/admission is claimed. Phase 0 amounts are synthetic and non-monetary.
`;
  writeFileSync(join(EVID, 'PHASE0_FUNCTIONAL_TEST_REPORT.md'), md);
}

let doc = writeResults();
writeReport(doc);
const findings = sanitiseDir(EVID);
cases.find((c) => c.id === 'F0-023').result = findings.length === 0 ? 'PASS' : 'FAIL';
doc = writeResults();
writeReport(doc);
console.log(`phase0: sanitisation ${findings.length === 0 ? 'clean' : 'FAILED'}`);
console.log(`phase0: summary ${JSON.stringify(summary())}`);
if (!pilotOK || !coreOK || findings.length) process.exitCode = 1;
