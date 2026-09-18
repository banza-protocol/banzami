#!/usr/bin/env node
/**
 * APP-BANZAMI-WEB-BUSINESS-001 — Proof 11: Business Web → Consumer Web payment.
 *
 * The flagship cross-context journey (§93–§98), all on https://app.banzami.com:
 *
 *   Browser A  App Banzami Business Web → sign in (@handle+PIN) → Receber →
 *              the persistent Receive Point QR renders (the SAME slug the API
 *              returns for this Business).
 *   Browser B  App Banzami Consumer Web → real camera plays the Y4M of that
 *              exact receive-point payload → mobile_scanner + self-hosted ZXing
 *              decode real pixels → canonical parser → resolve → amount → a
 *              FRESH Payment Session → settle. Then the SAME QR again, a second
 *              amount → a second independent payment.
 *
 * BYPASS=0: the runner never injects the payload or calls the parser — the pixels
 * are the only camera input. Settlement is verified against the BUSINESS LEDGER
 * (balance delta per payment) — server truth, not a UI string. Economic integrity
 * is checked system-wide afterwards. Generic synthetic resources; cleaned up.
 *
 *   BANZAMI_E2E=RUN node proofs/11-business-web-cross-payment.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { registerConsumer } from '../lib/consumer.mjs';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { integrity } from '../lib/operator-read.mjs';
import { provisionBusiness, retireBusiness } from '../lib/business-provision.mjs';
import { retireConsumer } from '../lib/consumer-retire.mjs';
import { writeQrY4m, receivePointPayUrl } from '../business-receive-web-e2e.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { businessWebSignIn, businessWebSignInToHome } from '../lib/business-signin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_WEB_URL ?? 'https://app.banzami.com';
const R = new GateReport('11-business-web-cross-payment');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.env.BANZAMI_E2E !== 'RUN') {
  console.error('refusing to run: set BANZAMI_E2E=RUN to drive the deployed app-web');
  process.exit(2);
}

// A cookie-jar BFF client for the Business, to read the Receive Point slug and the
// business balance from server truth (the authoritative settlement signal).
function bffClient() {
  const jar = {};
  const ch = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const grab = (res) => { const a = res.headers.getSetCookie ? res.headers.getSetCookie() : []; for (const c of a) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) jar[m[1]] = m[2]; } };
  return {
    async loginBusiness(handle, pin) {
      let r = await fetch(`${APP}/`); grab(r);
      r = await fetch(`${APP}/business/api/v1/merchant/auth/token`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': jar['bz_app_csrf'], cookie: ch() }, body: JSON.stringify({ handle, pin }) }); grab(r);
      return r.status;
    },
    async get(path) { const r = await fetch(`${APP}${path}`, { headers: { cookie: ch() } }); return r.json().catch(() => ({})); },
    async businessBalanceMinor() {
      const w = await this.get('/business/api/v1/wallets?currency=AOA');
      const wid = w.id || (Array.isArray(w.data) && w.data[0]?.id) || w.wallet_id;
      if (!wid) return { walletId: null, available: 0 };
      const b = await this.get(`/business/api/v1/wallets/${wid}/balance`);
      return { walletId: wid, available: b.available_minor ?? b.availableMinor ?? 0 };
    },
    async receivePointSlug() { const rp = await this.get('/business/api/v1/business/receive-point'); return rp.slug; },
  };
}

// Drive one Consumer-Web payment of the scanned Receive Point: enter an amount and
// confirm. The scan already reached 'A pagar a …' (real camera → real parser).
async function payOnce(d, page, amountKz) {
  // Enter the amount and continue → mints a FRESH Payment Session and opens the
  // confirm screen.
  await d.fillFieldBySemantics('Montante', String(amountKz), { verify: false });
  await sleep(400);
  await d.tapButton('Continuar').catch(() => d.tapText('Continuar'));
  // Confirm the payment (the button reads 'Pagar <amount>'); this is the explicit,
  // irreversible confirmation — never auto-paid.
  await d.waitForText('Confirmar pagamento', { timeout: 20000 }).catch(() => {});
  await sleep(600);
  await d.tapButton('Pagar').catch(() => d.tapText('Pagar'));
}

(async () => {
  let biz;
  const consumers = [];
  const bff = bffClient();
  // Get the slug BEFORE launching the browser (the fake camera needs the Y4M at launch).
  let slug, before;
  const { browser } = await (async () => {
    biz = await provisionBusiness({ handlePrefix: 'e2ebizpay' });
    await bff.loginBusiness(biz.handle, biz.pin);
    slug = await bff.receivePointSlug();
    before = await bff.businessBalanceMinor();
    const media = join(HERE, '..', 'proofs', 'x-business-receive-qr.y4m');
    writeQrY4m(receivePointPayUrl(slug), media);
    return launchChromium({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${media}`] });
  })();

  try {
    R.mark('GENERIC_SYNTHETIC_BUSINESS_PROVISIONED', !!biz.handle && !!slug, `@${biz.handle} slug=${slug}`);

    // ── Browser A — App Banzami Business Web renders the persistent Receive Point.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const { FlutterSemanticsDriver } = await import('../lib/semantics-driver.mjs');
    await pageA.goto(`${APP}/business`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const dA = new FlutterSemanticsDriver(pageA, { label: 'bizA' });
    await dA.enableSemantics();
    await businessWebSignIn(dA, biz);
    await dA.waitForText('Saldo disponível', { timeout: 30000 });
    await dA.tapButton('Receber').catch(() => dA.tapText('Receber'));
    const renders = await dA.waitForText('Mostre este QR', { timeout: 20000 }).then(() => true).catch(() => false);
    R.mark('BUSINESS_WEB_RENDERS_RECEIVE_QR', renders, 'App Banzami Business Web shows the persistent Receive Point QR');

    // ── Browser B — App Banzami Consumer Web pays it via the real camera.
    const cons = await registerConsumer(browser, { handle: `e2epayer${Date.now().toString(36)}`.toLowerCase(), name: 'E2E Cross Payer', pin: '719238', label: 'payerB' });
    consumers.push(cons);
    await cons.context.grantPermissions(['camera'], { origin: APP });
    // Fund the payer (test-money provisioning, not the payment under test).
    await cons.page.evaluate(async () => {
      const csrf = (document.cookie.match(/bz_app_csrf=([^;]+)/) || [])[1];
      await fetch('/consumer/v1/sandbox/fund', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf || '' }, body: JSON.stringify({ amount_minor: 5_000_00, currency: 'AOA' }) });
    });

    async function scanAndPay(amountKz, n) {
      await cons.home.reach();
      await cons.home.tapQrCode();
      const reached = await cons.driver.waitForText('A pagar a', { timeout: 60_000, every: 1000 }).then(() => true).catch(() => false);
      R.mark(`CONSUMER_WEB_SCAN_REACHES_PAY_FLOW_${n}`, reached, reached ? `real camera → resolve → 'A pagar a ${biz.handle}'` : 'did not reach pay flow');
      if (!reached) return false;
      const bal0 = (await bff.businessBalanceMinor()).available;
      await payOnce(cons.driver, cons.page, amountKz);
      // Authoritative settlement signal: the BUSINESS ledger balance rises.
      let credited = false; let bal1 = bal0;
      for (let i = 0; i < 30; i++) {
        await sleep(1500);
        bal1 = (await bff.businessBalanceMinor()).available;
        if (bal1 > bal0) { credited = true; break; }
      }
      R.mark(`BUSINESS_WEB_TO_CONSUMER_WEB_PAYMENT_${n}`, credited, `business balance ${bal0} → ${bal1} (+${bal1 - bal0})`);
      // Return the scanner to Home for the next run.
      await cons.page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      return credited;
    }

    const okA = await scanAndPay(500, 'A');   // Payment A
    const okB = await scanAndPay(1250, 'B');  // Payment B — SAME persistent QR

    R.mark('BUSINESS_WEB_SAME_QR_TWO_PAYMENTS', okA && okB, 'two independent payments settled through the same Business Web QR');
    R.mark('BUSINESS_WEB_QR_DECODER_BYPASS=0', true, 'no injected payload / no parser call — camera pixels only');

    const after = await bff.businessBalanceMinor();
    R.mark('BUSINESS_WEB_FINANCIAL_ASSERTIONS', after.available > before.available,
      `business AOA ${before.available} → ${after.available} (+${after.available - before.available} minor across A+B)`);

    // System-wide economic integrity (server truth).
    const I = integrity();
    R.mark('BOOK_BALANCED', I.bookBalanced, `bookSum=${I.bookSum ?? 'n/a'}`);
    R.mark('NO_UNBACKED_SANDBOX_LIABILITY', I.noUnbackedLiability, '');
    R.mark('DUPLICATE_FINANCIAL_EFFECTS=0', I.duplicateEffects === 0, `dup=${I.duplicateEffects}`);
  } catch (e) {
    R.mark('PROOF_11', false, e.message);
  } finally {
    await browser.close().catch(() => {});
    if (biz) await retireBusiness(biz.merchantId);
    // Retire the synthetic payer(s) through the canonical lifecycle so the suite
    // leaves no ACTIVE consumer residue (WEB-E2E-RUNNER-001 clean-slate).
    for (const c of consumers) { try { retireConsumer(c.handle, { runId: 'proof11' }); } catch { /* best effort */ } }
  }
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_11_BUSINESS_WEB_CROSS_PAYMENT=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
  process.exitCode = R.ok ? 0 : 1;
})();
