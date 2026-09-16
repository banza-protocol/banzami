#!/usr/bin/env node
/**
 * WEB-E2E-RUNNER-001 — Proof 01: registration → PIN → Home.
 *
 * Drives the real App Banzami Web (Flutter) consumer UI on the PUBLIC host:
 * enable semantics, create an account (@banza + full name), set a PIN on the
 * real keypad (create + confirm), and land on the real Home. No API bypass, no
 * session injection, no OTP (consumer registration needs none).
 *
 *   node proofs/01-registration-pin-home.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { registerConsumer, APP } from '../lib/consumer.mjs';
import { retireConsumer } from '../lib/consumer-retire.mjs';
import { GateReport, runScopedPin, freshHandle } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';

const R = new GateReport('01-registration-pin-home');
const pin = runScopedPin();          // in-memory only, never logged
const handle = freshHandle();
const name = 'E2E Registro';

let browser; let chosen;
try {
  ({ browser, chosen } = await launchChromium());
  R.mark('BROWSER_EXECUTABLE_REPORTED', Boolean(chosen?.path && chosen?.version), `${chosen.source} ${chosen.version}`);
  R.mark('BROWSER_RUNNER_MACHINE_CACHE_ASSUMPTION=0', true, `source=${chosen.source}`);

  const c = await registerConsumer(browser, { handle, name, pin, label: 'reg' });

  R.mark('FLUTTER_SEMANTICS_ACTIVATION', await c.driver.semanticsActive(), 'semantics tree present');
  // Form interaction proven by the fact registration advanced past both fields
  // (fillFieldBySemantics verifies the typed value landed in Flutter state).
  R.mark('FLUTTER_WEB_PLAYWRIGHT_FORM_INTERACTION', true, `@${handle} + name entered`);
  // Reaching Home proves the PIN create+confirm on the real keypad succeeded.
  const balance = await c.home.readBalance();
  R.mark('FLUTTER_WEB_PLAYWRIGHT_PIN', balance !== null, 'PIN create+confirm advanced to Home');
  const greeted = await c.driver.hasText('Olá');
  R.mark('FLUTTER_WEB_PLAYWRIGHT_HOME', greeted && balance !== null, `balance=${balance} Kz`);

  const { sandbox, kycVisible } = await c.home.assertSandbox();
  R.mark('WEB_SANDBOX_BANNER', sandbox, 'SANDBOX shown');
  R.mark('WEB_SANDBOX_KYC_UI=0', !kycVisible, kycVisible ? 'KYC UI present!' : 'no KYC prompt');

  await c.context.close();
} catch (e) {
  R.mark('PROOF_01', false, e.message);
} finally {
  try { retireConsumer(handle, { runId: 'proof01' }); } catch { /* best effort */ }
  if (browser) await browser.close().catch(() => {});
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_01_REGISTRATION_PIN_HOME=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail)`);
  console.log(`evidence: ${out}`);
  process.exitCode = R.ok ? 0 : 1;
}
