#!/usr/bin/env node
/**
 * A measurement that failed is not a measurement of zero.
 *
 * proof 06 read a balance, got null, coerced it with `?? 0`, and waited 25 s
 * for a consumer holding 10 000 Kz to display 100. Two realtime gates then
 * reported "B did not update within 25s" — a product accusation manufactured
 * out of a missing reading. The product was fine; the harness could not see it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROOFS = join(repo, 'tools/e2e/app-web/proofs');
let failures = 0;
const check = (t, ok, d = '') => { if (ok) return console.log(`  ✓ ${t}`); console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`); failures++; };

console.log('\nmeasurement honesty — a failed read is not a zero\n');

const { requireBalanceBaseline, BalanceBaselineUnavailable } =
  await import('./e2e/app-web/lib/balance-baseline.mjs');

check('a real reading is returned as itself',
  (await requireBalanceBaseline(() => 10_000, { timeoutMs: 200 })) === 10_000);

let n = 0;
check('a reading that arrives late is waited for',
  (await requireBalanceBaseline(() => (++n < 3 ? null : 250), { timeoutMs: 3000, everyMs: 20 })) === 250);

for (const bad of [null, undefined, NaN, '10000', {}]) {
  let threw = null, returned;
  try { returned = await requireBalanceBaseline(() => bad, { label: 'X', timeoutMs: 120, everyMs: 20 }); }
  catch (e) { threw = e; }
  check(`an unreadable balance (${String(bad)}) never becomes a number`,
    threw instanceof BalanceBaselineUnavailable && returned === undefined,
    `returned ${JSON.stringify(returned)}`);
}

check('…and the failure is named so it cannot be mistaken for a product fault',
  await requireBalanceBaseline(() => null, { timeoutMs: 80, everyMs: 20 })
    .then(() => null).catch((e) => e.code) === 'BALANCE_BASELINE_UNAVAILABLE');

check('a reader that throws is treated as unreadable, not as an exception',
  await requireBalanceBaseline(() => { throw new Error('boom'); }, { timeoutMs: 80, everyMs: 20 })
    .then(() => 'returned').catch((e) => e.code) === 'BALANCE_BASELINE_UNAVAILABLE');

/* ── and no proof may reintroduce the coercion ───────────────────────────── */

const offenders = [];
for (const f of readdirSync(PROOFS).filter((x) => x.endsWith('.mjs'))) {
  const src = readFileSync(join(PROOFS, f), 'utf8');
  // `(<something>Balance|before|baseline) ?? <number>` — a measurement with a
  // default. The named-variable form is what proof 06 actually had.
  for (const m of src.matchAll(/\b(\w*[Bb]alance\w*|before|baseline|\w*Before)\s*\?\?\s*-?\d/g)) {
    offenders.push(`${f}: ${m[0]}`);
  }
}
check('no proof defaults a balance reading to a number', offenders.length === 0, offenders.join('; '));

const p06 = readFileSync(join(PROOFS, '06-realtime-resilience.mjs'), 'utf8');
check('proof 06 requires a baseline before asserting anything about realtime',
  /B_BALANCE_BASELINE_READY/.test(p06) && /C_BALANCE_BASELINE_READY/.test(p06),
  'baseline readiness is its own phase, so its failure is not reported as a realtime failure');
check('…and derives its target from the baseline it read',
  /waitForBalance\(bHome, before \+ 100/.test(p06) && /waitForBalance\(cHome, cBefore \+ 100/.test(p06));
check('…and says what the balance stayed at when it does not move',
  /B stayed at \$\{before\} Kz/.test(p06),
  '"did not update within 25s" told nobody what it had been watching');

/* ── A3 · a claim about the product must not rest on the instrument ──────── */

// BZV-20260920-0001: S05-LNK-001 failed APP_BOOTS_ON_DEEPLINK and
// APP_NO_BLANK_SCREEN while every invalid-deeplink safety assertion passed.
// Both were computed from the semantics tree, so a late screen reader was
// reported as an application that did not boot and a screen that was blank.
// Neither was true.
const p03 = readFileSync(join(PROOFS, '03-invalid-deeplink.mjs'), 'utf8');
const driver = readFileSync(
  join(PROOFS, '..', 'lib', 'semantics-driver.mjs'), 'utf8');

check('boot is proven from the engine mount, not from semantics',
  /appBooted\(\)/.test(p03) && /APP_BOOTS_ON_DEEPLINK', boot\.booted/.test(p03),
  'flutter-view + glass-pane + scene host exist before any placeholder is clicked');
check('not-blank is proven from pixels, not from accessible text',
  /renderedPixels\(\)/.test(p03) && /APP_NO_BLANK_SCREEN', px\.painted/.test(p03),
  'with semantics off this build exposes no DOM text and no canvas, so only a frame can answer it');
check('semantics readiness is its own gate',
  /SEMANTICS_ACTIVATION_READY/.test(p03),
  'so that its failure is attributed to activation rather than to the application');
check('neither product assertion reads visibleText/semanticsActive',
  !/APP_BOOTS_ON_DEEPLINK[^\n]*(visibleText|semanticsActive)/.test(p03)
  && !/APP_NO_BLANK_SCREEN[^\n]*(bootText|visibleText)/.test(p03));

// The forensics the next reader needs, present on the failure path — a driver
// that reports timings only when it succeeds is silent on the one run that
// needs explaining.
for (const field of ['semantics_dispatches', 'semantics_elapsed_ms', 'timeout_phase', 'timeout_bound_ms']) {
  check(`driver timing carries ${field}`, new RegExp(`${field}:`).test(driver));
}
check('the activation timeout records its forensics BEFORE throwing',
  /this\.timeoutPhase = 'SEMANTICS_ACTIVATION';[\s\S]{0,200}throw new DriverPhaseTimeout/.test(driver));
check('the activation bound was not simply raised',
  /const ACTIVATION_BUDGET_MS = 20_000;/.test(driver),
  'the bound is a question for measured distribution; widening it silently would erase the evidence');

console.log(failures === 0
  ? `\n✓ E2E_MEASUREMENT_HONESTY=PASS\n`
  : `\n✗ E2E_MEASUREMENT_HONESTY=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
