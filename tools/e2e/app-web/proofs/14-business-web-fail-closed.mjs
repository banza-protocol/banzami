#!/usr/bin/env node
/**
 * APP-BANZAMI-WEB-BUSINESS-001 — Proof 14: disabled/suspended Receive Point fails
 * closed on the real Web camera path (§14–§16).
 *
 * For each case the Business Web QR is rendered, then the receive point is taken
 * down through the CANONICAL lifecycle (disable endpoint / Business suspend — no
 * DB writes). A Consumer Web session then scans the OLD QR through the real camera
 * (mobile_scanner + self-hosted ZXing, BYPASS=0). The app must NOT reach the pay
 * flow — it fails closed.
 *
 *   BANZAMI_E2E=RUN node proofs/14-business-web-fail-closed.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { registerConsumer } from '../lib/consumer.mjs';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { provisionBusiness, retireBusiness } from '../lib/business-provision.mjs';
import { writeQrY4m, receivePointPayUrl } from '../business-receive-web-e2e.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_WEB_URL ?? 'https://app.banzami.com';
const R = new GateReport('14-business-web-fail-closed');
if (process.env.BANZAMI_E2E !== 'RUN') { console.error('set BANZAMI_E2E=RUN'); process.exit(2); }

function bffLoginBusiness(biz) {
  const s = {}; const ch = () => Object.entries(s).map(([k, v]) => `${k}=${v}`).join('; ');
  const grab = (r) => { const a = r.headers.getSetCookie ? r.headers.getSetCookie() : []; for (const c of a) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) s[m[1]] = m[2]; } };
  return (async () => {
    grab(await fetch(`${APP}/`));
    let r = await fetch(`${APP}/business/api/v1/merchant/auth/token`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': s['bz_app_csrf'], cookie: ch() }, body: JSON.stringify({ handle: biz.handle, pin: biz.pin }) }); grab(r);
    const slug = (await (await fetch(`${APP}/business/api/v1/business/receive-point`, { headers: { cookie: ch() } })).json()).slug;
    return { slug, disable: () => fetch(`${APP}/business/api/v1/business/receive-point/disable`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': s['bz_app_csrf'], cookie: ch() }, body: '{}' }) };
  })();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One case: render the Business Web QR, prove it is payable (control scan reaches
// 'A pagar a'), then take it down through the canonical lifecycle, and rescan the
// SAME QR on the real camera — it must now fail closed (never reach the pay flow).
// One consumer registration per case, lightly retried against the BFF auth limit.
async function failClosedCase(name, prep) {
  const biz = await provisionBusiness({ handlePrefix: `e2efc${name}` });
  const sess = await bffLoginBusiness(biz);
  const media = join(HERE, '..', 'proofs', `x-failclosed-${name}.y4m`);
  writeQrY4m(receivePointPayUrl(sess.slug), media);
  const { browser } = await launchChromium({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${media}`] });
  try {
    let cons;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { cons = await registerConsumer(browser, { handle: `e2efc${name}${Date.now().toString(36)}`.toLowerCase(), name: 'E2E FC', pin: '719238', label: `fc-${name}` }); break; }
      catch (e) { if (attempt === 1) throw e; await sleep(90000); }
    }
    await cons.context.grantPermissions(['camera'], { origin: APP });
    // Control: while ACTIVE the same QR reaches the pay flow (proves camera+consumer OK).
    await cons.home.reach();
    await cons.home.tapQrCode();
    const control = await cons.driver.waitForText('A pagar a', { timeout: 45000, every: 1000 }).then(() => true).catch(() => false);
    await cons.page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    // Take the Receive Point down (disable / suspend the Business) — canonical, no DB.
    await prep(biz, sess);
    await sleep(2000);
    // Rescan the SAME QR — must fail closed.
    await cons.home.reach();
    await cons.home.tapQrCode();
    const reached = await cons.driver.waitForText('A pagar a', { timeout: 25000, every: 1000 }).then(() => true).catch(() => false);
    const txt = await cons.driver.visibleText();
    return { control, reached, txt: txt.replace(/\s+/g, ' ').slice(0, 120), biz };
  } finally {
    await browser.close().catch(() => {});
  }
}

(async () => {
  const toRetire = [];
  try {
    // §14 — disabled Receive Point.
    const dis = await failClosedCase('disabled', async (_b, sess) => { await sess.disable(); });
    toRetire.push(dis.biz.merchantId);
    R.mark('DISABLED_CONTROL_SCAN_PAYABLE_WHILE_ACTIVE', dis.control === true, dis.control ? 'active QR reached the pay flow before disable' : 'control scan did not reach pay flow');
    R.mark('BUSINESS_WEB_DISABLED_RECEIVE_POINT_E2E', dis.control === true && dis.reached === false, dis.reached ? `REACHED pay flow (leak): ${dis.txt}` : `failed closed after disable: ${dis.txt}`);

    // §15 — suspended Business.
    const sus = await failClosedCase('suspended', async (b) => { await retireBusiness(b.merchantId); });
    toRetire.push(sus.biz.merchantId);
    R.mark('SUSPENDED_CONTROL_SCAN_PAYABLE_WHILE_ACTIVE', sus.control === true, sus.control ? 'active QR reached the pay flow before suspend' : 'control scan did not reach pay flow');
    R.mark('BUSINESS_WEB_SUSPENDED_BUSINESS_E2E', sus.control === true && sus.reached === false, sus.reached ? `REACHED pay flow (leak): ${sus.txt}` : `failed closed after suspend: ${sus.txt}`);

    R.mark('BUSINESS_WEB_RECEIVE_POINT_STATE_TRUTH', dis.reached === false && sus.reached === false, 'a torn-down Receive Point is never payable from a stale QR');
  } catch (e) {
    R.mark('PROOF_14', false, e.message);
  } finally {
    for (const id of toRetire) await retireBusiness(id);
  }
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_14_BUSINESS_WEB_FAIL_CLOSED=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
  process.exitCode = R.ok ? 0 : 1;
})();
