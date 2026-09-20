#!/usr/bin/env node
/**
 * WEB-E2E-RUNNER-001 — Proof 03: invalid payment deep-link (item 12).
 *
 * A fresh visitor opens app.banzami.com/pay/<invalid>. The app must boot (no
 * crash, no blank screen), and once a session exists the parked link must
 * resolve to a truthful not-found/invalid state — never a payment, never leaked
 * private information.
 *
 *   node proofs/03-invalid-deeplink.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { freshContext, APP } from '../lib/consumer.mjs';
import { WelcomePage } from '../pages/welcome.mjs';
import { CreateAccountPage } from '../pages/create-account.mjs';
import { PinPage } from '../pages/pin.mjs';
import { PaymentRequestPage } from '../pages/payment-request.mjs';
import { retireConsumer } from '../lib/consumer-retire.mjs';
import { GateReport, runScopedPin, freshHandle } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';

const R = new GateReport('03-invalid-deeplink');
const INVALID = 'pl_nonexistent_' + Math.random().toString(36).slice(2, 10);
const pin = runScopedPin();
const handle = freshHandle('e2ei');

let browser;
try {
  ({ browser } = await launchChromium());
  const { context, page, driver } = await freshContext(browser, { url: `${APP}/pay/${INVALID}`, label: 'invalid' });

  // 1. Three SEPARATE properties, because they failed together for one reason
  //    and only one of them was about the product.
  //
  //    In BZV-20260920-0001 both boot assertions failed while all three
  //    invalid-deeplink safety assertions passed. The app had booted and
  //    painted; accessibility activation was late. Deriving "did it boot" and
  //    "is it blank" from the semantics tree made a slow screen reader look
  //    like a broken application.
  //
  //    So: boot is proven from the engine's own mount, not-blank from pixels,
  //    and semantics readiness stands on its own and carries its timings.

  // 1a. BOOT — structure only. True before anything is ever clicked.
  const boot = await driver.appBooted();
  R.mark('APP_BOOTS_ON_DEEPLINK', boot.booted,
    `flutter-view ${boot.viewW}×${boot.viewH} mounted in ${boot.ms}ms (bound ${boot.bound_ms}ms) · glass-pane=${boot.glassPane} · scene-host=${boot.sceneHost}`);

  // 1b. NOT BLANK — pixels. With semantics off this build exposes no DOM text
  //     and no canvas, so the screenshot is the only thing that can tell a
  //     painted screen from a flat one.
  const px = await driver.renderedPixels();
  R.mark('APP_NO_BLANK_SCREEN', px.painted,
    `${px.bytesPerPixel} bytes/pixel of lossless frame (blank ≈ 0.0047, threshold ${px.threshold}) at ${px.width}×${px.height}`);

  // 1c. SEMANTICS — its own gate, and its own budget. Never again folded into
  //     a claim about the product.
  let semanticsReady = false;
  try {
    await driver.enableSemantics();
    semanticsReady = await driver.semanticsActive();
  } catch (e) {
    semanticsReady = false;
    R.note('SEMANTICS_TIMEOUT', `${e.phase ?? 'unknown'} — ${driver.timingLine}`);
  }
  R.mark('SEMANTICS_ACTIVATION_READY', semanticsReady, driver.timingLine);

  // The accessible text is still what the rest of the proof reads, but its
  // absence is now attributed to activation rather than to the application.
  const bootText = semanticsReady ? await driver.visibleText() : '';

  const pr = new PaymentRequestPage(driver);
  let state = await pr.resolve({ timeout: 8000 });

  // 2. If it needs auth first (parked slug), register, which drains it post-login.
  if (state === 'unresolved' && (bootText.includes('Criar conta') || await driver.hasText('Criar conta'))) {
    const welcome = new WelcomePage(driver);
    const create = new CreateAccountPage(driver);
    const pinPage = new PinPage(driver);
    await welcome.reach();
    await welcome.tapCreateAccount();
    await create.reach();
    await create.fill({ handle, name: 'E2E Invalido' });
    await create.submit();
    await pinPage.createDuringOnboarding(pin);
    await page.waitForTimeout(3000);
    state = await pr.resolve({ timeout: 20000 });
  }

  // 3. The resolved state is a truthful not-found/invalid — never a payment.
  const finalText = await driver.visibleText();
  const truthful = state === 'not_found' || state === 'invalid'
    || /não encontrado|inválido/i.test(finalText);
  R.mark('PLAYWRIGHT_INVALID_PAYMENT_ARTIFACT', truthful, `state=${state}`);
  // No pay affordance and no crash trace / private data leak.
  const noPay = !/Confirmar pagamento/.test(finalText);
  R.mark('INVALID_DEEPLINK_NO_PAYMENT', noPay, noPay ? 'no pay UI offered' : 'PAY UI shown for invalid slug!');
  const noLeak = !new RegExp(INVALID.replace(/[^a-z0-9]/gi, '')).test('') && !/exception|stack trace|null check/i.test(finalText);
  R.mark('INVALID_DEEPLINK_NO_PRIVATE_INFO', noLeak, 'no exception/trace leaked');

  await context.close();
} catch (e) {
  R.mark('PROOF_03', false, e.message);
} finally {
  // A consumer is created only if the invalid link required auth first; retire
  // it if so (a no-op when none was registered).
  try { retireConsumer(handle, { runId: 'proof03' }); } catch { /* best effort */ }
  if (browser) await browser.close().catch(() => {});
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_03_INVALID_DEEPLINK=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail)`);
  console.log(`evidence: ${out}`);
  process.exitCode = R.ok ? 0 : 1;
}
