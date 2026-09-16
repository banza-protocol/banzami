#!/usr/bin/env node
/**
 * WEB-E2E-RUNNER-001 — Proof 02: Web→Web P2P through the real Flutter UI.
 *
 * Two fresh consumers in two isolated browser contexts, each registered through
 * the real UI. Consumer A sends to Consumer B via Enviar → recipient → amount →
 * review → Confirmar envio. Value conservation is asserted from BOTH the UI
 * balances and a canonical read-only ledger read (never screenshots alone).
 *
 *   node proofs/02-web-to-web-p2p.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { registerConsumer } from '../lib/consumer.mjs';
import { SendPage } from '../pages/send.mjs';
import { ReceiptPage } from '../pages/receipt.mjs';
import { GateReport, runScopedPin, freshHandle } from '../lib/report.mjs';
import { consumerBalanceMinor } from '../lib/operator-read.mjs';
import { retireConsumer } from '../lib/consumer-retire.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';

const R = new GateReport('02-web-to-web-p2p');
const AMOUNT_KZ = 2500;                 // whole Kwanza
const AMOUNT_MINOR = AMOUNT_KZ * 100;

const A = { handle: freshHandle('e2ea'), name: 'E2E Alice', pin: runScopedPin() };
const B = { handle: freshHandle('e2eb'), name: 'E2E Bruno', pin: runScopedPin() };

let browser;
try {
  ({ browser } = await launchChromium());

  const ca = await registerConsumer(browser, { ...A, label: 'A' });
  const cb = await registerConsumer(browser, { ...B, label: 'B' });
  R.mark('CONSUMER_BROWSER_CONTEXT_ISOLATION', ca.context !== cb.context, 'two isolated contexts');
  R.mark('PUBLIC_WEB_MULTIUSER_E2E', true, `A=@${A.handle} B=@${B.handle} both registered via UI`);

  // Canonical balances before.
  const aBefore = consumerBalanceMinor(A.handle);
  const bBefore = consumerBalanceMinor(B.handle);
  R.note('CANONICAL_BALANCES_BEFORE', `A=${aBefore} B=${bBefore} minor`);

  // A sends to B through the real Send UI.
  await ca.home.tapEnviar();
  const send = new SendPage(ca.driver);
  await send.reach();
  await send.fill({ recipientHandle: B.handle, amountKz: AMOUNT_KZ });
  await send.continue();
  await send.confirm();

  const receiptA = new ReceiptPage(ca.driver);
  const success = await receiptA.waitForSuccess({ timeout: 25000 });
  R.mark('P2P_UI_SUCCESS_CONFIRMATION', Boolean(success), `A saw "${success}"`);
  await receiptA.done();

  // Canonical balances after.
  const aAfter = consumerBalanceMinor(A.handle);
  const bAfter = consumerBalanceMinor(B.handle);
  R.note('CANONICAL_BALANCES_AFTER', `A=${aAfter} B=${bAfter} minor`);

  const aDebited = aBefore - aAfter;
  const bCredited = bAfter - bBefore;
  R.mark('PLAYWRIGHT_WEB_TO_WEB_P2P',
    aDebited === AMOUNT_MINOR && bCredited === AMOUNT_MINOR,
    `A debited ${aDebited}, B credited ${bCredited}, expected ${AMOUNT_MINOR}`);

  // Value conservation: total eligible participant value unchanged (P2P is
  // fee-neutral in the canonical economic model).
  const conserved = (aBefore + bBefore) === (aAfter + bAfter);
  R.mark('WEB_INTERNAL_P2P_VALUE_CONSERVATION', conserved,
    `before=${aBefore + bBefore} after=${aAfter + bAfter} minor`);

  // UI corroboration: B's Home now shows the higher balance.
  await cb.page.reload({ waitUntil: 'domcontentloaded' });
  await cb.home.reach();
  const bUi = await cb.home.readBalance();
  R.mark('P2P_RECIPIENT_UI_BALANCE', bUi !== null && bUi * 100 === bAfter,
    `B Home shows ${bUi} Kz (ledger ${bAfter} minor)`);

  await ca.context.close();
  await cb.context.close();
} catch (e) {
  R.mark('PROOF_02', false, e.message);
} finally {
  try { retireConsumer(A.handle, { runId: 'proof02a' }); retireConsumer(B.handle, { runId: 'proof02b' }); } catch { /* best effort */ }
  if (browser) await browser.close().catch(() => {});
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_02_WEB_TO_WEB_P2P=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail)`);
  console.log(`evidence: ${out}`);
  process.exitCode = R.ok ? 0 : 1;
}
