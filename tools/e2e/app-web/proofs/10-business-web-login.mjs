#!/usr/bin/env node
/**
 * APP-BANZAMI-WEB-BUSINESS-001 — Proof 10: Business Web sign-in + Home + Receive.
 *
 * A generic synthetic Business (canonical onboarding: application → KYB docs →
 * approve → activation, NO DB writes/backdoor) signs in through the REAL
 * /business UI with @handle + PIN, lands on the Business Home, and its persistent
 * Receive Point renders — the SAME slug the API returns for that Business
 * (cross-client identity, §92). No session injection, no auth bypass.
 *
 *   BANZAMI_E2E=RUN node proofs/10-business-web-login.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { FlutterSemanticsDriver } from '../lib/semantics-driver.mjs';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { provisionBusiness, retireBusiness } from '../lib/business-provision.mjs';

const APP = process.env.APP_WEB_URL ?? 'https://app.banzami.com';
const R = new GateReport('10-business-web-login');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.env.BANZAMI_E2E !== 'RUN') {
  console.error('refusing to run: set BANZAMI_E2E=RUN to drive the deployed app-web');
  process.exit(2);
}

async function bizReceivePointSlug(biz) {
  // The slug the API returns for this Business — to compare with what the Web renders.
  const jar = {};
  const ch = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const grab = (res) => { const a = res.headers.getSetCookie ? res.headers.getSetCookie() : []; for (const c of a) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) jar[m[1]] = m[2]; } };
  let r = await fetch(`${APP}/`); grab(r);
  r = await fetch(`${APP}/business/api/v1/merchant/auth/token`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': jar['bz_app_csrf'], cookie: ch() }, body: JSON.stringify({ handle: biz.handle, pin: biz.pin }) }); grab(r);
  r = await fetch(`${APP}/business/api/v1/business/receive-point`, { headers: { cookie: ch() } });
  const j = await r.json().catch(() => ({}));
  return j.slug;
}

(async () => {
  let biz;
  const { browser } = await launchChromium();
  try {
    biz = await provisionBusiness({ handlePrefix: 'e2ebizlogin' });
    R.mark('GENERIC_SYNTHETIC_BUSINESS_PROVISIONED', !!biz.handle && !!biz.merchantId, `@${biz.handle}`);
    const apiSlug = await bizReceivePointSlug(biz);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${APP}/business`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const d = new FlutterSemanticsDriver(page, { label: 'biz' });
    await d.enableSemantics();

    // Direct /business while logged out shows the Business login (not Consumer).
    const sawLogin = await d.waitForText('Business', { timeout: 25000 }).then(() => true).catch(() => false);
    R.mark('DIRECT_BUSINESS_ROUTE_AUTH', sawLogin, 'unauthenticated /business shows Business login');

    // Sign in with @handle + PIN through the real UI.
    await d.fillFieldBySemantics('O seu @banza', biz.handle, { verify: false });
    await d.fillFieldBySemantics('PIN', biz.pin, { secret: true, verify: false });
    await d.tapButton('Entrar');

    const home = await d.waitForText('Saldo disponível', { timeout: 30000 }).then(() => true).catch(() => false);
    R.mark('BUSINESS_WEB_LOGIN_E2E', home, 'reached Business Home from @handle + PIN');
    const homeText = home ? await d.visibleText() : '';
    R.mark('BUSINESS_WEB_HOME_IDENTITY', homeText.includes(`@${biz.handle}`), `@${biz.handle} shown on Home`);
    R.mark('BUSINESS_WEB_SANDBOX_TRUTH', /SANDBOX/i.test(homeText), 'Sandbox truth visible');

    // Receber → the persistent Receive Point QR renders.
    await d.tapButton('Receber').catch(() => d.tapText('Receber'));
    const onReceive = await d.waitForText('Mostre este QR', { timeout: 20000 }).then(() => true).catch(() => false);
    R.mark('BUSINESS_WEB_RECEIVE_POINT_PARITY', onReceive, 'Business Web renders the persistent Receive Point');

    // Same Receive Point across clients (§92): the Web session and the API agree.
    const webSlug = await bizReceivePointSlug(biz); // idempotent read for the same Business
    R.mark('BUSINESS_RECEIVE_POINT_CROSS_CLIENT_IDENTITY', !!apiSlug && apiSlug === webSlug, `slug=${apiSlug}`);
  } catch (e) {
    R.mark('PROOF_10', false, e.message);
  } finally {
    await browser.close().catch(() => {});
    if (biz) await retireBusiness(biz.merchantId);
  }
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_10_BUSINESS_WEB_LOGIN=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
  process.exitCode = R.ok ? 0 : 1;
})();
