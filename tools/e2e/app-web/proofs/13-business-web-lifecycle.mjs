#!/usr/bin/env node
/**
 * APP-BANZAMI-WEB-BUSINESS-001 — Proof 13: Business Web lifecycle & revocation.
 *
 *  - hard refresh: an authenticated Business survives F5 on /business* (context +
 *    authority restored from the server-side session; no re-login);
 *  - browser history: /business ↔ / stay coherent and never swap authority;
 *  - access revocation / one-context expiry isolation: suspending the Business
 *    canonically drops ONLY the business authority mid-session — the consumer
 *    stays; the business route 401s (BFF refresh also fails).
 *
 *   BANZAMI_E2E=RUN node proofs/13-business-web-lifecycle.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { FlutterSemanticsDriver } from '../lib/semantics-driver.mjs';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { provisionBusiness, retireBusiness } from '../lib/business-provision.mjs';
import { retireConsumer } from '../lib/consumer-retire.mjs';
import { businessWebSignIn, businessWebSignInToHome } from '../lib/business-signin.mjs';

const APP = process.env.APP_WEB_URL ?? 'https://app.banzami.com';
const R = new GateReport('13-business-web-lifecycle');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (process.env.BANZAMI_E2E !== 'RUN') { console.error('set BANZAMI_E2E=RUN'); process.exit(2); }

async function loginBusinessUI(page) {
  const d = new FlutterSemanticsDriver(page, { label: 'life' });
  await d.enableSemantics();
  await businessWebSignIn(d, globalThis.__biz);
  await d.waitForText('Saldo disponível', { timeout: 30000 });
  return d;
}

// HTTP jar for the revocation test (register consumer + login business in one cookie).
function jar() {
  const s = {}; const ch = () => Object.entries(s).map(([k, v]) => `${k}=${v}`).join('; ');
  const grab = (r) => { const a = r.headers.getSetCookie ? r.headers.getSetCookie() : []; for (const c of a) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) { if (m[2] === '') delete s[m[1]]; else s[m[1]] = m[2]; } } };
  return { s, csrf: () => s['bz_app_csrf'], async seed() { grab(await fetch(`${APP}/`)); },
    async req(m, p, b) { const h = { cookie: ch() }; if (b !== undefined) { h['content-type'] = 'application/json'; h['x-csrf-token'] = s['bz_app_csrf'] || ''; } const r = await fetch(`${APP}${p}`, { method: m, headers: h, body: b !== undefined ? JSON.stringify(b) : undefined }); grab(r); let j = null; try { j = await r.clone().json(); } catch {} return { status: r.status, body: j }; } };
}

(async () => {
  let biz;
  let lifeConsumer = null;   // retired in the finally; residue is residue
  const { browser } = await launchChromium();
  try {
    biz = await provisionBusiness({ handlePrefix: 'e2elife' });
    globalThis.__biz = biz;
    R.mark('GENERIC_SYNTHETIC_BUSINESS_PROVISIONED', !!biz.handle, `@${biz.handle}`);

    // ── Hard refresh ────────────────────────────────────────────────────────────
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${APP}/business`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const d = await loginBusinessUI(page);
    // F5 on /business — the authority is restored from the cookie, no re-login.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await d.enableSemantics();
    const afterReload = await d.waitForText('Saldo disponível', { timeout: 30000 }).then(() => true).catch(() => false);
    const reloadText = afterReload ? await d.visibleText() : '';
    R.mark('BUSINESS_WEB_HARD_REFRESH_E2E', afterReload && !/Entrar|Entre com o seu/.test(reloadText), 'Business Home restored after F5, no re-login');
    // Hard refresh directly on a deep business path restores the Business context.
    await page.goto(`${APP}/business/history`, { waitUntil: 'domcontentloaded' });
    await d.enableSemantics();
    const deep = await d.waitForText('Saldo disponível', { timeout: 30000 }).then(() => true).catch(() => false);
    R.mark('BUSINESS_WEB_DEEP_PATH_REFRESH', deep, '/business/history hard-load restores Business context');

    // ── Browser history — /business ↔ / stay coherent, authority stable ──────────
    const settle = async () => { await page.waitForLoadState('load').catch(() => {}); await sleep(2500); const dd = new FlutterSemanticsDriver(page, { label: 'hist' }); for (let i = 0; i < 3; i++) { try { await dd.enableSemantics(); break; } catch { await sleep(1000); } } return dd; };
    const sidBefore = (await ctx.cookies()).find((c) => c.name === 'bz_app_session')?.value;
    await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' }); // Consumer root
    let dh = await settle();
    const onConsumer = await dh.waitForText('Banzami', { timeout: 20000 }).then(() => true).catch(() => false);
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {}); // history back → /business
    dh = await settle();
    const backBusiness = await dh.waitForText('Saldo disponível', { timeout: 30000 }).then(() => true).catch(() => false);
    await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {}); // forward → / (consumer)
    dh = await settle();
    const fwdConsumer = await dh.waitForText('Banzami', { timeout: 20000 }).then(() => true).catch(() => false);
    const sidAfter = (await ctx.cookies()).find((c) => c.name === 'bz_app_session')?.value;
    R.mark('BUSINESS_WEB_BROWSER_HISTORY_E2E', onConsumer && backBusiness && fwdConsumer && sidBefore === sidAfter, 'back/forward keep each context; opaque session unchanged (authority stable)');
    await ctx.close();

    // ── Access revocation / one-context expiry isolation (canonical suspend) ─────
    const J = jar();
    await J.seed();
    lifeConsumer = `e2elifec${Date.now().toString(36)}`;
    await J.req('POST', '/consumer/v1/auth/register', { handle: lifeConsumer, display_name: 'E2E', pin: '481516' });
    await J.req('POST', '/business/api/v1/merchant/auth/token', { handle: biz.handle, pin: biz.pin });
    const pre = (await J.req('GET', '/session/state')).body || {};
    const bOk = await J.req('GET', '/business/api/v1/business/receive-point');
    // Suspend the Business through the canonical core-api lifecycle (not a DB write).
    await retireBusiness(biz.merchantId);
    await sleep(1500);
    const bRevoked = await J.req('GET', '/business/api/v1/business/receive-point');
    const cStill = await J.req('GET', '/consumer/v1/me');
    const revoked = bRevoked.status === 401 || bRevoked.status === 403; // suspended Business → forbidden/unauthorized
    R.mark('BUSINESS_WEB_ACCESS_REVOCATION', pre.business === true && bOk.status === 200 && revoked,
      `business route ${bOk.status} → after suspend ${bRevoked.status} (blocked)`);
    R.mark('WEB_CONTEXT_SESSION_EXPIRY_ISOLATION', cStill.status === 200, `consumer authority intact after business revoked (/me ${cStill.status})`);
    R.mark('WEB_CONTEXT_EXPIRY_E2E', revoked && cStill.status === 200, 'one context revoked, the other unaffected');
    biz = null; // already suspended
  } catch (e) {
    R.mark('PROOF_13', false, e.message);
  } finally {
    await browser.close().catch(() => {});
    if (biz) await retireBusiness(biz.merchantId);
    if (lifeConsumer) { try { retireConsumer(lifeConsumer, { runId: 'proof13' }); } catch { /* best effort */ } }
  }
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_13_BUSINESS_WEB_LIFECYCLE=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
  process.exitCode = R.ok ? 0 : 1;
})();
